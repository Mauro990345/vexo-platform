import { describe, it, expect } from "vitest";
import { panelAppointmentGroup, groupAppointmentsForPanel } from "./panel-appointments";

const NOW = new Date("2026-11-10T15:00:00.000Z"); // terça, meio da tarde (UTC) — meio do dia em America/Sao_Paulo

describe("panelAppointmentGroup", () => {
  it("SCHEDULED no futuro: Próximos", () => {
    expect(panelAppointmentGroup({ status: "SCHEDULED", scheduledAt: new Date("2026-11-12T12:00:00.000Z") }, NOW)).toBe("UPCOMING");
  });

  it("CONFIRMED no futuro: Próximos", () => {
    expect(panelAppointmentGroup({ status: "CONFIRMED", scheduledAt: new Date("2026-11-11T12:00:00.000Z") }, NOW)).toBe("UPCOMING");
  });

  it("SCHEDULED no passado, mesmo dia de hoje: Aguardando resposta", () => {
    expect(panelAppointmentGroup({ status: "SCHEDULED", scheduledAt: new Date("2026-11-10T10:00:00.000Z") }, NOW)).toBe("AWAITING_RESPONSE");
  });

  it("CONFIRMED no passado, mesmo dia de hoje: Aguardando resposta", () => {
    expect(panelAppointmentGroup({ status: "CONFIRMED", scheduledAt: new Date("2026-11-10T09:00:00.000Z") }, NOW)).toBe("AWAITING_RESPONSE");
  });

  it("SCHEDULED no passado, de um dia anterior (ainda não marcado): Histórico", () => {
    expect(panelAppointmentGroup({ status: "SCHEDULED", scheduledAt: new Date("2026-11-08T10:00:00.000Z") }, NOW)).toBe("HISTORY");
  });

  it("NO_SHOW (já marcado Faltou), mesmo que hoje: Histórico — já foi decidido", () => {
    expect(panelAppointmentGroup({ status: "NO_SHOW", scheduledAt: new Date("2026-11-10T09:00:00.000Z") }, NOW)).toBe("HISTORY");
  });

  it("NO_SHOW antigo: Histórico", () => {
    expect(panelAppointmentGroup({ status: "NO_SHOW", scheduledAt: new Date("2026-10-01T09:00:00.000Z") }, NOW)).toBe("HISTORY");
  });
});

describe("groupAppointmentsForPanel", () => {
  function appt(id: string, status: string, scheduledAt: string) {
    return { id, status, scheduledAt: new Date(scheduledAt) };
  }

  it("separa nos 3 grupos", () => {
    const appointments = [
      appt("futuro-2", "SCHEDULED", "2026-11-15T12:00:00.000Z"),
      appt("hoje-aguardando", "SCHEDULED", "2026-11-10T10:00:00.000Z"),
      appt("futuro-1", "SCHEDULED", "2026-11-11T12:00:00.000Z"),
      appt("faltou", "NO_SHOW", "2026-11-05T12:00:00.000Z"),
      appt("ontem-completado", "SCHEDULED", "2026-11-09T12:00:00.000Z"),
    ];
    const { upcoming, awaitingResponse, history } = groupAppointmentsForPanel(appointments, NOW);
    expect(upcoming.map((a) => a.id)).toEqual(["futuro-1", "futuro-2"]); // mais próximo primeiro
    expect(awaitingResponse.map((a) => a.id)).toEqual(["hoje-aguardando"]);
    expect(history.map((a) => a.id)).toEqual(["ontem-completado", "faltou"]); // mais recente primeiro
  });

  it("próximos ordenados do mais próximo pro mais distante", () => {
    const appointments = [
      appt("distante", "SCHEDULED", "2026-12-01T12:00:00.000Z"),
      appt("proximo", "SCHEDULED", "2026-11-11T08:00:00.000Z"),
    ];
    const { upcoming } = groupAppointmentsForPanel(appointments, NOW);
    expect(upcoming.map((a) => a.id)).toEqual(["proximo", "distante"]);
  });

  it("aguardando resposta ordenados do mais atrasado (mais antigo hoje) primeiro", () => {
    const appointments = [
      appt("tarde", "SCHEDULED", "2026-11-10T14:00:00.000Z"),
      appt("manha", "SCHEDULED", "2026-11-10T08:00:00.000Z"),
    ];
    const { awaitingResponse } = groupAppointmentsForPanel(appointments, NOW);
    expect(awaitingResponse.map((a) => a.id)).toEqual(["manha", "tarde"]);
  });

  it("histórico ordenado do mais recente pro mais antigo", () => {
    const appointments = [
      appt("antigo", "NO_SHOW", "2026-09-01T12:00:00.000Z"),
      appt("recente", "NO_SHOW", "2026-11-01T12:00:00.000Z"),
    ];
    const { history } = groupAppointmentsForPanel(appointments, NOW);
    expect(history.map((a) => a.id)).toEqual(["recente", "antigo"]);
  });

  it("lista vazia: os 3 grupos ficam vazios", () => {
    const { upcoming, awaitingResponse, history } = groupAppointmentsForPanel([], NOW);
    expect(upcoming).toEqual([]);
    expect(awaitingResponse).toEqual([]);
    expect(history).toEqual([]);
  });
});
