import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPipelineSnapshot } from "@/lib/pipeline-data";

// Busca leve usada pelo polling do Pipeline (PipelineBoard, a cada 3-4s) —
// mesmo retrato que a página usa na primeira carga (getPipelineSnapshot,
// fonte única), devolvido inteiro (não é incremental como a de mensagens:
// aqui qualquer card pode ter mudado de coluna, então o cliente compara o
// retrato novo com o atual e decide o que fazer, ver pipeline-polling.ts).
//
// :id aqui já É o clinicId (rota /api/clinicas/[id]/pipeline, não
// /conversas/[id] como em mensagens) — o dono do Revisor é checado direto
// contra o :id, sem precisar consultar o banco antes. Liberada
// explicitamente pra ele em reviewer-access.ts, só leitura (GET) e só da
// própria clínica.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const isInternalUser = session?.user.role === "INTERNAL_ADMIN" || session?.user.role === "INTERNAL_STAFF";
  const isReviewerUser = session?.user.role === "REVIEWER";
  if (!session || (!isInternalUser && !isReviewerUser)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (isReviewerUser && session.user.clinicId !== params.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const snapshot = await getPipelineSnapshot(params.id);
  return NextResponse.json(snapshot);
}
