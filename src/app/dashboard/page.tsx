import Link from "next/link";
import { requireClientSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getClinicMetrics, startOfDay, startOfMonth, addDays } from "@/lib/metrics";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function ClientDashboardPage() {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

  const [today, month, ongoing] = await Promise.all([
    getClinicMetrics(clinicId, todayStart, addDays(todayStart, 1)),
    getClinicMetrics(clinicId, monthStart, addDays(now, 1)),
    prisma.conversation.findMany({
      where: { clinicId, status: { in: ["NEW", "IN_CONVERSATION", "FOLLOW_UP", "NEEDS_HUMAN"] } },
      include: { lead: true },
      orderBy: { lastMessageAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Visão geral</h1>
        <p className="text-sm text-vexo-muted">Acompanhamento em tempo real das abordagens no Instagram.</p>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-vexo-muted">Hoje</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Abordados" value={String(today.approached)} />
          <StatCard label="Responderam" value={String(today.responded)} />
          <StatCard
            label="Taxa de resposta"
            value={today.responseRate !== null ? `${Math.round(today.responseRate * 100)}%` : "—"}
          />
          <StatCard label="Agendados" value={String(today.scheduled)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-vexo-muted">Este mês</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Abordados" value={String(month.approached)} />
          <StatCard label="Responderam" value={String(month.responded)} />
          <StatCard label="Compareceram" value={String(month.completed)} />
          <StatCard label="Faltas" value={String(month.noShow)} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-vexo-muted">Conversas em andamento</h2>
          <Link href="/dashboard/conversas" className="text-xs text-vexo-accent hover:underline">
            ver todas
          </Link>
        </div>
        <div className="divide-y divide-vexo-border rounded-xl border border-vexo-border bg-vexo-surface">
          {ongoing.map((conv) => (
            <div key={conv.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{conv.lead.name ?? conv.lead.igUsername ?? "Lead"}</span>
              <StatusBadge status={conv.status} />
            </div>
          ))}
          {ongoing.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-vexo-muted">Nenhuma conversa em andamento.</p>
          )}
        </div>
      </section>
    </div>
  );
}
