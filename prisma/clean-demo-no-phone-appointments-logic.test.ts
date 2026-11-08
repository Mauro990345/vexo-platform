import { describe, it, expect } from "vitest";
import { isNoPhoneTestAppointment, selectNoPhoneAppointmentsToClean, type AppointmentPhoneRow } from "./clean-demo-no-phone-appointments-logic";

function appt(overrides: Partial<AppointmentPhoneRow> = {}): AppointmentPhoneRow {
  return { id: "appt-1", leadId: "lead-1", leadPhone: null, ...overrides };
}

describe("isNoPhoneTestAppointment", () => {
  it("lead sem telefone (null): é candidato", () => {
    expect(isNoPhoneTestAppointment(appt({ leadPhone: null }))).toBe(true);
  });

  it("lead com telefone vazio/só espaço: é candidato (mesmo critério de isLeadWithoutPhoto)", () => {
    expect(isNoPhoneTestAppointment(appt({ leadPhone: "   " }))).toBe(true);
    expect(isNoPhoneTestAppointment(appt({ leadPhone: "" }))).toBe(true);
  });

  it("lead com telefone: não é candidato", () => {
    expect(isNoPhoneTestAppointment(appt({ leadPhone: "11999999999" }))).toBe(false);
  });

  it("sem leadId (agendamento importado do Google sem lead): não é candidato — outro caso, coberto por outro script", () => {
    expect(isNoPhoneTestAppointment(appt({ leadId: null, leadPhone: null }))).toBe(false);
  });
});

describe("selectNoPhoneAppointmentsToClean", () => {
  it("filtra só os sem telefone, fora da lista de exclusão", () => {
    const appointments = [
      appt({ id: "a", leadPhone: null }),
      appt({ id: "b", leadPhone: "11999999999" }),
      appt({ id: "c", leadPhone: null }),
    ];
    const result = selectNoPhoneAppointmentsToClean(appointments, new Set());
    expect(result.map((a) => a.id)).toEqual(["a", "c"]);
  });

  it("nunca inclui um id da lista de exclusão (cards fixos da Reativação / agendamento do reactivation-return-demo), mesmo sem telefone", () => {
    const appointments = [appt({ id: "fixed-card-appt", leadPhone: null }), appt({ id: "normal", leadPhone: null })];
    const result = selectNoPhoneAppointmentsToClean(appointments, new Set(["fixed-card-appt"]));
    expect(result.map((a) => a.id)).toEqual(["normal"]);
  });

  it("lista vazia: nada a limpar", () => {
    expect(selectNoPhoneAppointmentsToClean([], new Set())).toEqual([]);
  });
});
