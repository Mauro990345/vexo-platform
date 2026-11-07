"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { ApproachChart } from "@/components/ApproachChart";
import { ChannelStatusPill } from "@/components/ChannelStatusPill";
import { InstagramGlyphIcon, WhatsAppGlyphIcon } from "@/components/BrandIcons";
import { MetricCard } from "@/components/MetricCard";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ReactivationRail, type ReactivationRailProps } from "@/components/ReactivationRail";

export type PeriodOption = {
  days: number;
  label: string;
  metrics: { approached: number; responded: number; scheduled: number };
  attendance: { attended: number; pastDue: number };
};
export type ReturnPeriodStat = { days: number; label: string; sent: number; returned: number };

export type WeekNav = { prevHref: string; todayHref: string; nextHref: string; label: string };

// Cabeçalho + faixa de métricas + navegação de semana (sob demanda) +
// grade de 2 colunas (Para fazer hoje / Agendamentos) do Painel do
// cliente — Etapa 4 da migração de design (reorganização do Painel, ver
// docs/design-audit.md). Um único Client Component porque o seletor de
// Período (pedido explícito: movido pro cabeçalho, ao lado do nome da
// clínica) precisa acompanhar tanto a faixa de métricas quanto a linha "N
// enviadas · M voltaram" da Reativação — mesmo motivo que já existia em
// PanelActivityColumn.tsx (removido, absorvido aqui). `rightColumn` entra
// pronto (Server Component) — composição Server-dentro-de-Client padrão
// do Next.js App Router, pra não precisar de nenhum estado/mudança na
// coluna Agendamentos.
export function PanelOverview({
  clinicName,
  instagramConnected,
  googleConnected,
  whatsappConnected,
  headerAction,
  periods,
  returnPeriods,
  weekNav,
  dailyApproached,
  rightColumn,
  ...railProps
}: {
  clinicName: string;
  instagramConnected: boolean;
  googleConnected: boolean;
  whatsappConnected: boolean;
  headerAction?: ReactNode;
  periods: PeriodOption[];
  returnPeriods: ReturnPeriodStat[];
  weekNav: WeekNav;
  dailyApproached: number[];
  rightColumn: ReactNode;
} & Omit<ReactivationRailProps, "returnMetric" | "cards"> & { cards: ReactivationRailProps["cards"] }) {
  const [days, setDays] = useState(periods[0]?.days);
  const [weekOpen, setWeekOpen] = useState(false);
  const current = periods.find((p) => p.days === days) ?? periods[0];
  const currentReturn = returnPeriods.find((p) => p.days === days) ?? returnPeriods[0];

  if (!current) return null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho enxuto (item 1 do pedido): nome da clínica + ícones de
          integração à esquerda, botão de ação (ex: "Criar painel") e
          seletor de Período à direita — sem a linha "PERÍODO" separada de
          antes (ApproachMetricsToggle.tsx, removido) e sem repetir o
          título "Painel"/descrição (já ditos pela aba, quando ela existe —
          ver ClientPanelTabs.tsx). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-vexo-success" />
          <h2 className="text-base font-medium">{clinicName}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <ChannelStatusPill connected={instagramConnected} label="Instagram" icon={<InstagramGlyphIcon className="h-3.5 w-3.5" />} iconBg="" />
            <ChannelStatusPill connected={googleConnected} label="Google Calendar" icon={<Calendar className="h-3 w-3" strokeWidth={2.5} />} iconBg="bg-blue-500" />
            <ChannelStatusPill connected={whatsappConnected} label="WhatsApp" icon={<WhatsAppGlyphIcon className="h-3.5 w-3.5" />} iconBg="" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Período"
            className="rounded-control border border-vexo-border bg-vexo-surface2 px-control-x py-control-y text-xs font-medium outline-none focus:border-vexo-accent"
          >
            {periods.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Faixa fina com as 4 métricas (item 2) — numa linha só (2x2 no
          celular), divididas por linhas finas (divide-x + borda entre as
          2 linhas do 2x2), no lugar dos 4 blocos grandes de antes
          (PanelMetricCard.tsx, removido). MetricCard com `bare` (Etapa
          2/4, ver MetricCard.tsx) porque o bloco (borda/fundo) é deste
          container em volta, não de cada métrica — por isso não uso o
          componente Card aqui (ele sempre inclui seu próprio padding,
          que entraria em conflito com a divisão por linha). */}
      <div className="grid grid-cols-2 divide-x divide-vexo-border rounded-block border border-vexo-border bg-vexo-surface2 sm:grid-cols-4 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-vexo-border sm:[&>*:nth-child(n+3)]:border-t-0">
        <div className="px-3 py-2.5">
          <MetricCard label="Abordados" value={String(current.metrics.approached)} bare />
        </div>
        <div className="px-3 py-2.5">
          <MetricCard label="Em conversa" value={String(current.metrics.responded)} bare />
        </div>
        <div className="px-3 py-2.5">
          <MetricCard label="Agendaram" value={String(current.metrics.scheduled)} bare highlight />
        </div>
        <div className="px-3 py-2.5">
          <MetricCard label="Compareceram" value={String(current.attendance.attended)} bare />
        </div>
      </div>

      {/* Navegação de semana + gráfico "Abordagens por dia" (item 3) —
          deixam de ser um bloco fixo: viram um link discreto que abre o
          gráfico por demanda, mantendo a mesma lógica de navegação
          (?week=, ver ClientPanelView.tsx). */}
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setWeekOpen((o) => !o)}>
          {weekOpen ? "Ocultar semana" : "Ver semana"}
        </Button>
        {weekOpen && (
          <Card surface="surface2" className="mt-2 space-y-2">
            <div className="flex items-center justify-between gap-1.5">
              <Link href={weekNav.prevHref} className="rounded-control border border-vexo-border px-control-x py-control-y text-xs hover:border-vexo-accent">
                ← Semana
              </Link>
              <Link href={weekNav.todayHref} className="rounded-control border border-vexo-border px-control-x py-control-y text-xs hover:border-vexo-accent">
                Hoje
              </Link>
              <Link href={weekNav.nextHref} className="rounded-control border border-vexo-border px-control-x py-control-y text-xs hover:border-vexo-accent">
                Semana →
              </Link>
            </div>
            <div className="space-y-2 border-t border-vexo-border pt-2">
              <p className="text-caption font-medium uppercase tracking-wide text-vexo-muted">Abordagens por dia · {weekNav.label}</p>
              <ApproachChart counts={dailyApproached} />
            </div>
          </Card>
        )}
      </div>

      {/* Duas colunas (item 4), ~55%/45% em computador: "Para fazer hoje"
          (esquerda, sempre aberta) e "Agendamentos" (direita). Uma coluna
          só no celular (sem `lg:grid-cols`, empilha). */}
      <div className="grid gap-4 lg:grid-cols-[55fr_45fr]">
        <div className="min-w-0">
          <ReactivationRail {...railProps} returnMetric={currentReturn} />
        </div>
        <div className="min-w-0">{rightColumn}</div>
      </div>
    </div>
  );
}
