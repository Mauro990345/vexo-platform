import { describe, it, expect } from "vitest";
import { findMostRecentNoShowAppointment, buildNoShowReplyContext, buildColdLeadReengagementContext } from "./card-reply-context";

describe("findMostRecentNoShowAppointment", () => {
  it("acha o NO_SHOW mais recente entre vários agendamentos", () => {
    const appts = [
      { scheduledAt: new Date("2026-01-01T12:00:00Z"), status: "NO_SHOW" },
      { scheduledAt: new Date("2026-03-01T12:00:00Z"), status: "NO_SHOW" },
      { scheduledAt: new Date("2026-02-01T12:00:00Z"), status: "CANCELLED" },
    ];
    expect(findMostRecentNoShowAppointment(appts)?.scheduledAt).toEqual(new Date("2026-03-01T12:00:00Z"));
  });

  it("sem nenhum NO_SHOW: null", () => {
    const appts = [{ scheduledAt: new Date("2026-01-01T12:00:00Z"), status: "SCHEDULED" }];
    expect(findMostRecentNoShowAppointment(appts)).toBeNull();
  });

  it("lista vazia: null", () => {
    expect(findMostRecentNoShowAppointment([])).toBeNull();
  });
});

describe("buildNoShowReplyContext", () => {
  it("sem reengaged: null, mesmo com NO_SHOW", () => {
    expect(
      buildNoShowReplyContext({ mostRecentNoShowAppointment: { scheduledAt: new Date("2026-01-01T12:00:00Z") }, reengaged: false })
    ).toBeNull();
  });

  it("reengaged sem NO_SHOW: null", () => {
    expect(buildNoShowReplyContext({ mostRecentNoShowAppointment: null, reengaged: true })).toBeNull();
  });

  it("reengaged com NO_SHOW: bloco de contexto com a data, nunca afirmando como fato", () => {
    const result = buildNoShowReplyContext({
      mostRecentNoShowAppointment: { scheduledAt: new Date("2026-01-01T12:00:00Z") },
      reengaged: true,
    });
    expect(result).not.toBeNull();
    expect(result).toContain("não compareceu");
    expect(result).toContain("PODE ser uma resposta");
    expect(result).not.toMatch(/foi enviada\./); // nunca afirma como fato, só possibilidade
  });
});

describe("buildColdLeadReengagementContext", () => {
  it("sem reengaged: null", () => {
    expect(buildColdLeadReengagementContext({ everHadAnyAppointment: false, reengaged: false })).toBeNull();
  });

  it("já teve agendamento (mesmo cancelado): null — não é 'nunca agendou'", () => {
    expect(buildColdLeadReengagementContext({ everHadAnyAppointment: true, reengaged: true })).toBeNull();
  });

  it("reengaged e nunca agendou: bloco de contexto", () => {
    const result = buildColdLeadReengagementContext({ everHadAnyAppointment: false, reengaged: true });
    expect(result).not.toBeNull();
    expect(result).toContain("sem nunca ter agendado");
    expect(result).toContain("PODE ser uma");
  });
});
