import { useId } from "react";

// Anel (donut) da taxa de comparecimento — elemento principal do
// relatório (pedido explícito, item 4). Mesma definição de taxa do box
// "Compareceram" do Resumo (ver attendanceRate, report-metrics.ts), nunca
// uma segunda conta: este componente só DESENHA o número, não calcula
// nada. Traço em degradê ciano (--tab-icon-1, #28a4c2) -> verde
// (--tab-icon-4, #49b76c) — mesmos tokens já usados nos ícones das abas,
// nenhuma cor nova. `useId` evita colidir o id do gradiente quando as DUAS
// frequências (mensal/quinzenal) do preview admin ficam montadas ao mesmo
// tempo, só uma escondida (ver ClinicReportPeriodToggle.tsx).
export function AttendanceRing({ rate }: { rate: number | null }) {
  const gradientId = useId();
  const size = 96;
  // 11 (era 9, ~20% mais grosso — 4ª rodada, pedido explícito).
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = rate !== null ? Math.round(rate * 100) : null;
  // Arredondado a 2 casas — só estética do atributo SVG (evita um
  // `strokeDasharray` com uma dúzia de casas decimais no HTML renderizado,
  // sem nenhum efeito visual: a diferença é bem menor que 1 pixel).
  const dash = pct !== null ? Math.round(((Math.min(100, Math.max(0, pct)) / 100) * circumference) * 100) / 100 : 0;
  const dashRemainder = Math.round((circumference - dash) * 100) / 100;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={pct !== null ? `Taxa de comparecimento: ${pct}%` : "Taxa de comparecimento indisponível"}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "rgb(var(--tab-icon-1) / 1)" }} />
          <stop offset="100%" style={{ stopColor: "rgb(var(--tab-icon-4) / 1)" }} />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-vexo-border" aria-hidden="true" />
      {pct !== null && pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke={`url(#${gradientId})`}
          strokeDasharray={`${dash} ${dashRemainder}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          aria-hidden="true"
        />
      )}
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className="fill-vexo-tabFg text-lg font-semibold" aria-hidden="true">
        {pct !== null ? `${pct}%` : "—"}
      </text>
      <text x="50%" y="66%" textAnchor="middle" dominantBaseline="middle" className="fill-vexo-reportCaption" style={{ fontSize: 8 }} aria-hidden="true">
        comparecimento
      </text>
    </svg>
  );
}
