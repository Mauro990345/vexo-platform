import { prisma } from "@/lib/prisma";
import { getClinicMetrics, getAttendanceMetrics } from "@/lib/metrics";
import { getReactivationReturnStats, RETURN_ATTRIBUTION_DAYS } from "@/lib/reactivation";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";
import { resolvePreviousPeriod, periodLengthDays, splitIntoWeeks, type ReportFrequency, type ReportPeriod, type ReportWeek } from "@/lib/report-period";

// Números do Relatório de resultados (quinzenal/mensal) — ver DESIGN.md e
// ClinicReportDelivery no schema. REUTILIZA as mesmas queries/definições
// já usadas pelo Painel do cliente (getClinicMetrics/getAttendanceMetrics,
// metrics.ts) e pela Reativação (getReactivationReturnStats/
// RETURN_ATTRIBUTION_DAYS, reactivation.ts) — nenhuma segunda definição
// pro mesmo número, nenhuma regra nova de atribuição.

export const REPORT_FOLLOW_UP_RETOMADOS_HELP =
  "Leads que pararam de responder ou faltaram, entraram na sequência automática de follow-up, e voltaram a responder " +
  "ou remarcaram dentro do período (FollowUpLog.respondedAt já usado pelo sistema — não é uma regra nova).";

// "Retomados" (item c do pedido) — quantos LEADS DISTINTOS voltaram a
// responder/remarcar (FollowUpLog.respondedAt, já gravado hoje por
// cancelPendingFollowUp — ver conversation-pipeline.ts/appointments.ts/
// follow-up.ts, sempre que o lead responde de verdade ou remarca durante
// um follow-up em andamento) DENTRO do período. Conta por conversationId
// distinto (não por linha de log) — uma mesma conversa pode ter logs de
// SILENCE e NO_SHOW separados, mas representa o MESMO lead retomado.
async function countFollowUpRecovered(clinicId: string, from: Date, to: Date): Promise<number> {
  const rows = await prisma.followUpLog.findMany({
    where: {
      respondedAt: { gte: from, lt: to },
      conversation: { clinicId },
    },
    select: { conversationId: true },
    distinct: ["conversationId"],
  });
  return rows.length;
}

export type ReportFunnel = {
  contacted: number; // "Abordados" (getClinicMetrics.approached)
  inConversation: number; // "Em conversa" (getClinicMetrics.responded)
  scheduled: number; // "Agendaram" (getClinicMetrics.scheduled)
  attended: number; // "Compareceram" (getAttendanceMetrics.attended)
  noShow: number; // "Não compareceram" (getClinicMetrics.noShow)
};

export type ReportNumbers = {
  period: ReportPeriod;
  funnel: ReportFunnel;
  attendanceRate: number | null; // attended / pastDue (mesma definição do Painel)
  followUpRecovered: number;
  reactivation: { sent: number; returned: number };
  isSimulated: boolean;
};

export type WeeklyApproached = { start: Date; end: Date; count: number };

export type ReportNumbersWithComparison = ReportNumbers & {
  // Comparação discreta com o período anterior do MESMO tipo — nos 4
  // boxes do Resumo (Abordados/Em conversa/Agendaram/Compareceram, ver
  // ClinicReportContent.tsx), null quando o período anterior não tem
  // base pra comparar (anterior = 0, divisão por zero não faz sentido
  // como "+N%" — nunca aparece "-100%" por causa disso).
  previousComparison: {
    contactedPct: number | null;
    inConversationPct: number | null;
    scheduledPct: number | null;
    attendedPct: number | null;
  };
  // Abordagens por semana dentro do período ATUAL (gráfico de barras,
  // pedido explícito, item 5) — só do período atual, nunca do anterior
  // (que só entra na comparação discreta acima, não tem gráfico próprio).
  // Ver computeWeeklyApproached/buildSimulatedWeeklyApproached abaixo.
  weeklyApproached: WeeklyApproached[];
};

// Delta percentual simples (current vs previous) — null quando previous=0
// (sem base: "+infinito%" não é uma comparação útil, melhor omitir).
export function computePercentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

async function fetchRealReportNumbers(clinicId: string, period: ReportPeriod, now: Date): Promise<Omit<ReportNumbers, "isSimulated">> {
  const [clinicMetrics, attendance] = await Promise.all([
    getClinicMetrics(clinicId, period.start, period.end),
    getAttendanceMetrics(clinicId, period.start, period.end, now),
  ]);

  const days = periodLengthDays(period);
  // Adapter sem duplicar a regra de atribuição (ver comentário grande em
  // reactivation.ts, computeReactivationReturnStats): essa função sempre
  // olha pra uma janela ROLANTE de N dias terminando em `now` — passando
  // `referenceNow` = último instante do período (1ms antes de period.end)
  // e `days` = duração exata do período (sempre um nº inteiro de dias,
  // start/end são ambos meia-noite de Brasília), a janela rolante
  // reproduz EXATAMENTE [period.start, period.end), sem mexer em nenhuma
  // linha de reactivation.ts.
  const referenceNow = new Date(period.end.getTime() - 1);
  const [reactivationStat] = await getReactivationReturnStats(clinicId, [{ days, label: "período" }], referenceNow);

  const followUpRecovered = await countFollowUpRecovered(clinicId, period.start, period.end);

  return {
    period,
    funnel: {
      contacted: clinicMetrics.approached,
      inConversation: clinicMetrics.responded,
      scheduled: clinicMetrics.scheduled,
      attended: attendance.attended,
      noShow: clinicMetrics.noShow,
    },
    attendanceRate: attendance.pastDue > 0 ? attendance.attended / attendance.pastDue : null,
    followUpRecovered,
    reactivation: { sent: reactivationStat?.sent ?? 0, returned: reactivationStat?.returned ?? 0 },
  };
}

// Distribui `total` (inteiro) entre os `weights` proporcionalmente,
// SEMPRE somando exatamente `total` no final (método dos restos maiores/
// maior resto, mesmo princípio usado em apuração proporcional de votos) —
// é o que garante a soma das barras do gráfico semanal bater exatamente
// com o número já mostrado no box "Abordados" (pedido explícito, item 5),
// mesmo a métrica "abordados" por semana (ver computeWeeklyApproached)
// não sendo necessariamente aditiva pela própria fórmula de
// getClinicMetrics (que usa Math.max de 3 contadores — ver metrics.ts).
// O FORMATO/proporção de cada semana vem do dado real (os pesos); só o
// AJUSTE FINAL de arredondamento é novo aqui, nunca uma métrica nova.
export function allocateToTotal(weights: number[], total: number): number[] {
  if (total <= 0 || weights.length === 0) return weights.map(() => 0);

  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    // Nenhum peso real (não deveria acontecer com total>0, já que os
    // mesmos contadores alimentam o total — guarda defensiva): distribui
    // igualmente, sobra pras primeiras semanas.
    const base = Math.floor(total / weights.length);
    const remainder = total - base * weights.length;
    return weights.map((_, i) => base + (i < remainder ? 1 : 0));
  }

  const scaled = weights.map((w) => (w / weightSum) * total);
  const floors = scaled.map(Math.floor);
  const used = floors.reduce((a, b) => a + b, 0);
  const remaining = total - used;

  const order = scaled.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remaining; k++) {
    result[order[k]!.i]! += 1;
  }
  return result;
}

// Abordagens por semana dentro do período, pra o gráfico de barras
// (pedido explícito, item 5) — REUTILIZA getClinicMetrics (a mesma
// definição de "abordados" do Painel e do Resumo), só chamada uma vez por
// semana (ver splitIntoWeeks, report-period.ts) em vez de uma vez pro
// período inteiro. Nenhuma métrica nova: cada "peso" semanal É o
// `.approached` de getClinicMetrics pra aquela semana; o único passo novo
// é o ajuste final (allocateToTotal) pra a soma bater com o total já
// mostrado no Resumo (ver comentário de allocateToTotal sobre por que a
// soma dos pesos crus pode não bater sozinha).
async function computeWeeklyApproached(clinicId: string, period: ReportPeriod, totalApproached: number): Promise<WeeklyApproached[]> {
  const weeks = splitIntoWeeks(period);
  const weeklyMetrics = await Promise.all(weeks.map((w: ReportWeek) => getClinicMetrics(clinicId, w.start, w.end)));
  const weights = weeklyMetrics.map((m) => m.approached);
  const counts = allocateToTotal(weights, totalApproached);
  return weeks.map((w, i) => ({ start: w.start, end: w.end, count: counts[i]! }));
}

// Versão simulada (só Clínica Demo, ver isEmptyFunnel) da série semanal —
// mesmo princípio de buildSimulatedReportNumbers: um "peso" plausível por
// semana (determinístico, PRNG seedado), ajustado pra somar exatamente
// `totalApproached` (o mesmo número simulado do box "Abordados"), nunca
// um total independente.
function buildSimulatedWeeklyApproached(period: ReportPeriod, totalApproached: number): WeeklyApproached[] {
  const weeks = splitIntoWeeks(period);
  const rand = seededRandom(period.start.getTime() / 1000 + 17);
  const weights = weeks.map(() => 0.6 + rand() * 0.8);
  const counts = allocateToTotal(weights, totalApproached);
  return weeks.map((w, i) => ({ start: w.start, end: w.end, count: counts[i]! }));
}

// PRNG determinístico (mulberry32) só pra gerar os números simulados da
// Demo sempre IGUAIS pro mesmo período (reabrir o relatório não troca os
// números à toa) — nunca usado fora deste fallback, nunca grava nada no
// banco (pedido explícito: "prefira um cálculo/fallback isolado... em vez
// de gravar registros falsos nas tabelas reais").
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dados plausíveis de exemplo pra Clínica Demo VEXO quando os dados reais
// do período estão vazios/insuficientes (pedido explícito, item 7) — a UI
// mostra um aviso discreto "Dados de exemplo" (ver isSimulated). Nunca
// chamado fora de DEMO_CLINIC_ID e nunca escreve nada — é só um cálculo
// alternativo, isolado desta função (ver getReportNumbers/
// getReportNumbersWithComparison abaixo).
//
// Coerência interna GARANTIDA pela própria forma da conta (cada etapa é
// uma FRAÇÃO da anterior, nunca um valor independente): Abordados >=
// Em conversa >= Agendaram >= Compareceram sempre vale, por construção,
// nunca por sorte. "Não compareceram" sai do mesmo `scheduled` que gera
// "Compareceram" (uma fração dele), nunca pode superar Agendaram. Taxa de
// comparecimento = attended/scheduled, coerente com os dois.
function buildSimulatedReportNumbers(period: ReportPeriod): Omit<ReportNumbers, "isSimulated"> {
  const days = periodLengthDays(period);
  const rand = seededRandom(period.start.getTime() / 1000);
  const scale = Math.max(1, Math.round(days / 7)); // mais atividade simulada em períodos mais longos

  const contacted = 18 * scale + Math.floor(rand() * 10);
  const inConversation = Math.round(contacted * (0.55 + rand() * 0.15));
  const scheduled = Math.round(inConversation * (0.35 + rand() * 0.1));
  const noShow = Math.round(scheduled * (0.1 + rand() * 0.05));
  const attended = Math.max(0, scheduled - noShow - Math.round(scheduled * 0.05));
  const sent = Math.max(1, Math.round(scheduled * 0.2));
  const returned = Math.round(sent * (0.25 + rand() * 0.15));

  return {
    period,
    funnel: { contacted, inConversation, scheduled, attended, noShow },
    attendanceRate: scheduled > 0 ? attended / scheduled : null,
    followUpRecovered: Math.max(0, Math.round(inConversation * 0.08)),
    reactivation: { sent, returned },
  };
}

// Critério de "dados insuficientes" (documentado, pedido explícito, item
// 7) — SÓ conta como insuficiente quando NENHUMA atividade de verdade
// aconteceu no período: abordados=0 E agendaram=0 E compareceram=0 E
// reativação enviada=0, todos ao mesmo tempo. Qualquer um desses
// diferente de zero já é "dado real suficiente" — mostra os números
// reais (mesmo que baixos/zerados nos outros campos), nunca troca por
// simulado. Não depende de follow-up retomados de propósito: esse número
// nunca é positivo sozinho sem nenhuma das quatro atividades acima.
function isEmptyFunnel(numbers: Omit<ReportNumbers, "isSimulated">): boolean {
  return (
    numbers.funnel.contacted === 0 &&
    numbers.funnel.scheduled === 0 &&
    numbers.funnel.attended === 0 &&
    numbers.reactivation.sent === 0
  );
}

export async function getReportNumbers(clinicId: string, period: ReportPeriod, now: Date = new Date()): Promise<ReportNumbers> {
  const real = await fetchRealReportNumbers(clinicId, period, now);

  // Clínicas reais NUNCA recebem números simulados (pedido explícito,
  // item 7) — só a Demo, e só quando o período real está vazio (ver
  // isEmptyFunnel acima).
  if (clinicId === DEMO_CLINIC_ID && isEmptyFunnel(real)) {
    return { ...buildSimulatedReportNumbers(period), isSimulated: true };
  }
  return { ...real, isSimulated: false };
}

export async function getReportNumbersWithComparison(
  clinicId: string,
  frequency: ReportFrequency,
  period: ReportPeriod,
  now: Date = new Date()
): Promise<ReportNumbersWithComparison> {
  const previousPeriod = resolvePreviousPeriod(frequency, period);

  // A decisão "simula ou não" é tomada UMA VEZ, só a partir do período
  // ATUAL — nunca independentemente pro período anterior (bug corrigido
  // nesta rodada: antes cada período decidia por conta própria, podendo
  // comparar um atual simulado contra um anterior real/vazio, ou vice-
  // versa, sem nenhum sentido). Decidido simular, os DOIS períodos saem
  // da mesma fonte simulada — item 7 explícito: "também um período
  // anterior simulado para a comparação aparecer".
  const realCurrent = await fetchRealReportNumbers(clinicId, period, now);
  const shouldSimulate = clinicId === DEMO_CLINIC_ID && isEmptyFunnel(realCurrent);

  const [current, previous]: [ReportNumbers, ReportNumbers] = shouldSimulate
    ? [
        { ...buildSimulatedReportNumbers(period), isSimulated: true },
        { ...buildSimulatedReportNumbers(previousPeriod), isSimulated: true },
      ]
    : [
        { ...realCurrent, isSimulated: false },
        { ...(await fetchRealReportNumbers(clinicId, previousPeriod, now)), isSimulated: false },
      ];

  // Série semanal (gráfico de barras, item 5) — SÓ do período atual (a
  // comparação com o anterior já é só a discreta acima, sem gráfico
  // próprio pro anterior). Mesma decisão simular-ou-não já tomada acima,
  // nunca uma segunda decisão independente.
  const weeklyApproached = shouldSimulate
    ? buildSimulatedWeeklyApproached(period, current.funnel.contacted)
    : await computeWeeklyApproached(clinicId, period, current.funnel.contacted);

  return {
    ...current,
    previousComparison: {
      contactedPct: computePercentDelta(current.funnel.contacted, previous.funnel.contacted),
      inConversationPct: computePercentDelta(current.funnel.inConversation, previous.funnel.inConversation),
      scheduledPct: computePercentDelta(current.funnel.scheduled, previous.funnel.scheduled),
      attendedPct: computePercentDelta(current.funnel.attended, previous.funnel.attended),
    },
    weeklyApproached,
  };
}

// Reexportado só por conveniência de quem monta o texto da mensagem/rodapé
// do relatório (ex.: "janela de atribuição de X dias") sem precisar
// importar reactivation.ts diretamente por esse único valor.
export { RETURN_ATTRIBUTION_DAYS };
