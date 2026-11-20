import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { messageVisibleAt, selectMessagesAfterCursor } from "@/lib/message-visibility";

// Busca leve usada pelo polling da tela de conversa (ConversationMessages,
// a cada 3-4s): só as mensagens MAIS NOVAS que o último par
// (afterVisibleAt, afterId) que o cliente já tem — nunca a conversa
// inteira. PENDING/SENDING nunca são devolvidas (a resposta da IA só
// aparece depois de enviada de verdade, ver message-visibility.ts).
//
// O cursor é pelo instante em que a mensagem FICOU VISÍVEL (sentAt pra
// saída, createdAt pra entrada), não createdAt puro — uma resposta criada
// PENDING minutos atrás (antes do cursor atual já ter avançado por causa
// de uma mensagem do lead nesse meio-tempo) só fica visível quando sai de
// verdade, e precisa continuar aparecendo nesse momento, não só num F5.
// A query abaixo já restringe pelas colunas reais de cada caso (sentAt
// pras de saída, updatedAt pras que falharam sem nunca ter saído,
// createdAt pras de entrada) — filtro exato (com o desempate por id) é
// refeito em memória sobre esse conjunto já pequeno, nunca a conversa
// inteira.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const isInternalUser = session?.user.role === "INTERNAL_ADMIN" || session?.user.role === "INTERNAL_STAFF";
  const isReviewerUser = session?.user.role === "REVIEWER";
  if (!session || (!isInternalUser && !isReviewerUser)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Login Revisor (ver UserRole.REVIEWER): esta rota é liberada por
  // pathname pro middleware (não dá pra saber a clínica só pelo :id da
  // conversa), então o dono de verdade é checado aqui — mesma regra das
  // páginas liberadas (requireInternalOrReviewerSession, session.ts): só
  // conversa da PRÓPRIA clínica do Revisor, 404 (nunca 401, pra não
  // revelar que a conversa existe) em qualquer outro caso.
  if (isReviewerUser) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      select: { clinicId: true },
    });
    if (!conversation || conversation.clinicId !== session.user.clinicId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  const afterVisibleAtRaw = request.nextUrl.searchParams.get("afterVisibleAt");
  const afterId = request.nextUrl.searchParams.get("afterId");
  if (!afterVisibleAtRaw || !afterId) {
    return NextResponse.json({ error: "afterVisibleAt e afterId são obrigatórios" }, { status: 400 });
  }
  const afterVisibleAt = new Date(afterVisibleAtRaw);
  if (Number.isNaN(afterVisibleAt.getTime())) {
    return NextResponse.json({ error: "afterVisibleAt inválido" }, { status: 400 });
  }

  const candidates = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      status: { in: ["SENT", "FAILED"] },
      OR: [
        { direction: "INBOUND", createdAt: { gt: afterVisibleAt } },
        { direction: "OUTBOUND", sentAt: { gt: afterVisibleAt } },
        { direction: "OUTBOUND", sentAt: null, updatedAt: { gt: afterVisibleAt } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const fresh = selectMessagesAfterCursor(
    candidates.map((m) => ({ ...m, visibleAt: messageVisibleAt(m) })),
    afterVisibleAt,
    afterId
  );

  return NextResponse.json({
    messages: fresh.map((m) => ({
      id: m.id,
      direction: m.direction,
      sender: m.sender,
      content: m.content,
      mediaUrl: m.mediaUrl,
      status: m.status,
      visibleAt: m.visibleAt.toISOString(),
    })),
  });
}
