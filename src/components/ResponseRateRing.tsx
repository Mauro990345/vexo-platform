// Chaves fixas (não construídas por template string) pra o Tailwind JIT
// conseguir achar essas classes por análise estática do arquivo — se fosse
// `stroke-vexo-${color}` em runtime, a classe nunca seria gerada no CSS
// final.
const RING_STROKE: Record<"accent" | "success" | "warning" | "error", string> = {
  accent: "stroke-vexo-accent",
  success: "stroke-vexo-success",
  warning: "stroke-vexo-warning",
  error: "stroke-vexo-error",
};

// Anel de progresso simples pra uma métrica de "parte de um todo" (taxa de
// resposta, taxa de comparecimento) — um valor único, então não é um caso
// de paleta categórica (só a cor escolhida + a trilha em vexo-border).
// rotate-90 deixa o início do arco no topo em vez de à direita (padrão de
// gráfico de "%"). "color" é decidido por quem usa o componente (ex: fixo
// pra uma métrica, ou condicional a faixas de valor pra outra) — o anel em
// si não sabe nada sobre o que cada faixa significa.
export function ResponseRateRing({
  value,
  color = "accent",
}: {
  value: number | null;
  color?: "accent" | "success" | "warning" | "error";
}) {
  const pct = value !== null ? Math.round(value * 100) : null;
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const offset = pct !== null ? circumference * (1 - Math.min(pct, 100) / 100) : circumference;

  return (
    <div className="flex items-center gap-2">
      <svg width="30" height="30" viewBox="0 0 30 30" className="-rotate-90 shrink-0" aria-hidden="true">
        <circle cx="15" cy="15" r={radius} fill="none" strokeWidth="3.5" className="stroke-vexo-border" />
        {pct !== null && (
          <circle
            cx="15"
            cy="15"
            r={radius}
            fill="none"
            strokeWidth="3.5"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={RING_STROKE[color]}
          />
        )}
      </svg>
      <p className="text-xl font-semibold leading-none tracking-tight">{pct !== null ? `${pct}%` : "—"}</p>
    </div>
  );
}
