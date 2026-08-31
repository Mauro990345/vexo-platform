import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getClinicMetrics, startOfDay, addDays } from "@/lib/metrics";
import { ClinicMetricsCard } from "@/components/ClinicMetricsCard";

export const dynamic = "force-dynamic";

export default async function ClinicsOverviewPage() {
  const clinics = await prisma.clinic.findMany({
    orderBy: { createdAt: "desc" },
    include: { instagramAccount: true, googleCalendarAccount: true },
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
          className="rounded-lg bg-vexo-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + Nova clínica
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map(({ clinic, today, last7Days }) => (
          <ClinicMetricsCard
            key={clinic.id}
            name={clinic.name}
            href={`/crm/clinicas/${clinic.id}`}
            active={clinic.active}
            connections={{
              instagramConnected: Boolean(clinic.instagramAccount),
              instagramUsername: clinic.instagramAccount?.igUsername,
              calendarConnected: Boolean(clinic.googleCalendarAccount),
            }}
            today={today}
            last7Days={last7Days}
          />
        ))}

        {clinics.length === 0 && (
          <p className="text-sm text-vexo-muted">Nenhuma clínica cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
