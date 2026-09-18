import { prisma } from "@/lib/prisma";
import { classifyConversation, generateLeadReply, summarizeOlderTurns, type AgentTools } from "@/lib/anthropic";
import { buildConversationContext, withOlderSummary } from "@/lib/conversation-context";
import { checkAvailability, createCalendarEvent, updateCalendarEvent, getRawBusyPeriods } from "@/lib/google-calendar";
import { getInstagramUserProfile } from "@/lib/instagram";
import { decryptToken } from "@/lib/crypto";
import { computeAdaptiveDelaySeconds, FAST_REPLY_DELAY_SECONDS } from "@/lib/scheduler";
import { DEFAULT_CONVERSATION_SYSTEM_PROMPT } from "@/lib/default-prompt";
import { sendWhatsappMessage, formatEscalationAlert } from "@/lib/whatsapp";
import { cancelPendingFollowUp, getSilenceHours, applyTemplateVariables } from "@/lib/follow-up";
import { toChatHistory } from "@/lib/chat-history";
import { buildResultPhotoMessages, type ResultPhotoInput } from "@/lib/result-photo-message";
import { detectStagnation, STAGNATION_SIMILARITY_THRESHOLD, STAGNATION_WINDOW_SIZE } from "@/lib/loop-guard";

export { toChatHistory } from "@/lib/chat-history";

// Usado quando Clinic.confirmationVideoCaption está vazio (editável em
// /crm/clinicas/[id]/agente-ia) — ver confirmAppointment mais abaixo.
const DEFAULT_CONFIRMATION_VIDEO_CAPTION = "Vou te mandar um vídeo rápido mostrando como é o nosso atendimento 🙂";

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
  // Diagnóstico TEMPORÁRIO (ver comentário grande mais abaixo, junto do log
  // de timing do delay artificial) — marca o início do processamento deste
  // evento pra medir quanto tempo a classificação + geração da resposta da
  // IA consomem ANTES do delay artificial (computeAdaptiveDelaySeconds)
  // sequer entrar em jogo — separa "tempo de processamento real" de "delay
  // configurado", que são coisas diferentes mas se somam no tempo total que
  // o lead observa.
  const pipelineStartedAt = Date.now();

  let igAccount = await prisma.instagramAccount.findFirst({
    where: { igUserId: event.igUserId },
    include: { clinic: true },
  });

  if (!igAccount) {
    // Auto-correção (era o botão manual "Corrigir ID do webhook") —
    // nenhum endpoint de OAuth desse produto devolve de antemão o ID que
    // a Meta manda de verdade nos eventos de webhook (ver comentário
    // grande em exchangeInstagramCode, src/lib/instagram.ts), então o
    // primeiro evento real de uma conta recém-conectada SEMPRE bate aqui.
    // Sem essa correção automática, isso exigia alguém abrir
    // /crm/webhook-logs, copiar o ID reportado e colar manualmente em
    // Conexões antes da primeira mensagem real ser respondida — pra toda
    // clínica nova, sempre. Só corrige sozinho quando existe EXATAMENTE
    // UMA conta ainda não confirmada (webhookIdVerified=false) — se houver
    // mais de uma (duas clínicas conectadas em sequência antes de
    // qualquer uma receber sua primeira mensagem real), a ambiguidade cai
    // pro fluxo manual de sempre, pra nunca arriscar corrigir a conta
    // errada.
    const unverified = await prisma.instagramAccount.findMany({
      where: { webhookIdVerified: false },
      include: { clinic: true },
    });

    const [onlyUnverified] = unverified;
    if (unverified.length === 1 && onlyUnverified) {
      const previousId = onlyUnverified.igUserId;
      igAccount = await prisma.instagramAccount.update({
        where: { id: onlyUnverified.id },
        data: { igUserId: event.igUserId, webhookIdVerified: true },
        include: { clinic: true },
      });
      const reason =
        `ID do webhook corrigido automaticamente pra clínica "${igAccount.clinic.name}": ` +
        `${previousId} → ${event.igUserId} (primeiro evento real confirmou o valor).`;
      console.warn(`[vexo] ${reason}`);
      if (webhookLogId) {
        await prisma.webhookLog
          .update({ where: { id: webhookLogId }, data: { matchFailureReason: reason } })
          .catch((err) => console.error("[vexo] Falha ao gravar correção automática de ID no WebhookLog:", err));
      }
    } else {
      const knownAccounts = await prisma.instagramAccount.findMany({
        select: { igUserId: true, igUsername: true },
      });
      const reason =
        `Nenhuma InstagramAccount encontrada pra igUserId="${event.igUserId}" (vindo do webhook) — ` +
        `${unverified.length === 0 ? "nenhuma" : unverified.length} conta(s) não confirmada(s), auto-correção pulada ` +
        `por ambiguidade. Contas conhecidas no banco: ${
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
  // dado.
  //
  // Só tenta UMA VEZ por lead (nameLookupAttempted) — bug real em produção
  // encontrado ao investigar por que a busca "tentava de novo em toda
  // mensagem": pra uma conta pública normal, sem nada de privado, a busca
  // voltava vazia (sem "name" na resposta) EM TODA mensagem da conversa,
  // gastando uma chamada de API à toa a cada turno pra sempre, sem nunca
  // ter chance de dar certo (resultado consistente, não uma falha
  // transitória). @default(false) preserva a autocorreção pra leads já
  // existentes antes deste campo — a primeira mensagem seguinte ainda
  // tenta uma vez. Best effort, uma falha aqui não pode impedir a
  // conversa de continuar — mas registra o resultado (sucesso, falha ou
  // "sem nome retornado") em WebhookLog.processingError, senão uma falha
  // nessa chamada específica ficaria invisível pra sempre (só no console
  // do Railway, sem acesso), indistinguível de "a Meta genuinamente não
  // devolveu nome".
  if (!lead.name && !lead.nameLookupAttempted) {
    try {
      const profile = await getInstagramUserProfile(decryptToken(igAccount.accessTokenEnc), lead.igScopedId);
      if (profile.name) {
        await prisma.lead.update({ where: { id: lead.id }, data: { name: profile.name, nameLookupAttempted: true } });
        lead.name = profile.name;
      } else {
        await prisma.lead.update({ where: { id: lead.id }, data: { nameLookupAttempted: true } });
        if (webhookLogId) {
          await prisma.webhookLog
            .update({
              where: { id: webhookLogId },
              data: { processingError: `getInstagramUserProfile não devolveu "name" pra igScopedId=${lead.igScopedId} (resposta sem esse campo).` },
            })
            .catch((updateErr) => console.error("[vexo] Falha ao gravar diagnóstico de perfil do lead:", updateErr));
        }
      }
    } catch (err) {
      // NÃO marca nameLookupAttempted aqui — um erro pode ser transitório
      // (timeout, instabilidade da API), diferente de uma resposta válida
      // sem "name" (que é definitivo). Tenta de novo na próxima mensagem.
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

  // Proteção contra loop automático: sem isso, se o "lead" do outro lado
  // for na verdade outra conta comercial (a própria, ou qualquer bot
  // externo) respondendo automaticamente, cada resposta da IA vira uma
  // nova mensagem recebida pro outro lado, que responde de volta, e assim
  // indefinidamente — sem nenhuma trava natural pra parar sozinho (visto
  // em produção: dezenas de rodadas só interrompidas ao desconectar a
  // conta manualmente). Risco real de custo (cada rodada consome tokens
  // da API) além de péssima experiência. NÃO tenta identificar se o
  // remetente é outra InstagramAccount conectada — o ID que chega no
  // webhook (event.sender.id) é escopado por app/conversa, não dá pra
  // comparar com segurança contra o igUserId de outra clínica. Em vez
  // disso, um limite simples e independente de quem é o remetente: se a
  // IA já respondeu demais nesta conversa numa janela de tempo curta, para
  // e escalona pra humano revisar (@setConversationStatus é o único jeito
  // de devolver a conversa pra IA depois), em vez de continuar
  // respondendo automaticamente sem fim.
  //
  // Limiar calibrado pra pegar um loop de bot de verdade, não "muitas
  // mensagens" — bug real em produção: uma conversa de vendas normal, bem
  // engajada (8 mensagens da IA em 10 minutos, ~25s de latência média por
  // resposta — nada anormalmente rápido) disparava o escalonamento à toa
  // com o limiar antigo (8 msgs / 10 min). A partir da migração pro Luna
  // (via OpenRouter, bem mais barato que Sonnet/Haiku), o custo de uma
  // conversa longa deixou de ser uma preocupação real — o que passou a
  // importar de verdade é NUNCA interromper um lead engajado avançando
  // rumo ao agendamento, porque esse é um lead perdido silenciosamente
  // (ele só para de receber resposta, sem nenhum alerta de que algo deu
  // errado). Por isso este contador virou só a REDE DE SEGURANÇA FINAL —
  // a proteção principal contra loop de bot de verdade agora é o detector
  // de estagnação/repetição logo abaixo, que não depende de nenhum número
  // fixo de mensagens. 50 mensagens em 30 minutos (cadência de disparo: 1
  // a cada 36s sustentado) é generoso o bastante pra nunca incomodar
  // mesmo um lead humano bem falante — mas ainda existe caso o detector de
  // estagnação tenha algum furo.
  const LOOP_GUARD_WINDOW_MINUTES = 30;
  const LOOP_GUARD_MAX_AI_MESSAGES = 50;

  // Escalonamento compartilhado pelas duas proteções de loop abaixo (contagem
  // e estagnação) — mesmo efeito nos dois casos: pausa a conversa pra revisão
  // humana e avisa a clínica por WhatsApp, só muda o texto do motivo.
  //
  // Recebe conversationId em vez de fechar sobre `conversation` (que é `let`
  // e pode ser `null` antes do bloco acima) — dentro de uma closure como
  // esta o TypeScript não carrega a checagem de nulo já feita, então captura
  // o id já validado numa const logo abaixo em vez disso.
  const conversationId = conversation.id;
  async function escalateToHuman(reason: string): Promise<void> {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "NEEDS_HUMAN", needsHumanReason: reason },
    });
    if (clinic.notifyWhatsappNumber && clinic.whatsappInstanceName) {
      try {
        await sendWhatsappMessage(
          clinic.whatsappInstanceName,
          clinic.notifyWhatsappNumber,
          formatEscalationAlert({
            clinicName: clinic.name,
            leadName: lead.name ?? lead.igUsername ?? "lead sem nome",
            leadPhone: lead.phone,
            leadIgUsername: lead.igUsername,
            reason,
            conversationUrl: `${process.env.APP_URL ?? ""}/crm/conversas/${conversationId}`,
          })
        );
      } catch (err) {
        console.error("[vexo] Falha ao notificar escalonamento (loop guard) via WhatsApp:", err);
      }
    }
  }

  const recentAiMessageCount = await prisma.message.count({
    where: {
      conversationId: conversation.id,
      sender: "AI",
      direction: "OUTBOUND",
      createdAt: { gte: new Date(event.timestamp.getTime() - LOOP_GUARD_WINDOW_MINUTES * 60 * 1000) },
    },
  });

  if (recentAiMessageCount >= LOOP_GUARD_MAX_AI_MESSAGES) {
    await escalateToHuman(
      `Possível loop automático: a IA já enviou ${recentAiMessageCount} mensagens nesta conversa nos ` +
        `últimos ${LOOP_GUARD_WINDOW_MINUTES} minutos — pausada para revisão humana em vez de continuar ` +
        `respondendo automaticamente (proteção contra loop com outro bot/conta conectada).`
    );
    return;
  }

  // Detector de estagnação/repetição — proteção PRINCIPAL contra loop de
  // bot de verdade (ver src/lib/loop-guard.ts pra a lógica de similaridade
  // por trás disso). Só avalia enquanto a conversa está ativamente em
  // atendimento pela IA (NEW/IN_CONVERSATION) — durante FOLLOW_UP as
  // mensagens são templates propositalmente parecidos entre si (não é
  // sinal de loop), e SCHEDULED/NEEDS_HUMAN nem chegam aqui de novo com a
  // IA respondendo automaticamente.
  //
  // MODO SOMBRA (combinado com o usuário): por enquanto só calcula e loga
  // a similaridade — NÃO pausa a conversa por esse motivo ainda. Roda
  // assim por alguns dias pra confirmar com dados reais se
  // STAGNATION_SIMILARITY_THRESHOLD/STAGNATION_WINDOW_SIZE (src/lib/loop-guard.ts)
  // são os valores certos antes de virar STAGNATION_GUARD_SHADOW_MODE pra
  // false e ativar de verdade.
  const STAGNATION_GUARD_SHADOW_MODE = true;
  const conversationActivelyInAi = conversation.status === "NEW" || conversation.status === "IN_CONVERSATION";
  if (conversationActivelyInAi) {
    const recentAiTexts = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        sender: "AI",
        direction: "OUTBOUND",
        channel: "INSTAGRAM",
        mediaUrl: null,
      },
      orderBy: { createdAt: "desc" },
      take: STAGNATION_WINDOW_SIZE,
      select: { content: true },
    });

    if (recentAiTexts.length >= STAGNATION_WINDOW_SIZE) {
      const texts = recentAiTexts.map((m) => m.content).reverse();
      const { stuck, avgSimilarity, pairSimilarities } = detectStagnation(texts, {
        threshold: STAGNATION_SIMILARITY_THRESHOLD,
      });
      console.log(
        `[vexo:loop-guard-shadow] conversationId=${conversation.id} avgSimilarity=${avgSimilarity.toFixed(3)} ` +
          `threshold=${STAGNATION_SIMILARITY_THRESHOLD} stuck=${stuck} ` +
          `pairSimilarities=${pairSimilarities.map((s) => s.toFixed(2)).join(",")} textos=${JSON.stringify(texts)}`
      );

      if (stuck && !STAGNATION_GUARD_SHADOW_MODE) {
        await escalateToHuman(
          `Possível loop automático: as últimas ${STAGNATION_WINDOW_SIZE} respostas da IA nesta conversa estão ` +
            `muito parecidas entre si (similaridade média ${(avgSimilarity * 100).toFixed(0)}%, limiar ` +
            `${(STAGNATION_SIMILARITY_THRESHOLD * 100).toFixed(0)}%) — sem progressão real, pausada para revisão humana.`
        );
        return;
      }
    }
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
  console.log(`[vexo:timing] classifyConversation levou ${Date.now() - pipelineStartedAt}ms (desde o início do processamento deste evento)`);

  if (signal.needsHuman) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "NEEDS_HUMAN", needsHumanReason: signal.needsHumanReason ?? "Não especificado" },
    });

    // Bug crítico real em produção: escalonar pra NEEDS_HUMAN nunca mandava
    // NENHUMA mensagem de volta pro lead — só atualizava o status e (se
    // configurado) avisava a clínica por WhatsApp, em silêncio. Do lado do
    // lead isso é indistinguível de "a IA parou de responder": ele mandou
    // uma mensagem nova (ex.: uma dúvida ou pedido relacionado à saúde,
    // motivo legítimo de escalonamento pelo CLASSIFIER_SYSTEM_PROMPT) e
    // simplesmente nunca recebeu nada de volta. Isso vale pra QUALQUER
    // escalonamento, não só depois de agendamento confirmado — só ficou
    // mais visível nesse teste porque a pergunta veio logo depois de
    // marcar o horário. Mensagem curta e neutra, igual pra todo motivo de
    // escalonamento (não tenta explicar o motivo específico ao lead) —
    // só pra confirmar que a mensagem chegou e alguém vai continuar a
    // conversa, em vez de deixar a conversa parecendo "morta".
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        sender: "SYSTEM",
        content: "Entendi! Vou repassar isso pra nossa equipe te dar mais detalhes por aqui, tá bom? 🙂",
        status: "PENDING",
        scheduledFor: new Date(Date.now() + FAST_REPLY_DELAY_SECONDS * 1000),
      },
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

  // Janela de mensagens recentes mandadas por inteiro pra IA de
  // conversação (generateLeadReply, mais abaixo) — o que ficar de fora
  // vira um resumo curto (ver buildConversationContext/withOlderSummary em
  // conversation-context.ts, e summarizeOlderTurns em anthropic.ts). Bug
  // real de custo: sem isso, `chatHistory` (a conversa INTEIRA desde o
  // primeiro dia) ia por completo pro Sonnet em toda mensagem nova, pra
  // sempre — sem nenhum teto, o custo de input só cresce numa conversa
  // longa. Calculado só aqui (depois do "return" de needsHuman acima) pra
  // não gastar a chamada de resumo (Haiku) à toa quando a conversa
  // escalona antes de gerar qualquer resposta. Só afeta a geração da
  // resposta; o classificador acima continua vendo o histórico completo
  // (classifierHistory), sem mudança nenhuma.
  const conversationContext = await buildConversationContext(history, summarizeOlderTurns);
  const windowedHistory = withOlderSummary(conversationContext);

  let scheduledStartTime: string | undefined;
  let capturedLeadPhone: string | undefined;
  let capturedResultPhoto: ResultPhotoInput | undefined;
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
    `agendamento e move ele em vez de criar outro. Quando o lead pedir pra agendar sem dizer ` +
    `qual dia, SEMPRE confirme o DIA específico primeiro (ex.: "quinta-feira", "dia 20", ` +
    `"amanhã") antes de perguntar ou oferecer período do dia (manhã/tarde) — nunca pergunte só ` +
    `"manhã ou tarde?" sem já saber (ou ter perguntado) em qual dia; sem o dia definido, ` +
    `check_availability não tem como saber que intervalo consultar.]`;

  const reply = await generateLeadReply({
    // Separados (não mais concatenados numa string só) pra permitir prompt
    // caching: basePrompt é estável por clínica, dateTimeContext muda a
    // cada mensagem — ver cache_control em generateLeadReply, anthropic.ts.
    systemPrompt: basePrompt,
    contextNote: dateTimeContext,
    history: windowedHistory,
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
        capturedResultPhoto = { imageUrl: photo.imageUrl, caption: photo.caption };
        resultPhotoAlreadySent = true;
        return { sent: true };
      },
    },
  });
  console.log(`[vexo:timing] generateLeadReply levou ${Date.now() - pipelineStartedAt}ms no total (desde o início do processamento deste evento, inclui classifyConversation)`);

  const leadResponseTimeSeconds = previousAiMessage?.sentAt
    ? Math.max(0, Math.round((event.timestamp.getTime() - previousAiMessage.sentAt.getTime()) / 1000))
    : null;

  const aiSettings = await prisma.aiSettings.findUnique({ where: { id: "singleton" } });
  const delaySeconds = aiSettings?.adaptiveDelayEnabled === false
    ? FAST_REPLY_DELAY_SECONDS
    : computeAdaptiveDelaySeconds(leadResponseTimeSeconds, clinic.firstBandDelaySeconds);
  const scheduledFor = new Date(Date.now() + delaySeconds * 1000);

  // Diagnóstico TEMPORÁRIO (remover depois de confirmar o comportamento em
  // produção) — investigação do relato de que o delay da faixa "até 1h"
  // (Clinic.firstBandDelaySeconds, ajustável em Agente de IA) não muda o
  // tempo de resposta observado, mesmo configurando valores bem diferentes,
  // de forma consistente ao longo de várias semanas/deploys. Mostra, no
  // exato momento do cálculo: o valor CRU lido do banco agora mesmo
  // (firstBandDelaySecondsDb — descarta de vez a hipótese de cache/deploy
  // desatualizado se bater com o configurado) e o valor que
  // computeAdaptiveDelaySeconds efetivamente devolveu (delaySeconds) — se
  // os dois baterem com o configurado na tela mas o lead ainda receber a
  // resposta fora desse intervalo, o problema está em outro lugar (ex:
  // tempo de geração da IA antes daqui, ou o worker de despacho), não
  // nesse cálculo.
  console.log(
    `[vexo:timing] clinicId=${clinic.id} clinicName=${JSON.stringify(clinic.name)} ` +
      `adaptiveDelayEnabled=${aiSettings?.adaptiveDelayEnabled ?? true} ` +
      `leadResponseTimeSeconds=${leadResponseTimeSeconds} ` +
      `firstBandDelaySecondsDb=${clinic.firstBandDelaySeconds} ` +
      `delaySeconds(usado)=${delaySeconds} ` +
      `now=${new Date().toISOString()} scheduledFor=${scheduledFor.toISOString()}`
  );

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
    // O WhatsApp pode ter sido pedido numa mensagem ANTERIOR à que
    // agendou (ex: a própria mensagem de confirmação do horário já pede
    // o WhatsApp, e o lead só responde com o número no turno seguinte) —
    // se já existe um agendamento esperando o vídeo, manda agora que o
    // número acabou de chegar. Ver maybeSendConfirmationVideo pro bug que
    // isso corrige (vídeo saindo antes do WhatsApp confirmado).
    await maybeSendConfirmationVideo({ clinicId: clinic.id, conversationId: conversation.id, afterScheduledFor: scheduledFor });
  }

  if (capturedResultPhoto) {
    // +5s pra chegar logo depois da resposta em texto, não junto/antes dela
    // — a legenda cadastrada (ResultPhoto.caption), quando existe, sai
    // ainda mais alguns segundos antes da própria foto (ver
    // buildResultPhotoMessages, src/lib/result-photo-message.ts); sem
    // legenda, comportamento idêntico ao de antes desse campo existir.
    const photoMessages = buildResultPhotoMessages(capturedResultPhoto, new Date(scheduledFor.getTime() + 5_000));
    await prisma.$transaction([
      ...photoMessages.map((draft) =>
        prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: "OUTBOUND",
            sender: "AI",
            content: draft.content,
            mediaUrl: draft.mediaUrl,
            status: "PENDING",
            scheduledFor: draft.scheduledFor,
          },
        })
      ),
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
      // Vídeo (se houver) só pode sair DEPOIS que a própria mensagem de
      // confirmação (reply.text, criada acima com este mesmo scheduledFor)
      // já tiver saído — ver comentário mais abaixo, dentro da função.
      afterScheduledFor: scheduledFor,
    });
  }
}

async function confirmAppointment(params: {
  clinicId: string;
  conversationId: string;
  leadId: string;
  leadName?: string;
  startTimeIso: string;
  afterScheduledFor: Date;
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

  if (existing) {
    if (existing.scheduledAt.getTime() !== newScheduledAt.getTime()) {
      // Horário diferente do já agendado nesta conversa = remarcação:
      // move o evento EXISTENTE em vez de criar outro.
      if (existing.googleEventId) {
        try {
          await updateCalendarEvent(params.clinicId, existing.googleEventId, params.startTimeIso);
        } catch (err) {
          console.error("[vexo] Falha ao mover evento no Google Calendar:", err);
        }
      }
      await prisma.appointment.update({
        where: { id: existing.id },
        data: { scheduledAt: newScheduledAt },
      });
    }
    // Senão: mesmo horário já confirmado antes nesta conversa (reenvio da
    // mesma chamada, ou o modelo confirmando de novo o que já estava
    // certo) — reaproveita sem mexer no Google Calendar nem duplicar.
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

    await prisma.appointment.create({
      data: {
        clinicId: params.clinicId,
        conversationId: params.conversationId,
        leadId: params.leadId,
        scheduledAt: newScheduledAt,
        googleEventId,
        status: "SCHEDULED",
      },
    });
  }

  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { status: "SCHEDULED" },
  });

  await maybeSendConfirmationVideo({
    clinicId: params.clinicId,
    conversationId: params.conversationId,
    afterScheduledFor: params.afterScheduledFor,
  });
}

// Bug real reportado em produção: o vídeo saía IMEDIATAMENTE ao agendar,
// mesmo quando a PRÓPRIA mensagem que confirmou o horário também pedia o
// WhatsApp do lead pela primeira vez — ou seja, o vídeo chegava antes do
// número sequer ter sido informado, "do nada", sem ter sido pedido ainda
// numa resposta anterior. Por isso essa checagem não vive só dentro de
// confirmAppointment (chamada uma vez, no momento de agendar): é chamada
// de novo sempre que um telefone novo é capturado (ver capturedLeadPhone
// em handleInboundInstagramMessage), pra cobrir o caso comum de agendar
// primeiro e o lead só responder com o WhatsApp num turno seguinte — sem
// isso, o vídeo nunca seria enviado nesse caso (nada mais dispara
// confirmAppointment de novo só porque o telefone chegou).
//
// Idempotente (por Appointment.confirmationVideoSentAt) e silenciosa
// quando ainda não há o que mandar (sem agendamento ativo, sem vídeo
// configurado pela clínica, ou sem telefone ainda) — cada chamada só
// efetivamente envia quando as três condições finalmente se encontram.
async function maybeSendConfirmationVideo(params: {
  clinicId: string;
  conversationId: string;
  afterScheduledFor: Date;
}) {
  const appointment = await prisma.appointment.findFirst({
    where: { conversationId: params.conversationId, status: { in: ["SCHEDULED", "CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!appointment || appointment.confirmationVideoSentAt) return;

  const [clinic, conversation] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: params.clinicId } }),
    prisma.conversation.findUnique({ where: { id: params.conversationId }, include: { lead: true } }),
  ]);
  if (!clinic?.confirmationVideoUrl) return;
  // Ainda sem WhatsApp — não é erro, só significa "ainda não é a hora";
  // a próxima chamada (quando o telefone chegar) tenta de novo.
  if (!conversation?.lead.phone) return;

  // Bug real reportado em produção (parte 1, resolvida antes desta): o
  // vídeo saía IMEDIATAMENTE (scheduledFor: agora), enquanto a própria
  // mensagem de texto que confirma o agendamento pro lead (reply.text,
  // criada em handleInboundInstagramMessage com um delay adaptativo de
  // alguns segundos a poucos minutos — ver computeAdaptiveDelaySeconds)
  // ainda estava PENDING, esperando esse delay passar. Corrigido
  // ancorando o vídeo alguns segundos DEPOIS de params.afterScheduledFor
  // (o scheduledFor da mensagem que disparou esta checagem — a de
  // confirmação do agendamento, ou a que reconhece o WhatsApp recebido),
  // nunca antes dela.
  //
  // Também manda uma frase curta explicando o vídeo ANTES dele — a API do
  // Instagram não permite combinar texto + mídia numa única mensagem (por
  // isso vira dois envios separados, mesmo padrão já usado nos passos de
  // follow-up com anexo em follow-up.ts), e sem isso o vídeo chegava sem
  // nenhuma legenda/contexto (dispatchDueMessages descarta message.content
  // quando mediaUrl está preenchido — só a mídia é enviada nesse caso).
  const introAt = new Date(params.afterScheduledFor.getTime() + 5_000);
  const videoAt = new Date(params.afterScheduledFor.getTime() + 8_000);
  const introText = clinic.confirmationVideoCaption?.trim() || DEFAULT_CONFIRMATION_VIDEO_CAPTION;
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "OUTBOUND",
        sender: "SYSTEM",
        content: introText,
        status: "PENDING",
        scheduledFor: introAt,
      },
    }),
    prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "OUTBOUND",
        sender: "SYSTEM",
        content: "[vídeo de confirmação de agendamento]",
        mediaUrl: clinic.confirmationVideoUrl,
        status: "PENDING",
        scheduledFor: videoAt,
      },
    }),
    prisma.appointment.update({
      where: { id: appointment.id },
      data: { confirmationVideoSentAt: new Date() },
    }),
  ]);
}
