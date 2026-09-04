import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getClinicMetrics, startOfDay, addDays } from "@/lib/metrics";
import { ClinicMetricsCard } from "@/components/ClinicMetricsCard";
import { removeClientLogin } from "@/app/crm/clinicas/actions";
import { CreateClientLoginForm } from "@/components/CreateClientLoginForm";

export const dynamic = "force-dynamic";

// Dashboard de métricas de todas as clínicas — antes ficava misturado
// dentro de "Contas" (ver /crm/page.tsx, que agora é só o seletor de
// clínica). O bloco "Acesso do cliente" por clínica também veio pra cá —
// antes era o card "Contas" dentro de Automações de cada clínica.
export default async function PainelPage() {
  const clinics = await prisma.clinic.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      instagramAccount: true,
      googleCalendarAccount: true,
      users: { where: { role: "CLIENT" } },
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

            <details className="rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
              <summary className="cursor-pointer list-none text-xs font-medium text-vexo-muted">
                Acesso do cliente ao painel dele ({clinic.users.length})
              </summary>

              <div className="mt-2.5 space-y-2.5">
                <p className="text-card text-vexo-muted">
                  Login do painel do cliente — permanente, sem expiração. Revogado removendo o
                  acesso abaixo.
                </p>

                {clinic.users.length > 0 && (
                  <ul className="divide-y divide-vexo-border rounded-lg border border-vexo-border">
                    {clinic.users.map((u) => (
                      <li key={u.id} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                        <div>
                          <p>{u.name}</p>
                          <p className="text-card text-vexo-muted">{u.email}</p>
                        </div>
                        <form action={removeClientLogin.bind(null, clinic.id, u.id)}>
                          <button className="rounded-md border border-vexo-border px-1.5 py-1 text-card text-vexo-error hover:border-vexo-error/40">
                            Remover acesso
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}

                <CreateClientLoginForm clinicId={clinic.id} />
              </div>
            </details>
          </div>
        ))}

        {clinics.length === 0 && (
          <p className="text-sm text-vexo-muted">Nenhuma clínica cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
