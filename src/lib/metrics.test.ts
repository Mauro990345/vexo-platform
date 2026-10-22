import { describe, it, expect } from "vitest";
import {
  computeAttendanceMetrics,
  appointmentDisplayStatus,
  type AttendanceSourceAppointment,
} from "./metrics";

const NOW = new Date("2026-10-22T15:00:00.000Z");
const FROM = new Date("2026-10-15T03:00:00.000Z");
const TO = new Date("2026-10-23T03:00:00.000Z");

function appt(overrides: Partial<AttendanceSourceAppointment> = {}): AttendanceSourceAppointment {
  return {
    conversationId: "conv-1",
    scheduledAt: new Date("2026-10-20T12:00:00.000Z"), // passado, dentro do período
    status: "SCHEDULED",
    ...overrides,
  };
}

describe("computeAttendanceMetrics", () => {
  it("agendamento da IA no passado sem marcação conta como compareceu", () => {
    const result = computeAttendanceMetrics([appt()], FROM, TO, NOW);
    expect(result).toEqual({ attended: 1, pastDue: 1 });
  });

  it("marcado como Não compareceu (NO_SHOW) não conta como comparecimento, mas entra no total de passados", () => {
    const result = computeAttendanceMetrics([appt({ status: "NO_SHOW" })], FROM, TO, NOW);
    expect(result).toEqual({ attended: 0, pastDue: 1 });
  });

  it("agendamento manual (sem conversationId, importado do Google Calendar) não conta", () => {
    const result = computeAttendanceMetrics([appt({ conversationId: null })], FROM, TO, NOW);
    expect(result).toEqual({ attended: 0, pastDue: 0 });
  });

  it("agendamento futuro não conta", () => {
    const result = computeAttendanceMetrics(
      [appt({ scheduledAt: new Date("2026-10-23T02:00:00.000Z") })],
      FROM,
      TO,
      NOW
    );
    expect(result).toEqual({ attended: 0, pastDue: 0 });
  });

  it("troca de período: o mesmo agendamento só conta no período que inclui sua data", () => {
    const appointments = [appt()];
    const periodThatIncludesIt = computeAttendanceMetrics(appointments, FROM, TO, NOW);
    const periodThatExcludesIt = computeAttendanceMetrics(
      appointments,
      new Date("2026-10-21T03:00:00.000Z"),
      TO,
      NOW
    );
    expect(periodThatIncludesIt).toEqual({ attended: 1, pastDue: 1 });
    expect(periodThatExcludesIt).toEqual({ attended: 0, pastDue: 0 });
  });

  it("agendamento cancelado (evento removido do Google Calendar) não conta nem como passado nem como comparecimento", () => {
    const result = computeAttendanceMetrics([appt({ status: "CANCELLED" })], FROM, TO, NOW);
    expect(result).toEqual({ attended: 0, pastDue: 0 });
  });

  it("soma vários agendamentos, misturando os que contam e os que não contam", () => {
    const appointments = [
      appt(), // conta: compareceu
      appt({ status: "NO_SHOW" }), // conta como passado, não como comparecimento
      appt({ conversationId: null }), // não conta: sem lead
      appt({ scheduledAt: new Date("2026-10-23T02:00:00.000Z") }), // não conta: futuro
    ];
    const result = computeAttendanceMetrics(appointments, FROM, TO, NOW);
    expect(result).toEqual({ attended: 1, pastDue: 2 });
  });
});

describe("appointmentDisplayStatus", () => {
  it("SCHEDULED no passado passa a mostrar COMPLETED (Compareceu)", () => {
    expect(
      appointmentDisplayStatus({ status: "SCHEDULED", scheduledAt: new Date("2026-10-20T12:00:00.000Z") }, NOW)
    ).toBe("COMPLETED");
  });

  it("CONFIRMED no passado também passa a mostrar COMPLETED", () => {
    expect(
      appointmentDisplayStatus({ status: "CONFIRMED", scheduledAt: new Date("2026-10-20T12:00:00.000Z") }, NOW)
    ).toBe("COMPLETED");
  });

  it("SCHEDULED no futuro continua mostrando SCHEDULED", () => {
    expect(
      appointmentDisplayStatus({ status: "SCHEDULED", scheduledAt: new Date("2026-10-23T02:00:00.000Z") }, NOW)
    ).toBe("SCHEDULED");
  });

  it("NO_SHOW continua mostrando NO_SHOW mesmo no passado", () => {
    expect(
      appointmentDisplayStatus({ status: "NO_SHOW", scheduledAt: new Date("2026-10-20T12:00:00.000Z") }, NOW)
    ).toBe("NO_SHOW");
  });

  it("CANCELLED continua mostrando CANCELLED mesmo no passado", () => {
    expect(
      appointmentDisplayStatus({ status: "CANCELLED", scheduledAt: new Date("2026-10-20T12:00:00.000Z") }, NOW)
    ).toBe("CANCELLED");
  });
});
