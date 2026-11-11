import { MetricCard } from "@/components/MetricCard";
import { AttendanceRing } from "@/components/AttendanceRing";
import { ReportColumnChart } from "@/components/ReportColumnChart";
import type { ReportNumbersWithComparison } from "@/lib/report-metrics";
import { formatReportPeriodLabel, formatReportDateRange, formatReportPeriodName, formatReportPeriodShortLabel, formatShortDate, type ReportFrequency } from "@/lib/report-period";
import { buildOpeningSentence } from "@/lib/report-opening-sentence";
import {
  buildEvolutionReading,
  computeConversionRates,
  deltaColorClass,
  formatDeltaPct,
  formatRatePct,
  safeRate,
  shouldShowEvolution,
  type ConversionRate,
} from "@/lib/report-rates";

// Conteúdo do Relatório de resultados (quinzenal/mensal) — componente
// presentacional PURO (sem Prisma, sem sessão), reaproveitado pelas DUAS
// telas que mostram o relatório: a página pública /relatorio/[token] (o
// que o cliente recebe) e o preview admin em
// /crm/clinicas/[id]/relatorio-preview.
//
// 4ª rodada (ver DESIGN.md, "Relatório"): painéis elevados (.report-panel —
// degradê vertical sutil + borda clara de baixa opacidade + sombra escura),
// números maiores, cabeçalho com brilho/filete, faixa de conversão entre
// etapas, evolução dos últimos 6 períodos e taxa de retorno da Reativação.
// Cor única nos 4 boxes do Resumo (nenhum `highlight` — o Painel continua
// com o dele, intocado). Comparação "vs. anterior" (6ª rodada): ALTA em
// verde vivo (vexo-reportDeltaUp), QUEDA em azul vivo
// (vexo-reportDeltaDown), 0% em cinza, sem base nenhum texto — nunca
// vermelho/rosa/coral (ver deltaColorClass, report-rates.ts).
function formatComparisonLabel(pct: number | null): string | null {
  if (pct === null) return null;
  return `${formatDeltaPct(pct)} vs. anterior`;
}

function comparisonColorClass(pct: number | null): string {
  return pct === null ? "text-vexo-reportCaption" : deltaColorClass(pct);
}

// Tipografia do Relatório (5ª rodada) — número 24px no celular, 26px a
// partir de sm, semibold; legenda em cinza #8b909a (vexo-reportCaption) com
// peso normal (mais leve que o font-medium padrão do MetricCard).
// 9ª rodada — leitura pra dono de negócio com mais de 50 anos: todo texto
// de apoio/rótulo pequeno sobe +1px (nunca os números grandes nem os
// títulos). `!text-[12px]` força a sobrescrita do `text-card` (11px) que
// o MetricCard já aplica por padrão ao rótulo — sem o `!` a ordem das
// classes geradas pelo Tailwind não garante qual tamanho vence; só
// precisa disso porque é um componente COMPARTILHADO com o Painel
// (nunca mudar o tamanho padrão dele).
const VALUE_CLASS = "text-report-value sm:text-report-value-lg text-vexo-tabFg";
const LABEL_CLASS = "font-normal text-vexo-reportCaption !text-[12px]";

// Caixa do Resumo (`bare`, dentro da faixa dividida) — valor + (opcional)
// comparação. Uma função só pros 4 boxes: todos seguem EXATAMENTE a mesma
// regra visual.
function SummaryBox({ label, value, comparisonPct }: { label: string; value: number; comparisonPct: number | null }) {
  const comparisonLabel = formatComparisonLabel(comparisonPct);
  return (
    <div className="px-3 py-2.5">
      <MetricCard label={label} value={String(value)} bare labelClassName={LABEL_CLASS} valueClassName={VALUE_CLASS} />
      {comparisonLabel && <p className={`mt-1 text-[12px] ${comparisonColorClass(comparisonPct)}`}>{comparisonLabel}</p>}
    </div>
  );
}

// Título de seção — off-white (vexo-tabFg, ~#e6e8ec), caixa alta, 12px.
function SectionTitle({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-vexo-tabFg">{children}</p>;
}

// Faixa de conversão DENTRO do bloco do Resumo (5ª rodada), abaixo dos 4
// números e separada por linha fina. Só as taxas válidas (ver
// computeConversionRates): uma linha por taxa no celular — "48%  Em
// conversa → Agendaram" nunca quebra desalinhado em 360px —, lado a lado a
// partir de sm. Nenhuma taxa válida: a faixa some.
function ConversionStrip({ rates }: { rates: ConversionRate[] }) {
  if (rates.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 border-t border-vexo-reportLine px-3 py-2 sm:flex-row sm:gap-6" aria-label="Taxas de conversão entre etapas">
      {rates.map((r) => (
        <li key={r.to} className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="text-sm font-semibold text-vexo-tabFg">{formatRatePct(r.rate)}</span>
          <span className="text-card text-vexo-reportCaption">
            {r.from} → {r.to}
          </span>
        </li>
      ))}
    </ul>
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
  const {
    funnel,
    attendanceRate,
    attendanceBase,
    contactedFromApproachLogs,
    followUp,
    reactivation,
    previousComparison,
    isSimulated,
    weekly,
    evolution,
  } = numbers;
  const openingSentence = buildOpeningSentence(frequency, numbers.period, funnel);
  const conversion = computeConversionRates(funnel, contactedFromApproachLogs);
  const reactivationReturnRate = safeRate(reactivation.returned, reactivation.sent);
  // Evolução: SEMPRE em meses (também no quinzenal — ver
  // evolutionMonthsOfPeriod), só com os 3 meses com dados.
  const showEvolution = shouldShowEvolution(evolution);
  const evolutionReading = showEvolution ? buildEvolutionReading(evolution, (p) => formatReportPeriodName("MONTHLY", p), "MONTHLY") : null;
  const weeklySummary = weekly.map((w) => `semana de ${formatShortDate(w.start)}: ${w.contacted} abordados, ${w.inConversation} em conversa`).join("; ");
  const evolutionSummary = evolution
    .map((p) => `${formatReportPeriodName("MONTHLY", p)}: ${p.scheduled} agendaram, ${p.attended} compareceram`)
    .join("; ");
  const followUpRate = safeRate(followUp.responded, followUp.received);

  return (
    <div className="space-y-3.5">
      {/* Cabeçalho com identidade: brilho azul bem suave ao fundo
          (.report-header-glow, ~12%) + filete de 2px azul → ciano sob o
          nome da clínica (.report-title-rule). Nada além disso. */}
      <header className="report-header-glow -mx-4 px-4 pb-1 pt-2">
        <h1 className="text-lg font-semibold tracking-tight text-vexo-tabFg">{clinicName}</h1>
        <div className="report-title-rule mt-1.5 w-12 rounded-full" aria-hidden="true" />
        <p className="mt-2 text-sm text-vexo-reportCaption">Relatório VEXO IA</p>
        <p className="mt-0.5 text-xs text-vexo-reportCaption">
          {periodLabel} ({dateRange})
        </p>
        {isSimulated && (
          <span className="mt-1.5 inline-block rounded-sm bg-vexo-surface2 px-1.5 py-0.5 text-caption font-medium uppercase tracking-wide text-vexo-reportCaption">
            Dados de exemplo
          </span>
        )}
        <p className="mt-2.5 text-report-lead text-vexo-tabFg">{openingSentence}</p>
      </header>

      {/* Resumo — bloco de nível BASE (mais escuro), 4 números divididos
          por linha fina (2x2 no celular, 4 em linha a partir de sm) e, logo
          abaixo, separada por outra linha fina, a faixa de taxas válidas. */}
      <section className="space-y-1.5">
        <SectionTitle>Resumo</SectionTitle>
        <div className="report-panel overflow-hidden rounded-report">
          <div className="grid grid-cols-2 divide-x divide-vexo-reportLine sm:grid-cols-4 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-vexo-reportLine sm:[&>*:nth-child(n+3)]:border-t-0">
            <SummaryBox label="Abordados" value={funnel.contacted} comparisonPct={previousComparison.contactedPct} />
            <SummaryBox label="Em conversa" value={funnel.inConversation} comparisonPct={previousComparison.inConversationPct} />
            <SummaryBox label="Agendaram" value={funnel.scheduled} comparisonPct={previousComparison.scheduledPct} />
            <SummaryBox label="Compareceram" value={funnel.attended} comparisonPct={previousComparison.attendedPct} />
          </div>
          <ConversionStrip rates={conversion} />
        </div>
      </section>

      {/* Blocos de gráfico — nível RAISED (um tom mais claro). Celular:
          empilhados em largura total. Desktop largo (lg): anel + semanas e
          Evolução lado a lado. Sob o anel, a BASE exata da taxa.
          9ª rodada: o anel (+ título) fica centralizado na vertical no
          espaço disponível da coluna (grid estica as duas colunas pra
          mesma altura — o conteúdo da direita, gráfico+legenda, é
          normalmente o mais alto); o texto da base fica como 2º filho do
          flex-col externo, por isso sempre no rodapé — na MESMA altura da
          legenda do gráfico ao lado, que também é o último elemento ali. */}
      <div className={`grid gap-3.5 ${showEvolution ? "lg:grid-cols-[3fr_2fr]" : ""}`}>
        <section className="report-panel-raised grid gap-4 rounded-report p-block sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center sm:w-32">
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5">
              <SectionTitle>Comparecimento</SectionTitle>
              <AttendanceRing rate={attendanceRate} />
            </div>
            {attendanceBase > 0 && (
              <p className="text-center text-[11px] leading-tight text-vexo-reportCaption">
                {funnel.attended} de {attendanceBase} {attendanceBase === 1 ? "atendimento" : "atendimentos"} com data no período
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <SectionTitle>Abordados por semana</SectionTitle>
            <ReportColumnChart
              groups={weekly.map((w) => ({ label: formatShortDate(w.start), values: [w.contacted, w.inConversation] }))}
              seriesLabels={["Abordados", "Em conversa"]}
              ariaLabel={`Abordados por semana, últimas ${weekly.length} semanas — ${weeklySummary}`}
            />
          </div>
        </section>

        {showEvolution && (
          <section className="report-panel-raised space-y-2 rounded-report p-block">
            <SectionTitle>Evolução · últimos 3 meses</SectionTitle>
            {/* Frase de leitura (só com base de comparação) — texto pequeno
                e leve; o % segue a mesma regra de cor da comparação. */}
            {evolutionReading && (
              <p className="text-[12px] text-vexo-reportCaption">
                {evolutionReading.lead}
                <span className={deltaColorClass(evolutionReading.pct)}>{formatDeltaPct(evolutionReading.pct)}</span>
                {evolutionReading.tail}
              </p>
            )}
            <ReportColumnChart
              groups={evolution.map((p) => ({ label: formatReportPeriodShortLabel("MONTHLY", p), values: [p.scheduled, p.attended] }))}
              seriesLabels={["Agendaram", "Compareceram"]}
              ariaLabel={`Evolução dos últimos 3 meses — ${evolutionSummary}`}
            />
          </section>
        )}
      </div>

      {/* Follow-up + Reativação numa faixa só, no MESMO formato (6ª rodada):
          dois números lado a lado + uma linha de taxa. Follow-up:
          "Receberam"/"Responderam" (ver computeFollowUpReach,
          report-metrics.ts — Responderam é subconjunto de Receberam) e
          "X% responderam" (oculta sem ninguém que recebeu). */}
      <section className="report-panel grid gap-3 rounded-report p-block sm:grid-cols-2 sm:divide-x sm:divide-vexo-reportLine">
        <div className="space-y-1.5 sm:pr-3">
          <SectionTitle>Follow-up</SectionTitle>
          <div className="grid grid-cols-2 gap-1.5">
            <MetricCard label="Receberam" value={String(followUp.received)} bare labelClassName={LABEL_CLASS} valueClassName={VALUE_CLASS} />
            <div>
              <MetricCard label="Responderam" value={String(followUp.responded)} bare labelClassName={LABEL_CLASS} valueClassName={VALUE_CLASS} />
              {followUpRate !== null && <p className="mt-1 text-[12px] text-vexo-reportCaption">{formatRatePct(followUpRate)} responderam</p>}
            </div>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-vexo-reportLine pt-3 sm:border-t-0 sm:pl-3 sm:pt-0">
          <SectionTitle>Reativação</SectionTitle>
          <div className="grid grid-cols-2 gap-1.5">
            <MetricCard label="Enviadas" value={String(reactivation.sent)} bare labelClassName={LABEL_CLASS} valueClassName={VALUE_CLASS} />
            <div>
              <MetricCard label="Voltaram" value={String(reactivation.returned)} bare labelClassName={LABEL_CLASS} valueClassName={VALUE_CLASS} />
              {reactivationReturnRate !== null && (
                <p className="mt-1 text-[12px] text-vexo-reportCaption">{formatRatePct(reactivationReturnRate)} das enviadas</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
