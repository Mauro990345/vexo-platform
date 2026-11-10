import { prisma } from "@/lib/prisma";
import { getClinicMetrics, getAttendanceMetrics } from "@/lib/metrics";
import { getReactivationReturnStats, RETURN_ATTRIBUTION_DAYS } from "@/lib/reactivation";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";
import { resolvePreviousPeriod, periodLengthDays, type ReportFrequency, type ReportPeriod } from "@/lib/report-period";

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

  return {
    ...current,
    previousComparison: {
      contactedPct: computePercentDelta(current.funnel.contacted, previous.funnel.contacted),
      inConversationPct: computePercentDelta(current.funnel.inConversation, previous.funnel.inConversation),
      scheduledPct: computePercentDelta(current.funnel.scheduled, previous.funnel.scheduled),
      attendedPct: computePercentDelta(current.funnel.attended, previous.funnel.attended),
    },
  };
}

// Reexportado só por conveniência de quem monta o texto da mensagem/rodapé
// do relatório (ex.: "janela de atribuição de X dias") sem precisar
// importar reactivation.ts diretamente por esse único valor.
export { RETURN_ATTRIBUTION_DAYS };
