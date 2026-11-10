import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";

const getClinicMetricsMock = vi.fn();
const getAttendanceMetricsMock = vi.fn();
vi.mock("@/lib/metrics", () => ({
  getClinicMetrics: getClinicMetricsMock,
  getAttendanceMetrics: getAttendanceMetricsMock,
}));

const getReactivationReturnStatsMock = vi.fn();
vi.mock("@/lib/reactivation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reactivation")>();
  return { ...actual, getReactivationReturnStats: getReactivationReturnStatsMock };
});

const followUpLogFindManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { followUpLog: { findMany: followUpLogFindManyMock } },
}));

const { getReportNumbers, getReportNumbersWithComparison, computePercentDelta, RETURN_ATTRIBUTION_DAYS } = await import("./report-metrics");
const { computeMonthlyPeriod } = await import("./report-period");

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
});

describe("getReportNumbersWithComparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compara contra o mês civil ANTERIOR (outubro), não uma janela rolante de 30 dias", async () => {
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
});
