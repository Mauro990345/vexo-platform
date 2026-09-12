import { prisma } from "@/lib/prisma";
import { sendInstagramMessage } from "@/lib/instagram";
import { toPublicUploadUrl } from "@/lib/uploads";

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
    // TUDO dentro do try — inclusive o acesso a message.conversation.clinic
    // e o update de "sem conta conectada", que antes ficavam FORA do
    // try/catch (só a chamada de sendInstagramMessage era protegida). Uma
    // exceção não tratada aqui (relação nula por inconsistência de dados,
    // falha no próprio update, etc.) abortava o `for` inteiro — e como
    // `due` vem ordenado por scheduledFor ascendente, TODA mensagem depois
    // da que quebrou (inclusive mensagens mais novas) nunca chegava a ser
    // tentada, ciclo após ciclo, sem nenhum erro visível (a exceção só
    // aparecia no catch de fora, em runSafely no worker, direto pro log do
    // Railway — sem acesso). Isso explica uma mensagem específica ficar
    // PENDING pra sempre enquanto mensagens mais antigas na mesma fila são
    // processadas normalmente: não é a query que ignora a linha, é uma
    // exceção anterior na mesma leva que trava o resto atrás dela.
    try {
      const igAccount = message.conversation.clinic.instagramAccount;
      if (!igAccount) {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "FAILED", failReason: "Clínica sem conta do Instagram conectada." },
        });
        failed++;
        continue;
      }

      const result = await sendInstagramMessage({
        accessTokenEnc: igAccount.accessTokenEnc,
        igUserId: igAccount.igUserId,
        recipientIgScopedId: message.conversation.lead.igScopedId,
        text: message.mediaUrl ? undefined : message.content,
        mediaUrl: message.mediaUrl ? toPublicUploadUrl(message.mediaUrl) : undefined,
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
      const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      failed++;
      console.error(`[vexo] Falha ao processar mensagem ${message.id}:`, err);
      // Catch própria pro update em si — se ATÉ marcar como FAILED falhar,
      // não deixa isso também virar uma exceção não tratada que travaria o
      // resto da fila de novo, exatamente o bug que essa mudança corrige.
      await prisma.message
        .update({ where: { id: message.id }, data: { status: "FAILED", failReason: detail.slice(0, 2000) } })
        .catch((updateErr) => console.error(`[vexo] Falha ao marcar mensagem ${message.id} como FAILED:`, updateErr));
    }
  }

  return { sent, failed };
}
