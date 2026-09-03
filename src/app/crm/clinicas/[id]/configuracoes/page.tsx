import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Placeholder — futuramente vai guardar ajustes visuais/tema (cores, fontes
// etc) do sistema. Por enquanto só existe pra o item de menu e a rota já
// estarem no lugar certo.
export default async function ClinicConfiguracoesPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!clinic) notFound();

  return (
    <div className="max-w-3xl space-y-2.5">
      <h1 className="text-base font-semibold tracking-tight">Configurações</h1>
      <p className="rounded-xl border border-vexo-border bg-vexo-surface p-3.5 text-sm text-vexo-muted">
        Em breve: ajustes visuais do sistema (cores, fontes e outras preferências de aparência).
      </p>
    </div>
  );
}
