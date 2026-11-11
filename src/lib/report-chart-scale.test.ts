import { describe, it, expect } from "vitest";
import { niceAxis } from "./report-chart-scale";
import { lastWeeksOfPeriod, evolutionMonthsOfPeriod, computeMonthlyPeriod, computeBiweeklyPeriod } from "./report-period";

describe("niceAxis — 3 a 4 marcas redondas, cobrindo o máximo", () => {
  for (const [max, ticks] of [
    [0, [0, 1, 2]],
    [2, [0, 1, 2]],
    [3, [0, 1, 2, 3]],
    [7, [0, 5, 10]],
    [10, [0, 5, 10]],
    [12, [0, 5, 10, 15]],
    [26, [0, 10, 20, 30]],
    [165, [0, 100, 200]],
    [540, [0, 200, 400, 600]],
  ] as Array<[number, number[]]>) {
    it(`máx ${max} → ${ticks.join(",")}`, () => {
      const r = niceAxis(max);
      expect(r.ticks).toEqual(ticks);
      expect(r.max).toBeGreaterThanOrEqual(max);
      expect(r.ticks.length).toBeGreaterThanOrEqual(3);
      expect(r.ticks.length).toBeLessThanOrEqual(4);
    });
  }
});

describe("lastWeeksOfPeriod — 6 semanas civis", () => {
  it("outubro/2026: termina na semana de 26/10 (recortada em 31/10), começa em 21/09", () => {
    const w = lastWeeksOfPeriod(computeMonthlyPeriod(new Date("2026-10-15T12:00:00Z")));
    expect(w).toHaveLength(6);
    expect(w[0]!.start.toISOString()).toBe("2026-09-21T03:00:00.000Z");
    expect(w[5]!.start.toISOString()).toBe("2026-10-26T03:00:00.000Z");
    expect(w[5]!.end.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    for (let i = 1; i < 6; i++) expect(w[i]!.start.getTime()).toBe(w[i - 1]!.end.getTime());
  });
});

describe("evolutionMonthsOfPeriod — sempre meses completos", () => {
  it("mensal: termina no mês do relatório", () => {
    const m = evolutionMonthsOfPeriod(computeMonthlyPeriod(new Date("2026-10-15T12:00:00Z")));
    expect(m.map((p) => p.start.toISOString())).toEqual(["2026-08-01T03:00:00.000Z", "2026-09-01T03:00:00.000Z", "2026-10-01T03:00:00.000Z"]);
  });
  it("quinzenal 2ª quinzena: agrupa por mês e termina no mês que ela fecha", () => {
    const m = evolutionMonthsOfPeriod(computeBiweeklyPeriod(new Date("2026-10-20T12:00:00Z")));
    expect(m[2]!.start.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(m[2]!.end.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });
  it("quinzenal 1ª quinzena: mês ainda aberto → termina no mês anterior completo", () => {
    const m = evolutionMonthsOfPeriod(computeBiweeklyPeriod(new Date("2026-11-05T12:00:00Z")));
    expect(m[2]!.start.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });
});
