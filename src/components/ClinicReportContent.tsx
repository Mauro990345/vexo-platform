import { MetricCard } from "@/components/MetricCard";
import type { ReportNumbersWithComparison } from "@/lib/report-metrics";
import { formatReportPeriodLabel, formatReportDateRange, type ReportFrequency } from "@/lib/report-period";

// Conteúdo do Relatório de resultados (quinzenal/mensal) — componente
// presentacional PURO (sem Prisma, sem sessão), reaproveitado pelas DUAS
// telas que mostram o relatório (pedido explícito: "uma única definição
// de cada número"): a página pública /relatorio/[token] (o que o cliente
// recebe) e o preview admin em /crm/clinicas/[id]/relatorio-preview.
//
// Ajuste de conteúdo/layout (2ª rodada, ver DESIGN.md): reaproveita
// literalmente a MESMA faixa de métricas do Painel (MetricCard `bare`,
// dividida por linhas finas — ver PanelOverview.tsx) pro Resumo, em vez
// de uma grade própria — zero componente/token novo. Cor: só "Agendaram"
// tem destaque (`highlight`, tom âmbar `--vexo-painel-highlight`), porque
// é exatamente a mesma regra que o Painel já aplica a essa métrica ali
// (ver PanelOverview.tsx) — nenhum OUTRO box do relatório usa cor
// diferente. Único toque de identidade NOVO (pedido explícito, "mais azul
// sem poluir"): a comparação com o período anterior fica em
// `text-vexo-accent` (azul da marca) quando é uma MELHORA (%+), e em
// `text-vexo-muted` (cinza) quando é queda ou nula — nunca vermelho/rosa,
// sempre a mesma regra em todo box que tiver comparação.
function formatComparisonLabel(pct: number | null): string | null {
  if (pct === null) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs. anterior`;
}

// Cor do indicador de comparação — azul só quando é melhora, cinza em
// qualquer outro caso (queda, estável ou indisponível). Mesma função pros
// 4 boxes do Resumo, nunca uma regra diferente por métrica.
function comparisonColorClass(pct: number | null): string {
  return pct !== null && pct > 0 ? "text-vexo-accent" : "text-vexo-muted";
}

function formatRate(rate: number | null): string | null {
  if (rate === null) return null;
  return `${Math.round(rate * 100)}% dos agendados`;
}

// Caixa do Resumo (`bare`, dentro da faixa dividida — ver grid abaixo) —
// valor + (opcional) linha de taxa + (opcional) comparação colorida. Uma
// função só, usada pelos 4 boxes, pra garantir que todos sigam
// EXATAMENTE a mesma regra visual (pedido explícito, item 5 — "nenhum
// box diferente dos outros").
function SummaryBox({
  label,
  value,
  rateLabel,
  comparisonPct,
  highlight = false,
}: {
  label: string;
  value: number;
  rateLabel?: string | null;
  comparisonPct: number | null;
  highlight?: boolean;
}) {
  const comparisonLabel = formatComparisonLabel(comparisonPct);
  return (
    <div className="px-2.5 py-2">
      <MetricCard label={label} value={String(value)} bare highlight={highlight} />
      {rateLabel && <p className="mt-1 text-card text-vexo-muted">{rateLabel}</p>}
      {comparisonLabel && <p className={`mt-0.5 text-card ${comparisonColorClass(comparisonPct)}`}>{comparisonLabel}</p>}
    </div>
  );
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
  const { funnel, attendanceRate, followUpRecovered, reactivation, previousComparison, isSimulated } = numbers;

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
      </div>

      {/* Resumo — mesma faixa dividida do Painel (ver PanelOverview.tsx):
          2x2 no celular, 4-em-linha a partir de sm. Reutilizada ao pé da
          letra (mesmas classes), não recriada — é o que garante nenhum
          rótulo cortado nas larguras pedidas (já testado ali) e a MESMA
          cor/hierarquia do Painel. "Compareceram" ganha a taxa de
          comparecimento como 2ª linha, em vez de um box separado
          (pedido explícito, item 1). */}
      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Resumo</p>
        <div className="mt-1.5 grid grid-cols-2 divide-x divide-vexo-border rounded-block border border-vexo-border bg-vexo-surface2 sm:grid-cols-4 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-vexo-border sm:[&>*:nth-child(n+3)]:border-t-0">
          <SummaryBox label="Abordados" value={funnel.contacted} comparisonPct={previousComparison.contactedPct} />
          <SummaryBox label="Em conversa" value={funnel.inConversation} comparisonPct={previousComparison.inConversationPct} />
          <SummaryBox label="Agendaram" value={funnel.scheduled} comparisonPct={previousComparison.scheduledPct} highlight />
          <SummaryBox label="Compareceram" value={funnel.attended} rateLabel={formatRate(attendanceRate)} comparisonPct={previousComparison.attendedPct} />
        </div>
      </div>

      {/* "Não compareceram" — box próprio, mesmo estilo dos outros (sem
          faixa/cor diferente), logo abaixo do Resumo (pedido explícito,
          item 2 — substitui o antigo bloco "Funil", que duplicava os
          mesmos 4 números de cima). */}
      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard label="Não compareceram" value={String(funnel.noShow)} />
      </div>

      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Follow-up</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <MetricCard label="Leads retomados" value={String(followUpRecovered)} />
        </div>
      </div>

      {/* Reativação — 2 boxes (pedido explícito, item 3): "Enviadas" e
          "Voltaram", reaproveitando getReactivationReturnStats/
          RETURN_ATTRIBUTION_DAYS (ver report-metrics.ts), sem redefinir a
          regra. Sem nenhuma enviada no período: mostra os dois boxes em
          0 mesmo assim (mais discreto/limpo que um aviso extra — os
          próprios boxes já contam a história). */}
      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Reativação</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <MetricCard label="Enviadas" value={String(reactivation.sent)} />
          <MetricCard label="Voltaram" value={String(reactivation.returned)} />
        </div>
      </div>
    </div>
  );
}
