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
    <div className="rounded-xl border border-vexo-border bg-vexo-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {active !== undefined && (
            <span
              className={`h-2 w-2 rounded-full ${active ? "bg-emerald-400" : "bg-vexo-muted"}`}
              title={active ? "Ativa" : "Inativa"}
            />
          )}
          <h2 className="font-medium">{name}</h2>
        </div>
        {connections && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className={`rounded-full border px-2 py-0.5 ${connections.instagramConnected ? "border-emerald-500/30 text-emerald-300" : "border-vexo-border text-vexo-muted"}`}
            >
              Instagram {connections.instagramConnected ? `@${connections.instagramUsername ?? "conectado"}` : "pendente"}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 ${connections.calendarConnected ? "border-emerald-500/30 text-emerald-300" : "border-vexo-border text-vexo-muted"}`}
            >
              Calendar {connections.calendarConnected ? "conectado" : "pendente"}
            </span>
            {connections.whatsappConnected !== undefined && (
              <span
                className={`rounded-full border px-2 py-0.5 ${connections.whatsappConnected ? "border-emerald-500/30 text-emerald-300" : "border-vexo-border text-vexo-muted"}`}
              >
                WhatsApp {connections.whatsappConnected ? "conectado" : "pendente"}
              </span>
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
    <Link href={href} className="block transition hover:opacity-90">
      {content}
    </Link>
  );
}
