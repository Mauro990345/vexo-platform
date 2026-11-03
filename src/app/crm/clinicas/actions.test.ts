import { describe, it, expect, vi, beforeEach } from "vitest";

const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const toggleReactivationCardSentMock = vi.fn();
const sendReactivationWhatsAppMessageMock = vi.fn();
vi.mock("@/lib/reactivation", () => ({
  toggleReactivationCardSent: (...args: unknown[]) => toggleReactivationCardSentMock(...args),
  sendReactivationWhatsAppMessage: (...args: unknown[]) => sendReactivationWhatsAppMessageMock(...args),
  isValidReturnPeriodDays: () => true,
}));

const clinicFindUniqueMock = vi.fn();
const clinicCreateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      findUnique: (...args: unknown[]) => clinicFindUniqueMock(...args),
      create: (...args: unknown[]) => clinicCreateMock(...args),
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { toggleReactivationCardSentAction, sendReactivationWhatsAppMessageAction, createClinic } from "./actions";

// Pedido explícito (item 5): sessão INTERNAL_ADMIN/STAFF pode marcar os
// cards de QUALQUER clínica — sem a validação de clinicId que a versão
// CLIENT tem (ver toggleReactivationCardSentClientAction,
// dashboard/actions.test.ts) — só precisa de sessão interna.
describe("toggleReactivationCardSentAction", () => {
  beforeEach(() => {
    requireInternalSessionMock.mockReset();
    toggleReactivationCardSentMock.mockReset();
  });

  it("sessão interna: chama toggleReactivationCardSent sem checar a clínica dele mesmo", async () => {
    requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
    toggleReactivationCardSentMock.mockResolvedValue({ clinicId: "qualquer-clinica", sentAt: new Date() });

    await toggleReactivationCardSentAction("appt-1", 30);

    expect(toggleReactivationCardSentMock).toHaveBeenCalledWith("appt-1", 30);
  });

  it("sem sessão interna válida: requireInternalSession rejeita, nunca chega a chamar toggleReactivationCardSent", async () => {
    requireInternalSessionMock.mockRejectedValue(new Error("sem sessão"));

    await expect(toggleReactivationCardSentAction("appt-1", 30)).rejects.toThrow();
    expect(toggleReactivationCardSentMock).not.toHaveBeenCalled();
  });
});

// Mesmo padrão de permissão — ENVIO de verdade do WhatsApp, sessão
// interna pode mandar pelo card de qualquer clínica (pedido explícito).
describe("sendReactivationWhatsAppMessageAction", () => {
  beforeEach(() => {
    requireInternalSessionMock.mockReset();
    sendReactivationWhatsAppMessageMock.mockReset();
  });

  it("sessão interna: chama sendReactivationWhatsAppMessage sem checar a clínica dele mesmo, e devolve o resultado", async () => {
    requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
    sendReactivationWhatsAppMessageMock.mockResolvedValue({ ok: true, alreadySent: false, clinicId: "qualquer-clinica" });

    const result = await sendReactivationWhatsAppMessageAction("appt-1", 90);

    expect(sendReactivationWhatsAppMessageMock).toHaveBeenCalledWith("appt-1", 90);
    expect(result).toEqual({ ok: true, alreadySent: false, clinicId: "qualquer-clinica" });
  });

  it("sem sessão interna válida: requireInternalSession rejeita, nunca chega a chamar sendReactivationWhatsAppMessage", async () => {
    requireInternalSessionMock.mockRejectedValue(new Error("sem sessão"));

    await expect(sendReactivationWhatsAppMessageAction("appt-1", 90)).rejects.toThrow();
    expect(sendReactivationWhatsAppMessageMock).not.toHaveBeenCalled();
  });
});

function newClinicForm(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

// Snapshot opcional ao criar clínica (pedido explícito, item 1) — ver
// comentário grande em createClinic, actions.ts, pra lista completa do
// que é/não é copiado.
describe("createClinic — snapshot opcional (\"Copiar configurações de:\")", () => {
  beforeEach(() => {
    requireInternalSessionMock.mockReset();
    clinicFindUniqueMock.mockReset();
    clinicCreateMock.mockReset();
    requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
    clinicCreateMock.mockResolvedValue({ id: "clinic-new" });
  });

  it('sem "copyFromClinicId" (padrão "Nenhuma"): nasce só com o default de sempre, nunca consulta outra clínica', async () => {
    await createClinic(newClinicForm({ name: "Clínica Nova" }));

    expect(clinicFindUniqueMock).not.toHaveBeenCalled();
    const data = clinicCreateMock.mock.calls[0]![0].data;
    expect(data.reminderConfig).toEqual({ create: { hoursBefore: [24, 3] } });
    expect(data.aiSystemPrompt).toBeUndefined();
    expect(data.firstBandDelaySeconds).toBeUndefined();
    expect(data.reactivationConfig).toBeUndefined();
    expect(data.hotLeadConfig).toBeUndefined();
  });

  it("com origem preenchida: copia prompt, delay, lembretes, prazos de retorno e os dois limites diários", async () => {
    clinicFindUniqueMock.mockResolvedValue({
      aiSystemPrompt: "Prompt da clínica origem",
      firstBandDelaySeconds: 20,
      reminderConfig: { hoursBefore: [48, 6], firstMessageTemplate: "Lembrete 1", secondMessageTemplate: "Lembrete 2" },
      reactivationConfig: { availablePeriods: [30, 60, 90], defaultPeriods: [30], dailyWhatsappLimit: 25 },
      hotLeadConfig: { dailyLimit: 8 },
    });

    await createClinic(newClinicForm({ name: "Clínica Nova", copyFromClinicId: "clinic-origem" }));

    expect(clinicFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "clinic-origem" } }));
    const data = clinicCreateMock.mock.calls[0]![0].data;
    expect(data.aiSystemPrompt).toBe("Prompt da clínica origem");
    expect(data.firstBandDelaySeconds).toBe(20);
    expect(data.reminderConfig).toEqual({
      create: { hoursBefore: [48, 6], firstMessageTemplate: "Lembrete 1", secondMessageTemplate: "Lembrete 2" },
    });
    expect(data.reactivationConfig).toEqual({
      create: { availablePeriods: [30, 60, 90], defaultPeriods: [30], dailyWhatsappLimit: 25 },
    });
    expect(data.hotLeadConfig).toEqual({ create: { dailyLimit: 8 } });
  });

  it("nunca copia dado específico, conexão/credencial ou contador de rotação — só os campos explicitamente selecionados chegam no create", async () => {
    clinicFindUniqueMock.mockResolvedValue({
      aiSystemPrompt: "Prompt",
      firstBandDelaySeconds: 20,
      reminderConfig: { hoursBefore: [24, 3], firstMessageTemplate: null, secondMessageTemplate: null },
      reactivationConfig: { availablePeriods: [30], defaultPeriods: [30], dailyWhatsappLimit: 15 },
      hotLeadConfig: { dailyLimit: 5 },
    });

    await createClinic(newClinicForm({ name: "Clínica Nova", address: "Rua X, 123", copyFromClinicId: "clinic-origem" }));

    // A consulta à origem só pediu (select) os campos copiáveis — nem
    // address/aiSystemPrompt de outro lead/confirmationVideoUrl/
    // whatsappInstanceName/sequenceCounter/message1-5 entram no select,
    // então fisicamente não têm como vazar pro create.
    const selectedFields = clinicFindUniqueMock.mock.calls[0]![0].select;
    expect(Object.keys(selectedFields)).toEqual([
      "aiSystemPrompt",
      "firstBandDelaySeconds",
      "reminderConfig",
      "reactivationConfig",
      "hotLeadConfig",
    ]);
    expect(selectedFields.reactivationConfig.select).toEqual({ availablePeriods: true, defaultPeriods: true, dailyWhatsappLimit: true });
    expect(selectedFields.hotLeadConfig.select).toEqual({ dailyLimit: true });

    const data = clinicCreateMock.mock.calls[0]![0].data;
    expect(data.address).toBe("Rua X, 123"); // vem do FORM desta clínica, não da origem
    expect(data.whatsappInstanceName).toBe(data.slug); // sempre da clínica NOVA, nunca da origem
  });

  it("origem sem reactivationConfig/hotLeadConfig salvos ainda: não cria essas linhas (mesmo comportamento de sem origem)", async () => {
    clinicFindUniqueMock.mockResolvedValue({
      aiSystemPrompt: null,
      firstBandDelaySeconds: 45,
      reminderConfig: null,
      reactivationConfig: null,
      hotLeadConfig: null,
    });

    await createClinic(newClinicForm({ name: "Clínica Nova", copyFromClinicId: "clinic-origem" }));

    const data = clinicCreateMock.mock.calls[0]![0].data;
    expect(data.reminderConfig).toEqual({ create: { hoursBefore: [24, 3] } });
    expect(data.reactivationConfig).toBeUndefined();
    expect(data.hotLeadConfig).toBeUndefined();
    expect(data.aiSystemPrompt).toBeUndefined();
  });

  it("clínica de origem não existe mais (corrida rara): cai no comportamento padrão, sem erro", async () => {
    clinicFindUniqueMock.mockResolvedValue(null);

    await expect(createClinic(newClinicForm({ name: "Clínica Nova", copyFromClinicId: "clinic-sumiu" }))).resolves.not.toThrow();

    const data = clinicCreateMock.mock.calls[0]![0].data;
    expect(data.reminderConfig).toEqual({ create: { hoursBefore: [24, 3] } });
    expect(data.reactivationConfig).toBeUndefined();
  });

  it("nome em branco: lança erro antes de consultar ou criar qualquer coisa", async () => {
    await expect(createClinic(newClinicForm({ name: "   " }))).rejects.toThrow("Nome da clínica é obrigatório.");
    expect(clinicFindUniqueMock).not.toHaveBeenCalled();
    expect(clinicCreateMock).not.toHaveBeenCalled();
  });
});
