import { describe, it, expect } from "vitest";
import { safeRate, formatRatePct, computeConversionRates, computePercentDelta, shouldShowEvolution, trimEvolution } from "./report-rates";
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

describe("computeConversionRates — só taxas válidas, denominador = box anterior, sem Agendaram → Compareceram", () => {
  it("as 2 taxas a partir dos números exibidos", () => {
    expect(computeConversionRates({ contacted: 40, inConversation: 20, scheduled: 10 }, true)).toEqual([
      { from: "Abordados", to: "Em conversa", rate: 0.5 },
      { from: "Em conversa", to: "Agendaram", rate: 0.5 },
    ]);
  });
  it("nunca inclui a taxa de comparecimento (fica só no anel)", () => {
    const r = computeConversionRates({ contacted: 40, inConversation: 20, scheduled: 10 }, true);
    expect(r.some((x) => x.to === "Compareceram")).toBe(false);
  });
  it("'Abordados' sem registro manual (= nº de conversas): a 1ª some, sobra só uma", () => {
    expect(computeConversionRates({ contacted: 21, inConversation: 21, scheduled: 10 }, false)).toEqual([{ from: "Em conversa", to: "Agendaram", rate: 10 / 21 }]);
  });
  it("denominador zero: taxa some (nunca '—')", () => {
    expect(computeConversionRates({ contacted: 0, inConversation: 0, scheduled: 0 }, true)).toEqual([]);
  });
  it("acima de 100% (bases diferentes): taxa some", () => {
    expect(computeConversionRates({ contacted: 10, inConversation: 4, scheduled: 6 }, true)).toEqual([{ from: "Abordados", to: "Em conversa", rate: 0.4 }]);
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

describe("trimEvolution — começa no primeiro período com dados", () => {
  const p = (s: number, a: number) => ({ start: new Date(0), end: new Date(1), scheduled: s, attended: a });
  it("corta só os zeros iniciais (zeros no meio ficam)", () => {
    const out = trimEvolution([p(0, 0), p(0, 0), p(2, 1), p(0, 0), p(3, 2), p(4, 3)]);
    expect(out.map((x) => x.scheduled)).toEqual([2, 0, 3, 4]);
  });
  it("tudo zerado: vazio", () => expect(trimEvolution([p(0, 0), p(0, 0)])).toEqual([]));
});
