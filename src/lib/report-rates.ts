// Taxas do Relatório (4ª rodada, ver DESIGN.md) — lógica PURA (sem Prisma),
// importável pelo componente presentacional. Todas calculadas SÓ a partir
// dos MESMOS números já exibidos na página (boxes do Resumo, boxes da
// Reativação) — nunca um dado novo — e nunca exibidas quando contradiriam
// esses números (denominador zero, ou numerador maior que o denominador
// por diferença de base entre as métricas — ver comentário de cada uma).

// num/den em [0, 1], ou null quando não é uma taxa honesta pra mostrar:
// den <= 0 (sem base) ou num > den (as duas métricas vêm de bases
// diferentes — ex.: "Agendaram" conta agendamentos CRIADOS no período e
// "Compareceram" conta atendimentos com DATA no período, então perto das
// bordas o 2º pode superar o 1º; uma "taxa" acima de 100% contradiria os
// próprios números mostrados lado a lado).
export function safeRate(num: number, den: number): number | null {
  if (!(den > 0) || num < 0 || num > den) return null;
  return num / den;
}

export function formatRatePct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export type ConversionRate = { from: string; to: string; rate: number };

// Faixa de conversão dentro do Resumo (5ª rodada) — denominador = box
// anterior, SÓ as taxas válidas (nunca uma célula "—"). "Agendaram →
// Compareceram" saiu de propósito: o comparecimento fica só no anel, que
// já explica a base ("X de Y atendimentos com data no período").
// `contactedIsIndependent` = "Abordados" veio de registro manual de
// abordagem (ApproachLog) e não do fallback de getClinicMetrics (Math.max
// com o nº de conversas — ver metrics.ts). Sem registro manual, "Abordados"
// É o próprio nº de conversas, e a 1ª taxa seria um 100% artificial.
export function computeConversionRates(
  funnel: { contacted: number; inConversation: number; scheduled: number },
  contactedIsIndependent: boolean
): ConversionRate[] {
  const candidates: Array<{ from: string; to: string; rate: number | null }> = [
    { from: "Abordados", to: "Em conversa", rate: contactedIsIndependent ? safeRate(funnel.inConversation, funnel.contacted) : null },
    { from: "Em conversa", to: "Agendaram", rate: safeRate(funnel.scheduled, funnel.inConversation) },
  ];
  return candidates.filter((c): c is ConversionRate => c.rate !== null);
}

// Comparação "vs. anterior" (pedido explícito, item 1): só existe quando o
// valor ATUAL e o do período ANTERIOR são ambos > 0. Qualquer outro caso
// (atual 0 → "-100%"; anterior 0 → "+infinito%") some por completo.
export function computePercentDelta(current: number, previous: number): number | null {
  if (!(current > 0) || !(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type EvolutionPoint = { start: Date; end: Date; scheduled: number; attended: number };

// Mínimo de períodos COM DADOS (agendaram ou compareceram > 0) pra o
// gráfico de evolução aparecer (pedido explícito, item 6c) — abaixo disso
// a "evolução" seria 1-2 pontos soltos, mais ruído do que informação.
export const EVOLUTION_MIN_PERIODS_WITH_DATA = 3;

// Evolução começa no PRIMEIRO período com dados (5ª rodada): períodos
// zerados antes dele são cortados (zeros no meio continuam — são dado).
export function trimEvolution(points: EvolutionPoint[]): EvolutionPoint[] {
  const first = points.findIndex((p) => p.scheduled > 0 || p.attended > 0);
  return first === -1 ? [] : points.slice(first);
}

export function shouldShowEvolution(points: EvolutionPoint[]): boolean {
  return points.filter((p) => p.scheduled > 0 || p.attended > 0).length >= EVOLUTION_MIN_PERIODS_WITH_DATA;
}

// Frase de leitura acima do gráfico de Evolução (6ª rodada) — calculada só
// com os DOIS ÚLTIMOS pontos da própria série (período do relatório e o
// anterior), nunca um dado novo. Ex.: "Agendamentos: 10 em outubro, +43%
// sobre setembro". null (frase oculta) quando não há base de comparação —
// mesma regra de computePercentDelta (atual e anterior > 0).
export function buildEvolutionReading(
  points: EvolutionPoint[],
  periodName: (p: EvolutionPoint) => string,
  frequency: "MONTHLY" | "BIWEEKLY"
): { lead: string; pct: number; tail: string } | null {
  if (points.length < 2) return null;
  const current = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  const pct = computePercentDelta(current.scheduled, previous.scheduled);
  if (pct === null) return null;
  const inWord = frequency === "MONTHLY" ? "em" : "na";
  const overWord = frequency === "MONTHLY" ? "sobre" : "sobre a";
  return {
    lead: `Agendamentos: ${current.scheduled} ${inWord} ${periodName(current)}, `,
    pct,
    tail: ` ${overWord} ${periodName(previous)}`,
  };
}

// Regra de cor da comparação no Relatório (6ª rodada): alta = verde vivo,
// queda = azul vivo, 0% = cinza. Nunca vermelho/rosa/coral.
export function deltaColorClass(pct: number): string {
  if (pct > 0) return "text-vexo-reportDeltaUp";
  if (pct < 0) return "text-vexo-reportDeltaDown";
  return "text-vexo-reportCaption";
}

export function formatDeltaPct(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
