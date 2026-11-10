import { MetricCard } from "@/components/MetricCard";
import { AttendanceRing } from "@/components/AttendanceRing";
import { WeeklyApproachesChart } from "@/components/WeeklyApproachesChart";
import type { ReportNumbersWithComparison } from "@/lib/report-metrics";
import { formatReportPeriodLabel, formatReportDateRange, type ReportFrequency } from "@/lib/report-period";
import { buildOpeningSentence } from "@/lib/report-opening-sentence";

// Conteúdo do Relatório de resultados (quinzenal/mensal) — componente
// presentacional PURO (sem Prisma, sem sessão), reaproveitado pelas DUAS
// telas que mostram o relatório (pedido explícito: "uma única definição
// de cada número"): a página pública /relatorio/[token] (o que o cliente
// recebe) e o preview admin em /crm/clinicas/[id]/relatorio-preview.
//
// 3ª rodada (ver DESIGN.md) — hierarquia/profundidade: frase de abertura
// + 2 gráficos (anel de comparecimento + barras por semana), cor ÚNICA
// entre os 4 boxes do Resumo (SÓ NO RELATÓRIO — o destaque âmbar de
// "Agendaram" continua existindo no Painel, PanelOverview.tsx, intocado;
// aqui nenhum box usa `highlight`). Único toque de identidade: a
// comparação com o anterior fica em `text-vexo-accent` (azul da marca)
// quando é melhora, `text-vexo-muted` (cinza) em qualquer outro caso —
// nunca vermelho/rosa.
function formatComparisonLabel(pct: number | null): string | null {
  if (pct === null) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs. anterior`;
}

function comparisonColorClass(pct: number | null): string {
  return pct !== null && pct > 0 ? "text-vexo-accent" : "text-vexo-muted";
}

// "X% de comparecimento" — rótulo corrigido (2ª rodada tinha "X% dos
// agendados", mas a conta é attended/pastDue — atendimentos cujo horário
// já passou dentro do período, ver attendanceRate em report-metrics.ts/
// getAttendanceMetrics em metrics.ts — NÃO attended/scheduled, que é uma
// base diferente: "scheduled"/"Agendaram" conta agendamentos CRIADOS no
// período, de qualquer data; a taxa usa os agendamentos cuja DATA já
// passou dentro do período. As duas bases coincidem na maioria dos casos,
// mas podem divergir perto das bordas do período, o que já produziu um
// "100% dos agendados" com 9 de 10 — 90%, não 100% — porque o rótulo
// prometia uma base que a conta não usava. Nenhuma conta mudou: só o
// rótulo passou a descrever honestamente a base real.
function formatRate(rate: number | null): string | null {
  if (rate === null) return null;
  return `${Math.round(rate * 100)}% de comparecimento`;
}

// Caixa do Resumo (`bare`, dentro da faixa dividida — ver grid abaixo) —
// valor + (opcional) linha de taxa + (opcional) comparação colorida. Uma
// função só, usada pelos 4 boxes, pra garantir que todos sigam
// EXATAMENTE a mesma regra visual (pedido explícito, item 3 — "nenhum box
// diferente dos outros" — nenhum deles recebe `highlight` nesta rodada).
function SummaryBox({
  label,
  value,
  rateLabel,
  comparisonPct,
}: {
  label: string;
  value: number;
  rateLabel?: string | null;
  comparisonPct: number | null;
}) {
  const comparisonLabel = formatComparisonLabel(comparisonPct);
  return (
    <div className="px-2.5 py-2">
      <MetricCard label={label} value={String(value)} bare />
      {rateLabel && <p className="mt-1 text-card text-vexo-muted">{rateLabel}</p>}
      {comparisonLabel && <p className={`mt-0.5 text-card ${comparisonColorClass(comparisonPct)}`}>{comparisonLabel}</p>}
    </div>
  );
}

// Título de seção (Resumo/gráficos/Follow-up/Reativação) — off-white
// (pedido explícito, item 7: "~#e6e8ec", mesmo token já usado pelo texto
// das abas, `vexo-tabFg` — nenhuma cor nova) e um pouco maior
// (`text-card`, 11px — um token já existente, +1px sobre o `text-caption`
// de 10px usado antes), em vez do cinza apagado da rodada anterior.
function SectionTitle({ children }: { children: string }) {
  return <p className="text-card font-semibold uppercase tracking-wide text-vexo-tabFg">{children}</p>;
}

export function ClinicReportContent({
  clinicName,
  frequency,
  numbers,
}: {
  clinicName: string;
  frequency: ReportFrequency;
  numbers: ReportNumbersWithComparison;
}) {
  const periodLabel = formatReportPeriodLabel(frequency, numbers.period);
  const dateRange = formatReportDateRange(numbers.period);
  const { funnel, attendanceRate, followUpRecovered, reactivation, previousComparison, isSimulated, weeklyApproached } = numbers;
  const openingSentence = buildOpeningSentence(frequency, numbers.period, funnel);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold tracking-tight">{clinicName}</h1>
        <p className="text-sm text-vexo-muted">Relatório VEXO IA</p>
        <p className="mt-0.5 text-xs text-vexo-muted">
          {periodLabel} <span className="text-vexo-muted">({dateRange})</span>
        </p>
        {isSimulated && (
          <span className="mt-1.5 inline-block rounded-sm bg-vexo-surface2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-vexo-muted">
            Dados de exemplo
          </span>
        )}
        {/* Frase de abertura (pedido explícito, item 2) — off-white e um
            pouco maior que o texto de apoio, calculada só com os mesmos
            números do Resumo (ver buildOpeningSentence). */}
        <p className="mt-2 text-sm text-vexo-tabFg">{openingSentence}</p>
      </div>

      {/* Resumo — mesma faixa dividida do Painel (ver PanelOverview.tsx):
          2x2 no celular, 4-em-linha a partir de sm. Reutilizada ao pé da
          letra (mesmas classes), não recriada — garante nenhum rótulo
          cortado nas larguras pedidas. Cor única (pedido explícito, item
          3): nenhum dos 4 boxes usa `highlight` nesta tela. "Compareceram"
          ganha a taxa de comparecimento como 2ª linha. */}
      <div>
        <SectionTitle>Resumo</SectionTitle>
        <div className="mt-1.5 grid grid-cols-2 divide-x divide-vexo-border rounded-block border border-vexo-border bg-vexo-surface2 sm:grid-cols-4 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-vexo-border sm:[&>*:nth-child(n+3)]:border-t-0">
          <SummaryBox label="Abordados" value={funnel.contacted} comparisonPct={previousComparison.contactedPct} />
          <SummaryBox label="Em conversa" value={funnel.inConversation} comparisonPct={previousComparison.inConversationPct} />
          <SummaryBox label="Agendaram" value={funnel.scheduled} comparisonPct={previousComparison.scheduledPct} />
          <SummaryBox label="Compareceram" value={funnel.attended} rateLabel={formatRate(attendanceRate)} comparisonPct={previousComparison.attendedPct} />
        </div>
      </div>

      {/* Gráficos (pedido explícito, item 4/5) — anel de comparecimento +
          barras de abordagens por semana, lado a lado no desktop
          (sm:grid-cols-2) e empilhados no celular (grid-cols-1, padrão).
          Mesmo container com profundidade (borda fina + bg-vexo-surface2,
          item 7) dos outros blocos — nenhum token novo. */}
      <div className="grid gap-4 rounded-block border border-vexo-border bg-vexo-surface2 p-block sm:grid-cols-2">
        <div className="flex flex-col items-center gap-1.5">
          <SectionTitle>Comparecimento</SectionTitle>
          <AttendanceRing rate={attendanceRate} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <SectionTitle>Abordagens por semana</SectionTitle>
          <WeeklyApproachesChart weeks={weeklyApproached} />
        </div>
      </div>

      {/* Follow-up + Reativação numa única faixa (pedido explícito, item
          6): "Leads retomados" (Follow-up) de um lado, "Enviadas"/
          "Voltaram" (Reativação) do outro — divididos por borda a partir
          de sm; no celular empilham (Follow-up acima, Reativação com seus
          2 boxes abaixo, ambos em largura total, sem sobrar espaço vazio
          ao lado). Sem nenhuma reativação enviada no período, mostra os
          2 boxes em 0 mesmo assim (mais discreto/limpo que esconder a
          seção). */}
      <div className="grid gap-3 rounded-block border border-vexo-border bg-vexo-surface2 p-block sm:grid-cols-[1fr_2fr] sm:divide-x sm:divide-vexo-border">
        <div className="space-y-1.5 sm:pr-3">
          <SectionTitle>Follow-up</SectionTitle>
          <MetricCard label="Leads retomados" value={String(followUpRecovered)} bare />
        </div>
        <div className="space-y-1.5 border-t border-vexo-border pt-3 sm:border-t-0 sm:pl-3 sm:pt-0">
          <SectionTitle>Reativação</SectionTitle>
          <div className="grid grid-cols-2 gap-1.5">
            <MetricCard label="Enviadas" value={String(reactivation.sent)} bare />
            <MetricCard label="Voltaram" value={String(reactivation.returned)} bare />
          </div>
        </div>
      </div>
    </div>
  );
}
