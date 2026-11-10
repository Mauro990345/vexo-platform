import type { WeeklyApproached } from "@/lib/report-metrics";
import { brazilDateParts } from "@/lib/report-period";

// Barras de "Abordagens por semana" — puro HTML/CSS, reaproveitando os
// números de computeWeeklyApproached/buildSimulatedWeeklyApproached
// (report-metrics.ts, mesma definição de "abordados" do Painel).
//
// 5ª rodada (ver DESIGN.md, "Relatório"): barra ESTREITA (w-3, bem menor
// que o espaço da semana) centrada na coluna, topo arredondado, apoiada
// numa linha-base fina (border-vexo-reportLine) sobre a área rebaixada do
// gráfico (bg-vexo-reportInset). Degradê azul → ciano (.report-bar-fill);
// a semana com MAIS abordagens (só uma, a primeira em empate) em âmbar
// sólido (--tab-icon-2, #dbb148). Valor acima da barra só quando > 0.
function formatWeekLabel(week: WeeklyApproached): string {
  const { day, month0 } = brazilDateParts(week.start);
  return `${String(day).padStart(2, "0")}/${String(month0 + 1).padStart(2, "0")}`;
}

export function WeeklyApproachesChart({ weeks }: { weeks: WeeklyApproached[] }) {
  const allZero = weeks.every((w) => w.count === 0);
  const max = Math.max(0, ...weeks.map((w) => w.count));
  const maxIndex = weeks.findIndex((w) => w.count === max && max > 0);

  if (allZero) {
    return (
      <div className="flex items-center justify-center rounded-control bg-vexo-reportInset py-3">
        <p className="text-card leading-none text-vexo-reportCaption">Sem abordagens registradas no período</p>
      </div>
    );
  }

  const summary = weeks.map((w) => `${formatWeekLabel(w)}: ${w.count}`).join(", ");

  return (
    <div role="img" aria-label={`Abordagens por semana — ${summary}`}>
      <div className="flex h-20 items-stretch gap-3 rounded-t-control border-b border-vexo-reportLine bg-vexo-reportInset px-2 pt-4" aria-hidden="true">
        {weeks.map((week, i) => {
          const isMax = i === maxIndex;
          const heightPct = max > 0 ? Math.round((week.count / max) * 10000) / 100 : 0;
          return (
            <div key={i} className="relative min-w-0 flex-1">
              {week.count > 0 && (
                <>
                  <span
                    className="absolute left-1/2 -translate-x-1/2 text-caption leading-none text-vexo-tabFg"
                    style={{ bottom: `calc(${Math.max(heightPct, 6)}% + 3px)` }}
                  >
                    {week.count}
                  </span>
                  <div
                    className={`absolute bottom-0 left-1/2 w-3 -translate-x-1/2 rounded-t-sm ${isMax ? "bg-vexo-tabIcon2" : "report-bar-fill"}`}
                    style={{ height: `${Math.max(heightPct, 6)}%` }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-3 px-2" aria-hidden="true">
        {weeks.map((week, i) => (
          <span key={i} className="min-w-0 flex-1 text-center text-caption leading-none text-vexo-reportCaption">
            {formatWeekLabel(week)}
          </span>
        ))}
      </div>
    </div>
  );
}
