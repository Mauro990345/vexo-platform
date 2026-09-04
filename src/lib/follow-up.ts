import { prisma } from "@/lib/prisma";
import type { ConversationStatus } from "@prisma/client";
import { classifyConversation } from "@/lib/anthropic";
import { toChatHistory } from "@/lib/chat-history";
import { nextValidSendTime } from "@/lib/follow-up-window";

// Duas sequências de follow-up independentes (ver FollowUpTrigger no schema):
//
//  - SILENCE: automático — o lead para de responder. Detectado sozinho pela
//    última mensagem da conversa, sem ação manual de ninguém. Só vale ANTES
//    do agendamento: a query abaixo olha só conversas com status
//    IN_CONVERSATION, então some da lista assim que o lead agenda (status
//    vira SCHEDULED) — dali em diante é só o fluxo de lembrete/no-show.
//    A decisão final usa Haiku para não reabrir follow-up em conversas que
//    já chegaram a uma conclusão natural (ex: recusa explícita).
//
//  - NO_SHOW: manual — só a secretária sabe se o paciente compareceu, o
//    sistema não tem como saber sozinho. Disparado pela chave "Compareceu /
//    Não compareceu" na tela do agendamento (ver src/lib/appointments.ts) —
//    não há nenhuma detecção automática por tempo decorrido.
//
// As mensagens enviadas seguem a sequência configurável em FollowUpStep
// (editável em /crm/follow-up, uma lista por trigger), e só saem dentro da
// janela de envio configurável (ver follow-up-window.ts) — fora da janela,
// o horário de envio é adiado pra próxima ocorrência válida em vez de
// disparar na hora.
//
// Cada log de follow-up avança pela sequência do seu próprio trigger a cada
// execução do worker, e para de avançar assim que o lead responde: ver
// cancelPendingFollowUp, chamada tanto por conversation-pipeline.ts (lead
// respondeu) quanto por appointments.ts (secretária desmarcou "não
// compareceu").

const DEFAULT_SILENCE_HOURS = 24;
const DEFAULT_WINDOW_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_WINDOW_START_MINUTE = 8 * 60;
const DEFAULT_WINDOW_END_MINUTE = 18 * 60;

async function getSettings() {
  const settings = await prisma.followUpSettings.findUnique({ where: { id: "singleton" } });
  return {
    silenceHours: settings?.silenceHours ?? DEFAULT_SILENCE_HOURS,
    windowDays: settings?.windowDays?.length ? settings.windowDays : DEFAULT_WINDOW_DAYS,
    windowStartMinute: settings?.windowStartMinute ?? DEFAULT_WINDOW_START_MINUTE,
    windowEndMinute: settings?.windowEndMinute ?? DEFAULT_WINDOW_END_MINUTE,
  };
}

// Move a conversa pra FOLLOW_UP e abre um log — chamada tanto pela detecção
// automática de silêncio quanto pela marcação manual de "não compareceu"
// (src/lib/appointments.ts).
export async function triggerFollowUp(conversationId: string, trigger: "SILENCE" | "NO_SHOW") {
  await prisma.$transaction([
    prisma.conversation.update({ where: { id: conversationId }, data: { status: "FOLLOW_UP" } }),
    prisma.followUpLog.create({ data: { conversationId, trigger } }),
  ]);
}

// Interrompe qualquer follow-up em andamento numa conversa: fecha os logs
// abertos (o dispatcher para de avançá-los) e cancela mensagens já
// enfileiradas (status PENDING) que ainda não saíram de fato — sem isso,
// uma mensagem que já tinha sido posta na fila pelo worker ainda seria
// enviada mesmo depois do lead responder ou da secretária desmarcar.
export async function cancelPendingFollowUp(
  conversationId: string,
  at: Date = new Date(),
  newConversationStatus?: ConversationStatus
) {
  await prisma.$transaction([
    prisma.followUpLog.updateMany({
      where: { conversationId, respondedAt: null },
      data: { respondedAt: at },
    }),
    prisma.message.deleteMany({
      where: { conversationId, status: "PENDING", sender: "AI" },
    }),
    ...(newConversationStatus
      ? [prisma.conversation.update({ where: { id: conversationId }, data: { status: newConversationStatus } })]
      : []),
  ]);
}

async function processSilentConversations(): Promise<number> {
  const { silenceHours } = await getSettings();
  const silenceThreshold = new Date(Date.now() - silenceHours * 60 * 60 * 1000);

  // status: IN_CONVERSATION exclui de propósito quem já agendou (SCHEDULED)
  // — o gatilho de silêncio só vale antes do agendamento acontecer.
  const staleConversations = await prisma.conversation.findMany({
    where: { status: "IN_CONVERSATION", lastLeadMessageAt: { lt: silenceThreshold } },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  let triggered = 0;
  for (const conv of staleConversations) {
    const alreadyPending = await prisma.followUpLog.findFirst({
      where: { conversationId: conv.id, respondedAt: null },
    });
    if (alreadyPending) continue;

    const signal = await classifyConversation(toChatHistory(conv.messages));
    if (!signal.suggestedFollowUp) continue;

    await triggerFollowUp(conv.id, "SILENCE");
    triggered++;
  }
  return triggered;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function dispatchFollowUpSteps(): Promise<number> {
  const [silenceSteps, noShowSteps, settings] = await Promise.all([
    prisma.followUpStep.findMany({ where: { trigger: "SILENCE" }, orderBy: { order: "asc" } }),
    prisma.followUpStep.findMany({ where: { trigger: "NO_SHOW" }, orderBy: { order: "asc" } }),
    getSettings(),
  ]);

  const openLogs = await prisma.followUpLog.findMany({
    where: { respondedAt: null, conversation: { status: "FOLLOW_UP" } },
    include: {
      conversation: {
        select: {
          lastLeadMessageAt: true,
          appointments: {
            where: { status: { in: ["SCHEDULED", "CONFIRMED"] } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  let dispatched = 0;
  const now = new Date();

  for (const log of openLogs) {
    // Sem passo configurado pra esse trigger: não envia nada — sem mensagem
    // padrão/fallback. Só sai o que a clínica configurou explicitamente em
    // /crm/follow-up.
    const steps = log.trigger === "NO_SHOW" ? noShowSteps : silenceSteps;

    const nextIndex = (log.lastStepIndex ?? -1) + 1;
    const nextStep = steps[nextIndex];
    if (!nextStep) continue; // sequência já concluída para este log

    const dueAt = log.lastStepSentAt
      ? addDays(log.lastStepSentAt, nextStep.offsetDays)
      : addDays(log.triggeredAt, nextStep.offsetDays);
    if (now < dueAt) continue;

    // Confere de novo, bem no momento de enviar, se o lead já respondeu ou
    // já tem agendamento marcado desde o último passo — normalmente isso já
    // teria cancelado o follow-up antes (ver cancelPendingFollowUp, chamada
    // assim que a resposta/o agendamento chega), mas essa segunda checagem
    // não confia cegamente nisso: cobre corrida entre o worker e o evento
    // que cancela, e qualquer forma futura de confirmar agendamento que não
    // passe por um dos pontos que já cancelam.
    const sinceRef = log.lastStepSentAt ?? log.triggeredAt;
    const leadReplied = Boolean(log.conversation.lastLeadMessageAt && log.conversation.lastLeadMessageAt > sinceRef);
    const rescheduled = log.conversation.appointments.length > 0;

    if (leadReplied || rescheduled) {
      await cancelPendingFollowUp(log.conversationId, now, rescheduled ? "SCHEDULED" : "IN_CONVERSATION");
      continue;
    }

    // O passo já venceu (dueAt <= now) — mas o envio de fato só acontece
    // dentro da janela configurada; fora dela, adia pra próxima ocorrência
    // válida em vez de disparar na hora.
    const sendAt = nextValidSendTime(now, settings.windowDays, settings.windowStartMinute, settings.windowEndMinute);

    const messagesToCreate = [];
    if (nextStep.content) {
      messagesToCreate.push({
        conversationId: log.conversationId,
        direction: "OUTBOUND" as const,
        sender: "AI" as const,
        content: nextStep.content,
        status: "PENDING" as const,
        scheduledFor: sendAt,
      });
    }
    if (nextStep.attachmentUrl) {
      messagesToCreate.push({
        conversationId: log.conversationId,
        direction: "OUTBOUND" as const,
        sender: "AI" as const,
        content: nextStep.content ? "[anexo]" : "",
        mediaUrl: nextStep.attachmentUrl,
        status: "PENDING" as const,
        // Se já existe uma mensagem de texto no mesmo passo, o anexo chega
        // logo em seguida, como duas mensagens separadas (limite da API do
        // Instagram: não dá pra combinar texto + anexo numa única mensagem).
        scheduledFor: nextStep.content ? new Date(sendAt.getTime() + 5_000) : sendAt,
      });
    }

    await prisma.$transaction([
      ...messagesToCreate.map((data) => prisma.message.create({ data })),
      prisma.followUpLog.update({
        where: { id: log.id },
        // lastStepSentAt marca o momento em que o passo foi PROCESSADO (pra
        // contar o espaçamento até o próximo a partir daqui), não o horário
        // de envio real — assim o espaçamento entre passos não fica maior só
        // porque um deles teve que esperar a janela abrir.
        data: { lastStepIndex: nextIndex, lastStepSentAt: now },
      }),
    ]);
    dispatched++;
  }

  return dispatched;
}

export async function processFollowUps(): Promise<{ triggered: number; stepsDispatched: number }> {
  const triggered = await processSilentConversations();
  const stepsDispatched = await dispatchFollowUpSteps();
  return { triggered, stepsDispatched };
}
