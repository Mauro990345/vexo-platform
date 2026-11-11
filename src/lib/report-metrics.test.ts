import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";

const getClinicMetricsMock = vi.fn();
const getAttendanceMetricsMock = vi.fn();

const getReactivationReturnStatsMock = vi.fn();
vi.mock("@/lib/reactivation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reactivation")>();
  return { ...actual, getReactivationReturnStats: getReactivationReturnStatsMock };
});

const followUpLogFindManyMock = vi.fn();
const appointmentFindManyMock = vi.fn().mockResolvedValue([]);
const messageFindManyMock = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/prisma", () => ({
  prisma: { followUpLog: { findMany: followUpLogFindManyMock }, appointment: { findMany: appointmentFindManyMock }, message: { findMany: messageFindManyMock } },
}));
vi.mock("@/lib/metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/metrics")>();
  return { ...actual, getClinicMetrics: getClinicMetricsMock, getAttendanceMetrics: getAttendanceMetricsMock };
});

const {
  getReportNumbers,
  getReportNumbersWithComparison,
  computePercentDelta,
  allocateToTotal,
  computeFollowUpReach,
  buildDemoEvolutionFallback,
  fixDemoInConversationTie,
  RETURN_ATTRIBUTION_DAYS,
} = await import("./report-metrics");
const { computeMonthlyPeriod, computeBiweeklyPeriod } = await import("./report-period");

const PERIOD = computeMonthlyPeriod(new Date("2026-11-15T12:00:00.000Z")); // novembro/2026 (30 dias)
const NOW = new Date("2026-11-30T20:00:00.000Z");
const REAL_CLINIC_ID = "clinic-real-1";

function emptyClinicMetrics() {
  return { approached: 0, responded: 0, responseRate: null, scheduled: 0, completed: 0, noShow: 0 };
}

describe("report-metrics — reaproveita as queries/definições existentes, não redefine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClinicMetricsMock.mockResolvedValue({ approached: 20, responded: 12, responseRate: 0.6, scheduled: 8, completed: 0, noShow: 1 });
    getAttendanceMetricsMock.mockResolvedValue({ attended: 7, pastDue: 8 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 5, returned: 2 }]);
    // c1: recebeu passo em 05/11 e respondeu em 07/11; c2: recebeu e não respondeu.
    followUpLogFindManyMock.mockResolvedValue([
      { conversationId: "c1", triggeredAt: new Date("2026-11-03T12:00:00Z"), respondedAt: new Date("2026-11-07T12:00:00Z"), lastStepIndex: 0 },
      { conversationId: "c2", triggeredAt: new Date("2026-11-03T12:00:00Z"), respondedAt: null, lastStepIndex: 1 },
    ]);
    messageFindManyMock.mockResolvedValue([
      { conversationId: "c1", sentAt: new Date("2026-11-05T12:00:00Z") },
      { conversationId: "c2", sentAt: new Date("2026-11-05T12:00:00Z") },
    ]);
  });

  it("chama getClinicMetrics/getAttendanceMetrics EXATAMENTE com os limites do período (mesma fonte do Painel)", async () => {
    await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);

    expect(getClinicMetricsMock).toHaveBeenCalledWith(REAL_CLINIC_ID, PERIOD.start, PERIOD.end);
    expect(getAttendanceMetricsMock).toHaveBeenCalledWith(REAL_CLINIC_ID, PERIOD.start, PERIOD.end, NOW);
  });

  it("usa o funil/compareceram vindos de getClinicMetrics/getAttendanceMetrics, sem reinventar os números", async () => {
    const numbers = await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);

    expect(numbers.funnel).toEqual({ contacted: 20, inConversation: 12, scheduled: 8, attended: 7, noShow: 1 });
    expect(numbers.attendanceRate).toBeCloseTo(7 / 8);
    expect(numbers.isSimulated).toBe(false);
  });

  it("Reativação: chama getReactivationReturnStats com a janela rolante equivalente ao período (1 instante antes de period.end, 30 dias), sem redefinir a regra de atribuição", async () => {
    await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);

    expect(getReactivationReturnStatsMock).toHaveBeenCalledTimes(1);
    const [clinicIdArg, periodsArg, referenceNowArg] = getReactivationReturnStatsMock.mock.calls[0]!;
    expect(clinicIdArg).toBe(REAL_CLINIC_ID);
    expect(periodsArg).toEqual([{ days: 30, label: "período" }]);
    expect((referenceNowArg as Date).getTime()).toBe(PERIOD.end.getTime() - 1);
  });

  it("Reativação: usa sent/returned exatamente como devolvidos pela função existente", async () => {
    const numbers = await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);
    expect(numbers.reactivation).toEqual({ sent: 5, returned: 2 });
  });

  it("reexporta RETURN_ATTRIBUTION_DAYS (a MESMA constante de reactivation.ts, não uma cópia)", () => {
    expect(RETURN_ATTRIBUTION_DAYS).toBe(35);
  });

  it("Follow-up: duas consultas (logs com passo processado + mensagens AI ENVIADAS no período), sem laço por lead", async () => {
    await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);

    expect(followUpLogFindManyMock).toHaveBeenCalledWith({
      where: {
        conversation: { clinicId: REAL_CLINIC_ID },
        lastStepIndex: { not: null },
        triggeredAt: { lt: PERIOD.end },
        OR: [{ respondedAt: null }, { respondedAt: { gte: PERIOD.start } }],
      },
      select: { conversationId: true, triggeredAt: true, respondedAt: true, lastStepIndex: true },
    });
    expect(messageFindManyMock).toHaveBeenCalledWith({
      where: {
        conversationId: { in: ["c1", "c2"] },
        direction: "OUTBOUND",
        sender: "AI",
        status: "SENT",
        sentAt: { gte: PERIOD.start, lt: PERIOD.end },
      },
      select: { conversationId: true, sentAt: true },
    });
  });

  it("Follow-up: Receberam = 2, Responderam = 1", async () => {
    const numbers = await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);
    expect(numbers.followUp).toEqual({ received: 2, responded: 1 });
  });
});

describe("computeFollowUpReach — regra de Receberam/Responderam", () => {
  const d = (iso: string) => new Date(iso);
  const log = (o: Partial<{ conversationId: string; triggeredAt: Date; respondedAt: Date | null; lastStepIndex: number | null }>) => ({
    conversationId: "c1",
    triggeredAt: d("2026-11-02T12:00:00Z"),
    respondedAt: null,
    lastStepIndex: 0,
    ...o,
  });

  it("mensagem AI enviada dentro da janela (após o gatilho, antes da resposta) e no período = recebeu", () => {
    expect(computeFollowUpReach([log({})], [{ conversationId: "c1", sentAt: d("2026-11-04T12:00:00Z") }], PERIOD)).toEqual({ received: 1, responded: 0 });
  });

  it("mensagem ANTES do gatilho (conversa normal) não conta como follow-up", () => {
    expect(computeFollowUpReach([log({})], [{ conversationId: "c1", sentAt: d("2026-11-01T12:00:00Z") }], PERIOD)).toEqual({ received: 0, responded: 0 });
  });

  it("mensagem DEPOIS da resposta do lead (a IA voltando a conversar) não conta", () => {
    const l = log({ respondedAt: d("2026-11-05T12:00:00Z") });
    expect(computeFollowUpReach([l], [{ conversationId: "c1", sentAt: d("2026-11-06T12:00:00Z") }], PERIOD)).toEqual({ received: 0, responded: 0 });
  });

  it("log sem nenhum passo processado (lastStepIndex null) não conta, mesmo com resposta", () => {
    const l = log({ lastStepIndex: null, respondedAt: d("2026-11-05T12:00:00Z") });
    expect(computeFollowUpReach([l], [{ conversationId: "c1", sentAt: d("2026-11-04T12:00:00Z") }], PERIOD)).toEqual({ received: 0, responded: 0 });
  });

  it("recebeu no período e respondeu depois, no período = respondeu", () => {
    const l = log({ respondedAt: d("2026-11-06T12:00:00Z") });
    expect(computeFollowUpReach([l], [{ conversationId: "c1", sentAt: d("2026-11-04T12:00:00Z") }], PERIOD)).toEqual({ received: 1, responded: 1 });
  });

  it("respondeu só depois do fim do período: recebeu, mas não conta como respondeu neste período", () => {
    const l = log({ respondedAt: d("2026-12-03T12:00:00Z") });
    expect(computeFollowUpReach([l], [{ conversationId: "c1", sentAt: d("2026-11-28T12:00:00Z") }], PERIOD)).toEqual({ received: 1, responded: 0 });
  });

  it("mesmo lead com 2 logs (SILENCE e NO_SHOW) e várias mensagens conta UMA vez", () => {
    const logs = [log({ respondedAt: d("2026-11-06T12:00:00Z") }), log({ triggeredAt: d("2026-11-10T12:00:00Z"), lastStepIndex: 2 })];
    const msgs = [
      { conversationId: "c1", sentAt: d("2026-11-04T12:00:00Z") },
      { conversationId: "c1", sentAt: d("2026-11-12T12:00:00Z") },
      { conversationId: "c1", sentAt: d("2026-11-14T12:00:00Z") },
    ];
    expect(computeFollowUpReach(logs, msgs, PERIOD)).toEqual({ received: 1, responded: 1 });
  });

  it("Responderam nunca passa de Receberam (respondeu sem ter recebido no período não entra)", () => {
    const logs = [log({ conversationId: "a", respondedAt: d("2026-11-06T12:00:00Z") }), log({ conversationId: "b", respondedAt: d("2026-11-06T12:00:00Z") })];
    const msgs = [{ conversationId: "a", sentAt: d("2026-11-04T12:00:00Z") }]; // b nunca recebeu
    const r = computeFollowUpReach(logs, msgs, PERIOD);
    expect(r).toEqual({ received: 1, responded: 1 });
    expect(r.responded).toBeLessThanOrEqual(r.received);
  });

  it("nada recebido: zeros", () => {
    expect(computeFollowUpReach([], [], PERIOD)).toEqual({ received: 0, responded: 0 });
  });
});

describe("report-metrics — Demo vs. clínica real", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clínica REAL com dados vazios no período: mostra zeros de verdade, NUNCA simula", async () => {
    getClinicMetricsMock.mockResolvedValue(emptyClinicMetrics());
    getAttendanceMetricsMock.mockResolvedValue({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 0, returned: 0 }]);
    followUpLogFindManyMock.mockResolvedValue([]);

    const numbers = await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);

    expect(numbers.isSimulated).toBe(false);
    expect(numbers.funnel).toEqual({ contacted: 0, inConversation: 0, scheduled: 0, attended: 0, noShow: 0 });
  });

  it("Clínica Demo com dados vazios no período: cai pro fallback simulado, com aviso isSimulated=true e números plausíveis (não zerados)", async () => {
    getClinicMetricsMock.mockResolvedValue(emptyClinicMetrics());
    getAttendanceMetricsMock.mockResolvedValue({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 0, returned: 0 }]);
    followUpLogFindManyMock.mockResolvedValue([]);

    const numbers = await getReportNumbers(DEMO_CLINIC_ID, PERIOD, NOW);

    expect(numbers.isSimulated).toBe(true);
    expect(numbers.funnel.contacted).toBeGreaterThan(0);
    expect(numbers.funnel.scheduled).toBeGreaterThan(0);
  });

  it("Clínica Demo com dados REAIS no período (não vazio): usa os números reais, isSimulated=false", async () => {
    getClinicMetricsMock.mockResolvedValue({ approached: 15, responded: 9, responseRate: 0.6, scheduled: 6, completed: 0, noShow: 1 });
    getAttendanceMetricsMock.mockResolvedValue({ attended: 5, pastDue: 6 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 3, returned: 1 }]);
    followUpLogFindManyMock.mockResolvedValue([]);

    const numbers = await getReportNumbers(DEMO_CLINIC_ID, PERIOD, NOW);

    expect(numbers.isSimulated).toBe(false);
    expect(numbers.funnel.contacted).toBe(15);
  });

  it("fallback simulado da Demo é determinístico (mesmo período -> mesmos números, sem variar a cada chamada)", async () => {
    getClinicMetricsMock.mockResolvedValue(emptyClinicMetrics());
    getAttendanceMetricsMock.mockResolvedValue({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 0, returned: 0 }]);
    followUpLogFindManyMock.mockResolvedValue([]);

    const first = await getReportNumbers(DEMO_CLINIC_ID, PERIOD, NOW);
    const second = await getReportNumbers(DEMO_CLINIC_ID, PERIOD, NOW);
    expect(first.funnel).toEqual(second.funnel);
  });
});

describe("computePercentDelta", () => {
  it("variação positiva arredondada", () => {
    expect(computePercentDelta(22, 20)).toBe(10);
  });

  it("variação negativa", () => {
    expect(computePercentDelta(15, 20)).toBe(-25);
  });

  it("período anterior zerado: null (sem base pra comparar, nunca mostra '+infinito%')", () => {
    expect(computePercentDelta(10, 0)).toBeNull();
  });

  it("sem variação: 0", () => {
    expect(computePercentDelta(10, 10)).toBe(0);
  });

  it("período ATUAL zerado: null (nunca '-100%')", () => {
    expect(computePercentDelta(0, 20)).toBeNull();
  });

  it("os dois zerados: null", () => {
    expect(computePercentDelta(0, 0)).toBeNull();
  });
});

describe("getReportNumbersWithComparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compara contra o mês civil ANTERIOR (outubro), não uma janela rolante de 30 dias", async () => {
    // Default pras chamadas EXTRAS a getClinicMetrics que vêm depois
    // (uma por semana, pro gráfico de barras — ver computeWeeklyApproached)
    // — as duas primeiras (atual/anterior) continuam fixadas pelos
    // mockResolvedValueOnce abaixo, só a cauda cai no default.
    getClinicMetricsMock.mockResolvedValue({ approached: 3, responded: 2, responseRate: 0.6, scheduled: 1, completed: 0, noShow: 0 });
    getClinicMetricsMock
      .mockResolvedValueOnce({ approached: 22, responded: 14, responseRate: 0.6, scheduled: 10, completed: 0, noShow: 1 }) // novembro (atual)
      .mockResolvedValueOnce({ approached: 20, responded: 12, responseRate: 0.6, scheduled: 8, completed: 0, noShow: 1 }); // outubro (anterior)
    getAttendanceMetricsMock.mockResolvedValue({ attended: 7, pastDue: 8 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 5, returned: 2 }]);
    followUpLogFindManyMock.mockResolvedValue([]);

    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    // 2ª chamada a getClinicMetrics deve ter sido com os limites de OUTUBRO.
    const previousCallArgs = getClinicMetricsMock.mock.calls[1]!;
    expect(previousCallArgs[1].toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(previousCallArgs[2].toISOString()).toBe("2026-11-01T03:00:00.000Z");

    expect(result.previousComparison.contactedPct).toBe(10); // (22-20)/20
    expect(result.previousComparison.scheduledPct).toBe(25); // (10-8)/8
  });

  it("período anterior zerado: a comparação some (null), nunca mostra '-100%' nem qualquer percentual", async () => {
    getClinicMetricsMock.mockResolvedValue({ approached: 3, responded: 2, responseRate: 0.6, scheduled: 1, completed: 0, noShow: 0 });
    getClinicMetricsMock
      .mockResolvedValueOnce({ approached: 22, responded: 14, responseRate: 0.6, scheduled: 10, completed: 0, noShow: 1 }) // atual, com dados
      .mockResolvedValueOnce(emptyClinicMetrics()); // anterior, zerado (ex.: clínica nova, sem histórico)
    getAttendanceMetricsMock.mockResolvedValueOnce({ attended: 7, pastDue: 8 }).mockResolvedValueOnce({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock
      .mockResolvedValueOnce([{ days: 30, label: "período", sent: 5, returned: 2 }])
      .mockResolvedValueOnce([{ days: 30, label: "período", sent: 0, returned: 0 }]);
    followUpLogFindManyMock.mockResolvedValue([]);

    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.previousComparison).toEqual({ contactedPct: null, inConversationPct: null, scheduledPct: null, attendedPct: null });
  });

  it("Clínica Demo com período ATUAL vazio: simula os DOIS períodos (atual e anterior) juntos — nunca compara simulado contra real/zerado", async () => {
    getClinicMetricsMock.mockResolvedValue(emptyClinicMetrics()); // vazio nos dois períodos
    getAttendanceMetricsMock.mockResolvedValue({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 0, returned: 0 }]);
    followUpLogFindManyMock.mockResolvedValue([]);

    const result = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.isSimulated).toBe(true);
    // A comparação aparece de verdade (não fica null) — prova que o
    // período ANTERIOR também foi simulado, não ficou em 0 real.
    expect(result.previousComparison.contactedPct).not.toBeNull();
    expect(result.previousComparison.scheduledPct).not.toBeNull();
    expect(result.previousComparison.attendedPct).not.toBeNull();
    // fetchRealReportNumbers do período ANTERIOR nunca chega a ser
    // chamado de novo depois que "simular" já foi decidido — só a
    // consulta do período ATUAL (pra decidir) é real.
    expect(getClinicMetricsMock).toHaveBeenCalledTimes(1);
  });

  it("Clínica Demo com período atual REAL (não vazio) mas anterior vazio: compara contra o anterior REAL zerado (nunca simula só um lado)", async () => {
    getClinicMetricsMock.mockResolvedValue({ approached: 2, responded: 1, responseRate: 0.5, scheduled: 1, completed: 0, noShow: 0 });
    getClinicMetricsMock
      .mockResolvedValueOnce({ approached: 12, responded: 8, responseRate: 0.6, scheduled: 5, completed: 0, noShow: 1 }) // atual, com dados reais
      .mockResolvedValueOnce(emptyClinicMetrics()); // anterior, vazio de verdade
    getAttendanceMetricsMock.mockResolvedValueOnce({ attended: 4, pastDue: 5 }).mockResolvedValueOnce({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock
      .mockResolvedValueOnce([{ days: 30, label: "período", sent: 2, returned: 1 }])
      .mockResolvedValueOnce([{ days: 30, label: "período", sent: 0, returned: 0 }]);
    followUpLogFindManyMock.mockResolvedValue([]);

    const result = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.isSimulated).toBe(false);
    expect(result.funnel.contacted).toBe(12);
    // Período anterior ficou 0 de verdade — comparação some (null), não
    // inventa um "-100%" nem simula só pra fazer a comparação aparecer.
    expect(result.previousComparison.contactedPct).toBeNull();
  });
});

describe("buildSimulatedReportNumbers (via getReportNumbers) — coerência interna dos dados de exemplo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClinicMetricsMock.mockResolvedValue(emptyClinicMetrics());
    getAttendanceMetricsMock.mockResolvedValue({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 0, returned: 0 }]);
    followUpLogFindManyMock.mockResolvedValue([]);
  });

  it("funil sempre decrescente: Abordados >= Em conversa >= Agendaram >= Compareceram", async () => {
    const numbers = await getReportNumbers(DEMO_CLINIC_ID, PERIOD, NOW);
    expect(numbers.funnel.contacted).toBeGreaterThanOrEqual(numbers.funnel.inConversation);
    expect(numbers.funnel.inConversation).toBeGreaterThanOrEqual(numbers.funnel.scheduled);
    expect(numbers.funnel.scheduled).toBeGreaterThanOrEqual(numbers.funnel.attended);
  });

  it("'Não compareceram' nunca passa de Agendaram, e Compareceram + uma margem de desistência nunca passa de Agendaram", async () => {
    const numbers = await getReportNumbers(DEMO_CLINIC_ID, PERIOD, NOW);
    expect(numbers.funnel.noShow).toBeLessThanOrEqual(numbers.funnel.scheduled);
    expect(numbers.funnel.attended + numbers.funnel.noShow).toBeLessThanOrEqual(numbers.funnel.scheduled);
  });

  it("taxa de comparecimento = attended / attendanceBase (mesma definição da conta real), base <= Agendaram", async () => {
    const numbers = await getReportNumbers(DEMO_CLINIC_ID, PERIOD, NOW);
    expect(numbers.attendanceRate).not.toBeNull();
    expect(numbers.attendanceBase).toBe(numbers.funnel.attended + numbers.funnel.noShow);
    expect(numbers.attendanceBase).toBeLessThanOrEqual(numbers.funnel.scheduled);
    expect(numbers.attendanceRate).toBeCloseTo(numbers.funnel.attended / numbers.attendanceBase);
  });

  it("Follow-up simulado: Receberam > 0 e Responderam <= Receberam", async () => {
    const numbers = await getReportNumbers(DEMO_CLINIC_ID, PERIOD, NOW);
    expect(numbers.followUp.received).toBeGreaterThan(0);
    expect(numbers.followUp.responded).toBeLessThanOrEqual(numbers.followUp.received);
    expect(numbers.followUp.received).toBeLessThanOrEqual(numbers.funnel.inConversation);
  });

  it("Reativação simulada: 'voltaram' nunca passa de 'enviadas'", async () => {
    const numbers = await getReportNumbers(DEMO_CLINIC_ID, PERIOD, NOW);
    expect(numbers.reactivation.returned).toBeLessThanOrEqual(numbers.reactivation.sent);
  });

  it("Reativação simulada: nunca mostra '0 (0%)' — pelo menos 1 retorno sempre que algo foi enviado (9ª rodada)", async () => {
    // Período curto de propósito (quinzena) — é onde a fórmula antiga
    // (`Math.round(sent * fração)`) mais arredondava "voltaram" pra 0.
    const shortPeriod = (await import("./report-period")).computeBiweeklyPeriod(new Date("2026-11-20T12:00:00.000Z"));
    const numbers = await getReportNumbers(DEMO_CLINIC_ID, shortPeriod, NOW);
    expect(numbers.reactivation.sent).toBeGreaterThan(0);
    expect(numbers.reactivation.returned).toBeGreaterThanOrEqual(1);
  });
});

describe("allocateToTotal — distribui pesos proporcionalmente SEMPRE somando exatamente o total", () => {
  it("pesos exatamente proporcionais: nenhum arredondamento necessário", () => {
    expect(allocateToTotal([1, 1, 1, 1], 8)).toEqual([2, 2, 2, 2]);
  });

  it("pesos desproporcionais (restos maiores): soma sempre bate com o total", () => {
    const result = allocateToTotal([1, 2, 3], 10);
    expect(result.reduce((a, b) => a + b, 0)).toBe(10);
    // Preserva a ordem de grandeza dos pesos (semana com peso maior nunca
    // recebe uma contagem menor que uma de peso menor).
    expect(result[0]!).toBeLessThanOrEqual(result[1]!);
    expect(result[1]!).toBeLessThanOrEqual(result[2]!);
  });

  it("total = 0: todos os pesos saem zero", () => {
    expect(allocateToTotal([5, 3, 2], 0)).toEqual([0, 0, 0]);
  });

  it("todos os pesos zero mas total > 0 (guarda defensiva): distribui igualmente, sobra pras primeiras", () => {
    const result = allocateToTotal([0, 0, 0], 10);
    expect(result.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("muitos pesos pequenos (6 semanas, caso real de novembro/2026): soma exata, sem depender de sorte no arredondamento", () => {
    const result = allocateToTotal([3, 7, 1, 9, 4, 6], 128);
    expect(result.reduce((a, b) => a + b, 0)).toBe(128);
  });
});

describe("getReportNumbersWithComparison — 'Abordados por semana' (últimas 6 semanas)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAttendanceMetricsMock.mockResolvedValue({ attended: 7, pastDue: 8 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 5, returned: 2 }]);
    followUpLogFindManyMock.mockResolvedValue([]);
  });

  it("clínica real: 6 semanas civis (segunda a domingo) terminando na semana do último dia, cada uma via getClinicMetrics (Abordados = approached, Em conversa = responded)", async () => {
    getClinicMetricsMock.mockResolvedValueOnce({ approached: 22, approachLogged: 22, responded: 14, responseRate: 0.6, scheduled: 10, completed: 0, noShow: 1 });
    getClinicMetricsMock.mockResolvedValueOnce({ approached: 20, approachLogged: 20, responded: 12, responseRate: 0.6, scheduled: 8, completed: 0, noShow: 1 });
    for (let i = 0; i < 6; i++) {
      getClinicMetricsMock.mockResolvedValueOnce({ approached: 10 + i, approachLogged: 10 + i, responded: 5 + i, responseRate: null, scheduled: 0, completed: 0, noShow: 0 });
    }

    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.weekly).toHaveLength(6);
    expect(result.weekly.map((w) => [w.contacted, w.inConversation])).toEqual([
      [10, 5], [11, 6], [12, 7], [13, 8], [14, 9], [15, 10],
    ]);
    // novembro/2026: último dia 30/11 (segunda) → última semana = só 30/11;
    // a primeira começa 6 segundas antes (26/10).
    expect(result.weekly[0]!.start.toISOString()).toBe("2026-10-26T03:00:00.000Z");
    expect(result.weekly[5]!.start.toISOString()).toBe("2026-11-30T03:00:00.000Z");
    expect(result.weekly[5]!.end.getTime()).toBe(PERIOD.end.getTime());
    const weekCalls = getClinicMetricsMock.mock.calls.slice(2);
    expect(weekCalls).toHaveLength(6);
    for (let i = 0; i < 6; i++) expect((weekCalls[i]![1] as Date).getTime()).toBe(result.weekly[i]!.start.getTime());
  });

  it("Demo simulada: 6 semanas, Em conversa <= Abordados, sem chamadas extras ao banco", async () => {
    getClinicMetricsMock.mockResolvedValue(emptyClinicMetrics());
    getAttendanceMetricsMock.mockResolvedValue({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 0, returned: 0 }]);

    const result = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.isSimulated).toBe(true);
    expect(result.weekly).toHaveLength(6);
    for (const w of result.weekly) {
      expect(w.contacted).toBeGreaterThan(0);
      expect(w.inConversation).toBeLessThanOrEqual(w.contacted);
    }
    expect(getClinicMetricsMock).toHaveBeenCalledTimes(1);
  });
});

describe("report-metrics — 'Abordados' veio de registro manual? (contactedFromApproachLogs)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAttendanceMetricsMock.mockResolvedValue({ attended: 9, pastDue: 9 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 31, label: "período", sent: 2, returned: 1 }]);
    followUpLogFindManyMock.mockResolvedValue([]);
  });

  it("sem ApproachLog (caso da Demo em outubro: 21 = 21): Abordados cai no fallback = nº de conversas -> false", async () => {
    getClinicMetricsMock.mockResolvedValue({ approached: 21, approachLogged: 0, responded: 21, responseRate: 1, scheduled: 10, completed: 0, noShow: 0 });
    const numbers = await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);
    expect(numbers.funnel.contacted).toBe(numbers.funnel.inConversation);
    expect(numbers.contactedFromApproachLogs).toBe(false);
  });

  it("ApproachLog menor que o nº de conversas (fallback do Math.max também) -> false", async () => {
    getClinicMetricsMock.mockResolvedValue({ approached: 21, approachLogged: 5, responded: 21, responseRate: 1, scheduled: 10, completed: 0, noShow: 0 });
    const numbers = await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);
    expect(numbers.contactedFromApproachLogs).toBe(false);
  });

  it("ApproachLog >= conversas: Abordados é independente -> true", async () => {
    getClinicMetricsMock.mockResolvedValue({ approached: 60, approachLogged: 60, responded: 21, responseRate: 0.35, scheduled: 10, completed: 0, noShow: 0 });
    const numbers = await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);
    expect(numbers.contactedFromApproachLogs).toBe(true);
    expect(numbers.attendanceBase).toBe(9);
  });
});

describe("getReportNumbersWithComparison — Evolução · últimos 3 meses (sempre meses)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClinicMetricsMock.mockResolvedValue({ approached: 22, approachLogged: 22, responded: 14, responseRate: 0.6, scheduled: 10, completed: 0, noShow: 1 });
    getAttendanceMetricsMock.mockResolvedValue({ attended: 7, pastDue: 8 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 5, returned: 2 }]);
    followUpLogFindManyMock.mockResolvedValue([]);
  });

  const at = (iso: string) => new Date(iso);

  it("mensal: 3 meses terminando no mês do relatório, UMA consulta agregada, último mês = números do Resumo", async () => {
    appointmentFindManyMock.mockResolvedValueOnce([
      { createdAt: at("2026-09-05T15:00:00Z"), scheduledAt: at("2026-09-10T15:00:00Z"), conversationId: "c1", status: "CONFIRMED" },
      { createdAt: at("2026-09-28T15:00:00Z"), scheduledAt: at("2026-10-02T15:00:00Z"), conversationId: "c2", status: "NO_SHOW" },
      { createdAt: at("2026-10-01T15:00:00Z"), scheduledAt: at("2026-10-05T15:00:00Z"), conversationId: "c3", status: "SCHEDULED" },
      { createdAt: at("2026-10-02T15:00:00Z"), scheduledAt: at("2026-10-06T15:00:00Z"), conversationId: "c4", status: "CANCELLED" },
      { createdAt: at("2026-10-03T15:00:00Z"), scheduledAt: at("2026-10-07T15:00:00Z"), conversationId: null, status: "SCHEDULED" },
    ]);

    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(appointmentFindManyMock).toHaveBeenCalledTimes(1);
    expect(result.evolution.map((p) => p.start.toISOString())).toEqual([
      "2026-09-01T03:00:00.000Z",
      "2026-10-01T03:00:00.000Z",
      "2026-11-01T03:00:00.000Z",
    ]);
    expect(result.evolution.map((p) => [p.scheduled, p.attended])).toEqual([
      [2, 1], // set: 2 criados; 1 compareceu (o outro é de outubro)
      [3, 1], // out: 3 criados; só c3 compareceu (faltou/cancelado/sem conversa não contam)
      [10, 7], // nov = Resumo
    ]);
  });

  it("quinzenal, 2ª quinzena: agrupa por MÊS-CALENDÁRIO e o último é o mês que a quinzena fecha", async () => {
    const secondHalf = computeBiweeklyPeriod(new Date("2026-11-20T12:00:00.000Z")); // 16–30/11
    appointmentFindManyMock.mockResolvedValueOnce([
      // duas quinzenas de novembro somam no MESMO mês
      { createdAt: at("2026-11-03T15:00:00Z"), scheduledAt: at("2026-11-04T15:00:00Z"), conversationId: "a", status: "SCHEDULED" },
      { createdAt: at("2026-11-20T15:00:00Z"), scheduledAt: at("2026-11-21T15:00:00Z"), conversationId: "b", status: "SCHEDULED" },
    ]);
    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "BIWEEKLY", secondHalf, NOW);
    expect(result.evolution.map((p) => p.start.toISOString())).toEqual([
      "2026-09-01T03:00:00.000Z",
      "2026-10-01T03:00:00.000Z",
      "2026-11-01T03:00:00.000Z",
    ]);
    expect(result.evolution[2]!.end.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(result.evolution[2]!.scheduled).toBe(2); // mês inteiro, não só a quinzena
    expect(result.evolution[2]!.attended).toBe(2);
  });

  it("quinzenal, 1ª quinzena: o mês corrente ainda não fechou → últimos 3 meses COMPLETOS (ago, set, out)", async () => {
    const firstHalf = computeBiweeklyPeriod(new Date("2026-11-05T12:00:00.000Z")); // 01–15/11
    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "BIWEEKLY", firstHalf, NOW);
    expect(result.evolution.map((p) => p.start.toISOString())).toEqual([
      "2026-08-01T03:00:00.000Z",
      "2026-09-01T03:00:00.000Z",
      "2026-10-01T03:00:00.000Z",
    ]);
    const where = appointmentFindManyMock.mock.calls[0]![0].where;
    expect(where.OR[0].createdAt.lt.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });

  it("Demo simulada: 3 meses com dados, Agendaram >= Compareceram, último = Resumo simulado (mensal), sem consulta", async () => {
    getClinicMetricsMock.mockResolvedValue(emptyClinicMetrics());
    getAttendanceMetricsMock.mockResolvedValue({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 0, returned: 0 }]);

    const result = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.isSimulated).toBe(true);
    expect(appointmentFindManyMock).not.toHaveBeenCalled();
    expect(result.evolution).toHaveLength(3);
    for (const p of result.evolution) {
      expect(p.scheduled).toBeGreaterThan(0);
      expect(p.scheduled).toBeGreaterThanOrEqual(p.attended);
    }
    expect(result.evolution[2]!.scheduled).toBe(result.funnel.scheduled);
    expect(result.evolution[2]!.attended).toBe(result.funnel.attended);
    const f = result.funnel;
    expect(f.contacted).toBeGreaterThanOrEqual(f.inConversation);
    expect(f.inConversation).toBeGreaterThanOrEqual(f.scheduled);
    expect(f.scheduled).toBeGreaterThanOrEqual(f.attended);
  });

  it("forceSimulated (preview '?exemplo=1'): Demo com dados REAIS passa a simular", async () => {
    const result = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW, { forceSimulated: true });
    expect(result.isSimulated).toBe(true);
  });

  it("forceSimulated em clínica REAL é ignorado — nunca número simulado", async () => {
    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "MONTHLY", PERIOD, NOW, { forceSimulated: true });
    expect(result.isSimulated).toBe(false);
    expect(result.funnel.contacted).toBe(22);
  });

  it("Demo com dado REAL no período atual (não vazio) mas os 2 meses anteriores genuinamente zerados no banco: preenche o fallback (nunca esconde o bloco por isso)", async () => {
    // appointmentFindManyMock sem override -> [] (nenhum agendamento nos 2
    // meses anteriores, real e zerado) — só o mês atual (sempre tirado do
    // Resumo, nunca da consulta) tem dado; sem o fallback só 1 dos 3 meses
    // teria dado, escondendo o bloco inteiro (bug relatado: a Demo tinha só
    // 2 meses com dado — aqui o caso ainda mais vazio, só 1).
    const result = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.isSimulated).toBe(false); // mês atual tem dado real — nunca simula o relatório inteiro
    // os 2 meses mais antigos (sintéticos, preenchidos): fração do mês
    // atual real (scheduled=10 -> 5 e 7; ver beforeEach deste describe).
    expect(result.evolution[0]).toMatchObject({ scheduled: 5, attended: 3 });
    expect(result.evolution[1]).toMatchObject({ scheduled: 7, attended: 5 });
    // mês atual: sempre o dado real do Resumo, nunca sintético.
    expect(result.evolution[2]).toMatchObject({ scheduled: result.funnel.scheduled, attended: result.funnel.attended });
  });

  it("clínica REAL com o mesmo histórico incompleto (2 meses zerados): a regra de produção NÃO muda — meses continuam 0/0", async () => {
    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.evolution[0]).toMatchObject({ scheduled: 0, attended: 0 });
    expect(result.evolution[1]).toMatchObject({ scheduled: 0, attended: 0 });
  });
});

describe("buildDemoEvolutionFallback — só preenche mês genuinamente zerado, nunca o último", () => {
  function point(scheduled: number, attended: number) {
    return { start: new Date("2026-01-01T00:00:00Z"), end: new Date("2026-02-01T00:00:00Z"), scheduled, attended };
  }

  it("2 meses zerados + último real (10/9): preenche os 2 com a fração esperada (5/3 e 7/5)", () => {
    const result = buildDemoEvolutionFallback([point(0, 0), point(0, 0), point(10, 9)]);
    expect(result).toEqual([point(5, 3), point(7, 5), point(10, 9)]);
  });

  it("só o mês mais antigo zerado, o do meio já tem dado real: não sobrescreve o do meio", () => {
    const result = buildDemoEvolutionFallback([point(0, 0), point(4, 2), point(10, 9)]);
    expect(result[0]).toEqual(point(5, 3));
    expect(result[1]).toEqual(point(4, 2)); // intocado
    expect(result[2]).toEqual(point(10, 9));
  });

  it("nenhum mês zerado: devolve exatamente os mesmos pontos (sem efeito)", () => {
    const points = [point(3, 2), point(4, 3), point(10, 9)];
    expect(buildDemoEvolutionFallback(points)).toEqual(points);
  });

  it("'Compareceram' sintético nunca passa de 'Agendaram' sintético no mesmo mês", () => {
    const result = buildDemoEvolutionFallback([point(0, 0), point(0, 0), point(10, 9)]);
    for (const p of result) expect(p.attended).toBeLessThanOrEqual(p.scheduled);
  });

  it("escala com o último mês real (não hardcoded): último em 20/18 -> proporção preservada", () => {
    const result = buildDemoEvolutionFallback([point(0, 0), point(0, 0), point(20, 18)]);
    expect(result[0]).toEqual(point(10, 6));
    expect(result[1]).toEqual(point(14, 10));
  });
});

describe("fixDemoInConversationTie — 'Em conversa' nunca igual (ou maior) que 'Abordados', só na Demo", () => {
  it("já diferente (inConversation < contacted): devolve o mesmo valor, sem efeito (idempotente)", () => {
    expect(fixDemoInConversationTie(21, 15, new Date("2026-10-01T00:00:00Z"))).toBe(15);
  });

  it("empatados (21/21, o bug relatado): sintetiza um valor MENOR, nunca igual", () => {
    const result = fixDemoInConversationTie(21, 21, new Date("2026-10-01T00:00:00Z"));
    expect(result).toBeLessThan(21);
    expect(result).toBeGreaterThan(0);
  });

  it("determinístico: mesma data (seed) -> mesmo resultado sempre", () => {
    const seed = new Date("2026-10-01T00:00:00Z");
    expect(fixDemoInConversationTie(21, 21, seed)).toBe(fixDemoInConversationTie(21, 21, seed));
  });

  it("contacted = 0: nunca produz um valor negativo nem maior que 0", () => {
    expect(fixDemoInConversationTie(0, 0, new Date("2026-10-01T00:00:00Z"))).toBe(0);
  });

  it("escala com 'Abordados': contacted maior -> inConversation sintético maior, mas sempre menor que contacted", () => {
    const seed = new Date("2026-10-01T00:00:00Z");
    const small = fixDemoInConversationTie(10, 10, seed);
    const big = fixDemoInConversationTie(100, 100, seed);
    expect(small).toBeLessThan(10);
    expect(big).toBeLessThan(100);
    expect(big).toBeGreaterThan(small);
  });
});

describe("getReportNumbersWithComparison — 'Em conversa' = 'Abordados' só pra Demo (9ª rodada)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sem ApproachLog (approachLogged ausente/0) e responded = scheduled
    // o bastante pra o piso de getClinicMetrics igualar approached a
    // responded — mesmo cenário relatado (21 abordados = 21 em conversa).
    getClinicMetricsMock.mockResolvedValue({ approached: 21, approachLogged: 0, responded: 21, responseRate: 1, scheduled: 10, completed: 0, noShow: 1 });
    getAttendanceMetricsMock.mockResolvedValue({ attended: 9, pastDue: 10 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 5, returned: 2 }]);
    followUpLogFindManyMock.mockResolvedValue([]);
  });

  it("Demo: 'Em conversa' sai MENOR que 'Abordados' (nunca igual), 'Abordados' real intocado", async () => {
    const result = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.funnel.contacted).toBe(21); // Abordados real, nunca mexido
    expect(result.funnel.inConversation).toBeLessThan(result.funnel.contacted);
  });

  it("Demo: a série semanal também não tem semana com os dois números empatados", async () => {
    const result = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    for (const w of result.weekly) {
      if (w.contacted > 0) expect(w.inConversation).toBeLessThan(w.contacted);
    }
  });

  it("clínica REAL com o MESMO cenário (sem ApproachLog): comportamento de produção intocado — 'Em conversa' continua igual a 'Abordados'", async () => {
    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.funnel.contacted).toBe(21);
    expect(result.funnel.inConversation).toBe(21); // comportamento real/correto do piso, não tocado
  });
});
