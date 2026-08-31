import { prisma } from "@/lib/prisma";
import { classifyConversation } from "@/lib/anthropic";
import { toChatHistory } from "@/lib/conversation-pipeline";

// Detecta dois gatilhos de follow-up (ver especificação, "Fluxo principal"):
//  a) o lead some no meio da conversa
//  b) o lead não comparece ao horário agendado
// A decisão de "sumiu no meio" usa Haiku para não reabrir follow-up em
// conversas que já chegaram a uma conclusão natural (ex: recusa explícita).
//
// As mensagens enviadas seguem a sequência configurável em FollowUpStep
// (editável em /crm/follow-up), não um texto fixo. Cada log de follow-up
// avança pela sequência a cada execução do worker, e para de avançar assim
// que o lead responde (ver conversation-pipeline.ts, que marca
// FollowUpLog.respondedAt e volta a conversa pra IN_CONVERSATION).

const FOLLOW_UP_SILENCE_HOURS = Number(process.env.FOLLOW_UP_SILENCE_HOURS ?? 20);
const NO_SHOW_GRACE_HOURS = Number(process.env.NO_SHOW_GRACE_HOURS ?? 2);

// Usado somente se a clínica ainda não configurou nenhum passo em
// /crm/follow-up — garante que o follow-up nunca fique mudo por falta de
// configuração.
const DEFAULT_STEPS: { offsetDays: number; content: string; attachmentUrl: null }[] = [
  {
    offsetDays: 0,
    content: "Oi! Ainda tem interesse em agendar sua avaliação? Consigo te ajudar a encontrar um horário 🙂",
    attachmentUrl: null,
  },
];
const DEFAULT_NO_SHOW_STEPS: typeof DEFAULT_STEPS = [
  {
    offsetDays: 0,
    content: "Oi! Vimos que não foi possível comparecer hoje. Quer que eu já veja um novo horário pra você?",
    attachmentUrl: null,
  },
];

async function triggerFollowUp(conversationId: string, reason: string) {
  await prisma.$transaction([
    prisma.conversation.update({ where: { id: conversationId }, data: { status: "FOLLOW_UP" } }),
    prisma.followUpLog.create({ data: { conversationId, reason } }),
  ]);
}

async function processSilentConversations(): Promise<number> {
  const silenceThreshold = new Date(Date.now() - FOLLOW_UP_SILENCE_HOURS * 60 * 60 * 1000);

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

    await triggerFollowUp(conv.id, "sumiu_na_conversa");
    triggered++;
  }
  return triggered;
}

async function processMissedAppointments(): Promise<number> {
  const graceThreshold = new Date(Date.now() - NO_SHOW_GRACE_HOURS * 60 * 60 * 1000);

  const missed = await prisma.appointment.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lt: graceThreshold } },
  });

  let triggered = 0;
  for (const appt of missed) {
    await prisma.appointment.update({ where: { id: appt.id }, data: { status: "NO_SHOW" } });
    await triggerFollowUp(appt.conversationId, "nao_compareceu");
    triggered++;
  }
  return triggered;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function dispatchFollowUpSteps(): Promise<number> {
  const configuredSteps = await prisma.followUpStep.findMany({ orderBy: { order: "asc" } });

  const openLogs = await prisma.followUpLog.findMany({
    where: { respondedAt: null, conversation: { status: "FOLLOW_UP" } },
  });

  let dispatched = 0;
  const now = new Date();

  for (const log of openLogs) {
    const steps = configuredSteps.length > 0
      ? configuredSteps
      : log.reason === "nao_compareceu"
        ? DEFAULT_NO_SHOW_STEPS
        : DEFAULT_STEPS;

    const nextIndex = (log.lastStepIndex ?? -1) + 1;
    const nextStep = steps[nextIndex];
    if (!nextStep) continue; // sequência já concluída para este log

    const dueAt = log.lastStepSentAt
      ? addDays(log.lastStepSentAt, nextStep.offsetDays)
      : addDays(log.triggeredAt, nextStep.offsetDays);
    if (now < dueAt) continue;

    const messagesToCreate = [];
    if (nextStep.content) {
      messagesToCreate.push({
        conversationId: log.conversationId,
        direction: "OUTBOUND" as const,
        sender: "AI" as const,
        content: nextStep.content,
        status: "PENDING" as const,
        scheduledFor: now,
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
        scheduledFor: nextStep.content ? new Date(now.getTime() + 5_000) : now,
      });
    }

    await prisma.$transaction([
      ...messagesToCreate.map((data) => prisma.message.create({ data })),
      prisma.followUpLog.update({
        where: { id: log.id },
        data: { lastStepIndex: nextIndex, lastStepSentAt: now },
      }),
    ]);
    dispatched++;
  }

  return dispatched;
}

export async function processFollowUps(): Promise<{ triggered: number; stepsDispatched: number }> {
  const [silent, missed] = await Promise.all([
    processSilentConversations(),
    processMissedAppointments(),
  ]);
  const stepsDispatched = await dispatchFollowUpSteps();
  return { triggered: silent + missed, stepsDispatched };
}
