import { formatReportOpeningPrefix, type ReportFrequency, type ReportPeriod } from "@/lib/report-period";
import type { ReportFunnel } from "@/lib/report-metrics";

// Frase de abertura do relatório (pedido explícito, item 2) — calculada
// SÓ com os mesmos números do Resumo (Abordados/Agendaram/Compareceram),
// nunca um dado novo. Lógica pura (sem Prisma/sessão), testável isolada —
// mesmo padrão de report-period.ts/report-metrics.ts.
//
// Singular/plural tratados explicitamente (pedido explícito: "1 pessoa",
// "1 agendou"). Zeros nunca produzem frase estranha: cada zero tem seu
// próprio ramo, substituindo a cláusula correspondente por uma frase
// neutra em vez de "0 pessoas"/"0 agendaram".
function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

export function buildOpeningSentence(frequency: ReportFrequency, period: ReportPeriod, funnel: ReportFunnel): string {
  const { contacted, scheduled, attended } = funnel;

  // Abordados = 0: nenhum dos outros números faz sentido sozinho (todo o
  // funil nasce de uma abordagem) — uma única linha neutra, sem mês/
  // quinzena (pedido explícito, item 2: "mostrar apenas uma linha
  // neutra").
  if (contacted === 0) {
    return "Neste período ainda não houve abordagens registradas.";
  }

  const prefix = formatReportOpeningPrefix(frequency, period);
  const contactedWord = pluralize(contacted, `${contacted} pessoa`, `${contacted} pessoas`);

  if (scheduled === 0) {
    return `${prefix}, o VEXO IA abordou ${contactedWord}. Neste período ainda não houve agendamentos.`;
  }

  const scheduledWord = pluralize(scheduled, `${scheduled} agendou`, `${scheduled} agendaram`);

  if (attended === 0) {
    return `${prefix}, o VEXO IA abordou ${contactedWord} e ${scheduledWord}. Ainda não houve comparecimentos neste período.`;
  }

  const attendedWord = pluralize(attended, `${attended} compareceu`, `${attended} compareceram`);

  return `${prefix}, o VEXO IA abordou ${contactedWord}, ${scheduledWord} e ${attendedWord}.`;
}
