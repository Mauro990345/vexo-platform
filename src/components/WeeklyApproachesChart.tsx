import type { WeeklyApproached } from "@/lib/report-metrics";
import { brazilDateParts } from "@/lib/report-period";

// Barras de "Abordagens por semana" (pedido explícito, item 5) — puro
// HTML/CSS (sem SVG/biblioteca: cada barra é só um retângulo com
// degradê), reaproveitando os mesmos números já calculados por
// computeWeeklyApproached/buildSimulatedWeeklyApproached (report-metrics.ts,
// mesma definição de "abordados" do Painel). Barras normais em degradê
// azul (--vexo-accent, #2b87bd) -> ciano (--tab-icon-1, #28a4c2); a semana
// com MAIS abordagens (só uma, mesmo em caso de empate — a primeira) em
// âmbar sólido (--tab-icon-2, #dbb148) — nenhuma cor nova, mesmos tokens
// já usados nos ícones das abas.
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
      <div className="flex items-center justify-center rounded-control border border-dashed border-vexo-border/60 py-3">
        <p className="text-card leading-none text-vexo-muted">Sem abordagens registradas no período</p>
      </div>
    );
  }

  const summary = weeks.map((w) => `${formatWeekLabel(w)}: ${w.count}`).join(", ");

  return (
    <div className="flex items-end gap-1.5" style={{ height: 96 }} role="img" aria-label={`Abordagens por semana — ${summary}`}>
      {weeks.map((week, i) => {
        const isMax = i === maxIndex;
        const heightPct = max > 0 ? Math.round((week.count / max) * 10000) / 100 : 0;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-card font-medium leading-none">{week.count}</span>
            <div className="flex h-16 w-full items-end overflow-hidden rounded-sm bg-vexo-surface" aria-hidden="true">
              <div
                className={`w-full rounded-sm ${isMax ? "bg-vexo-tabIcon2" : ""}`}
                style={{
                  height: `${Math.max(heightPct, week.count > 0 ? 4 : 0)}%`,
                  background: isMax ? undefined : "linear-gradient(to top, rgb(var(--vexo-accent) / 1), rgb(var(--tab-icon-1) / 1))",
                }}
              />
            </div>
            <span className="text-caption leading-none text-vexo-muted">{formatWeekLabel(week)}</span>
          </div>
        );
      })}
    </div>
  );
}
