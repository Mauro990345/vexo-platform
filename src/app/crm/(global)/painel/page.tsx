import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getClinicMetrics, startOfDay, addDays } from "@/lib/metrics";
import { ClinicMetricsCard } from "@/components/ClinicMetricsCard";
import { ClientAccessModal } from "@/components/ClientAccessModal";

export const dynamic = "force-dynamic";

// Dashboard de métricas de todas as clínicas — antes ficava misturado
// dentro de "Contas" (ver /crm/page.tsx, que agora é só o seletor de
// clínica). O bloco "Acesso do cliente" por clínica também veio pra cá —
// antes era o card "Contas" dentro de Automações de cada clínica. Reusa o
// mesmo ClientAccessModal do Painel de dentro de uma clínica específica
// (clinicas/[id]/painel/page.tsx) em vez de duplicar a lógica de acesso
// aqui — os dois lugares mostram o mesmo link permanente por clínica.
export default async function PainelPage() {
  const clinics = await prisma.clinic.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      instagramAccount: true,
      googleCalendarAccount: true,
      clientPanelLink: { select: { token: true } },
    },
  });

  const now = new Date();
  const todayStart = startOfDay(now);
  const last7Start = addDays(todayStart, -6);

  const cards = await Promise.all(
    clinics.map(async (clinic) => {
      const [today, last7Days] = await Promise.all([
        getClinicMetrics(clinic.id, todayStart, addDays(todayStart, 1)),
        getClinicMetrics(clinic.id, last7Start, addDays(todayStart, 1)),
      ]);
      return { clinic, today, last7Days };
    })
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Painel</h1>
        <Link
          href="/crm/clinicas/nova"
          className="rounded-lg bg-vexo-accent px-3 py-1.5 text-sm font-medium text-vexo-accentFg hover:opacity-90"
        >
          + Nova clínica
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map(({ clinic, today, last7Days }) => (
          <div key={clinic.id} className="space-y-2.5">
            <ClinicMetricsCard
              name={clinic.name}
              href={`/crm/clinicas/${clinic.id}`}
              active={clinic.active}
              connections={{
                instagramConnected: Boolean(clinic.instagramAccount),
                instagramUsername: clinic.instagramAccount?.igUsername,
                calendarConnected: Boolean(clinic.googleCalendarAccount),
                whatsappConnected: clinic.whatsappStatus === "open",
              }}
              today={today}
              last7Days={last7Days}
            />

            <div className="flex gap-2">
              <Link
                href={`/crm/painel-cliente/${clinic.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-lg border border-vexo-border px-2.5 py-1.5 text-center text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
              >
                Ver painel de {clinic.name} ↗
              </Link>
              <ClientAccessModal
                clinicId={clinic.id}
                initialLink={
                  clinic.clientPanelLink
                    ? { token: clinic.clientPanelLink.token, url: `${process.env.APP_URL ?? ""}/acesso/${clinic.clientPanelLink.token}` }
                    : null
                }
              />
            </div>
          </div>
        ))}

        {clinics.length === 0 && (
          <p className="text-sm text-vexo-muted">Nenhuma clínica cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
