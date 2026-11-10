import type { EvolutionPoint } from "@/lib/report-rates";
import { formatReportPeriodShortLabel, type ReportFrequency } from "@/lib/report-period";

// Evolução dos últimos períodos (Relatório) — Agendaram e Compareceram
// lado a lado por período, mesmas regras das barras semanais (5ª rodada,
// ver DESIGN.md): barras estreitas (w-2) com topo arredondado sobre linha-
// base fina e área rebaixada, valor só quando > 0, altura reduzida.
// Agendaram no degradê azul → ciano (.report-bar-fill), Compareceram no
// ciano → verde do anel (.report-attended-fill). Só desenha: quem corta os
// zeros iniciais e decide se aparece é trimEvolution/shouldShowEvolution
// (report-rates.ts).
export function PeriodEvolutionChart({ frequency, points }: { frequency: ReportFrequency; points: EvolutionPoint[] }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.scheduled, p.attended)));
  const pct = (v: number) => Math.max(6, Math.round((v / max) * 10000) / 100);
  const summary = points
    .map((p) => `${formatReportPeriodShortLabel(frequency, p)}: ${p.scheduled} agendaram, ${p.attended} compareceram`)
    .join("; ");

  return (
    <div className="space-y-1.5">
      <div role="img" aria-label={`Evolução dos últimos ${points.length} períodos — ${summary}`}>
        <div className="flex h-16 items-stretch gap-2 rounded-t-control border-b border-vexo-reportLine bg-vexo-reportInset px-2 pt-4" aria-hidden="true">
          {points.map((p, i) => (
            <div key={i} className="flex min-w-0 flex-1 justify-center gap-1.5">
              {[
                { v: p.scheduled, fill: "report-bar-fill" },
                { v: p.attended, fill: "report-attended-fill" },
              ].map((bar, j) => (
                <div key={j} className="relative w-2.5">
                  {bar.v > 0 && (
                    <>
                      <span
                        className="absolute left-1/2 -translate-x-1/2 text-caption leading-none text-vexo-tabFg"
                        style={{ bottom: `calc(${pct(bar.v)}% + 3px)` }}
                      >
                        {bar.v}
                      </span>
                      <div className={`absolute bottom-0 w-full rounded-t-sm ${bar.fill}`} style={{ height: `${pct(bar.v)}%` }} />
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-2 px-2" aria-hidden="true">
          {points.map((p, i) => (
            <span key={i} className="min-w-0 flex-1 truncate text-center text-caption leading-none text-vexo-reportCaption">
              {formatReportPeriodShortLabel(frequency, p)}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 text-caption text-vexo-reportCaption" aria-hidden="true">
        <span className="flex items-center gap-1">
          <span className="report-bar-fill inline-block h-1.5 w-1.5 rounded-full" /> Agendaram
        </span>
        <span className="flex items-center gap-1">
          <span className="report-attended-fill inline-block h-1.5 w-1.5 rounded-full" /> Compareceram
        </span>
      </div>
    </div>
  );
}
