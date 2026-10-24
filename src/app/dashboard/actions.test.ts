import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { appointment: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

const requireClientSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireClientSession: (...args: unknown[]) => requireClientSessionMock(...args),
}));

const setAppointmentAttendanceMock = vi.fn();
vi.mock("@/lib/appointments", () => ({
  setAppointmentAttendance: (...args: unknown[]) => setAppointmentAttendanceMock(...args),
}));

const toggleReactivationCardSentMock = vi.fn();
const sendReactivationWhatsAppMessageMock = vi.fn();
vi.mock("@/lib/reactivation", () => ({
  toggleReactivationCardSent: (...args: unknown[]) => toggleReactivationCardSentMock(...args),
  sendReactivationWhatsAppMessage: (...args: unknown[]) => sendReactivationWhatsAppMessageMock(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { toggleReactivationCardSentClientAction, sendReactivationWhatsAppMessageClientAction } from "./actions";

// Pedido explícito (item 5): a sessão CLIENT só pode marcar/desmarcar os
// cards da PRÓPRIA clínica — mesmo padrão já usado por
// setAppointmentAttendanceClientAction (ver dashboard/actions.ts).
describe("toggleReactivationCardSentClientAction", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    requireClientSessionMock.mockReset();
    toggleReactivationCardSentMock.mockReset();
  });

  it("agendamento da PRÓPRIA clínica: chama toggleReactivationCardSent normalmente", async () => {
    requireClientSessionMock.mockResolvedValue({ user: { clinicId: "clinic-1" } });
    findUniqueMock.mockResolvedValue({ clinicId: "clinic-1" });
    toggleReactivationCardSentMock.mockResolvedValue({ clinicId: "clinic-1", sentAt: new Date() });

    await toggleReactivationCardSentClientAction("appt-1", 30);

    expect(toggleReactivationCardSentMock).toHaveBeenCalledWith("appt-1", 30);
  });

  it("agendamento de OUTRA clínica: lança erro, nunca chega a chamar toggleReactivationCardSent", async () => {
    requireClientSessionMock.mockResolvedValue({ user: { clinicId: "clinic-1" } });
    findUniqueMock.mockResolvedValue({ clinicId: "clinic-OUTRA" });

    await expect(toggleReactivationCardSentClientAction("appt-1", 30)).rejects.toThrow();
    expect(toggleReactivationCardSentMock).not.toHaveBeenCalled();
  });

  it("agendamento inexistente: lança erro, nunca chama toggleReactivationCardSent", async () => {
    requireClientSessionMock.mockResolvedValue({ user: { clinicId: "clinic-1" } });
    findUniqueMock.mockResolvedValue(null);

    await expect(toggleReactivationCardSentClientAction("appt-inexistente", 30)).rejects.toThrow();
    expect(toggleReactivationCardSentMock).not.toHaveBeenCalled();
  });
});

// Mesmo padrão de permissão por clínica, agora pro ENVIO de verdade do
// WhatsApp (pedido explícito, item 5).
describe("sendReactivationWhatsAppMessageClientAction", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    requireClientSessionMock.mockReset();
    sendReactivationWhatsAppMessageMock.mockReset();
  });

  it("agendamento da PRÓPRIA clínica: chama sendReactivationWhatsAppMessage e devolve o resultado", async () => {
    requireClientSessionMock.mockResolvedValue({ user: { clinicId: "clinic-1" } });
    findUniqueMock.mockResolvedValue({ clinicId: "clinic-1" });
    sendReactivationWhatsAppMessageMock.mockResolvedValue({ ok: true, alreadySent: false, clinicId: "clinic-1" });

    const result = await sendReactivationWhatsAppMessageClientAction("appt-1", 90);

    expect(sendReactivationWhatsAppMessageMock).toHaveBeenCalledWith("appt-1", 90);
    expect(result).toEqual({ ok: true, alreadySent: false, clinicId: "clinic-1" });
  });

  it("agendamento de OUTRA clínica: lança erro, nunca chega a chamar sendReactivationWhatsAppMessage", async () => {
    requireClientSessionMock.mockResolvedValue({ user: { clinicId: "clinic-1" } });
    findUniqueMock.mockResolvedValue({ clinicId: "clinic-OUTRA" });

    await expect(sendReactivationWhatsAppMessageClientAction("appt-1", 90)).rejects.toThrow();
    expect(sendReactivationWhatsAppMessageMock).not.toHaveBeenCalled();
  });

  it("agendamento inexistente: lança erro, nunca chama sendReactivationWhatsAppMessage", async () => {
    requireClientSessionMock.mockResolvedValue({ user: { clinicId: "clinic-1" } });
    findUniqueMock.mockResolvedValue(null);

    await expect(sendReactivationWhatsAppMessageClientAction("appt-inexistente", 90)).rejects.toThrow();
    expect(sendReactivationWhatsAppMessageMock).not.toHaveBeenCalled();
  });
});
