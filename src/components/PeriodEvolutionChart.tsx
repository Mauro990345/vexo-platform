import { useId } from "react";
import type { EvolutionPoint } from "@/lib/report-rates";
import { formatReportPeriodShortLabel, type ReportFrequency } from "@/lib/report-period";

// Evolução dos últimos períodos (Relatório, 6ª rodada) — GRÁFICO DE LINHAS
// com duas séries: Agendaram (traço em degradê azul da marca → ciano,
// --vexo-accent → --tab-icon-1, com um degradê MUITO suave sob a linha) e
// Compareceram (verde dos gráficos, --tab-icon-4). Traço fino (1.5), coerente
// com o anel fino; ponto em cada período; valor só quando > 0 (Agendaram
// acima do ponto, Compareceram abaixo — nunca se sobrepõem); período zerado
// no meio vira ponto na linha de base, sem rótulo. SVG simples, sem
// biblioteca. viewBox fixo de 300 de largura (= largura útil do bloco em
// 360px), escala junto com o bloco em telas maiores.
//
// Só desenha: quem corta os zeros iniciais e decide se aparece é
// trimEvolution/shouldShowEvolution (report-rates.ts).
const W = 300;
const H = 132;
const PAD_X = 16;
const TOP = 16; // espaço pro rótulo acima do ponto mais alto
const BASE = H - 24; // linha de base (abaixo dela: rótulo de Compareceram + eixo)
const AXIS_Y = H - 4;
const LABEL_SIZE = 9;

export function PeriodEvolutionChart({ frequency, points }: { frequency: ReportFrequency; points: EvolutionPoint[] }) {
  const uid = useId();
  const lineId = `${uid}-line`;
  const areaId = `${uid}-area`;
  const max = Math.max(1, ...points.map((p) => Math.max(p.scheduled, p.attended)));
  const step = points.length > 1 ? (W - PAD_X * 2) / (points.length - 1) : 0;
  const x = (i: number) => PAD_X + i * step;
  const y = (v: number) => BASE - (v / max) * (BASE - TOP);

  const scheduledPts = points.map((p, i) => [x(i), y(p.scheduled)] as const);
  const attendedPts = points.map((p, i) => [x(i), y(p.attended)] as const);
  const toPath = (pts: ReadonlyArray<readonly [number, number]>) => pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const areaPath = `${toPath(scheduledPts)} L${x(points.length - 1).toFixed(1)} ${BASE} L${x(0).toFixed(1)} ${BASE} Z`;

  const description = points
    .map((p) => `${formatReportPeriodShortLabel(frequency, p)}: ${p.scheduled} agendaram, ${p.attended} compareceram`)
    .join("; ");

  return (
    <div className="space-y-1.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto block h-auto w-full lg:max-h-36"
        role="img"
        aria-label={`Evolução dos últimos ${points.length} períodos — ${description}`}
      >
        <defs>
          <linearGradient id={lineId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--vexo-accent) / 1)" }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--tab-icon-1) / 1)" }} />
          </linearGradient>
          <linearGradient id={areaId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--tab-icon-1) / 0.16)" }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--tab-icon-1) / 0)" }} />
          </linearGradient>
        </defs>

        <g aria-hidden="true">
          <line x1={PAD_X - 6} x2={W - PAD_X + 6} y1={BASE} y2={BASE} strokeWidth={1} className="stroke-vexo-reportLine" />
          <path d={areaPath} fill={`url(#${areaId})`} />
          <path d={toPath(attendedPts)} fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" className="stroke-vexo-tabIcon4" />
          <path d={toPath(scheduledPts)} fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" stroke={`url(#${lineId})`} />

          {points.map((p, i) => {
            const [sx, sy] = scheduledPts[i]!;
            const [ax, ay] = attendedPts[i]!;
            // Rótulo da série MAIOR acima do ponto, da menor abaixo — os
            // dois nunca colidem, mesmo com valores próximos.
            const scheduledOnTop = p.scheduled >= p.attended;
            return (
              <g key={i}>
                <circle cx={ax} cy={ay} r={2.4} className="fill-vexo-tabIcon4" />
                <circle cx={sx} cy={sy} r={2.4} className="fill-vexo-tabIcon1" />
                {p.scheduled > 0 && (
                  <text x={sx} y={scheduledOnTop ? sy - 6 : sy + 12} textAnchor="middle" className="fill-vexo-tabFg" style={{ fontSize: LABEL_SIZE }}>
                    {p.scheduled}
                  </text>
                )}
                {p.attended > 0 && (
                  <text x={ax} y={scheduledOnTop ? ay + 12 : ay - 6} textAnchor="middle" className="fill-vexo-reportCaption" style={{ fontSize: LABEL_SIZE }}>
                    {p.attended}
                  </text>
                )}
                <text x={x(i)} y={AXIS_Y} textAnchor="middle" className="fill-vexo-reportCaption" style={{ fontSize: LABEL_SIZE }}>
                  {formatReportPeriodShortLabel(frequency, p)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="flex items-center gap-3 text-caption text-vexo-reportCaption" aria-hidden="true">
        <span className="flex items-center gap-1">
          <span className="report-bar-fill inline-block h-0.5 w-3 rounded-full" /> Agendaram
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded-full bg-vexo-tabIcon4" /> Compareceram
        </span>
      </div>
    </div>
  );
}
