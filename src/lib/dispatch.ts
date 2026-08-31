import { prisma } from "@/lib/prisma";
import { sendInstagramMessage } from "@/lib/instagram";

// Despacha mensagens OUTBOUND com status PENDING cujo horário de envio
// (timing adaptativo) já chegou. Chamado periodicamente pelo worker.

export async function dispatchDueMessages(): Promise<{ sent: number; failed: number }> {
  const due = await prisma.message.findMany({
    where: { status: "PENDING", scheduledFor: { lte: new Date() } },
    include: {
      conversation: {
        include: {
          lead: true,
          clinic: { include: { instagramAccount: true } },
        },
      },
    },
    orderBy: { scheduledFor: "asc" },
    take: 50,
  });

  let sent = 0;
  let failed = 0;

  for (const message of due) {
    const igAccount = message.conversation.clinic.instagramAccount;
    if (!igAccount) {
      await prisma.message.update({
        where: { id: message.id },
        data: { status: "FAILED", failReason: "Clínica sem conta do Instagram conectada." },
      });
      failed++;
      continue;
    }

    try {
      const result = await sendInstagramMessage({
        pageAccessTokenEnc: igAccount.accessTokenEnc,
        igUserId: igAccount.igUserId,
        recipientIgScopedId: message.conversation.lead.igScopedId,
        text: message.mediaUrl ? undefined : message.content,
        mediaUrl: message.mediaUrl ?? undefined,
      });

      const now = new Date();
      await prisma.$transaction([
        prisma.message.update({
          where: { id: message.id },
          data: { status: "SENT", sentAt: now, igMessageId: result.messageId },
        }),
        prisma.conversation.update({
          where: { id: message.conversationId },
          data: {
            lastMessageAt: now,
            ...(message.sender === "AI" ? { lastAiMessageAt: now } : {}),
          },
        }),
      ]);
      sent++;
    } catch (err) {
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: "FAILED",
          failReason: err instanceof Error ? err.message : "Erro desconhecido ao enviar.",
        },
      });
      failed++;
      console.error(`[vexo] Falha ao enviar mensagem ${message.id}:`, err);
    }
  }

  return { sent, failed };
}
