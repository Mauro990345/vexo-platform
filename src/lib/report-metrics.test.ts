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
vi.mock("@/lib/prisma", () => ({
  prisma: { followUpLog: { findMany: followUpLogFindManyMock }, appointment: { findMany: appointmentFindManyMock } },
}));
vi.mock("@/lib/metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/metrics")>();
  return { ...actual, getClinicMetrics: getClinicMetricsMock, getAttendanceMetrics: getAttendanceMetricsMock };
});

const { getReportNumbers, getReportNumbersWithComparison, computePercentDelta, allocateToTotal, RETURN_ATTRIBUTION_DAYS } = await import("./report-metrics");
const { computeMonthlyPeriod, computeBiweeklyPeriod, splitIntoWeeks } = await import("./report-period");

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
    followUpLogFindManyMock.mockResolvedValue([{ conversationId: "c1" }, { conversationId: "c2" }]);
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

  it("Follow-up retomados: filtra FollowUpLog por respondedAt no período e clínica via a relação com Conversation, distinto por conversationId", async () => {
    await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);

    expect(followUpLogFindManyMock).toHaveBeenCalledWith({
      where: { respondedAt: { gte: PERIOD.start, lt: PERIOD.end }, conversation: { clinicId: REAL_CLINIC_ID } },
      select: { conversationId: true },
      distinct: ["conversationId"],
    });
  });

  it("Follow-up retomados: conta os leads distintos devolvidos pela query (2 no mock)", async () => {
    const numbers = await getReportNumbers(REAL_CLINIC_ID, PERIOD, NOW);
    expect(numbers.followUpRecovered).toBe(2);
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

  it("Reativação simulada: 'voltaram' nunca passa de 'enviadas'", async () => {
    const numbers = await getReportNumbers(DEMO_CLINIC_ID, PERIOD, NOW);
    expect(numbers.reactivation.returned).toBeLessThanOrEqual(numbers.reactivation.sent);
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

describe("getReportNumbersWithComparison — série semanal (gráfico 'Abordagens por semana', item 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAttendanceMetricsMock.mockResolvedValue({ attended: 7, pastDue: 8 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 5, returned: 2 }]);
    followUpLogFindManyMock.mockResolvedValue([]);
  });

  it("clínica real: uma semana por getClinicMetrics (reaproveitada, não uma métrica nova) e a SOMA das semanas bate exatamente com 'Abordados' (funnel.contacted)", async () => {
    const weeks = splitIntoWeeks(PERIOD); // novembro/2026 — 6 semanas (pior caso)
    getClinicMetricsMock.mockResolvedValueOnce({ approached: 22, responded: 14, responseRate: 0.6, scheduled: 10, completed: 0, noShow: 1 }); // atual (total)
    getClinicMetricsMock.mockResolvedValueOnce({ approached: 20, responded: 12, responseRate: 0.6, scheduled: 8, completed: 0, noShow: 1 }); // anterior (total)
    // Pesos variados por semana, só pra não bater com o total sem o
    // reajuste do allocateToTotal (prova real do ajuste, não coincidência).
    for (let i = 0; i < weeks.length; i++) {
      getClinicMetricsMock.mockResolvedValueOnce({ approached: i + 1, responded: 0, responseRate: null, scheduled: 0, completed: 0, noShow: 0 });
    }

    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.weeklyApproached).toHaveLength(weeks.length);
    const sum = result.weeklyApproached.reduce((a, w) => a + w.count, 0);
    expect(sum).toBe(result.funnel.contacted); // 22
    // Cobertura exata do período, mesma convenção de splitIntoWeeks.
    expect(result.weeklyApproached[0]!.start.getTime()).toBe(PERIOD.start.getTime());
    expect(result.weeklyApproached[result.weeklyApproached.length - 1]!.end.getTime()).toBe(PERIOD.end.getTime());
  });

  it("quinzena real (2-3 semanas): soma também bate exatamente", async () => {
    const biweekly = computeBiweeklyPeriod(new Date("2026-11-05T12:00:00.000Z"));
    const weeks = splitIntoWeeks(biweekly);
    getClinicMetricsMock.mockResolvedValueOnce({ approached: 15, responded: 10, responseRate: 0.6, scheduled: 7, completed: 0, noShow: 1 });
    getClinicMetricsMock.mockResolvedValueOnce(emptyClinicMetrics());
    for (let i = 0; i < weeks.length; i++) {
      getClinicMetricsMock.mockResolvedValueOnce({ approached: 2 + i, responded: 0, responseRate: null, scheduled: 0, completed: 0, noShow: 0 });
    }

    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "BIWEEKLY", biweekly, NOW);

    const sum = result.weeklyApproached.reduce((a, w) => a + w.count, 0);
    expect(sum).toBe(15);
  });

  it("Clínica Demo simulada: série semanal também simulada, coerente (soma = Abordados simulado, sem chamar getClinicMetrics de novo)", async () => {
    getClinicMetricsMock.mockResolvedValue(emptyClinicMetrics());
    getAttendanceMetricsMock.mockResolvedValue({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 0, returned: 0 }]);

    const result = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.isSimulated).toBe(true);
    const sum = result.weeklyApproached.reduce((a, w) => a + w.count, 0);
    expect(sum).toBe(result.funnel.contacted);
    // Só a chamada do período ATUAL (pra decidir simular) — nenhuma
    // chamada extra por semana quando a série já é simulada.
    expect(getClinicMetricsMock).toHaveBeenCalledTimes(1);
  });

  it("Clínica Demo simulada: mesmo período -> mesma série semanal (determinístico)", async () => {
    getClinicMetricsMock.mockResolvedValue(emptyClinicMetrics());
    getAttendanceMetricsMock.mockResolvedValue({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 0, returned: 0 }]);

    const first = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);
    const second = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);
    expect(first.weeklyApproached.map((w) => w.count)).toEqual(second.weeklyApproached.map((w) => w.count));
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

describe("getReportNumbersWithComparison — evolução dos últimos 6 períodos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClinicMetricsMock.mockResolvedValue({ approached: 22, approachLogged: 22, responded: 14, responseRate: 0.6, scheduled: 10, completed: 0, noShow: 1 });
    getAttendanceMetricsMock.mockResolvedValue({ attended: 7, pastDue: 8 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 5, returned: 2 }]);
    followUpLogFindManyMock.mockResolvedValue([]);
  });

  it("mensal: 6 meses terminando no período do relatório, UMA consulta agregada, último ponto = números do Resumo", async () => {
    const at = (iso: string) => new Date(iso);
    appointmentFindManyMock.mockResolvedValueOnce([
      // junho: criado e realizado em junho (compareceu)
      { createdAt: at("2026-06-05T15:00:00Z"), scheduledAt: at("2026-06-10T15:00:00Z"), conversationId: "c1", status: "CONFIRMED" },
      // setembro: criado em setembro, realizado em outubro (faltou)
      { createdAt: at("2026-09-28T15:00:00Z"), scheduledAt: at("2026-10-02T15:00:00Z"), conversationId: "c2", status: "NO_SHOW" },
      // outubro: realizado (compareceu); cancelado não conta como compareceu
      { createdAt: at("2026-10-01T15:00:00Z"), scheduledAt: at("2026-10-05T15:00:00Z"), conversationId: "c3", status: "SCHEDULED" },
      { createdAt: at("2026-10-02T15:00:00Z"), scheduledAt: at("2026-10-06T15:00:00Z"), conversationId: "c4", status: "CANCELLED" },
      // importado do Google (sem conversationId): conta em Agendaram, nunca em Compareceram
      { createdAt: at("2026-10-03T15:00:00Z"), scheduledAt: at("2026-10-07T15:00:00Z"), conversationId: null, status: "SCHEDULED" },
    ]);

    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(appointmentFindManyMock).toHaveBeenCalledTimes(1);
    const where = appointmentFindManyMock.mock.calls[0]![0].where;
    expect(where.OR[0].createdAt.gte.toISOString()).toBe("2026-06-01T03:00:00.000Z");
    expect(where.OR[0].createdAt.lt.toISOString()).toBe(PERIOD.start.toISOString());

    expect(result.evolution).toHaveLength(6);
    expect(result.evolution.map((p) => p.start.toISOString())).toEqual([
      "2026-06-01T03:00:00.000Z",
      "2026-07-01T03:00:00.000Z",
      "2026-08-01T03:00:00.000Z",
      "2026-09-01T03:00:00.000Z",
      "2026-10-01T03:00:00.000Z",
      "2026-11-01T03:00:00.000Z",
    ]);
    expect(result.evolution.map((p) => [p.scheduled, p.attended])).toEqual([
      [1, 1], // jun
      [0, 0],
      [0, 0],
      [1, 0], // set: criado em setembro, realizado em outubro
      [3, 1], // out: 3 criados; 1 compareceu (faltou/cancelado/sem conversa não contam)
      [10, 7], // nov = Resumo
    ]);
    const last = result.evolution[5]!;
    expect(last.scheduled).toBe(result.funnel.scheduled);
    expect(last.attended).toBe(result.funnel.attended);
  });

  it("quinzenal: 6 quinzenas consecutivas terminando na quinzena do relatório", async () => {
    const biweekly = computeBiweeklyPeriod(new Date("2026-11-05T12:00:00.000Z"));
    const result = await getReportNumbersWithComparison(REAL_CLINIC_ID, "BIWEEKLY", biweekly, NOW);
    expect(result.evolution.map((p) => p.start.toISOString())).toEqual([
      "2026-08-16T03:00:00.000Z",
      "2026-09-01T03:00:00.000Z",
      "2026-09-16T03:00:00.000Z",
      "2026-10-01T03:00:00.000Z",
      "2026-10-16T03:00:00.000Z",
      "2026-11-01T03:00:00.000Z",
    ]);
    expect(result.evolution[5]!.end.getTime()).toBe(biweekly.end.getTime());
  });

  it("Demo simulada: série de 6 coerente (Agendaram >= Compareceram em todo ponto, último = Resumo simulado), sem consulta ao banco", async () => {
    getClinicMetricsMock.mockResolvedValue(emptyClinicMetrics());
    getAttendanceMetricsMock.mockResolvedValue({ attended: 0, pastDue: 0 });
    getReactivationReturnStatsMock.mockResolvedValue([{ days: 30, label: "período", sent: 0, returned: 0 }]);

    const result = await getReportNumbersWithComparison(DEMO_CLINIC_ID, "MONTHLY", PERIOD, NOW);

    expect(result.isSimulated).toBe(true);
    expect(appointmentFindManyMock).not.toHaveBeenCalled();
    expect(result.evolution).toHaveLength(6);
    for (const p of result.evolution) {
      expect(p.scheduled).toBeGreaterThan(0);
      expect(p.scheduled).toBeGreaterThanOrEqual(p.attended);
    }
    expect(result.evolution[5]!.scheduled).toBe(result.funnel.scheduled);
    expect(result.evolution[5]!.attended).toBe(result.funnel.attended);
    // Funil simulado + taxas coerentes com os números exibidos
    const f = result.funnel;
    expect(f.contacted).toBeGreaterThanOrEqual(f.inConversation);
    expect(f.inConversation).toBeGreaterThanOrEqual(f.scheduled);
    expect(f.scheduled).toBeGreaterThanOrEqual(f.attended);
    expect(result.weeklyApproached.reduce((a, w) => a + w.count, 0)).toBe(f.contacted);
    expect(result.contactedFromApproachLogs).toBe(true);
  });
});
