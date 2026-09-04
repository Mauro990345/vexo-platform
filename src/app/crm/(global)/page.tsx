import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ClinicSearchList } from "@/components/ClinicSearchList";

export const dynamic = "force-dynamic";

// "Contas" agora é só o seletor/busca de clínica — as métricas que
// antes ficavam misturadas aqui moraram pra "Painel" (ver
// crm/(global)/painel/page.tsx).
export default async function ClinicsOverviewPage() {
  const clinics = await prisma.clinic.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, active: true },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Contas</h1>
        <Link
          href="/crm/clinicas/nova"
          className="rounded-lg bg-vexo-accent px-3 py-1.5 text-sm font-medium text-vexo-accentFg hover:opacity-90"
        >
          + Nova clínica
        </Link>
      </div>

      <ClinicSearchList clinics={clinics} />
    </div>
  );
}
