import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClinicsListPage() {
  const clinics = await prisma.clinic.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      instagramAccount: true,
      googleCalendarAccount: true,
      _count: {
        select: {
          conversations: { where: { status: { in: ["NEW", "IN_CONVERSATION"] } } },
        },
      },
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Clínicas</h1>
        <Link
          href="/crm/clinicas/nova"
          className="rounded-lg bg-vexo-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + Nova clínica
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clinics.map((clinic) => (
          <Link
            key={clinic.id}
            href={`/crm/clinicas/${clinic.id}`}
            className="rounded-xl border border-vexo-border bg-vexo-surface p-4 transition hover:border-vexo-accent"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">{clinic.name}</h2>
              <span
                className={`h-2 w-2 rounded-full ${clinic.active ? "bg-emerald-400" : "bg-vexo-muted"}`}
                title={clinic.active ? "Ativa" : "Inativa"}
              />
            </div>
            <p className="mb-3 text-xs text-vexo-muted">{clinic.slug}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span
                className={`rounded-full border px-2 py-0.5 ${clinic.instagramAccount ? "border-emerald-500/30 text-emerald-300" : "border-vexo-border text-vexo-muted"}`}
              >
                Instagram {clinic.instagramAccount ? "conectado" : "pendente"}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 ${clinic.googleCalendarAccount ? "border-emerald-500/30 text-emerald-300" : "border-vexo-border text-vexo-muted"}`}
              >
                Calendar {clinic.googleCalendarAccount ? "conectado" : "pendente"}
              </span>
            </div>
            <p className="mt-3 text-sm text-vexo-muted">
              {clinic._count.conversations} conversa(s) ativa(s)
            </p>
          </Link>
        ))}

        {clinics.length === 0 && (
          <p className="text-sm text-vexo-muted">Nenhuma clínica cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
