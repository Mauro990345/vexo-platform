import { describe, it, expect, vi, beforeEach } from "vitest";

const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const clinicFindUniqueMock = vi.fn();
const configFindUniqueMock = vi.fn();
const configFindManyMock = vi.fn();
const configUpsertMock = vi.fn();
const deliveryFindFirstMock = vi.fn();
const deliveryUpdateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: { findUnique: (...args: unknown[]) => clinicFindUniqueMock(...args) },
    clinicReportConfig: {
      findUnique: (...args: unknown[]) => configFindUniqueMock(...args),
      findMany: (...args: unknown[]) => configFindManyMock(...args),
      upsert: (...args: unknown[]) => configUpsertMock(...args),
    },
    clinicReportDelivery: {
      findFirst: (...args: unknown[]) => deliveryFindFirstMock(...args),
      update: (...args: unknown[]) => deliveryUpdateMock(...args),
    },
  },
}));

const sendClinicReportDeliveryMock = vi.fn();
vi.mock("@/lib/clinic-reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clinic-reports")>();
  return { ...actual, sendClinicReportDelivery: sendClinicReportDeliveryMock };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  updateClinicReportConfig,
  sendClinicReportNow,
  regenerateClinicReportLink,
  revokeClinicReportLink,
  getClinicReportRowSummaries,
  getClinicReportPanelData,
} = await import("./report-actions");

const CLIENT_SESSION_REDIRECT = new Error("NEXT_REDIRECT /dashboard"); // mesmo espírito de redirect() do Next.js — nunca resolve

function validInput(overrides: Partial<Parameters<typeof updateClinicReportConfig>[1]> = {}) {
  return {
    whatsappNumber: "11988887777",
    frequency: "MONTHLY" as const,
    monthlyDayMode: "LAST_DAY" as const,
    monthlyFixedDay: null,
    sendHour: 17,
    sendMinute: 0,
    autoSendEnabled: false,
    ...overrides,
  };
}

describe("report-actions — bloqueio pra quem não é sessão interna (cliente logado nunca alcança a mutação)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalSessionMock.mockRejectedValue(CLIENT_SESSION_REDIRECT);
  });

  it("updateClinicReportConfig: nunca chega a tocar no banco", async () => {
    await expect(updateClinicReportConfig("clinic-1", validInput())).rejects.toThrow();
    expect(configUpsertMock).not.toHaveBeenCalled();
  });

  it("sendClinicReportNow: nunca chega a consultar config nem a enviar", async () => {
    await expect(sendClinicReportNow("clinic-1")).rejects.toThrow();
    expect(configFindUniqueMock).not.toHaveBeenCalled();
    expect(sendClinicReportDeliveryMock).not.toHaveBeenCalled();
  });

  it("regenerateClinicReportLink: nunca chega a trocar o token", async () => {
    await expect(regenerateClinicReportLink("delivery-1")).rejects.toThrow();
    expect(deliveryUpdateMock).not.toHaveBeenCalled();
  });

  it("revokeClinicReportLink: nunca chega a revogar", async () => {
    await expect(revokeClinicReportLink("delivery-1")).rejects.toThrow();
    expect(deliveryUpdateMock).not.toHaveBeenCalled();
  });

  it("getClinicReportRowSummaries: nunca chega a ler a config em lote", async () => {
    await expect(getClinicReportRowSummaries(["clinic-1"])).rejects.toThrow();
    expect(configFindManyMock).not.toHaveBeenCalled();
  });

  it("getClinicReportPanelData: nunca chega a ler config/histórico da clínica", async () => {
    await expect(getClinicReportPanelData("clinic-1")).rejects.toThrow();
    expect(configFindUniqueMock).not.toHaveBeenCalled();
    expect(deliveryFindFirstMock).not.toHaveBeenCalled();
  });
});

describe("updateClinicReportConfig — validação no servidor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
    clinicFindUniqueMock.mockResolvedValue({ clientWhatsappNumber: "11933334444" });
    configUpsertMock.mockResolvedValue({});
  });

  it("número em formato brasileiro inválido: recusa, nunca grava", async () => {
    const result = await updateClinicReportConfig("clinic-1", validInput({ whatsappNumber: "123" }));
    expect(result.ok).toBe(false);
    expect(configUpsertMock).not.toHaveBeenCalled();
  });

  it("número igual ao da conexão WhatsApp da própria clínica (autoenvio): recusa com mensagem clara, nunca grava", async () => {
    const result = await updateClinicReportConfig("clinic-1", validInput({ whatsappNumber: "11933334444" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("mandar uma mensagem pra si mesma");
    expect(configUpsertMock).not.toHaveBeenCalled();
  });

  it("mesmo número, formatação diferente (com 55/pontuação): o guard normaliza antes de comparar, ainda recusa", async () => {
    const result = await updateClinicReportConfig("clinic-1", validInput({ whatsappNumber: "+55 (11) 93333-4444" }));
    expect(result.ok).toBe(false);
    expect(configUpsertMock).not.toHaveBeenCalled();
  });

  it("dia fixo mensal fora de 1-28: recusa", async () => {
    const result = await updateClinicReportConfig("clinic-1", validInput({ monthlyDayMode: "FIXED_DAY", monthlyFixedDay: 29 }));
    expect(result.ok).toBe(false);
    expect(configUpsertMock).not.toHaveBeenCalled();
  });

  it("horário inválido (hora/minuto fora de faixa): recusa", async () => {
    const result = await updateClinicReportConfig("clinic-1", validInput({ sendHour: 24 }));
    expect(result.ok).toBe(false);
  });

  it("envio automático ligado sem número: recusa (padrão desligado até o número ser informado)", async () => {
    const result = await updateClinicReportConfig("clinic-1", validInput({ whatsappNumber: "", autoSendEnabled: true }));
    expect(result.ok).toBe(false);
    expect(configUpsertMock).not.toHaveBeenCalled();
  });

  it("entrada válida: grava com os campos normalizados", async () => {
    const result = await updateClinicReportConfig("clinic-1", validInput({ autoSendEnabled: true }));
    expect(result).toEqual({ ok: true });
    expect(configUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clinicId: "clinic-1" },
        update: expect.objectContaining({ whatsappNumber: "11988887777", autoSendEnabled: true }),
      })
    );
  });

  it("FIXED_DAY no mês: grava o dia; LAST_DAY: grava monthlyFixedDay null mesmo se o form mandou um valor", async () => {
    await updateClinicReportConfig("clinic-1", validInput({ monthlyDayMode: "LAST_DAY", monthlyFixedDay: 10 }));
    expect(configUpsertMock).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ monthlyFixedDay: null }) }));
  });
});

describe("sendClinicReportNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
  });

  it("sem configuração/número: recusa sem chamar o envio", async () => {
    configFindUniqueMock.mockResolvedValue(null);
    const result = await sendClinicReportNow("clinic-1");
    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(sendClinicReportDeliveryMock).not.toHaveBeenCalled();
  });

  it("delega para sendClinicReportDelivery com trigger MANUAL e o período ATUAL da frequência configurada", async () => {
    configFindUniqueMock.mockResolvedValue({ whatsappNumber: "11988887777", frequency: "MONTHLY" });
    sendClinicReportDeliveryMock.mockResolvedValue({ ok: true, alreadySent: false });

    const result = await sendClinicReportNow("clinic-1");

    expect(result).toEqual({ ok: true, alreadySent: false });
    expect(sendClinicReportDeliveryMock).toHaveBeenCalledWith(expect.objectContaining({ clinicId: "clinic-1", frequency: "MONTHLY", trigger: "MANUAL" }));
  });
});

describe("regenerateClinicReportLink / revokeClinicReportLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
  });

  it("regenerar: grava um token novo (nunca reaproveita) e devolve a URL pública", async () => {
    deliveryUpdateMock.mockResolvedValue({ token: "novo-token-123" });
    const result = await regenerateClinicReportLink("delivery-1");
    expect(result).toEqual({ ok: true, url: expect.stringContaining("novo-token-123") });
    const callArgs = deliveryUpdateMock.mock.calls[0]![0];
    expect(callArgs.where).toEqual({ id: "delivery-1" });
    expect(typeof callArgs.data.token).toBe("string");
    expect(callArgs.data.token.length).toBeGreaterThan(10);
  });

  it("revogar: grava token null — a rota pública nunca mais reconhece o link antigo", async () => {
    deliveryUpdateMock.mockResolvedValue({});
    const result = await revokeClinicReportLink("delivery-1");
    expect(result).toEqual({ ok: true });
    expect(deliveryUpdateMock).toHaveBeenCalledWith({ where: { id: "delivery-1" }, data: { token: null } });
  });
});

describe("getClinicReportRowSummaries — texto discreto 'Relatório · DD/MM' em lote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
  });

  it("lista vazia: não consulta o banco", async () => {
    const result = await getClinicReportRowSummaries([]);
    expect(result).toEqual({});
    expect(configFindManyMock).not.toHaveBeenCalled();
  });

  it("só inclui clínicas com autoSendEnabled=true (filtro já na query, não em memória)", async () => {
    configFindManyMock.mockResolvedValue([
      { clinicId: "clinic-1", frequency: "MONTHLY", monthlyDayMode: "LAST_DAY", monthlyFixedDay: null, sendHour: 17, sendMinute: 0 },
    ]);
    const result = await getClinicReportRowSummaries(["clinic-1", "clinic-2"]);

    expect(configFindManyMock).toHaveBeenCalledWith({ where: { clinicId: { in: ["clinic-1", "clinic-2"] }, autoSendEnabled: true } });
    expect(Object.keys(result)).toEqual(["clinic-1"]);
    expect(result["clinic-1"]!.autoSendEnabled).toBe(true);
    expect(result["clinic-1"]!.nextSendDateLabel).toMatch(/^\d{2}\/\d{2}$/);
  });
});
