import { MetricCard } from "@/components/MetricCard";
import { AttendanceRing } from "@/components/AttendanceRing";
import { WeeklyApproachesChart } from "@/components/WeeklyApproachesChart";
import { PeriodEvolutionChart } from "@/components/PeriodEvolutionChart";
import type { ReportNumbersWithComparison } from "@/lib/report-metrics";
import { formatReportPeriodLabel, formatReportDateRange, type ReportFrequency } from "@/lib/report-period";
import { buildOpeningSentence } from "@/lib/report-opening-sentence";
import { computeConversionRates, formatRatePct, safeRate, shouldShowEvolution, trimEvolution, type ConversionRate } from "@/lib/report-rates";

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
// com o dele, intocado). Comparação positiva em azul claro
// (vexo-reportPositive); negativa/zero/sem base em cinza — nunca
// vermelho/rosa.
function formatComparisonLabel(pct: number | null): string | null {
  if (pct === null) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs. anterior`;
}

function comparisonColorClass(pct: number | null): string {
  return pct !== null && pct > 0 ? "text-vexo-reportPositive" : "text-vexo-reportCaption";
}

// Tipografia do Relatório (5ª rodada) — número 24px no celular, 26px a
// partir de sm, semibold; legenda em cinza #8b909a (vexo-reportCaption) com
// peso normal (mais leve que o font-medium padrão do MetricCard).
const VALUE_CLASS = "text-report-value sm:text-report-value-lg text-vexo-tabFg";
const LABEL_CLASS = "font-normal text-vexo-reportCaption";

// Caixa do Resumo (`bare`, dentro da faixa dividida) — valor + (opcional)
// comparação. Uma função só pros 4 boxes: todos seguem EXATAMENTE a mesma
// regra visual.
function SummaryBox({ label, value, comparisonPct }: { label: string; value: number; comparisonPct: number | null }) {
  const comparisonLabel = formatComparisonLabel(comparisonPct);
  return (
    <div className="px-3 py-2.5">
      <MetricCard label={label} value={String(value)} bare labelClassName={LABEL_CLASS} valueClassName={VALUE_CLASS} />
      {comparisonLabel && <p className={`mt-1 text-card ${comparisonColorClass(comparisonPct)}`}>{comparisonLabel}</p>}
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
    followUpRecovered,
    reactivation,
    previousComparison,
    isSimulated,
    weeklyApproached,
    evolution,
  } = numbers;
  const openingSentence = buildOpeningSentence(frequency, numbers.period, funnel);
  const conversion = computeConversionRates(funnel, contactedFromApproachLogs);
  const reactivationReturnRate = safeRate(reactivation.returned, reactivation.sent);
  const evolutionShown = trimEvolution(evolution);
  const showEvolution = shouldShowEvolution(evolutionShown);

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
          Evolução lado a lado. Sob o anel, a BASE exata da taxa. */}
      <div className={`grid gap-3.5 ${showEvolution ? "lg:grid-cols-2" : ""}`}>
        <section className="report-panel-raised grid gap-4 rounded-report p-block sm:grid-cols-2">
          <div className="flex flex-col items-center gap-1.5">
            <SectionTitle>Comparecimento</SectionTitle>
            <AttendanceRing rate={attendanceRate} />
            {attendanceBase > 0 && (
              <p className="text-center text-caption leading-tight text-vexo-reportCaption">
                {funnel.attended} de {attendanceBase} {attendanceBase === 1 ? "atendimento" : "atendimentos"} com data no período
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <SectionTitle>Abordagens por semana</SectionTitle>
            <WeeklyApproachesChart weeks={weeklyApproached} />
          </div>
        </section>

        {showEvolution && (
          <section className="report-panel-raised space-y-2 rounded-report p-block">
            <SectionTitle>{frequency === "MONTHLY" ? `Evolução · últimos ${evolutionShown.length} meses` : `Evolução · últimas ${evolutionShown.length} quinzenas`}</SectionTitle>
            <PeriodEvolutionChart frequency={frequency} points={evolutionShown} />
          </section>
        )}
      </div>

      {/* Follow-up + Reativação numa faixa só. "Voltaram" ganha a taxa
          sobre "Enviadas" (oculta sem envio). "Leads retomados" fica SEM
          taxa: não existe hoje um total confiável de follow-ups ENVIADOS
          por período (FollowUpLog só guarda o último passo, e ele avança
          também em passo descartado sem envio) — não inventamos um. */}
      <section className="report-panel grid gap-3 rounded-report p-block sm:grid-cols-[1fr_2fr] sm:divide-x sm:divide-vexo-reportLine">
        <div className="space-y-1.5 sm:pr-3">
          <SectionTitle>Follow-up</SectionTitle>
          <MetricCard label="Leads retomados" value={String(followUpRecovered)} bare labelClassName={LABEL_CLASS} valueClassName={VALUE_CLASS} />
        </div>
        <div className="space-y-1.5 border-t border-vexo-reportLine pt-3 sm:border-t-0 sm:pl-3 sm:pt-0">
          <SectionTitle>Reativação</SectionTitle>
          <div className="grid grid-cols-2 gap-1.5">
            <MetricCard label="Enviadas" value={String(reactivation.sent)} bare labelClassName={LABEL_CLASS} valueClassName={VALUE_CLASS} />
            <div>
              <MetricCard label="Voltaram" value={String(reactivation.returned)} bare labelClassName={LABEL_CLASS} valueClassName={VALUE_CLASS} />
              {reactivationReturnRate !== null && (
                <p className="mt-1 text-card text-vexo-reportCaption">{formatRatePct(reactivationReturnRate)} das enviadas</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
