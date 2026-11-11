import { prisma } from "@/lib/prisma";
import { getClinicMetrics, getAttendanceMetrics, computeAttendanceMetrics } from "@/lib/metrics";
import { getReactivationReturnStats, RETURN_ATTRIBUTION_DAYS } from "@/lib/reactivation";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";
import { resolvePreviousPeriod, periodLengthDays, splitIntoWeeks, type ReportFrequency, type ReportPeriod, type ReportWeek } from "@/lib/report-period";
import { computePercentDelta, type EvolutionPoint } from "@/lib/report-rates";

export { computePercentDelta };
export type { EvolutionPoint };

// Números do Relatório de resultados (quinzenal/mensal) — ver DESIGN.md e
// ClinicReportDelivery no schema. REUTILIZA as mesmas queries/definições
// já usadas pelo Painel do cliente (getClinicMetrics/getAttendanceMetrics,
// metrics.ts) e pela Reativação (getReactivationReturnStats/
// RETURN_ATTRIBUTION_DAYS, reactivation.ts) — nenhuma segunda definição
// pro mesmo número, nenhuma regra nova de atribuição.

// Follow-up do relatório (6ª rodada): "Receberam" e "Responderam".
//
// Não existe uma marca "esta mensagem é um passo de follow-up" na tabela
// Message, e FollowUpLog só guarda o ÚLTIMO passo (lastStepSentAt, que
// avança inclusive em passo descartado sem envio). Por isso a regra usa só
// dado que já existe e é confiável, sem inventar campo:
//
// - RECEBERAM = leads (conversas) distintos com pelo menos uma mensagem
//   automática (sender AI, OUTBOUND) EFETIVAMENTE ENVIADA (status SENT,
//   sentAt dentro do período) DENTRO de uma janela de follow-up aberta: a
//   partir do gatilho (FollowUpLog.triggeredAt) e antes do lead responder
//   (FollowUpLog.respondedAt, ou ainda aberta), num log com pelo menos um
//   passo processado (lastStepIndex não nulo). Dentro dessa janela a IA não
//   responde nada ao lead (qualquer resposta dele fecha a janela antes —
//   cancelPendingFollowUp), então a mensagem AI enviada ali é o próprio
//   passo de follow-up.
// - RESPONDERAM = desses, os que voltaram a responder/remarcar
//   (FollowUpLog.respondedAt, o mesmo campo dos antigos "retomados") DENTRO
//   do período e DEPOIS de terem recebido o passo. Subconjunto de
//   "Receberam" por construção — nunca maior.
export type FollowUpLogRow = { conversationId: string; triggeredAt: Date; respondedAt: Date | null; lastStepIndex: number | null };
export type FollowUpMessageRow = { conversationId: string; sentAt: Date | null };

export function computeFollowUpReach(
  logs: FollowUpLogRow[],
  messages: FollowUpMessageRow[],
  period: ReportPeriod
): { received: number; responded: number } {
  const received = new Set<string>();
  const responded = new Set<string>();
  for (const log of logs) {
    if (log.lastStepIndex === null) continue;
    const firstSent = messages
      .filter(
        (m) =>
          m.conversationId === log.conversationId &&
          m.sentAt !== null &&
          m.sentAt >= period.start &&
          m.sentAt < period.end &&
          m.sentAt >= log.triggeredAt &&
          (log.respondedAt === null || m.sentAt < log.respondedAt)
      )
      .reduce<Date | null>((min, m) => (min === null || m.sentAt! < min ? m.sentAt! : min), null);
    if (firstSent === null) continue;
    received.add(log.conversationId);
    if (log.respondedAt && log.respondedAt >= period.start && log.respondedAt < period.end && log.respondedAt > firstSent) {
      responded.add(log.conversationId);
    }
  }
  return { received: received.size, responded: responded.size };
}

// Duas consultas, sem laço por lead: os logs da clínica que podem ter
// janela aberta dentro do período, e as mensagens AI enviadas no período
// dessas conversas.
async function fetchFollowUpReach(clinicId: string, period: ReportPeriod): Promise<{ received: number; responded: number }> {
  const logs = await prisma.followUpLog.findMany({
    where: {
      conversation: { clinicId },
      lastStepIndex: { not: null },
      triggeredAt: { lt: period.end },
      OR: [{ respondedAt: null }, { respondedAt: { gte: period.start } }],
    },
    select: { conversationId: true, triggeredAt: true, respondedAt: true, lastStepIndex: true },
  });
  if (logs.length === 0) return { received: 0, responded: 0 };
  const messages = await prisma.message.findMany({
    where: {
      conversationId: { in: Array.from(new Set(logs.map((l) => l.conversationId))) },
      direction: "OUTBOUND",
      sender: "AI",
      status: "SENT",
      sentAt: { gte: period.start, lt: period.end },
    },
    select: { conversationId: true, sentAt: true },
  });
  return computeFollowUpReach(logs, messages, period);
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
  // Base da taxa acima (pastDue: atendimentos com DATA no período cujo
  // horário já passou, ver getAttendanceMetrics) — exibida junto do anel
  // ("9 de 9 atendimentos com data no período") pra a taxa nunca parecer
  // contradizer o box "Agendaram" (que conta agendamentos CRIADOS no
  // período, outra base — ver DESIGN.md, 4ª rodada).
  attendanceBase: number;
  // true quando "Abordados" veio de registro manual de abordagem
  // (ApproachLog) — e não do fallback Math.max de getClinicMetrics, que
  // sem registro manual faz "Abordados" = nº de conversas ("Em conversa").
  // Ver computeConversionRates (report-rates.ts).
  contactedFromApproachLogs: boolean;
  followUp: { received: number; responded: number }; // ver computeFollowUpReach
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
  // Agendaram/Compareceram dos últimos EVOLUTION_PERIODS períodos do mesmo
  // tipo, terminando no período do relatório (o último ponto é SEMPRE o
  // próprio período atual, com os mesmos números do Resumo). A tela só
  // mostra o gráfico com >= 3 períodos com dados (shouldShowEvolution).
  evolution: EvolutionPoint[];
};

export const EVOLUTION_PERIODS = 6;

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

  const followUp = await fetchFollowUpReach(clinicId, period);

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
    attendanceBase: attendance.pastDue,
    contactedFromApproachLogs: clinicMetrics.approachLogged > 0 && clinicMetrics.approachLogged >= clinicMetrics.responded,
    followUp,
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
  // Base da taxa = atendimentos com data no período já realizados
  // (compareceram + faltaram) — mesma DEFINIÇÃO da conta real
  // (attended/pastDue). Os ~5% restantes de "Agendaram" ficam de fora de
  // propósito (agendamentos pra depois do período/cancelados), como
  // acontece com dado real.
  const attendanceBase = attended + noShow;
  // Follow-up simulado: uma fração das conversas recebe follow-up, e uma
  // fração DESSES responde — Responderam <= Receberam por construção.
  const followUpReceived = Math.max(1, Math.round(inConversation * (0.3 + rand() * 0.1)));
  const simulatedFollowUp = { received: followUpReceived, responded: Math.round(followUpReceived * (0.25 + rand() * 0.15)) };

  return {
    period,
    funnel: { contacted, inConversation, scheduled, attended, noShow },
    attendanceRate: attendanceBase > 0 ? attended / attendanceBase : null,
    attendanceBase,
    contactedFromApproachLogs: true,
    followUp: simulatedFollowUp,
    reactivation: { sent, returned },
  };
}

// Evolução dos últimos N períodos (pedido explícito, item 6c) — UMA
// consulta só pros N-1 períodos anteriores juntos (agendamentos com
// createdAt OU scheduledAt dentro da janela inteira), agregada em memória
// pelas MESMAS definições do Resumo: "Agendaram" = agendamentos CRIADOS no
// período (mesmo filtro de getClinicMetrics.scheduled, metrics.ts) e
// "Compareceram" = computeAttendanceMetrics (a MESMA função pura usada por
// getAttendanceMetrics/Painel). O último ponto (período do relatório) não
// é recalculado: usa os números já mostrados no Resumo — garante que o
// gráfico termina exatamente no que o box diz.
export function evolutionPeriods(frequency: ReportFrequency, period: ReportPeriod, count: number = EVOLUTION_PERIODS): ReportPeriod[] {
  const periods: ReportPeriod[] = [period];
  while (periods.length < count) periods.unshift(resolvePreviousPeriod(frequency, periods[0]!));
  return periods;
}

async function computeRealEvolution(
  clinicId: string,
  frequency: ReportFrequency,
  period: ReportPeriod,
  currentFunnel: ReportFunnel,
  now: Date
): Promise<EvolutionPoint[]> {
  const periods = evolutionPeriods(frequency, period);
  const earlier = periods.slice(0, -1);
  const windowStart = earlier[0]!.start;
  const windowEnd = period.start;
  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId,
      OR: [{ createdAt: { gte: windowStart, lt: windowEnd } }, { scheduledAt: { gte: windowStart, lt: windowEnd } }],
    },
    select: { createdAt: true, scheduledAt: true, conversationId: true, status: true },
  });
  const points = earlier.map((p) => ({
    start: p.start,
    end: p.end,
    scheduled: appointments.filter((a) => a.createdAt >= p.start && a.createdAt < p.end).length,
    attended: computeAttendanceMetrics(appointments, p.start, p.end, now).attended,
  }));
  return [...points, { start: period.start, end: period.end, scheduled: currentFunnel.scheduled, attended: currentFunnel.attended }];
}

// Versão simulada (só Demo, mesma decisão simular-ou-não do período atual)
// — cada ponto é o MESMO buildSimulatedReportNumbers daquele período, então
// o último ponto bate com o Resumo simulado e cada ponto respeita
// Agendaram >= Compareceram por construção.
function buildSimulatedEvolution(frequency: ReportFrequency, period: ReportPeriod): EvolutionPoint[] {
  return evolutionPeriods(frequency, period).map((p) => {
    const sim = buildSimulatedReportNumbers(p);
    return { start: p.start, end: p.end, scheduled: sim.funnel.scheduled, attended: sim.funnel.attended };
  });
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
  const [weeklyApproached, evolution] = shouldSimulate
    ? [buildSimulatedWeeklyApproached(period, current.funnel.contacted), buildSimulatedEvolution(frequency, period)]
    : await Promise.all([
        computeWeeklyApproached(clinicId, period, current.funnel.contacted),
        computeRealEvolution(clinicId, frequency, period, current.funnel, now),
      ]);

  return {
    ...current,
    previousComparison: {
      contactedPct: computePercentDelta(current.funnel.contacted, previous.funnel.contacted),
      inConversationPct: computePercentDelta(current.funnel.inConversation, previous.funnel.inConversation),
      scheduledPct: computePercentDelta(current.funnel.scheduled, previous.funnel.scheduled),
      attendedPct: computePercentDelta(current.funnel.attended, previous.funnel.attended),
    },
    weeklyApproached,
    evolution,
  };
}

// Reexportado só por conveniência de quem monta o texto da mensagem/rodapé
// do relatório (ex.: "janela de atribuição de X dias") sem precisar
// importar reactivation.ts diretamente por esse único valor.
export { RETURN_ATTRIBUTION_DAYS };
