import { prisma } from "@/lib/prisma";
import { classifyConversation } from "@/lib/anthropic";
import { toChatHistory } from "@/lib/conversation-pipeline";

// Detecta dois gatilhos de follow-up (ver especificação, "Fluxo principal"):
//  a) o lead some no meio da conversa
//  b) o lead não comparece ao horário agendado
// A decisão de "sumiu no meio" usa Haiku para não reabrir follow-up em
// conversas que já chegaram a uma conclusão natural (ex: recusa explícita).

const FOLLOW_UP_SILENCE_HOURS = Number(process.env.FOLLOW_UP_SILENCE_HOURS ?? 20);
const NO_SHOW_GRACE_HOURS = Number(process.env.NO_SHOW_GRACE_HOURS ?? 2);

const SILENCE_FOLLOW_UP_MESSAGE =
  "Oi! Ainda tem interesse em agendar sua avaliação? Consigo te ajudar a encontrar um horário 🙂";
const NO_SHOW_FOLLOW_UP_MESSAGE =
  "Oi! Vimos que não foi possível comparecer hoje. Quer que eu já veja um novo horário pra você?";

async function triggerFollowUp(conversationId: string, reason: string, message: string) {
  await prisma.$transaction([
    prisma.conversation.update({ where: { id: conversationId }, data: { status: "FOLLOW_UP" } }),
    prisma.followUpLog.create({ data: { conversationId, reason } }),
    prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        sender: "AI",
        content: message,
        status: "PENDING",
        scheduledFor: new Date(),
      },
    }),
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

    await triggerFollowUp(conv.id, "sumiu_na_conversa", SILENCE_FOLLOW_UP_MESSAGE);
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
    await triggerFollowUp(appt.conversationId, "nao_compareceu", NO_SHOW_FOLLOW_UP_MESSAGE);
    triggered++;
  }
  return triggered;
}

export async function processFollowUps(): Promise<{ triggered: number }> {
  const [silent, missed] = await Promise.all([
    processSilentConversations(),
    processMissedAppointments(),
  ]);
  return { triggered: silent + missed };
}
