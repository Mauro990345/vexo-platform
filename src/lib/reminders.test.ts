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

const sendWhatsappMessageMock = vi.fn();
vi.mock("@/lib/whatsapp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp")>("@/lib/whatsapp");
  return {
    // formatReminderMessage/applyReminderTemplate são puras (sem I/O) —
    // mantidas reais, igual ao padrão já usado em dispatch.test.ts pras
    // constantes de delay de conversation-pipeline.
    formatReminderMessage: actual.formatReminderMessage,
    applyReminderTemplate: actual.applyReminderTemplate,
    sendWhatsappMessage: (...args: unknown[]) => sendWhatsappMessageMock(...args),
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
      whatsappInstanceName: "clinica-demo",
      remindersWhatsappEnabled: false,
      reminderConfig: null,
      instagramAccount: { accessTokenEnc: "enc-token", igUserId: "ig-user-1" },
    },
    reminderLogs: [],
    ...overrides,
  };
}

// Interruptor por clínica (Clinic.remindersWhatsappEnabled, padrão
// desligado) — pedido explícito: desligado não pode pular o lembrete em
// silêncio, só trocar o canal pro fallback de sempre (Instagram), igual
// já acontecia quando faltava telefone/instância antes deste interruptor
// existir.
describe("processReminders — interruptor remindersWhatsappEnabled por clínica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    sendWhatsappMessageMock.mockResolvedValue(undefined);
    sendInstagramMessageMock.mockResolvedValue({ messageId: "ig-msg-1" });
    reminderLogCreateMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("desligado (padrão): mesmo com telefone e WhatsApp conectado, cai pro fallback do Instagram — não pula o lembrete em silêncio", async () => {
    const appt = buildAppointment();
    appointmentFindManyMock.mockResolvedValue([appt]);

    const result = await processReminders();

    expect(result.sent).toBe(1);
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
    expect(sendInstagramMessageMock).toHaveBeenCalledTimes(1);
    expect(reminderLogCreateMock).toHaveBeenCalledWith({
      data: { appointmentId: "appt-1", hoursBefore: 24, channel: "instagram" },
    });
  });

  it("desligado e sem Instagram conectado: não envia nada e não registra (tentado de novo no próximo ciclo, sem reminderLog)", async () => {
    const appt = buildAppointment({
      clinic: { ...buildAppointment().clinic, instagramAccount: null },
    });
    appointmentFindManyMock.mockResolvedValue([appt]);

    const result = await processReminders();

    expect(result.sent).toBe(0);
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(reminderLogCreateMock).not.toHaveBeenCalled();
  });

  it("ligado: com telefone e WhatsApp conectado, envia por WhatsApp (não Instagram)", async () => {
    const appt = buildAppointment({
      clinic: { ...buildAppointment().clinic, remindersWhatsappEnabled: true },
    });
    appointmentFindManyMock.mockResolvedValue([appt]);

    const result = await processReminders();

    expect(result.sent).toBe(1);
    expect(sendWhatsappMessageMock).toHaveBeenCalledTimes(1);
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(reminderLogCreateMock).toHaveBeenCalledWith({
      data: { appointmentId: "appt-1", hoursBefore: 24, channel: "whatsapp" },
    });
  });

  it("ligado mas sem WhatsApp conectado (whatsappInstanceName null): cai pro Instagram mesmo assim", async () => {
    const appt = buildAppointment({
      clinic: { ...buildAppointment().clinic, remindersWhatsappEnabled: true, whatsappInstanceName: null },
    });
    appointmentFindManyMock.mockResolvedValue([appt]);

    const result = await processReminders();

    expect(result.sent).toBe(1);
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
    expect(sendInstagramMessageMock).toHaveBeenCalledTimes(1);
  });

  it("ligado mas sem telefone do lead: cai pro Instagram mesmo assim", async () => {
    const appt = buildAppointment({
      lead: { ...buildAppointment().lead, phone: null },
      clinic: { ...buildAppointment().clinic, remindersWhatsappEnabled: true },
    });
    appointmentFindManyMock.mockResolvedValue([appt]);

    const result = await processReminders();

    expect(result.sent).toBe(1);
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
    expect(sendInstagramMessageMock).toHaveBeenCalledTimes(1);
  });
});
