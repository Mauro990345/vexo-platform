import type { LucideIcon } from "lucide-react";
import { CalendarCheck, Camera, Clock3, BarChart3, MessageCircle, MessagesSquare, RotateCcw } from "lucide-react";
import { VexoMark } from "@/components/public/VexoLogo";

// Órbita da página pública: diagrama 760x400 (um SVG só, escala por inteiro
// no celular). Dois arcos concêntricos finos com brilho radial suave dentro,
// o símbolo do VEXO num círculo de 88px na base central e os nós de 56px nos
// arcos. Ícones genéricos em traço fino (lucide) — nunca os logos oficiais da
// Meta. Os rótulos usam .orbit-label (globals.css), maior em unidades do SVG
// no celular pra continuar legível depois da escala.
const W = 760;
const H = 400;
const CX = 380;
const CY = 350;
const R_OUT = 300;
const R_IN = 180;

type OrbitNode = { label: string; icon: LucideIcon; r: number; deg: number };

const NODES: OrbitNode[] = [
  { label: "WhatsApp", icon: MessageCircle, r: R_OUT, deg: 165 },
  { label: "Agenda", icon: CalendarCheck, r: R_OUT, deg: 128 },
  { label: "Instagram", icon: Camera, r: R_OUT, deg: 90 },
  { label: "Follow-up", icon: Clock3, r: R_OUT, deg: 52 },
  { label: "Relatório", icon: BarChart3, r: R_OUT, deg: 15 },
  { label: "Condução", icon: MessagesSquare, r: R_IN, deg: 135 },
  { label: "Reativação", icon: RotateCcw, r: R_IN, deg: 45 },
];

function pos(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: Math.round(CX + r * Math.cos(rad)), y: Math.round(CY - r * Math.sin(rad)) };
}

const arc = (r: number) => `M${CX - r} ${CY} A${r} ${r} 0 0 1 ${CX + r} ${CY}`;

export function OrbitDiagram() {
  const description = `O VEXO no centro, conectado a: ${NODES.map((n) => n.label).join(", ")}.`;
  return (
    <figure className="mx-auto w-full max-w-[760px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={description}>
        <defs>
          <radialGradient id="orbit-glow" cx={CX} cy={CY} r={R_OUT} gradientUnits="userSpaceOnUse">
            <stop offset="0%" style={{ stopColor: "rgb(var(--pub-brand) / 0.20)" }} />
            <stop offset="70%" style={{ stopColor: "rgb(var(--pub-brand) / 0)" }} />
          </radialGradient>
          <radialGradient id="orbit-core-glow" cx={CX} cy={CY} r={96} gradientUnits="userSpaceOnUse">
            <stop offset="0%" style={{ stopColor: "rgb(var(--pub-accent) / 0.35)" }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--pub-accent) / 0)" }} />
          </radialGradient>
        </defs>
        <g aria-hidden="true">
          <path d={`${arc(R_OUT)} Z`} fill="url(#orbit-glow)" />
          <path d={arc(R_OUT)} fill="none" strokeWidth={1} className="stroke-vexo-pubEdge/[0.10]" vectorEffect="non-scaling-stroke" />
          <path d={arc(R_IN)} fill="none" strokeWidth={1} className="stroke-vexo-pubEdge/[0.12]" vectorEffect="non-scaling-stroke" />

          {NODES.map((n) => {
            const { x, y } = pos(n.r, n.deg);
            const Icon = n.icon;
            return (
              <g key={n.label}>
                <circle cx={x} cy={y} r={28} className="fill-vexo-pubHeader stroke-vexo-pubEdge/[0.14]" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <Icon x={x - 12} y={y - 12} width={24} height={24} strokeWidth={1.6} className="text-vexo-pubAccent" />
                <text x={x} y={y + 48} textAnchor="middle" className="orbit-label fill-vexo-pubFg2">
                  {n.label}
                </text>
              </g>
            );
          })}

          <circle cx={CX} cy={CY} r={96} fill="url(#orbit-core-glow)" />
          <circle cx={CX} cy={CY} r={44} className="fill-vexo-pubBg" style={{ stroke: "rgb(var(--pub-accent) / 0.45)" }} strokeWidth={1.2} />
          <svg x={CX - 17} y={CY - 17} width={34} height={34} viewBox="0 0 26 26" overflow="visible">
            <VexoMark size={26} />
          </svg>
        </g>
      </svg>
      <figcaption className="mt-3 flex justify-center">
        <span className="rounded-full border border-vexo-pubEdge/10 bg-vexo-pubEdge/[0.03] whitespace-nowrap px-4 py-1.5 text-[10px] font-medium tracking-[0.08em] text-vexo-pubFg2 sm:text-[11px] sm:tracking-[0.14em]">
          UM SISTEMA, TODO O CAMINHO ATÉ A CONSULTA
        </span>
      </figcaption>
    </figure>
  );
}
