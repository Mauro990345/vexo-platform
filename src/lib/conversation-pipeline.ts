import { prisma } from "@/lib/prisma";
import { classifyConversation, generateLeadReply, type AgentTools } from "@/lib/anthropic";
import { checkAvailability, createCalendarEvent } from "@/lib/google-calendar";
import { computeAdaptiveDelaySeconds, FAST_REPLY_DELAY_SECONDS } from "@/lib/scheduler";
import { DEFAULT_CONVERSATION_SYSTEM_PROMPT } from "@/lib/default-prompt";
import { sendWhatsappMessage, formatEscalationAlert } from "@/lib/whatsapp";
import { cancelPendingFollowUp, getSilenceHours } from "@/lib/follow-up";
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

  const signal = await classifyConversation(chatHistory);

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

  const reply = await generateLeadReply({
    systemPrompt: clinic.aiSystemPrompt || DEFAULT_CONVERSATION_SYSTEM_PROMPT,
    history: chatHistory,
    tools: {
      checkAvailability: buildAvailabilityCheck(clinic.id),
      async scheduleAppointment(args) {
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

  const appointment = await prisma.appointment.create({
    data: {
      clinicId: params.clinicId,
      conversationId: params.conversationId,
      leadId: params.leadId,
      scheduledAt: new Date(params.startTimeIso),
      googleEventId,
      status: "SCHEDULED",
    },
  });
  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { status: "SCHEDULED" },
  });

  // Envio imediato (scheduledFor: agora) — dispatchDueMessages roda a
  // cada 15s, então sai pro Instagram quase na hora, reforçando o
  // comparecimento logo que o agendamento é confirmado na conversa.
  //
  // Trava contra reenvio: se o lead remarcar dentro da MESMA conversa,
  // confirmAppointment roda de novo e criaria um Appointment novo — sem
  // essa checagem, o vídeo seria disparado outra vez a cada remarcação.
  // Busca em TODOS os agendamentos já feitos nesta conversationId (o que
  // acabou de ser criado ainda não tem confirmationVideoSentAt, então
  // nunca bate consigo mesmo) se algum já recebeu o vídeo.
  const alreadySentVideo = await prisma.appointment.findFirst({
    where: { conversationId: params.conversationId, confirmationVideoSentAt: { not: null } },
    select: { id: true },
  });
  if (clinic?.confirmationVideoUrl && !alreadySentVideo) {
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
