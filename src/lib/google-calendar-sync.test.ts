import { describe, it, expect } from "vitest";
import { resolveGoogleCalendarSyncUpdate } from "./google-calendar-sync";

// Simula "o sync rodando depois do script" (prisma/seed-reactivation-showcase.ts):
// o script ajustou scheduledAt pra hoje, mas o evento real no Google
// Calendar ainda tem o horário original — sem skipGoogleCalendarSync, o
// sync normalmente reverteria scheduledAt de volta pro valor do evento
// (ver comentário grande em google-calendar-sync.ts/PR #156). Este
// arquivo garante que isso NÃO acontece mais pros agendamentos marcados.
describe("resolveGoogleCalendarSyncUpdate", () => {
  it("skipGoogleCalendarSync=true: NÃO reverte scheduledAt mesmo com o evento mostrando outro horário", () => {
    const existing = {
      scheduledAt: new Date("2026-10-29T12:00:00.000Z"), // data que o script ajustou pra hoje
      leadId: "lead-1",
      manualTitle: null,
      skipGoogleCalendarSync: true,
    };
    const event = { scheduledAt: new Date("2026-10-09T14:00:00.000Z"), summary: "Consulta" }; // horário real, original, do Google

    const data = resolveGoogleCalendarSyncUpdate(existing, event);

    expect(data.scheduledAt).toBeUndefined();
  });

  it("skipGoogleCalendarSync=false (comportamento de sempre): reverte scheduledAt normalmente quando difere", () => {
    const existing = {
      scheduledAt: new Date("2026-10-29T12:00:00.000Z"),
      leadId: "lead-1",
      manualTitle: null,
      skipGoogleCalendarSync: false,
    };
    const event = { scheduledAt: new Date("2026-10-09T14:00:00.000Z"), summary: "Consulta" };

    const data = resolveGoogleCalendarSyncUpdate(existing, event);

    expect(data.scheduledAt).toEqual(new Date("2026-10-09T14:00:00.000Z"));
  });

  it("skipGoogleCalendarSync=true: nenhuma escrita nenhuma quando scheduledAt já bate (nada a fazer)", () => {
    const sameDate = new Date("2026-10-09T14:00:00.000Z");
    const existing = { scheduledAt: sameDate, leadId: "lead-1", manualTitle: null, skipGoogleCalendarSync: true };
    const event = { scheduledAt: sameDate, summary: "Consulta" };

    const data = resolveGoogleCalendarSyncUpdate(existing, event);

    expect(data).toEqual({});
  });

  it("skipGoogleCalendarSync não afeta o renomeio de manualTitle (agendamento manual, sem Lead)", () => {
    const existing = {
      scheduledAt: new Date("2026-10-09T14:00:00.000Z"),
      leadId: null,
      manualTitle: "Título antigo",
      skipGoogleCalendarSync: true,
    };
    const event = { scheduledAt: new Date("2026-10-09T14:00:00.000Z"), summary: "Título novo" };

    const data = resolveGoogleCalendarSyncUpdate(existing, event);

    expect(data.scheduledAt).toBeUndefined();
    expect(data.manualTitle).toBe("Título novo");
  });

  it("agendamento com Lead: nunca sobrescreve manualTitle, com ou sem skip", () => {
    const existing = {
      scheduledAt: new Date("2026-10-09T14:00:00.000Z"),
      leadId: "lead-1",
      manualTitle: null,
      skipGoogleCalendarSync: false,
    };
    const event = { scheduledAt: new Date("2026-10-09T14:00:00.000Z"), summary: "Algum título do evento" };

    const data = resolveGoogleCalendarSyncUpdate(existing, event);

    expect(data.manualTitle).toBeUndefined();
  });
});
