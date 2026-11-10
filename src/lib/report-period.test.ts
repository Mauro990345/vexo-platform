import { describe, it, expect } from "vitest";
import {
  computeMonthlyPeriod,
  computeBiweeklyPeriod,
  computeReportPeriod,
  periodLengthDays,
  daysInMonth,
  resolveMonthlySendDay,
  resolveBiweeklySendDays,
  isReportSendMoment,
  resolveNextSendDate,
  formatReportPeriodLabel,
  formatReportDateRange,
  resolvePreviousPeriod,
  computeLastClosedPeriod,
} from "./report-period";

// Instantes em UTC escolhidos ao MEIO-DIA (não meia-noite) de propósito —
// evita qualquer ambiguidade de fuso na borda do dia em Brasília
// (UTC-3), mesmo cuidado já usado nos testes de reactivation.ts.
function brtNoon(isoDatePart: string): Date {
  return new Date(`${isoDatePart}T12:00:00.000Z`);
}

describe("computeMonthlyPeriod", () => {
  it("mês de 30 dias (novembro)", () => {
    const period = computeMonthlyPeriod(brtNoon("2026-11-15"));
    expect(period.start.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(periodLengthDays(period)).toBe(30);
  });

  it("mês de 31 dias (janeiro)", () => {
    const period = computeMonthlyPeriod(brtNoon("2027-01-10"));
    expect(period.start.toISOString()).toBe("2027-01-01T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2027-02-01T03:00:00.000Z");
    expect(periodLengthDays(period)).toBe(31);
  });

  it("fevereiro de ano NÃO bissexto (28 dias)", () => {
    const period = computeMonthlyPeriod(brtNoon("2027-02-05"));
    expect(period.end.toISOString()).toBe("2027-03-01T03:00:00.000Z");
    expect(periodLengthDays(period)).toBe(28);
  });

  it("fevereiro de ano bissexto (29 dias)", () => {
    const period = computeMonthlyPeriod(brtNoon("2028-02-05"));
    expect(period.end.toISOString()).toBe("2028-03-01T03:00:00.000Z");
    expect(periodLengthDays(period)).toBe(29);
  });

  it("dezembro — o período seguinte cai em janeiro do ano seguinte, sem quebrar a virada de ano", () => {
    const period = computeMonthlyPeriod(brtNoon("2026-12-20"));
    expect(period.start.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});

describe("computeBiweeklyPeriod", () => {
  it("1ª quinzena (dia 1 ao 15) — referência no meio dela", () => {
    const period = computeBiweeklyPeriod(brtNoon("2026-11-08"));
    expect(period.start.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-11-16T03:00:00.000Z");
    expect(periodLengthDays(period)).toBe(15);
  });

  it("referência EXATAMENTE no dia 15 ainda cai na 1ª quinzena", () => {
    const period = computeBiweeklyPeriod(brtNoon("2026-11-15"));
    expect(period.start.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-11-16T03:00:00.000Z");
  });

  it("2ª quinzena (dia 16 ao último dia) — mês de 30 dias", () => {
    const period = computeBiweeklyPeriod(brtNoon("2026-11-20"));
    expect(period.start.toISOString()).toBe("2026-11-16T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(periodLengthDays(period)).toBe(15);
  });

  it("2ª quinzena de janeiro (31 dias) tem 16 dias corridos (16 a 31)", () => {
    const period = computeBiweeklyPeriod(brtNoon("2027-01-25"));
    expect(period.start.toISOString()).toBe("2027-01-16T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2027-02-01T03:00:00.000Z");
    expect(periodLengthDays(period)).toBe(16);
  });

  it("2ª quinzena de fevereiro não bissexto tem 13 dias corridos (16 a 28)", () => {
    const period = computeBiweeklyPeriod(brtNoon("2027-02-20"));
    expect(period.start.toISOString()).toBe("2027-02-16T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2027-03-01T03:00:00.000Z");
    expect(periodLengthDays(period)).toBe(13);
  });
});

describe("computeReportPeriod", () => {
  it("despacha para mensal ou quinzenal pela frequência", () => {
    const monthly = computeReportPeriod("MONTHLY", brtNoon("2026-11-10"));
    const biweekly = computeReportPeriod("BIWEEKLY", brtNoon("2026-11-10"));
    expect(periodLengthDays(monthly)).toBe(30);
    expect(periodLengthDays(biweekly)).toBe(15);
  });
});

describe("daysInMonth", () => {
  it("meses de 28/29/30/31 dias, incluindo virada de ano (dezembro -> janeiro)", () => {
    expect(daysInMonth(2026, 10)).toBe(30); // novembro
    expect(daysInMonth(2026, 11)).toBe(31); // dezembro
    expect(daysInMonth(2026, 12)).toBe(31); // janeiro/2027, via rollover
    expect(daysInMonth(2026, 13)).toBe(28); // fevereiro/2027 (não bissexto)
    expect(daysInMonth(2028, 1)).toBe(29); // fevereiro/2028 (bissexto)
  });
});

describe("resolveMonthlySendDay", () => {
  it("LAST_DAY: sempre o último dia real do mês", () => {
    expect(resolveMonthlySendDay(2026, 10, "LAST_DAY", null)).toBe(30); // novembro
    expect(resolveMonthlySendDay(2027, 0, "LAST_DAY", null)).toBe(31); // janeiro
    expect(resolveMonthlySendDay(2027, 1, "LAST_DAY", null)).toBe(28); // fevereiro não bissexto
  });

  it("FIXED_DAY: o dia configurado, nunca além do último dia real do mês", () => {
    expect(resolveMonthlySendDay(2026, 10, "FIXED_DAY", 5)).toBe(5);
    expect(resolveMonthlySendDay(2027, 1, "FIXED_DAY", 28)).toBe(28); // fevereiro, 28 é válido
  });
});

describe("resolveBiweeklySendDays", () => {
  it("sempre dia 15 e o último dia do mês", () => {
    expect(resolveBiweeklySendDays(2026, 10)).toEqual([15, 30]); // novembro
    expect(resolveBiweeklySendDays(2027, 1)).toEqual([15, 28]); // fevereiro não bissexto
    expect(resolveBiweeklySendDays(2028, 1)).toEqual([15, 29]); // fevereiro bissexto
  });
});

describe("isReportSendMoment", () => {
  const monthlyLastDay = { frequency: "MONTHLY" as const, monthlyDayMode: "LAST_DAY" as const, monthlyFixedDay: null, sendHour: 17, sendMinute: 0 };

  it("mensal (último dia): true no último dia do mês, depois do horário configurado", () => {
    expect(isReportSendMoment(monthlyLastDay, new Date("2026-11-30T20:05:00.000Z"))).toBe(true); // 17h05 BRT
  });

  it("mensal (último dia): false no último dia, mas ANTES do horário configurado", () => {
    expect(isReportSendMoment(monthlyLastDay, new Date("2026-11-30T19:55:00.000Z"))).toBe(false); // 16h55 BRT
  });

  it("mensal (último dia): false em qualquer outro dia do mês, mesmo depois do horário", () => {
    expect(isReportSendMoment(monthlyLastDay, new Date("2026-11-29T20:05:00.000Z"))).toBe(false);
  });

  it("mensal (dia fixo): true só no dia configurado", () => {
    const fixedDay10 = { ...monthlyLastDay, monthlyDayMode: "FIXED_DAY" as const, monthlyFixedDay: 10 };
    expect(isReportSendMoment(fixedDay10, new Date("2026-11-10T20:05:00.000Z"))).toBe(true);
    expect(isReportSendMoment(fixedDay10, new Date("2026-11-11T20:05:00.000Z"))).toBe(false);
  });

  it("quinzenal: true no dia 15 E no último dia do mês, false em qualquer outro", () => {
    const biweekly = { ...monthlyLastDay, frequency: "BIWEEKLY" as const };
    expect(isReportSendMoment(biweekly, new Date("2026-11-15T20:05:00.000Z"))).toBe(true);
    expect(isReportSendMoment(biweekly, new Date("2026-11-30T20:05:00.000Z"))).toBe(true);
    expect(isReportSendMoment(biweekly, new Date("2026-11-16T20:05:00.000Z"))).toBe(false);
  });

  it("horário ajustado (ex.: 9h): respeita o novo horário, não mais 17h", () => {
    const earlyBird = { ...monthlyLastDay, sendHour: 9, sendMinute: 0 };
    expect(isReportSendMoment(earlyBird, new Date("2026-11-30T12:05:00.000Z"))).toBe(true); // 9h05 BRT
    expect(isReportSendMoment(earlyBird, new Date("2026-11-30T11:55:00.000Z"))).toBe(false); // 8h55 BRT
  });
});

describe("resolveNextSendDate", () => {
  const monthlyLastDay = { frequency: "MONTHLY" as const, monthlyDayMode: "LAST_DAY" as const, monthlyFixedDay: null, sendHour: 17, sendMinute: 0 };

  it("mensal: aponta pro último dia do mês atual quando ainda não chegou", () => {
    const next = resolveNextSendDate(monthlyLastDay, brtNoon("2026-11-10"));
    expect(next.toISOString()).toBe("2026-11-30T03:00:00.000Z");
  });

  it("mensal: já no dia de envio mas sem ter chegado o horário ainda aponta pra hoje", () => {
    const next = resolveNextSendDate(monthlyLastDay, new Date("2026-11-30T14:00:00.000Z")); // 11h BRT
    expect(next.toISOString()).toBe("2026-11-30T03:00:00.000Z");
  });

  it("mensal: depois do último dia do mês já ter passado, avança pro mês seguinte (virada de ano)", () => {
    const next = resolveNextSendDate(monthlyLastDay, brtNoon("2026-12-31"));
    // 31/12 já é o próprio dia de envio de dezembro — ainda aponta pra ele
    // (comparação por DIA, não por hora já ter passado às 12h do meio-dia).
    expect(next.toISOString()).toBe("2026-12-31T03:00:00.000Z");
  });

  it("mensal: no dia seguinte ao envio do mês, avança pra janeiro do ano seguinte", () => {
    const next = resolveNextSendDate(monthlyLastDay, brtNoon("2027-01-01")); // depois de 31/12 já ter passado
    expect(next.toISOString()).toBe("2027-01-31T03:00:00.000Z");
  });

  it("quinzenal: entre o dia 15 e o fim do mês, aponta pro último dia", () => {
    const biweekly = { ...monthlyLastDay, frequency: "BIWEEKLY" as const };
    const next = resolveNextSendDate(biweekly, brtNoon("2026-11-20"));
    expect(next.toISOString()).toBe("2026-11-30T03:00:00.000Z");
  });

  it("quinzenal: antes do dia 15, aponta pro dia 15", () => {
    const biweekly = { ...monthlyLastDay, frequency: "BIWEEKLY" as const };
    const next = resolveNextSendDate(biweekly, brtNoon("2026-11-05"));
    expect(next.toISOString()).toBe("2026-11-15T03:00:00.000Z");
  });

  it("quinzenal: depois do último dia do mês, avança pro dia 15 do mês seguinte", () => {
    const biweekly = { ...monthlyLastDay, frequency: "BIWEEKLY" as const };
    const next = resolveNextSendDate(biweekly, brtNoon("2026-12-01"));
    expect(next.toISOString()).toBe("2026-12-15T03:00:00.000Z");
  });
});

describe("formatReportPeriodLabel", () => {
  it("mensal: nome do mês + ano", () => {
    expect(formatReportPeriodLabel("MONTHLY", computeMonthlyPeriod(brtNoon("2026-11-15")))).toBe("novembro de 2026");
  });

  it("quinzenal, 1ª quinzena", () => {
    expect(formatReportPeriodLabel("BIWEEKLY", computeBiweeklyPeriod(brtNoon("2026-11-08")))).toBe("1ª quinzena de novembro de 2026");
  });

  it("quinzenal, 2ª quinzena", () => {
    expect(formatReportPeriodLabel("BIWEEKLY", computeBiweeklyPeriod(brtNoon("2026-11-20")))).toBe("2ª quinzena de novembro de 2026");
  });
});

describe("formatReportDateRange", () => {
  it("mostra sempre a data inicial e a final (último dia de verdade, não o limite exclusivo)", () => {
    expect(formatReportDateRange(computeMonthlyPeriod(brtNoon("2026-11-15")))).toBe("01/11 a 30/11");
    expect(formatReportDateRange(computeBiweeklyPeriod(brtNoon("2026-11-08")))).toBe("01/11 a 15/11");
    expect(formatReportDateRange(computeBiweeklyPeriod(brtNoon("2026-11-20")))).toBe("16/11 a 30/11");
  });
});

describe("resolvePreviousPeriod", () => {
  it("mensal: mês civil imediatamente anterior, qualquer que seja a duração dos dois (31 -> 30, virada de ano)", () => {
    const november = computeMonthlyPeriod(brtNoon("2026-11-15"));
    expect(resolvePreviousPeriod("MONTHLY", november)).toEqual(computeMonthlyPeriod(brtNoon("2026-10-15")));

    const january = computeMonthlyPeriod(brtNoon("2027-01-10"));
    expect(resolvePreviousPeriod("MONTHLY", january)).toEqual(computeMonthlyPeriod(brtNoon("2026-12-10")));
  });

  it("quinzenal: quinzena anterior, inclusive virando de mês (1ª quinzena -> 2ª quinzena do mês anterior)", () => {
    const firstHalf = computeBiweeklyPeriod(brtNoon("2026-11-08"));
    expect(resolvePreviousPeriod("BIWEEKLY", firstHalf)).toEqual(computeBiweeklyPeriod(brtNoon("2026-10-20")));

    const secondHalf = computeBiweeklyPeriod(brtNoon("2026-11-20"));
    expect(resolvePreviousPeriod("BIWEEKLY", secondHalf)).toEqual(computeBiweeklyPeriod(brtNoon("2026-11-08")));
  });
});

describe("computeLastClosedPeriod", () => {
  it("mensal: nunca o mês em andamento — sempre o mês anterior completo", () => {
    const result = computeLastClosedPeriod("MONTHLY", brtNoon("2026-11-15"));
    expect(result).toEqual(computeMonthlyPeriod(brtNoon("2026-10-15")));
    expect(formatReportDateRange(result)).toBe("01/10 a 31/10");
  });

  it("mensal: mesmo no ÚLTIMO dia do mês (quando o mês já está tecnicamente completo), ainda considera o mês anterior o 'último fechado' — nunca o que só fecha hoje", () => {
    const result = computeLastClosedPeriod("MONTHLY", brtNoon("2026-11-30"));
    expect(formatReportDateRange(result)).toBe("01/10 a 31/10");
  });

  it("quinzenal: nunca a quinzena em andamento — sempre a anterior completa", () => {
    const result = computeLastClosedPeriod("BIWEEKLY", brtNoon("2026-11-20"));
    expect(formatReportDateRange(result)).toBe("01/11 a 15/11");
  });

  it("virada de ano: dezembro -> último fechado é novembro", () => {
    const result = computeLastClosedPeriod("MONTHLY", brtNoon("2026-12-05"));
    expect(formatReportDateRange(result)).toBe("01/11 a 30/11");
  });
});
