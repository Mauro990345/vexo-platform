import { describe, it, expect } from "vitest";
import {
  parseBrazilLocalDateTime,
  formatAsBrazilLocalDateTime,
  startOfBrazilDay,
  SAO_PAULO_UTC_OFFSET_HOURS,
} from "./timezone";

describe("parseBrazilLocalDateTime", () => {
  it("converte 9h de Brasília pra 12:00 UTC (offset fixo de +3h)", () => {
    const date = parseBrazilLocalDateTime("2026-09-19T09:00");
    expect(date.toISOString()).toBe("2026-09-19T12:00:00.000Z");
  });

  it("converte 11h de Brasília pra 14:00 UTC", () => {
    const date = parseBrazilLocalDateTime("2026-09-19T11:00");
    expect(date.toISOString()).toBe("2026-09-19T14:00:00.000Z");
  });

  it("aceita segundos opcionais", () => {
    const date = parseBrazilLocalDateTime("2026-09-19T09:00:30");
    expect(date.toISOString()).toBe("2026-09-19T12:00:30.000Z");
  });

  it("rola pro dia seguinte em UTC quando o horário local + offset ultrapassa meia-noite", () => {
    // 22h de Brasília (sábado) = 01h UTC de domingo.
    const date = parseBrazilLocalDateTime("2026-09-19T22:00");
    expect(date.toISOString()).toBe("2026-09-20T01:00:00.000Z");
  });

  it("rejeita string sem o formato esperado", () => {
    expect(() => parseBrazilLocalDateTime("2026-09-19T09:00:00Z")).toThrow(/Data\/hora inválida/);
    expect(() => parseBrazilLocalDateTime("19/09/2026 09:00")).toThrow(/Data\/hora inválida/);
    expect(() => parseBrazilLocalDateTime("não é uma data")).toThrow(/Data\/hora inválida/);
  });

  it("normaliza um dia fora da faixa do mês pro dia seguinte real (comportamento herdado de Date.UTC)", () => {
    // 2026 não é bissexto — fevereiro tem 28 dias, então "30 de fevereiro"
    // rola pra 2 de março, em vez de lançar erro (mesmo comportamento que
    // `new Date(...)` já tinha antes desta função existir).
    const date = parseBrazilLocalDateTime("2026-02-30T09:00");
    expect(date.toISOString()).toBe("2026-03-02T12:00:00.000Z");
  });

  it("o offset é sempre +3h, sem variação de horário de verão", () => {
    // Brasília não tem mais DST desde 2019 — o mesmo offset vale em
    // qualquer época do ano (aqui: janeiro/verão vs. julho/inverno).
    const summer = parseBrazilLocalDateTime("2026-01-15T09:00");
    const winter = parseBrazilLocalDateTime("2026-07-15T09:00");
    expect(summer.getUTCHours()).toBe(9 + SAO_PAULO_UTC_OFFSET_HOURS);
    expect(winter.getUTCHours()).toBe(9 + SAO_PAULO_UTC_OFFSET_HOURS);
  });
});

describe("formatAsBrazilLocalDateTime", () => {
  it("é o inverso exato de parseBrazilLocalDateTime (round-trip)", () => {
    const original = "2026-09-19T09:00";
    const roundTripped = formatAsBrazilLocalDateTime(parseBrazilLocalDateTime(original));
    expect(roundTripped).toBe(original);
  });

  it("faz o round-trip corretamente através da virada de dia", () => {
    const original = "2026-09-19T22:30";
    const roundTripped = formatAsBrazilLocalDateTime(parseBrazilLocalDateTime(original));
    expect(roundTripped).toBe(original);
  });

  it("formata um instante UTC conhecido pro horário de Brasília esperado", () => {
    expect(formatAsBrazilLocalDateTime(new Date("2026-09-19T12:00:00.000Z"))).toBe("2026-09-19T09:00");
  });
});

describe("startOfBrazilDay", () => {
  it("corta pra meia-noite de Brasília (03:00 UTC), não meia-noite UTC", () => {
    // 14h de Brasília (17h UTC) no meio do dia 19/09.
    const date = startOfBrazilDay(new Date("2026-09-19T17:00:00.000Z"));
    expect(date.toISOString()).toBe("2026-09-19T03:00:00.000Z");
  });

  it("bug real: instante logo depois da meia-noite UTC mas ainda 'ontem' em Brasília continua no dia de ontem", () => {
    // 21h30 de Brasília do dia 19/09 = 00h30 UTC do dia 20/09 — a virada de
    // dia em UTC já aconteceu, mas em Brasília ainda é 19/09. Um corte
    // ingênuo (Date.setHours em processo UTC) devolveria 20/09 aqui; o
    // certo é continuar reportando 19/09.
    const date = startOfBrazilDay(new Date("2026-09-20T00:30:00.000Z"));
    expect(date.toISOString()).toBe("2026-09-19T03:00:00.000Z");
  });

  it("instante logo depois da meia-noite de Brasília já pertence ao novo dia", () => {
    // 00h30 de Brasília do dia 20/09 = 03h30 UTC do dia 20/09.
    const date = startOfBrazilDay(new Date("2026-09-20T03:30:00.000Z"));
    expect(date.toISOString()).toBe("2026-09-20T03:00:00.000Z");
  });

  it("é idempotente: aplicar de novo no resultado devolve o mesmo instante", () => {
    const once = startOfBrazilDay(new Date("2026-09-19T17:00:00.000Z"));
    const twice = startOfBrazilDay(once);
    expect(twice.toISOString()).toBe(once.toISOString());
  });
});
