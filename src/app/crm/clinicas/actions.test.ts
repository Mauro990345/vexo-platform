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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { toggleReactivationCardSentAction, sendReactivationWhatsAppMessageAction } from "./actions";

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
