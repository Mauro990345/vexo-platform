import { MetricCard } from "@/components/MetricCard";
import { AttendanceRing } from "@/components/AttendanceRing";
import { WeeklyApproachesChart } from "@/components/WeeklyApproachesChart";
import { PeriodEvolutionChart } from "@/components/PeriodEvolutionChart";
import type { ReportNumbersWithComparison } from "@/lib/report-metrics";
import { formatReportPeriodLabel, formatReportDateRange, type ReportFrequency } from "@/lib/report-period";
import { buildOpeningSentence } from "@/lib/report-opening-sentence";
import { computeConversionRates, formatRatePct, safeRate, shouldShowEvolution } from "@/lib/report-rates";

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

// Tipografia do Relatório — número grande (28px no celular, 30px a partir
// de sm), legenda em cinza #8b909a (vexo-reportCaption).
const VALUE_CLASS = "text-report-value sm:text-report-value-lg text-vexo-tabFg";
const LABEL_CLASS = "text-vexo-reportCaption";

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

// Célula da faixa de conversão: % + "Etapa → Etapa" embaixo (pode quebrar
// em 2 linhas no celular — nunca é cortado). "—" quando a taxa não é
// honesta pra mostrar (ver computeConversionRates, report-rates.ts).
function ConversionCell({ from, to, rate }: { from: string; to: string; rate: number | null }) {
  const pct = formatRatePct(rate);
  return (
    <div className="min-w-0 px-2.5 py-2" role="group" aria-label={rate === null ? `${from} para ${to}: sem taxa` : `${from} para ${to}: ${pct}`}>
      <p className="text-base font-semibold leading-none text-vexo-tabFg">{pct}</p>
      <p className="mt-1 text-caption leading-tight text-vexo-reportCaption">
        {from} → {to}
      </p>
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
  const showEvolution = shouldShowEvolution(evolution);

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

      {/* Resumo — mesma faixa dividida do Painel (2x2 no celular, 4 em
          linha a partir de sm), sobre o painel elevado do Relatório. Logo
          abaixo, a faixa fina de conversão entre etapas (denominador =
          box anterior, mesmos números exibidos). */}
      <section className="space-y-1.5">
        <SectionTitle>Resumo</SectionTitle>
        <div className="report-panel grid grid-cols-2 divide-x divide-vexo-border rounded-report sm:grid-cols-4 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-vexo-border sm:[&>*:nth-child(n+3)]:border-t-0">
          <SummaryBox label="Abordados" value={funnel.contacted} comparisonPct={previousComparison.contactedPct} />
          <SummaryBox label="Em conversa" value={funnel.inConversation} comparisonPct={previousComparison.inConversationPct} />
          <SummaryBox label="Agendaram" value={funnel.scheduled} comparisonPct={previousComparison.scheduledPct} />
          <SummaryBox label="Compareceram" value={funnel.attended} comparisonPct={previousComparison.attendedPct} />
        </div>
        <div className="report-panel grid grid-cols-3 divide-x divide-vexo-border rounded-report" role="group" aria-label="Taxas de conversão entre etapas">
          <ConversionCell from="Abordados" to="Em conversa" rate={conversion.contactedToConversation} />
          <ConversionCell from="Em conversa" to="Agendaram" rate={conversion.conversationToScheduled} />
          <ConversionCell from="Agendaram" to="Compareceram" rate={conversion.scheduledToAttended} />
        </div>
      </section>

      {/* Anel de comparecimento + barras por semana (lado a lado a partir
          de sm). Sob o anel, a BASE exata da taxa ("9 de 9 atendimentos
          com data no período") — a taxa nunca parece contradizer
          "Agendaram", que é outra base (agendamentos CRIADOS no período). */}
      <section className="report-panel grid gap-4 rounded-report p-block sm:grid-cols-2">
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
        <section className="report-panel space-y-2 rounded-report p-block">
          <SectionTitle>{frequency === "MONTHLY" ? `Evolução · últimos ${evolution.length} meses` : `Evolução · últimas ${evolution.length} quinzenas`}</SectionTitle>
          <PeriodEvolutionChart frequency={frequency} points={evolution} />
        </section>
      )}

      {/* Follow-up + Reativação numa faixa só. "Voltaram" ganha a taxa
          sobre "Enviadas" (oculta sem envio). "Leads retomados" fica SEM
          taxa: não existe hoje um total confiável de follow-ups ENVIADOS
          por período (FollowUpLog só guarda o último passo, e ele avança
          também em passo descartado sem envio) — não inventamos um. */}
      <section className="report-panel grid gap-3 rounded-report p-block sm:grid-cols-[1fr_2fr] sm:divide-x sm:divide-vexo-border">
        <div className="space-y-1.5 sm:pr-3">
          <SectionTitle>Follow-up</SectionTitle>
          <MetricCard label="Leads retomados" value={String(followUpRecovered)} bare labelClassName={LABEL_CLASS} valueClassName={VALUE_CLASS} />
        </div>
        <div className="space-y-1.5 border-t border-vexo-border pt-3 sm:border-t-0 sm:pl-3 sm:pt-0">
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
