import { describe, it, expect, vi, beforeEach } from "vitest";

const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const toggleReactivationCardSentMock = vi.fn();
vi.mock("@/lib/reactivation", () => ({
  toggleReactivationCardSent: (...args: unknown[]) => toggleReactivationCardSentMock(...args),
  isValidReactivationThresholdDays: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { toggleReactivationCardSentAction } from "./actions";

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
