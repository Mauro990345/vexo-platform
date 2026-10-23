import { describe, it, expect } from "vitest";
import {
  DEMO_CLINIC_ID,
  assertDemoClinic,
  isLeadWithoutPhoto,
  selectLeadsWithoutPhoto,
  isAppointmentWithoutLead,
  selectAppointmentsWithoutLead,
  shouldDeleteGroupB,
  buildLeadCascadePreview,
  dateRangeLabel,
  type LeadCascadeInput,
} from "./clean-no-photo-demo-data-logic";

describe("assertDemoClinic", () => {
  it("aceita a Clínica Demo VEXO", () => {
    expect(() => assertDemoClinic(DEMO_CLINIC_ID)).not.toThrow();
  });

  it("recusa qualquer outro id de clínica", () => {
    expect(() => assertDemoClinic("outra-clinica-qualquer")).toThrow(/só opera na Clínica Demo VEXO/);
    expect(() => assertDemoClinic("")).toThrow();
  });
});

describe("isLeadWithoutPhoto / selectLeadsWithoutPhoto", () => {
  it("lead com foto fica de fora (não é candidato)", () => {
    expect(isLeadWithoutPhoto({ profilePictureUrl: "https://scontent.cdninstagram.com/foto.jpg" })).toBe(false);
  });

  it("lead sem foto (null) é candidato", () => {
    expect(isLeadWithoutPhoto({ profilePictureUrl: null })).toBe(true);
  });

  it("lead com profilePictureUrl vazio/só espaço também é candidato", () => {
    expect(isLeadWithoutPhoto({ profilePictureUrl: "" })).toBe(true);
    expect(isLeadWithoutPhoto({ profilePictureUrl: "   " })).toBe(true);
  });

  it("selectLeadsWithoutPhoto filtra só os sem foto, mantendo os outros campos do objeto", () => {
    const leads = [
      { id: "com-foto", profilePictureUrl: "https://x.com/a.jpg" },
      { id: "sem-foto-1", profilePictureUrl: null },
      { id: "sem-foto-2", profilePictureUrl: "" },
    ];
    expect(selectLeadsWithoutPhoto(leads).map((l) => l.id)).toEqual(["sem-foto-1", "sem-foto-2"]);
  });
});

describe("isAppointmentWithoutLead / selectAppointmentsWithoutLead", () => {
  it("agendamento com lead vinculado não é Grupo B", () => {
    expect(isAppointmentWithoutLead({ leadId: "lead-1" })).toBe(false);
  });

  it("agendamento sem lead vinculado é Grupo B", () => {
    expect(isAppointmentWithoutLead({ leadId: null })).toBe(true);
  });

  it("selectAppointmentsWithoutLead filtra só os sem lead", () => {
    const appointments = [
      { id: "com-lead", leadId: "lead-1" },
      { id: "sem-lead", leadId: null },
    ];
    expect(selectAppointmentsWithoutLead(appointments).map((a) => a.id)).toEqual(["sem-lead"]);
  });
});

describe("shouldDeleteGroupB — Grupo B só entra com a flag, e só junto de --apply", () => {
  it("nem --apply nem --include-no-lead: não apaga Grupo B", () => {
    expect(shouldDeleteGroupB(false, false)).toBe(false);
  });

  it("só --apply, sem --include-no-lead: NÃO apaga Grupo B (pedido explícito)", () => {
    expect(shouldDeleteGroupB(true, false)).toBe(false);
  });

  it("só --include-no-lead, sem --apply: não apaga nada (modo relatório continua só leitura)", () => {
    expect(shouldDeleteGroupB(false, true)).toBe(false);
  });

  it("--apply E --include-no-lead juntas: apaga Grupo B", () => {
    expect(shouldDeleteGroupB(true, true)).toBe(true);
  });
});

describe("buildLeadCascadePreview", () => {
  const now = new Date("2026-10-24T12:00:00.000Z");

  function lead(overrides: Partial<LeadCascadeInput> = {}): LeadCascadeInput {
    return {
      id: "lead-1",
      igUsername: "fulano.silva",
      igScopedId: "demo-agendado-0",
      conversations: [],
      appointments: [],
      ...overrides,
    };
  }

  it("soma mensagens e follow-ups de todas as conversas do lead", () => {
    const preview = buildLeadCascadePreview(
      lead({
        conversations: [
          { lastMessageAt: null, messageCount: 3, followUpCount: 1 },
          { lastMessageAt: null, messageCount: 2, followUpCount: 0 },
        ],
      }),
      now
    );
    expect(preview.conversationCount).toBe(2);
    expect(preview.messageCount).toBe(5);
    expect(preview.followUpCount).toBe(1);
  });

  it("hasRecentConversation: true com lastMessageAt dentro dos últimos 7 dias", () => {
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const preview = buildLeadCascadePreview(
      lead({ conversations: [{ lastMessageAt: threeDaysAgo, messageCount: 1, followUpCount: 0 }] }),
      now
    );
    expect(preview.hasRecentConversation).toBe(true);
  });

  it("hasRecentConversation: false com lastMessageAt mais antigo que 7 dias", () => {
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const preview = buildLeadCascadePreview(
      lead({ conversations: [{ lastMessageAt: tenDaysAgo, messageCount: 1, followUpCount: 0 }] }),
      now
    );
    expect(preview.hasRecentConversation).toBe(false);
  });

  it("hasRecentConversation: false sem nenhuma conversa, ou lastMessageAt null", () => {
    expect(buildLeadCascadePreview(lead(), now).hasRecentConversation).toBe(false);
    expect(
      buildLeadCascadePreview(lead({ conversations: [{ lastMessageAt: null, messageCount: 0, followUpCount: 0 }] }), now)
        .hasRecentConversation
    ).toBe(false);
  });

  it("hasFutureAppointment: true com algum agendamento depois de 'now'", () => {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const preview = buildLeadCascadePreview(lead({ appointments: [{ scheduledAt: tomorrow }] }), now);
    expect(preview.hasFutureAppointment).toBe(true);
  });

  it("hasFutureAppointment: false com agendamentos só no passado", () => {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const preview = buildLeadCascadePreview(lead({ appointments: [{ scheduledAt: yesterday }] }), now);
    expect(preview.hasFutureAppointment).toBe(false);
  });
});

describe("dateRangeLabel", () => {
  it("formata do menor ao maior, independente da ordem de entrada", () => {
    const label = dateRangeLabel([
      new Date("2026-11-05T12:00:00.000Z"),
      new Date("2026-10-20T08:00:00.000Z"),
      new Date("2026-10-28T08:00:00.000Z"),
    ]);
    expect(label).toBe("2026-10-20 a 2026-11-05");
  });

  it("lista vazia devolve um traço", () => {
    expect(dateRangeLabel([])).toBe("—");
  });

  it("uma data só devolve a mesma data nos dois lados", () => {
    expect(dateRangeLabel([new Date("2026-10-20T08:00:00.000Z")])).toBe("2026-10-20 a 2026-10-20");
  });
});
