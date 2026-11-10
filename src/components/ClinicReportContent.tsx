import { MetricCard } from "@/components/MetricCard";
import { formatReactivationReturnLine } from "@/lib/reactivation";
import type { ReportNumbersWithComparison } from "@/lib/report-metrics";
import { formatReportPeriodLabel, formatReportDateRange, type ReportFrequency } from "@/lib/report-period";

// Conteúdo do Relatório de resultados (quinzenal/mensal) — componente
// presentacional PURO (sem Prisma, sem sessão), reaproveitado pelas DUAS
// telas que mostram o relatório (pedido explícito: "uma única definição
// de cada número"):
// - Página pública /relatorio/[token] (ClinicReportPublicContent,
//   route.tsx) — o que o cliente recebe, SEM seletor de período.
// - Preview admin /crm/clinicas/[id]/relatorio-preview — o mesmo
//   conteúdo, só que com o seletor de período por fora (ClinicReportPreview.tsx).
//
// Mesmos tokens do Painel do cliente (fundo #0b0f17/vexo-bg, títulos
// off-white/vexo-fg, texto de apoio cinza/vexo-muted, azul #2b87bd/
// vexo-accent) — nenhuma cor nova. SEM dado pessoal: só agregados (nunca
// nome/@ /telefone de paciente nenhum, pedido explícito).
function formatPercentLabel(pct: number | null): string | null {
  if (pct === null) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs. período anterior`;
}

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
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

      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Resumo</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          <MetricCard label="Agendamentos" value={String(funnel.scheduled)} hint={formatPercentLabel(previousComparison.scheduledPct) ?? undefined} />
          <MetricCard label="Compareceram" value={String(funnel.attended)} hint={formatPercentLabel(previousComparison.attendedPct) ?? undefined} />
          <MetricCard label="Taxa de comparecimento" value={formatRate(attendanceRate)} />
        </div>
      </div>

      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Funil</p>
        <div className="mt-1.5 grid grid-cols-2 divide-x divide-vexo-border rounded-block border border-vexo-border bg-vexo-surface2 sm:grid-cols-5 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-vexo-border sm:[&>*:nth-child(n+3)]:border-t-0">
          <div className="px-2.5 py-2">
            <MetricCard label="Contatados" value={String(funnel.contacted)} bare hint={formatPercentLabel(previousComparison.contactedPct) ?? undefined} />
          </div>
          <div className="px-2.5 py-2">
            <MetricCard label="Em conversa" value={String(funnel.inConversation)} bare />
          </div>
          <div className="px-2.5 py-2">
            <MetricCard label="Agendaram" value={String(funnel.scheduled)} bare highlight />
          </div>
          <div className="px-2.5 py-2">
            <MetricCard label="Compareceram" value={String(funnel.attended)} bare />
          </div>
          <div className="px-2.5 py-2">
            <MetricCard label="Não compareceram" value={String(funnel.noShow)} bare />
          </div>
        </div>
      </div>

      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Follow-up</p>
        <p className="mt-1.5 text-sm">
          <span className="font-semibold">{followUpRecovered}</span> <span className="text-vexo-muted">{followUpRecovered === 1 ? "lead retomado" : "leads retomados"}</span>
        </p>
      </div>

      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Reativação</p>
        <p className="mt-1.5 text-sm">{formatReactivationReturnLine(reactivation.sent, reactivation.returned)}</p>
      </div>
    </div>
  );
}
