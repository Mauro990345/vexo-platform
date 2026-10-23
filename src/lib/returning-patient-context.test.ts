import { describe, it, expect } from "vitest";
import { findMostRecentAttendedAppointment, buildReturningPatientContext } from "./returning-patient-context";

const NOW = new Date("2026-10-23T12:00:00Z");

describe("findMostRecentAttendedAppointment", () => {
  it("lead sem nenhum agendamento: não aplica (null)", () => {
    expect(findMostRecentAttendedAppointment([], NOW)).toBeNull();
  });

  it("agendamento SCHEDULED com scheduledAt no passado conta como atendido", () => {
    const appt = { scheduledAt: new Date("2026-10-14T12:00:00Z"), status: "SCHEDULED" };
    expect(findMostRecentAttendedAppointment([appt], NOW)).toBe(appt);
  });

  it("agendamento CONFIRMED com scheduledAt no passado também conta como atendido", () => {
    const appt = { scheduledAt: new Date("2026-10-14T12:00:00Z"), status: "CONFIRMED" };
    expect(findMostRecentAttendedAppointment([appt], NOW)).toBe(appt);
  });

  it("agendamento CANCELLED não conta, mesmo no passado", () => {
    const appt = { scheduledAt: new Date("2026-10-14T12:00:00Z"), status: "CANCELLED" };
    expect(findMostRecentAttendedAppointment([appt], NOW)).toBeNull();
  });

  it('agendamento marcado "Não compareceu" (NO_SHOW) não conta como atendido', () => {
    const appt = { scheduledAt: new Date("2026-10-14T12:00:00Z"), status: "NO_SHOW" };
    expect(findMostRecentAttendedAppointment([appt], NOW)).toBeNull();
  });

  it("agendamento SCHEDULED no futuro não conta (ainda não aconteceu)", () => {
    const appt = { scheduledAt: new Date("2026-11-01T12:00:00Z"), status: "SCHEDULED" };
    expect(findMostRecentAttendedAppointment([appt], NOW)).toBeNull();
  });

  it("com vários agendamentos atendidos, usa o MAIS RECENTE", () => {
    const older = { scheduledAt: new Date("2026-08-01T12:00:00Z"), status: "SCHEDULED" };
    const newer = { scheduledAt: new Date("2026-10-14T12:00:00Z"), status: "CONFIRMED" };
    expect(findMostRecentAttendedAppointment([older, newer], NOW)).toBe(newer);
    expect(findMostRecentAttendedAppointment([newer, older], NOW)).toBe(newer);
  });

  it("um NO_SHOW mais recente não esconde um atendimento de verdade mais antigo", () => {
    const attended = { scheduledAt: new Date("2026-08-01T12:00:00Z"), status: "SCHEDULED" };
    const noShow = { scheduledAt: new Date("2026-10-14T12:00:00Z"), status: "NO_SHOW" };
    expect(findMostRecentAttendedAppointment([attended, noShow], NOW)).toBe(attended);
  });

  // Caso real: a conversa antiga foi marcada "Perdido" (LOST) e o lead
  // escreve de novo numa Conversation NOVA (ver a busca por
  // Conversation.status em conversation-pipeline.ts, que não inclui
  // LOST) — o único vínculo que sobra com o atendimento antigo é o
  // Lead.id. PastAppointmentCandidate não tem (de propósito) nenhum campo
  // de conversationId: quem chama esta função busca os agendamentos POR
  // LEAD (prisma.appointment.findMany({ where: { leadId } })), nunca por
  // conversa — então um agendamento "de uma conversa diferente da atual"
  // é indistinguível, pra esta função, de qualquer outro: ela aplica
  // igual, sem precisar saber a que conversa ele pertencia.
  it("aplica mesmo quando o agendamento atendido não tem nenhum vínculo com a conversa ATUAL (busca é por lead, não por conversa)", () => {
    const attendedFromAnOldConversation = { scheduledAt: new Date("2026-08-01T12:00:00Z"), status: "SCHEDULED" };
    expect(findMostRecentAttendedAppointment([attendedFromAnOldConversation], NOW)).toBe(attendedFromAnOldConversation);
  });
});

describe("buildReturningPatientContext", () => {
  it("sem agendamento atendido: não aplica (null), mesmo reengajado", () => {
    expect(buildReturningPatientContext({ mostRecentAttendedAppointment: null, reengaged: true })).toBeNull();
  });

  it("com agendamento atendido mas SEM reengajamento (conversa corrida): não aplica (null)", () => {
    const result = buildReturningPatientContext({
      mostRecentAttendedAppointment: { scheduledAt: new Date("2026-10-14T12:00:00Z") },
      reengaged: false,
    });
    expect(result).toBeNull();
  });

  it("com agendamento atendido E reengajado: aplica, com a data do atendimento em pt-BR", () => {
    const result = buildReturningPatientContext({
      mostRecentAttendedAppointment: { scheduledAt: new Date("2026-10-14T12:00:00Z") },
      reengaged: true,
    });
    expect(result).not.toBeNull();
    expect(result).toContain("14/10/2026");
    expect(result).toContain("JÁ FOI ATENDIDO");
  });

  it('nunca afirma que uma mensagem específica foi enviada (fica no campo da possibilidade)', () => {
    const result = buildReturningPatientContext({
      mostRecentAttendedAppointment: { scheduledAt: new Date("2026-10-14T12:00:00Z") },
      reengaged: true,
    });
    expect(result).toContain("não há confirmação de que uma mensagem específica foi enviada");
    expect(result).not.toMatch(/mandamos (uma|a) mensagem/i);
    expect(result).not.toMatch(/enviamos (uma|a) mensagem/i);
  });

  it("instrui a NÃO tratar como primeiro contato e a ter prioridade sobre a pergunta de abertura de lead frio", () => {
    const result = buildReturningPatientContext({
      mostRecentAttendedAppointment: { scheduledAt: new Date("2026-10-14T12:00:00Z") },
      reengaged: true,
    });
    expect(result).toContain("NÃO trate como primeiro contato");
    expect(result).toContain("PRIORIDADE");
    expect(result).toContain("chamou atenção no perfil");
  });
});
