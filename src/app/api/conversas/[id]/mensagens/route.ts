import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Busca leve usada pelo polling da tela de conversa (ConversationMessages,
// a cada 3-4s): só as mensagens MAIS NOVAS que o último par
// (afterCreatedAt, afterId) que o cliente já tem — nunca a conversa
// inteira. O desempate por id replica exatamente o orderBy [createdAt asc,
// id asc] usado na primeira carga (ver comentário em conversas/[id]/page.tsx
// sobre mensagens do mesmo lote empatadas em createdAt).
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

  const afterCreatedAtRaw = request.nextUrl.searchParams.get("afterCreatedAt");
  const afterId = request.nextUrl.searchParams.get("afterId");
  if (!afterCreatedAtRaw || !afterId) {
    return NextResponse.json({ error: "afterCreatedAt e afterId são obrigatórios" }, { status: 400 });
  }
  const afterCreatedAt = new Date(afterCreatedAtRaw);
  if (Number.isNaN(afterCreatedAt.getTime())) {
    return NextResponse.json({ error: "afterCreatedAt inválido" }, { status: 400 });
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      OR: [{ createdAt: { gt: afterCreatedAt } }, { createdAt: afterCreatedAt, id: { gt: afterId } }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return NextResponse.json({ messages });
}
