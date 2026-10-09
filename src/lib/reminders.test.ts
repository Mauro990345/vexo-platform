import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mocks minimalistas — mesmo padrão de dispatch.test.ts: só as peças que
// processReminders realmente usa recebem implementação de verdade.
const appointmentFindManyMock = vi.fn();
const reminderLogCreateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: { findMany: (...args: unknown[]) => appointmentFindManyMock(...args) },
    reminderLog: { create: (...args: unknown[]) => reminderLogCreateMock(...args) },
  },
}));

vi.mock("@/lib/whatsapp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp")>("@/lib/whatsapp");
  return {
    // formatReminderMessage/applyReminderTemplate são puras (sem I/O) —
    // mantidas reais, igual ao padrão já usado em dispatch.test.ts pras
    // constantes de delay de conversation-pipeline. sendWhatsappMessage
    // não é importada por reminders.ts (regra de produto: lembrete nunca
    // sai por WhatsApp) — nem precisa de mock aqui.
    formatReminderMessage: actual.formatReminderMessage,
    applyReminderTemplate: actual.applyReminderTemplate,
  };
});

const sendInstagramMessageMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  sendInstagramMessage: (...args: unknown[]) => sendInstagramMessageMock(...args),
}));

import { processReminders } from "@/lib/reminders";

const NOW = new Date("2026-10-09T12:00:00.000Z");

// Agendamento daqui a exatamente 24h — bate o gatilho do 1º lembrete
// padrão (hoursBefore=24, ver DEFAULT em reminders.ts) no instante em que
// "agora" é NOW, sem precisar avançar relógio dentro do teste.
function buildAppointment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "appt-1",
    scheduledAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    lead: { name: "Maria Lima", phone: "21998223038", igScopedId: "ig-scoped-1" },
    clinic: {
      reminderConfig: null,
      instagramAccount: { accessTokenEnc: "enc-token", igUserId: "ig-user-1" },
    },
    reminderLogs: [],
    ...overrides,
  };
}

// Regra de produto: o WhatsApp da clínica serve só pra confirmação de
// agendamento (ver maybeSendWhatsappConfirmation, conversation-pipeline.ts)
// — lembrete SEMPRE por Instagram, nunca por WhatsApp, mesmo com telefone
// do lead salvo.
describe("processReminders — sempre por Instagram, nunca por WhatsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    sendInstagramMessageMock.mockResolvedValue({ messageId: "ig-msg-1" });
    reminderLogCreateMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("com telefone do lead salvo: ainda assim envia por Instagram, não por WhatsApp", async () => {
    const appt = buildAppointment();
    appointmentFindManyMock.mockResolvedValue([appt]);

    const result = await processReminders();

    expect(result.sent).toBe(1);
    expect(sendInstagramMessageMock).toHaveBeenCalledTimes(1);
    expect(reminderLogCreateMock).toHaveBeenCalledWith({
      data: { appointmentId: "appt-1", hoursBefore: 24, channel: "instagram" },
    });
  });

  it("sem Instagram conectado: não envia nada e não registra (tentado de novo no próximo ciclo, sem reminderLog)", async () => {
    const appt = buildAppointment({
      clinic: { ...buildAppointment().clinic, instagramAccount: null },
    });
    appointmentFindManyMock.mockResolvedValue([appt]);

    const result = await processReminders();

    expect(result.sent).toBe(0);
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(reminderLogCreateMock).not.toHaveBeenCalled();
  });

  it("sem telefone do lead: envia por Instagram mesmo assim (telefone nunca foi condição pro Instagram)", async () => {
    const appt = buildAppointment({
      lead: { ...buildAppointment().lead, phone: null },
    });
    appointmentFindManyMock.mockResolvedValue([appt]);

    const result = await processReminders();

    expect(result.sent).toBe(1);
    expect(sendInstagramMessageMock).toHaveBeenCalledTimes(1);
  });
});
