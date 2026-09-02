import Link from "next/link";
import { StatCard } from "@/components/StatCard";

type PeriodMetrics = {
  approached: number;
  responded: number;
  responseRate: number | null;
  scheduled: number;
  completed: number;
  noShow: number;
};

export function ClinicMetricsCard({
  name,
  href,
  active,
  connections,
  today,
  last7Days,
}: {
  name: string;
  href?: string;
  active?: boolean;
  connections?: {
    instagramConnected: boolean;
    instagramUsername?: string | null;
    calendarConnected: boolean;
    whatsappConnected?: boolean;
  };
  today: PeriodMetrics;
  last7Days: PeriodMetrics;
}) {
  const content = (
    <div className="rounded-2xl border border-vexo-border bg-vexo-surface p-4 transition hover:border-vexo-borderStrong sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {active !== undefined && (
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-emerald-400" : "bg-vexo-muted"}`}
              title={active ? "Ativa" : "Inativa"}
            />
          )}
          <h2 className="font-medium">{name}</h2>
        </div>
        {connections && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            <ConnectionBadge
              connected={connections.instagramConnected}
              label={connections.instagramConnected ? `@${connections.instagramUsername ?? "conectado"}` : "Instagram"}
            />
            <ConnectionBadge connected={connections.calendarConnected} label="Calendar" />
            {connections.whatsappConnected !== undefined && (
              <ConnectionBadge connected={connections.whatsappConnected} label="WhatsApp" />
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-vexo-muted">Hoje</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Abordados" value={String(today.approached)} />
            <StatCard label="Responderam" value={String(today.responded)} />
            <StatCard
              label="Taxa de resposta"
              value={today.responseRate !== null ? `${Math.round(today.responseRate * 100)}%` : "—"}
            />
            <StatCard label="Agendados" value={String(today.scheduled)} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-vexo-muted">
            Últimos 7 dias
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Abordados" value={String(last7Days.approached)} />
            <StatCard label="Responderam" value={String(last7Days.responded)} />
            <StatCard label="Compareceram" value={String(last7Days.completed)} />
            <StatCard label="Faltas" value={String(last7Days.noShow)} />
          </div>
        </div>
      </div>
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}

function ConnectionBadge({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
        connected ? "border-emerald-500/30 text-emerald-300" : "border-vexo-border text-vexo-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-emerald-400" : "bg-vexo-muted"}`} />
      {label}
    </span>
  );
}
