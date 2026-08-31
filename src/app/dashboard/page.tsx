import { requireClientSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getClinicMetrics, startOfDay, addDays } from "@/lib/metrics";
import { ClinicMetricsCard } from "@/components/ClinicMetricsCard";

export const dynamic = "force-dynamic";

export default async function ClientDashboardPage() {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });

  const now = new Date();
  const todayStart = startOfDay(now);
  const last7Start = addDays(todayStart, -6);

  const [today, last7Days] = await Promise.all([
    getClinicMetrics(clinicId, todayStart, addDays(todayStart, 1)),
    getClinicMetrics(clinicId, last7Start, addDays(todayStart, 1)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Painel</h1>
        <p className="text-sm text-vexo-muted">Acompanhamento em tempo real das abordagens no Instagram.</p>
      </div>

      <ClinicMetricsCard name={clinic.name} today={today} last7Days={last7Days} />
    </div>
  );
}
