import { prisma } from "@/lib/prisma";
import { classifyConversation, generateLeadReply, type CalendarTool } from "@/lib/anthropic";
import { checkAvailability, createCalendarEvent } from "@/lib/google-calendar";
import { computeAdaptiveDelaySeconds } from "@/lib/scheduler";
import { DEFAULT_CONVERSATION_SYSTEM_PROMPT } from "@/lib/default-prompt";
import { sendWhatsappMessage, formatEscalationAlert } from "@/lib/whatsapp";
import { cancelPendingFollowUp } from "@/lib/follow-up";
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

function buildAvailabilityCheck(clinicId: string): CalendarTool["checkAvailability"] {
  return async ({ dateFrom, dateTo }) => {
    try {
      const slots = await checkAvailability(clinicId, dateFrom, dateTo);
      return { slots };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao consultar agenda." };
    }
  };
}

export async function handleInboundInstagramMessage(event: InboundInstagramEvent) {
  const igAccount = await prisma.instagramAccount.findFirst({
    where: { igUserId: event.igUserId },
    include: { clinic: true },
  });
  if (!igAccount) {
    console.warn(`[vexo] Webhook recebido para conta IG desconhecida: ${event.igUserId}`);
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

  const reply = await generateLeadReply({
    systemPrompt: clinic.aiSystemPrompt || DEFAULT_CONVERSATION_SYSTEM_PROMPT,
    history: chatHistory,
    calendar: {
      checkAvailability: buildAvailabilityCheck(clinic.id),
      async scheduleAppointment(args) {
        scheduledStartTime = args.startTime;
        return { confirmed: true, startTime: args.startTime };
      },
    },
  });

  const leadResponseTimeSeconds = previousAiMessage?.sentAt
    ? Math.max(0, Math.round((event.timestamp.getTime() - previousAiMessage.sentAt.getTime()) / 1000))
    : null;

  const delaySeconds = computeAdaptiveDelaySeconds(leadResponseTimeSeconds);
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
  let googleEventId: string | undefined;
  try {
    googleEventId = await createCalendarEvent(
      params.clinicId,
      params.startTimeIso,
      `VEXO — Avaliação: ${params.leadName ?? "lead"}`
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

  const clinic = await prisma.clinic.findUnique({ where: { id: params.clinicId } });
  if (clinic?.welcomeVideoUrl) {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: params.conversationId,
          direction: "OUTBOUND",
          sender: "SYSTEM",
          content: "[vídeo de boas-vindas — primeiro atendimento]",
          mediaUrl: clinic.welcomeVideoUrl,
          status: "PENDING",
          scheduledFor: new Date(),
        },
      }),
      prisma.appointment.update({
        where: { id: appointment.id },
        data: { welcomeVideoSentAt: new Date() },
      }),
    ]);
  }
}
