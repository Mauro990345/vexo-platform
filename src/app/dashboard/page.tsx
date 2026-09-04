import Link from "next/link";
import { requireClientSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getClinicMetrics, startOfDay, addDays } from "@/lib/metrics";
import { StatCard } from "@/components/StatCard";

export const dynamic = "force-dynamic";

// Painel do cliente: só números informativos, sem Pipeline/Kanban (isso
// fica só no CRM interno) e sem os detalhes de conexão/taxa de resposta em
// anel do card usado no lado admin — aqui é só "abordados / em conversa /
// agendaram", hoje e nos últimos 7 dias.
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

      {clinic.whatsappStatus !== "open" && (
        <Link
          href="/dashboard/whatsapp"
          className="block rounded-xl border border-vexo-warning/30 bg-vexo-warning/10 p-3 text-sm text-vexo-warning hover:bg-vexo-warning/15"
        >
          ⚠️ WhatsApp não conectado — clique para conectar e receber os avisos da equipe.
        </Link>
      )}

      <div className="space-y-3">
        <h2 className="text-caption font-medium uppercase tracking-wide text-vexo-muted">Hoje</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="Abordados" value={String(today.approached)} />
          <StatCard label="Em conversa" value={String(today.responded)} />
          <StatCard label="Agendaram" value={String(today.scheduled)} />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-caption font-medium uppercase tracking-wide text-vexo-muted">Últimos 7 dias</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="Abordados" value={String(last7Days.approached)} />
          <StatCard label="Em conversa" value={String(last7Days.responded)} />
          <StatCard label="Agendaram" value={String(last7Days.scheduled)} />
        </div>
      </div>
    </div>
  );
}
