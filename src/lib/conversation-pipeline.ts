import { prisma } from "@/lib/prisma";
import { classifyConversation, generateLeadReply, type AgentTools } from "@/lib/anthropic";
import { checkAvailability, createCalendarEvent, updateCalendarEvent, getRawBusyPeriods } from "@/lib/google-calendar";
import { getInstagramUserProfile } from "@/lib/instagram";
import { decryptToken } from "@/lib/crypto";
import { computeAdaptiveDelaySeconds, FAST_REPLY_DELAY_SECONDS } from "@/lib/scheduler";
import { DEFAULT_CONVERSATION_SYSTEM_PROMPT } from "@/lib/default-prompt";
import { sendWhatsappMessage, formatEscalationAlert } from "@/lib/whatsapp";
import { cancelPendingFollowUp, getSilenceHours, applyTemplateVariables } from "@/lib/follow-up";
import { toChatHistory } from "@/lib/chat-history";

export { toChatHistory } from "@/lib/chat-history";

export type InboundInstagramEvent = {
  igUserId: string; // ID da conta profissional do Instagram da clínica (destinatária)
  leadIgScopedId: string;
  leadText: string;
  leadIgUsername?: string;
  timestamp: Date;
  igMessageId?: string;
};

function buildAvailabilityCheck(clinicId: string): AgentTools["checkAvailability"] {
  return async ({ dateFrom, dateTo }) => {
    try {
      const slots = await checkAvailability(clinicId, dateFrom, dateTo);
      return { slots };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao consultar agenda." };
    }
  };
}

export async function handleInboundInstagramMessage(
  event: InboundInstagramEvent,
  // ID da linha em WebhookLog dessa requisição (ver
  // api/webhooks/instagram/route.ts) — só usado pra gravar de volta nela o
  // motivo do descarte quando a conta não é encontrada, tornando isso
  // visível na tela /crm/webhook-logs em vez de só um console.warn
  // perdido nos logs do Railway (sem acesso). Opcional pra não quebrar
  // quem já chamava essa função sem esse contexto.
  webhookLogId?: string
) {
  const igAccount = await prisma.instagramAccount.findFirst({
    where: { igUserId: event.igUserId },
    include: { clinic: true },
  });
  if (!igAccount) {
    const knownAccounts = await prisma.instagramAccount.findMany({
      select: { igUserId: true, igUsername: true },
    });
    const reason =
      `Nenhuma InstagramAccount encontrada pra igUserId="${event.igUserId}" (vindo do webhook). ` +
      `Contas conhecidas no banco: ${
        knownAccounts.length
          ? knownAccounts.map((a) => `${a.igUsername ?? "?"}=${a.igUserId}`).join(", ")
          : "(nenhuma)"
      }.`;
    console.warn(`[vexo] ${reason}`);
    if (webhookLogId) {
      await prisma.webhookLog
        .update({ where: { id: webhookLogId }, data: { matchFailureReason: reason } })
        .catch((err) => console.error("[vexo] Falha ao gravar motivo do descarte no WebhookLog:", err));
    }
    return;
  }
  const clinic = igAccount.clinic;

  const lead = await prisma.lead.upsert({
    where: { clinicId_igScopedId: { clinicId: clinic.id, igScopedId: event.leadIgScopedId } },
    update: { igUsername: event.leadIgUsername ?? undefined },
    create: {
      clinicId: clinic.id,
      igScopedId: event.leadIgScopedId,
      igUsername: event.leadIgUsername,
    },
  });

  // O payload do webhook (event.sender.id) NUNCA traz nome/username do
  // lead — só o ID opaco (ver leadIgUsername acima, que na prática nunca
  // é preenchido por quem chama esta função a partir do webhook real).
  // Sem essa busca extra, Lead.name/igUsername ficam null pra sempre, e
  // {{primeiro_nome}} (ver applyTemplateVariables mais abaixo) substitui
  // certinho por uma string vazia — não é bug de substituição, é falta de
  // dado. Tenta de novo em TODA mensagem enquanto name estiver vazio (não
  // só na criação do lead) — um lead antigo, de antes dessa busca existir,
  // já se autocorrige na próxima mensagem, sem precisar de backfill.
  // Best effort, uma falha aqui não pode impedir a conversa de continuar
  // — mas registra o resultado (sucesso, falha ou "sem nome retornado")
  // em WebhookLog.processingError, senão uma falha nessa chamada
  // específica ficaria invisível pra sempre (só no console do Railway,
  // sem acesso), indistinguível de "a Meta genuinamente não devolveu
  // nome" — motivo real reportado em produção: {{primeiro_nome}} continua
  // vazio mesmo depois dessa correção, sem forma de saber por quê sem
  // isso aqui.
  if (!lead.name) {
    try {
      const profile = await getInstagramUserProfile(decryptToken(igAccount.accessTokenEnc), lead.igScopedId);
      if (profile.name) {
        await prisma.lead.update({ where: { id: lead.id }, data: { name: profile.name } });
        lead.name = profile.name;
      } else if (webhookLogId) {
        await prisma.webhookLog
          .update({
            where: { id: webhookLogId },
            data: { processingError: `getInstagramUserProfile não devolveu "name" pra igScopedId=${lead.igScopedId} (resposta sem esse campo).` },
          })
          .catch((updateErr) => console.error("[vexo] Falha ao gravar diagnóstico de perfil do lead:", updateErr));
      }
    } catch (err) {
      console.error("[vexo] Falha ao buscar nome do perfil do lead:", err);
      if (webhookLogId) {
        const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
        await prisma.webhookLog
          .update({ where: { id: webhookLogId }, data: { processingError: `Falha ao buscar nome do lead: ${detail}`.slice(0, 4000) } })
          .catch((updateErr) => console.error("[vexo] Falha ao gravar diagnóstico de perfil do lead:", updateErr));
      }
    }
  }

  let conversation = await prisma.conversation.findFirst({
    where: {
      leadId: lead.id,
      status: { in: ["NEW", "IN_CONVERSATION", "SCHEDULED", "FOLLOW_UP", "NEEDS_HUMAN"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { clinicId: clinic.id, leadId: lead.id, status: "NEW" },
    });
  }

  // Conversa já escalonada para humano: a IA não retoma sozinha.
  if (conversation.status === "NEEDS_HUMAN") {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        sender: "LEAD",
        content: event.leadText,
        igMessageId: event.igMessageId,
        sentAt: event.timestamp,
      },
    });
    return;
  }

  const reopeningFromFollowUp = conversation.status === "FOLLOW_UP";

  // Reengajamento: o lead esfriou (entrou numa sequência de follow-up, OU
  // simplesmente ficou calado por mais tempo que o limiar de silêncio —
  // mesmo limiar que dispara o follow-up automático, ver silenceHours em
  // follow-up.ts, pra não ter dois números diferentes definindo "esfriou")
  // e voltou a interagir. Isso encerra o "fôlego" anterior da conversa —
  // reseta a trava de resultPhotoSentAt logo abaixo, liberando a IA pra
  // mandar outra foto de resultado se fizer sentido de novo, já que a trava
  // de 1 foto só vale dentro do mesmo fôlego, não pra vida inteira da
  // conversa.
  const silenceHours = await getSilenceHours();
  const wentSilent =
    Boolean(conversation.lastLeadMessageAt) &&
    event.timestamp.getTime() - conversation.lastLeadMessageAt!.getTime() > silenceHours * 60 * 60 * 1000;
  const reengaged = reopeningFromFollowUp || wentSilent;

  const previousAiMessage = await prisma.message.findFirst({
    where: { conversationId: conversation.id, sender: "AI", direction: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
  });

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        sender: "LEAD",
        content: event.leadText,
        igMessageId: event.igMessageId,
        sentAt: event.timestamp,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastLeadMessageAt: event.timestamp,
        lastMessageAt: event.timestamp,
        status: conversation.status === "NEW" || reopeningFromFollowUp ? "IN_CONVERSATION" : conversation.status,
        ...(reengaged ? { resultPhotoSentAt: null } : {}),
      },
    }),
  ]);

  // Lead respondeu durante uma sequência de follow-up ativa: fecha o(s) log(s)
  // aberto(s) e cancela qualquer mensagem de follow-up já enfileirada (mas
  // ainda não enviada de fato) — sem isso, um passo que o worker já tinha
  // colocado na fila segundos antes ainda sairia mesmo com o lead já tendo
  // respondido.
  if (reopeningFromFollowUp) {
    await cancelPendingFollowUp(conversation.id, event.timestamp);
  }

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });

  const chatHistory = toChatHistory(history);

  // classifyConversation julga a conversa INTEIRA que recebe, não só a
  // mensagem nova — então, sem esse corte, o motivo que causou um
  // escalonamento anterior continua no transcript pra sempre (a reclamação
  // do lead não "deixa de ter acontecido" só porque um humano clicou
  // "Devolver para a IA"), e a primeira mensagem seguinte reescalona de
  // novo, mesmo sendo um assunto comercial normal e não repetitivo. Depois
  // que humanReviewedAt é marcado (setConversationStatus, único caller que
  // leva status pra IN_CONVERSATION), só as mensagens A PARTIR DESSE PONTO
  // entram na classificação — o histórico completo (chatHistory, acima)
  // continua indo pra geração da resposta da IA, que se beneficia do
  // contexto inteiro; só o classificador de bastidor precisa desse corte.
  const classifierHistory = conversation.humanReviewedAt
    ? toChatHistory(history.filter((m) => m.createdAt > conversation.humanReviewedAt!))
    : chatHistory;

  const signal = await classifyConversation(classifierHistory);

  if (signal.needsHuman) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "NEEDS_HUMAN", needsHumanReason: signal.needsHumanReason ?? "Não especificado" },
    });

    if (clinic.notifyWhatsappNumber) {
      if (!clinic.whatsappInstanceName) {
        console.warn(`[vexo] Clínica ${clinic.id} sem WhatsApp conectado — notificação de escalonamento pulada.`);
      } else {
        try {
          await sendWhatsappMessage(
            clinic.whatsappInstanceName,
            clinic.notifyWhatsappNumber,
            formatEscalationAlert({
              clinicName: clinic.name,
              leadName: lead.name ?? lead.igUsername ?? "lead sem nome",
              leadPhone: lead.phone,
              leadIgUsername: lead.igUsername,
              reason: signal.needsHumanReason ?? "não especificado",
              conversationUrl: `${process.env.APP_URL ?? ""}/crm/conversas/${conversation.id}`,
            })
          );
        } catch (err) {
          console.error("[vexo] Falha ao notificar escalonamento via WhatsApp:", err);
        }
      }
    }
    return;
  }

  let scheduledStartTime: string | undefined;
  let capturedLeadPhone: string | undefined;
  let capturedResultPhotoUrl: string | undefined;
  let resultPhotoAlreadySent = reengaged ? false : Boolean(conversation.resultPhotoSentAt);

  // Mesma variável {{primeiro_nome}} já suportada nos templates de
  // lembrete/follow-up (ver applyTemplateVariables em follow-up.ts) — sem
  // aplicar aqui também, um prompt customizado escrito com essa convenção
  // (razoável de esperar, já que é a mesma sintaxe usada nos outros dois
  // lugares) sai literal na resposta da IA em vez de virar o nome do lead.
  const basePrompt = applyTemplateVariables(clinic.aiSystemPrompt || DEFAULT_CONVERSATION_SYSTEM_PROMPT, lead);

  // Bug real encontrado em produção: um agendamento pra "amanhã" saiu
  // registrado com uma data completamente errada (mês diferente, não só
  // fuso). Causa raiz: nada em lugar nenhum do prompt jamais disse ao
  // modelo que dia é hoje — nem o prompt padrão (default-prompt.ts) nem
  // o prompt customizado por clínica têm como saber disso sozinhos, então
  // "hoje"/"amanhã" vira um chute do modelo sem nenhuma referência real.
  // Esse bloco é gerado a cada mensagem (nunca fica desatualizado, ao
  // contrário de um valor fixo no prompt customizado) e é sempre anexado,
  // independente do que a clínica escreveu — nenhum prompt customizado
  // deveria precisar se preocupar com isso por conta própria. Também
  // reforça o formato exigido nas chamadas de ferramenta (UTC explícito
  // com "Z"): sem isso, um ISO sem timezone escrito pelo modelo (ex.
  // "2026-09-14T14:00:00", sem sufixo) seria interpretado pelo
  // `new Date(...)` do servidor como horário LOCAL DO SERVIDOR (UTC no
  // Railway) — silenciosamente 3h adiantado/atrasado do que o lead ouviu.
  const now = new Date();
  const dateTimeContext =
    `[Contexto automático — data/hora atual: ${now.toLocaleString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    })} (horário de Brasília, America/Sao_Paulo, UTC-3). Use isso como referência real ` +
    `pra "hoje", "amanhã", "essa semana" etc. — nunca assuma outra data. Em toda chamada de ` +
    `check_availability ou schedule_appointment, o horário DEVE ser ISO 8601 em UTC, com o ` +
    `sufixo "Z" (ex.: 14h de Brasília = 17:00 UTC = "...T17:00:00Z") — nunca mande um horário ` +
    `sem timezone explícito. NUNCA diga ao lead que um horário está reservado/confirmado antes ` +
    `de check_availability confirmar que está livre E schedule_appointment ter sido chamado com ` +
    `sucesso, nessa ordem — não confirme adiantado, mesmo que pareça óbvio que vai dar certo. Se ` +
    `depois de oferecer um horário você descobrir que ele não está mais livre, deixe claro pro ` +
    `lead que aquele horário específico não está confirmado e pergunte qual dos horários ` +
    `alternativos ele prefere — só chame schedule_appointment depois que ele responder claramente ` +
    `qual dos horários quer; se a resposta dele ficar ambígua entre mais de um horário oferecido, ` +
    `pergunte de novo pra confirmar qual exatamente, em vez de escolher um sozinho. Se o lead ` +
    `perguntar sobre o horário marcado (ex.: "esqueci meu horário", "quando é minha consulta?") ` +
    `ou pedir pra remarcar, chame check_current_appointment antes de responder — não confie só no ` +
    `histórico da conversa. Remarcação usa a MESMA schedule_appointment, com o horário novo (as ` +
    `mesmas regras de confirmação valem); o sistema identifica sozinho que já existe um ` +
    `agendamento e move ele em vez de criar outro.]`;

  const reply = await generateLeadReply({
    systemPrompt: `${basePrompt}\n\n${dateTimeContext}`,
    history: chatHistory,
    tools: {
      checkAvailability: buildAvailabilityCheck(clinic.id),
      // Leitura pura (sem side effect) — mesma consulta que confirmAppointment
      // já faz pra decidir criar vs. mover um agendamento, exposta aqui pra
      // IA poder responder "esqueci meu horário"/"quando é minha consulta?"
      // e servir de primeiro passo antes de uma remarcação.
      async checkCurrentAppointment() {
        const active = await prisma.appointment.findFirst({
          where: { conversationId: conversation.id, status: { in: ["SCHEDULED", "CONFIRMED"] } },
          orderBy: { createdAt: "desc" },
        });
        if (!active) return { none: true as const };
        return { scheduledAt: active.scheduledAt.toISOString() };
      },
      // Nunca confia no que a conversa "disse" ter confirmado — bug real em
      // produção: a IA ofereceu um horário sem checar disponibilidade de
      // verdade, o lead confirmou, só DEPOIS a IA descobriu que estava
      // ocupado, e mesmo com a contradição nunca resolvida (não ficou
      // claro se o lead escolheu 11h ou 12h), um agendamento foi criado
      // mesmo assim. Essa é a trava de fato: reverifica a disponibilidade
      // real (Google Calendar) bem na hora de gravar, não importa quantas
      // vezes check_availability já rodou antes na conversa — pode ter
      // passado tempo, ou o modelo pode simplesmente não ter checado.
      // Rejeita (força o modelo a chamar check_availability de novo e
      // reoferecer) se o horário não estiver genuinamente livre.
      async scheduleAppointment(args) {
        const start = new Date(args.startTime);
        if (Number.isNaN(start.getTime())) {
          return { error: "startTime inválido — precisa ser um ISO 8601 UTC válido (com sufixo \"Z\")." };
        }
        // Consentimento explícito do lead pra ESSE horário específico não dá
        // pra verificar por código sozinho (entender linguagem natural) —
        // mas exigir uma citação da mensagem real do lead reduz bastante
        // confirmação inventada: sem uma frase de verdade pra citar, fica
        // mais difícil o modelo simplesmente afirmar que foi confirmado.
        if (!args.leadConfirmationQuote?.trim()) {
          return {
            error:
              "Inclua leadConfirmationQuote com a mensagem exata em que o lead confirmou ESSE horário específico " +
              "antes de chamar esta ferramenta.",
          };
        }
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        const freeSlots = await checkAvailability(clinic.id, start.toISOString(), end.toISOString()).catch(
          () => [] as string[]
        );
        if (!freeSlots.includes(start.toISOString())) {
          // Diagnóstico: registra o que o Google devolveu de verdade (conta,
          // calendário, períodos ocupados crus do dia inteiro) em
          // WebhookLog.processingError — sem isso, uma rejeição "estranha"
          // (ex.: horário que deveria estar livre) fica sem forma de
          // confirmar se é um evento genuíno na agenda conectada ou um bug
          // na lógica de disponibilidade. Best effort — falha aqui não pode
          // impedir a resposta normal ao lead.
          if (webhookLogId) {
            const dayStart = new Date(start);
            dayStart.setUTCHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            await getRawBusyPeriods(clinic.id, dayStart.toISOString(), dayEnd.toISOString())
              .then((raw) =>
                prisma.webhookLog.update({
                  where: { id: webhookLogId },
                  data: {
                    processingError:
                      `schedule_appointment rejeitou ${args.startTime} (não está em freeSlots). ` +
                      `Conta Google: ${raw.googleAccountEmail} (calendarId=${raw.calendarId}). ` +
                      `Períodos ocupados crus do dia (UTC): ${JSON.stringify(raw.busy)}`.slice(0, 4000),
                  },
                })
              )
              .catch((err) => console.error("[vexo] Falha ao gravar diagnóstico de disponibilidade:", err));
          }
          return {
            error:
              `O horário ${args.startTime} não está livre (ou está fora do horário de funcionamento). ` +
              `Chame check_availability de novo e ofereça outro horário — não confirme este ao lead.`,
          };
        }
        scheduledStartTime = args.startTime;
        return { confirmed: true, startTime: args.startTime };
      },
      async saveLeadPhone(args) {
        const phone = args.phone.trim();
        if (!phone) return { error: "Número vazio." };
        capturedLeadPhone = phone;
        return { saved: true };
      },
      async sendResultPhoto(args) {
        if (resultPhotoAlreadySent) {
          return { error: "Já foi enviada uma foto de resultado nesta conversa — não envie outra." };
        }
        const category = args.category.trim();
        if (!category) return { error: "Categoria vazia." };
        const photo = await prisma.resultPhoto.findFirst({
          where: { clinicId: clinic.id, category: { contains: category, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
        });
        if (!photo) {
          return { error: `Nenhuma foto de resultado cadastrada para a categoria "${category}".` };
        }
        capturedResultPhotoUrl = photo.imageUrl;
        resultPhotoAlreadySent = true;
        return { sent: true };
      },
    },
  });

  const leadResponseTimeSeconds = previousAiMessage?.sentAt
    ? Math.max(0, Math.round((event.timestamp.getTime() - previousAiMessage.sentAt.getTime()) / 1000))
    : null;

  const aiSettings = await prisma.aiSettings.findUnique({ where: { id: "singleton" } });
  const delaySeconds = aiSettings?.adaptiveDelayEnabled === false
    ? FAST_REPLY_DELAY_SECONDS
    : computeAdaptiveDelaySeconds(leadResponseTimeSeconds, clinic.firstBandDelaySeconds);
  const scheduledFor = new Date(Date.now() + delaySeconds * 1000);

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sender: "AI",
      content: reply.text,
      status: "PENDING",
      scheduledFor,
    },
  });

  if (capturedLeadPhone) {
    await prisma.lead.update({ where: { id: lead.id }, data: { phone: capturedLeadPhone } });
  }

  if (capturedResultPhotoUrl) {
    // +5s pra chegar logo depois da resposta em texto, não junto/antes dela.
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          sender: "AI",
          content: "[foto de resultado]",
          mediaUrl: capturedResultPhotoUrl,
          status: "PENDING",
          scheduledFor: new Date(scheduledFor.getTime() + 5_000),
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { resultPhotoSentAt: new Date() },
      }),
    ]);
  }

  if (scheduledStartTime) {
    await confirmAppointment({
      clinicId: clinic.id,
      conversationId: conversation.id,
      leadId: lead.id,
      leadName: lead.name ?? lead.igUsername ?? undefined,
      startTimeIso: scheduledStartTime,
    });
  }
}

async function confirmAppointment(params: {
  clinicId: string;
  conversationId: string;
  leadId: string;
  leadName?: string;
  startTimeIso: string;
}) {
  // Buscado logo no início (não só mais abaixo, pra confirmationVideoUrl)
  // porque address também alimenta o evento do Google Calendar criado a
  // seguir — endereço da clínica preenchido uma vez em Automações, sem
  // precisar digitar de novo aqui.
  const clinic = await prisma.clinic.findUnique({ where: { id: params.clinicId } });

  // Idempotente por conversa — bug real em produção: cada chamada
  // bem-sucedida de schedule_appointment nesta MESMA conversa criava um
  // Appointment + evento NOVO no Google Calendar, em vez de reaproveitar
  // o que já existia. Confirmado direto na agenda real (dois eventos
  // reais, mesmo lead, mesma conversa). O comentário mais abaixo (trava
  // de reenvio do vídeo de confirmação) já apontava esse risco, mas só
  // cobria o efeito colateral do vídeo — nunca a duplicata em si.
  const existing = await prisma.appointment.findFirst({
    where: { conversationId: params.conversationId, status: { in: ["SCHEDULED", "CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
  });

  const newScheduledAt = new Date(params.startTimeIso);
  let appointment: { id: string; confirmationVideoSentAt: Date | null };

  if (existing) {
    if (existing.scheduledAt.getTime() === newScheduledAt.getTime()) {
      // Mesmo horário já confirmado antes nesta conversa (reenvio da
      // mesma chamada, ou o modelo confirmando de novo o que já estava
      // certo) — reaproveita sem mexer no Google Calendar nem duplicar.
      appointment = existing;
    } else {
      // Horário diferente do já agendado nesta conversa = remarcação:
      // move o evento EXISTENTE em vez de criar outro.
      if (existing.googleEventId) {
        try {
          await updateCalendarEvent(params.clinicId, existing.googleEventId, params.startTimeIso);
        } catch (err) {
          console.error("[vexo] Falha ao mover evento no Google Calendar:", err);
        }
      }
      appointment = await prisma.appointment.update({
        where: { id: existing.id },
        data: { scheduledAt: newScheduledAt },
        select: { id: true, confirmationVideoSentAt: true },
      });
    }
  } else {
    let googleEventId: string | undefined;
    try {
      googleEventId = await createCalendarEvent(
        params.clinicId,
        params.startTimeIso,
        `VEXO — Avaliação: ${params.leadName ?? "lead"}`,
        clinic?.address ?? undefined
      );
    } catch (err) {
      console.error("[vexo] Falha ao criar evento no Google Calendar:", err);
    }

    appointment = await prisma.appointment.create({
      data: {
        clinicId: params.clinicId,
        conversationId: params.conversationId,
        leadId: params.leadId,
        scheduledAt: newScheduledAt,
        googleEventId,
        status: "SCHEDULED",
      },
      select: { id: true, confirmationVideoSentAt: true },
    });
  }

  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { status: "SCHEDULED" },
  });

  // Envio imediato (scheduledFor: agora) — dispatchDueMessages roda a
  // cada 15s, então sai pro Instagram quase na hora, reforçando o
  // comparecimento logo que o agendamento é confirmado na conversa.
  //
  // Trava contra reenvio: numa remarcação (bloco acima reaproveita o
  // MESMO Appointment em vez de criar outro), appointment.confirmationVideoSentAt
  // já reflete corretamente se o vídeo foi mandado antes — sem essa
  // checagem, ele seria disparado de novo a cada remarcação.
  if (clinic?.confirmationVideoUrl && !appointment.confirmationVideoSentAt) {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: params.conversationId,
          direction: "OUTBOUND",
          sender: "SYSTEM",
          content: "[vídeo de confirmação de agendamento]",
          mediaUrl: clinic.confirmationVideoUrl,
          status: "PENDING",
          scheduledFor: new Date(),
        },
      }),
      prisma.appointment.update({
        where: { id: appointment.id },
        data: { confirmationVideoSentAt: new Date() },
      }),
    ]);
  }
}
