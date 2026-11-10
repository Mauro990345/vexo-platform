import { describe, it, expect } from "vitest";
import { safeRate, formatRatePct, computeConversionRates, computePercentDelta, shouldShowEvolution } from "./report-rates";
import { formatReportPeriodShortLabel, computeMonthlyPeriod, computeBiweeklyPeriod } from "./report-period";

describe("safeRate / formatRatePct", () => {
  it("taxa normal", () => expect(safeRate(9, 10)).toBeCloseTo(0.9));
  it("denominador zero: null → '—'", () => {
    expect(safeRate(0, 0)).toBeNull();
    expect(formatRatePct(safeRate(3, 0))).toBe("—");
  });
  it("acima de 100% (bases diferentes): null, nunca '150%'", () => expect(safeRate(3, 2)).toBeNull());
  it("100% exato é válido", () => expect(formatRatePct(safeRate(5, 5))).toBe("100%"));
});

describe("computeConversionRates — denominador = box anterior", () => {
  const funnel = { contacted: 40, inConversation: 20, scheduled: 10, attended: 9 };
  it("as 3 taxas a partir dos números exibidos", () => {
    expect(computeConversionRates(funnel, true)).toEqual({ contactedToConversation: 0.5, conversationToScheduled: 0.5, scheduledToAttended: 0.9 });
  });
  it("'Abordados' sem registro manual (= nº de conversas): 1ª taxa oculta, as outras ficam", () => {
    const r = computeConversionRates({ contacted: 21, inConversation: 21, scheduled: 10, attended: 9 }, false);
    expect(r.contactedToConversation).toBeNull();
    expect(r.scheduledToAttended).toBeCloseTo(0.9);
  });
});

describe("computePercentDelta — só com atual > 0 E anterior > 0", () => {
  it("ambos > 0", () => expect(computePercentDelta(12, 10)).toBe(20));
  it("atual 0 (ex.: mês em andamento zerado): null, nunca -100%", () => expect(computePercentDelta(0, 10)).toBeNull());
  it("anterior 0: null", () => expect(computePercentDelta(10, 0)).toBeNull());
});

describe("shouldShowEvolution — >= 3 períodos com dados", () => {
  const p = (s: number, a: number) => ({ start: new Date(0), end: new Date(1), scheduled: s, attended: a });
  it("2 com dados: oculta", () => expect(shouldShowEvolution([p(0, 0), p(0, 0), p(0, 0), p(0, 0), p(2, 1), p(3, 2)])).toBe(false));
  it("3 com dados: mostra", () => expect(shouldShowEvolution([p(0, 0), p(0, 0), p(0, 0), p(1, 0), p(2, 1), p(3, 2)])).toBe(true));
});

describe("formatReportPeriodShortLabel", () => {
  it("mensal: 'mai', 'mar' (de março)", () => {
    expect(formatReportPeriodShortLabel("MONTHLY", computeMonthlyPeriod(new Date("2026-05-15T12:00:00Z")))).toBe("mai");
    expect(formatReportPeriodShortLabel("MONTHLY", computeMonthlyPeriod(new Date("2026-03-15T12:00:00Z")))).toBe("mar");
  });
  it("quinzenal: '1ª out' / '2ª out'", () => {
    expect(formatReportPeriodShortLabel("BIWEEKLY", computeBiweeklyPeriod(new Date("2026-10-05T12:00:00Z")))).toBe("1ª out");
    expect(formatReportPeriodShortLabel("BIWEEKLY", computeBiweeklyPeriod(new Date("2026-10-20T12:00:00Z")))).toBe("2ª out");
  });
});
