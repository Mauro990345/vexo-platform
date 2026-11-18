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
  if (!session || (session.user.role !== "INTERNAL_ADMIN" && session.user.role !== "INTERNAL_STAFF")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
