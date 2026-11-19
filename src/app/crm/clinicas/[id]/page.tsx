import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalOrReviewerSession } from "@/lib/session";
import { getPipelineSnapshot } from "@/lib/pipeline-data";
import { PipelineBoard } from "@/components/PipelineBoard";

export const dynamic = "force-dynamic";

// Board em si (faixa de métricas + colunas) virou um Client Component
// (PipelineBoard.tsx) que se atualiza sozinho a cada ~3.5s (mesma técnica
// da tela de conversa, ver pipeline-polling.ts) — esta página só garante a
// sessão, confirma que a clínica existe e busca o retrato INICIAL (mesma
// função getPipelineSnapshot que a rota de polling usa, fonte única).
export default async function ClinicPipelinePage({ params }: { params: { id: string } }) {
  await requireInternalOrReviewerSession(params.id);

  const clinicId = params.id;

  const [clinic, snapshot] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } }),
    getPipelineSnapshot(clinicId),
  ]);

  if (!clinic) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-1 text-sm text-vexo-muted">{clinic.name}</p>
      </div>

      <PipelineBoard clinicId={clinicId} initialSnapshot={snapshot} />
    </div>
  );
}
