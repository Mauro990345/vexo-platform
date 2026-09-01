import { prisma } from "@/lib/prisma";
import { classifyConversation } from "@/lib/anthropic";
import { toChatHistory } from "@/lib/conversation-pipeline";

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
//    sistema não tem como saber sozinho. Disparado exclusivamente pelo botão
//    "Não compareceu" na tela do agendamento (ver markAppointmentNoShow
//    abaixo e src/app/crm/clinicas/actions.ts) — não há nenhuma detecção
//    automática por tempo decorrido.
//
// As mensagens enviadas seguem a sequência configurável em FollowUpStep
// (editável em /crm/follow-up, uma lista por trigger). Cada log de follow-up
// avança pela sequência do seu próprio trigger a cada execução do worker, e
// para de avançar assim que o lead responde (ver conversation-pipeline.ts,
// que marca FollowUpLog.respondedAt e volta a conversa pra IN_CONVERSATION).

const DEFAULT_SILENCE_HOURS = 24;

// Usados somente enquanto a clínica ainda não configurou nenhum passo em
// /crm/follow-up para aquele trigger — garante que o follow-up nunca fique
// mudo por falta de configuração.
const DEFAULT_SILENCE_STEPS: { offsetDays: number; content: string; attachmentUrl: null }[] = [
  {
    offsetDays: 0,
    content: "Oi! Ainda tem interesse em agendar sua avaliação? Consigo te ajudar a encontrar um horário 🙂",
    attachmentUrl: null,
  },
];
const DEFAULT_NO_SHOW_STEPS: typeof DEFAULT_SILENCE_STEPS = [
  {
    // Só sai no dia seguinte — dá folga pra secretária marcar sem pressa.
    offsetDays: 1,
    content: "Oi! Vimos que não foi possível comparecer hoje. Quer que eu já veja um novo horário pra você?",
    attachmentUrl: null,
  },
];

async function getSilenceHours(): Promise<number> {
  const settings = await prisma.followUpSettings.findUnique({ where: { id: "singleton" } });
  return settings?.silenceHours ?? DEFAULT_SILENCE_HOURS;
}

async function triggerFollowUp(conversationId: string, trigger: "SILENCE" | "NO_SHOW") {
  await prisma.$transaction([
    prisma.conversation.update({ where: { id: conversationId }, data: { status: "FOLLOW_UP" } }),
    prisma.followUpLog.create({ data: { conversationId, trigger } }),
  ]);
}

async function processSilentConversations(): Promise<number> {
  const silenceHours = await getSilenceHours();
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

// Marca um agendamento como "não compareceu" e dispara a sequência NO_SHOW —
// único jeito de disparar esse trigger (não há detecção automática por
// tempo). Usado pelo botão manual da secretária em /crm (ver
// src/app/crm/clinicas/actions.ts). Guard contra reprocessar um agendamento
// já resolvido.
export async function markAppointmentNoShow(appointmentId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || (appt.status !== "SCHEDULED" && appt.status !== "CONFIRMED")) return null;

  const updated = await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "NO_SHOW" } });
  await triggerFollowUp(appt.conversationId, "NO_SHOW");
  return updated;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function dispatchFollowUpSteps(): Promise<number> {
  const [silenceSteps, noShowSteps] = await Promise.all([
    prisma.followUpStep.findMany({ where: { trigger: "SILENCE" }, orderBy: { order: "asc" } }),
    prisma.followUpStep.findMany({ where: { trigger: "NO_SHOW" }, orderBy: { order: "asc" } }),
  ]);

  const openLogs = await prisma.followUpLog.findMany({
    where: { respondedAt: null, conversation: { status: "FOLLOW_UP" } },
  });

  let dispatched = 0;
  const now = new Date();

  for (const log of openLogs) {
    const configuredSteps = log.trigger === "NO_SHOW" ? noShowSteps : silenceSteps;
    const steps = configuredSteps.length > 0
      ? configuredSteps
      : log.trigger === "NO_SHOW"
        ? DEFAULT_NO_SHOW_STEPS
        : DEFAULT_SILENCE_STEPS;

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
  const triggered = await processSilentConversations();
  const stepsDispatched = await dispatchFollowUpSteps();
  return { triggered, stepsDispatched };
}
