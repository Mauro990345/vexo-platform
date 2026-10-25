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
const ensureLeadFirstNameFromInstagramMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  sendInstagramMessage: (...args: unknown[]) => sendInstagramMessageMock(...args),
  ensureLeadFirstNameFromInstagram: (...args: unknown[]) => ensureLeadFirstNameFromInstagramMock(...args),
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
    // undefined (nome desconhecido) por padrão — testes que precisam de um
    // nome resolvido configuram isto explicitamente.
    ensureLeadFirstNameFromInstagramMock.mockResolvedValue(undefined);
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

// Bug real reportado (mesma causa do bug da Reativação): texto customizado
// de lembrete (ReminderConfig.firstMessageTemplate) com {{primeiro_nome}}
// saía literal quando o lead não tinha nome salvo.
describe("processReminders — template customizado com {{primeiro_nome}}/{{data_horario}}", () => {
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

  it("nome resolvido ao vivo (ensureLeadFirstNameFromInstagram): renderiza o template customizado com o nome", async () => {
    ensureLeadFirstNameFromInstagramMock.mockResolvedValue("Maria Lima");
    const appt = buildAppointment({
      clinic: {
        reminderConfig: { firstMessageTemplate: "Oi, {{primeiro_nome}}! Nos vemos {{data_horario}}.", secondMessageTemplate: null, hoursBefore: [24, 3] },
        instagramAccount: { accessTokenEnc: "enc-token", igUserId: "ig-user-1" },
      },
    });
    appointmentFindManyMock.mockResolvedValue([appt]);

    await processReminders();

    const [sentPayload] = sendInstagramMessageMock.mock.calls[0] as [{ text: string }];
    expect(sentPayload.text).toContain("Oi, Maria!");
    expect(sentPayload.text).not.toMatch(/\{\{/);
  });

  it("nome desconhecido (API não devolve nome): remove a variável do template customizado com limpeza, nunca literal", async () => {
    ensureLeadFirstNameFromInstagramMock.mockResolvedValue(undefined);
    const appt = buildAppointment({
      lead: { ...buildAppointment().lead, name: null },
      clinic: {
        reminderConfig: { firstMessageTemplate: "Oi, {{primeiro_nome}}! Passando para lembrar.", secondMessageTemplate: null, hoursBefore: [24, 3] },
        instagramAccount: { accessTokenEnc: "enc-token", igUserId: "ig-user-1" },
      },
    });
    appointmentFindManyMock.mockResolvedValue([appt]);

    await processReminders();

    const [sentPayload] = sendInstagramMessageMock.mock.calls[0] as [{ text: string }];
    expect(sentPayload.text).toBe("Oi! Passando para lembrar.");
    expect(sentPayload.text).not.toMatch(/\{\{/);
  });

  it("resolve o nome no máximo uma vez por agendamento, mesmo com 1º e 2º lembrete devidos no mesmo ciclo", async () => {
    ensureLeadFirstNameFromInstagramMock.mockResolvedValue("Maria Lima");
    const appt = buildAppointment({
      // scheduledAt a 3h de NOW (bate o gatilho dos DOIS lembretes padrão
      // ao mesmo tempo: 24h já passou do trigger, 3h também).
      scheduledAt: new Date(NOW.getTime() + 3 * 60 * 60 * 1000),
      clinic: {
        reminderConfig: null,
        instagramAccount: { accessTokenEnc: "enc-token", igUserId: "ig-user-1" },
      },
    });
    appointmentFindManyMock.mockResolvedValue([appt]);

    const result = await processReminders();

    expect(result.sent).toBe(2);
    expect(ensureLeadFirstNameFromInstagramMock).toHaveBeenCalledTimes(1);
  });
});
