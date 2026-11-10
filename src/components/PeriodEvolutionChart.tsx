import type { EvolutionPoint } from "@/lib/report-rates";
import { formatReportPeriodShortLabel, type ReportFrequency } from "@/lib/report-period";

// Evolução dos últimos 6 períodos (Relatório, 4ª rodada) — Agendaram e
// Compareceram lado a lado por período, puro HTML/CSS como o gráfico
// semanal. Mesmas cores dos outros gráficos: Agendaram no degradê azul →
// ciano das barras (.report-bar-fill), Compareceram no ciano → verde do
// anel (.report-attended-fill). Só desenha: quem decide se aparece é
// shouldShowEvolution (report-rates.ts, >= 3 períodos com dados).
export function PeriodEvolutionChart({ frequency, points }: { frequency: ReportFrequency; points: EvolutionPoint[] }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.scheduled, p.attended)));
  const pct = (v: number) => (v > 0 ? Math.max(4, Math.round((v / max) * 10000) / 100) : 0);
  const summary = points
    .map((p) => `${formatReportPeriodShortLabel(frequency, p)}: ${p.scheduled} agendaram, ${p.attended} compareceram`)
    .join("; ");

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1.5" role="img" aria-label={`Evolução dos últimos ${points.length} períodos — ${summary}`}>
        {points.map((p, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1" aria-hidden="true">
            <div className="flex h-20 w-full justify-center gap-0.5">
              {[
                { v: p.scheduled, fill: "report-bar-fill" },
                { v: p.attended, fill: "report-attended-fill" },
              ].map((bar, j) => (
                <div key={j} className="flex h-full min-w-0 flex-1 flex-col items-center gap-0.5">
                  <span className="text-caption leading-none text-vexo-tabFg">{bar.v}</span>
                  <div className="flex w-full flex-1 items-end justify-center">
                    <div className={`w-full max-w-4 rounded-t-md ${bar.fill}`} style={{ height: `${pct(bar.v)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <span className="truncate text-caption leading-none text-vexo-reportCaption">{formatReportPeriodShortLabel(frequency, p)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-caption text-vexo-reportCaption" aria-hidden="true">
        <span className="flex items-center gap-1">
          <span className="report-bar-fill inline-block h-2 w-2 rounded-sm" /> Agendaram
        </span>
        <span className="flex items-center gap-1">
          <span className="report-attended-fill inline-block h-2 w-2 rounded-sm" /> Compareceram
        </span>
      </div>
    </div>
  );
}
