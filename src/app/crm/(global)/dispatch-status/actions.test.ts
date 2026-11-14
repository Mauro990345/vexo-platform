import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const cancelPendingFollowUpMock = vi.fn();
vi.mock("@/lib/follow-up", () => ({
  cancelPendingFollowUp: (...args: unknown[]) => cancelPendingFollowUpMock(...args),
}));

const messageFindUniqueMock = vi.fn();
const messageUpdateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findUnique: (...args: unknown[]) => messageFindUniqueMock(...args),
      update: (...args: unknown[]) => messageUpdateMock(...args),
    },
  },
}));

import { resendFailedMessageAction } from "./actions";

const NOW = new Date("2026-11-14T12:00:00Z");

function buildFailedMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "msg-1",
    status: "FAILED",
    conversation: { clinicId: "clinic-1", lastLeadMessageAt: new Date(NOW.getTime() - 60 * 60 * 1000) }, // 1h atrás
    ...overrides,
  };
}

// Pedido explícito: depois de reconectar o Instagram (token vencido),
// reenviar uma mensagem que falhou — só dentro da janela de 24h da Meta
// desde a última mensagem do lead (ver canResendFailedMessage, dispatch.ts).
describe("resendFailedMessageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    requireInternalSessionMock.mockResolvedValue({});
  });

  it("mensagem FAILED, dentro da janela de 24h: volta pra PENDING com scheduledFor=agora e limpa failReason", async () => {
    messageFindUniqueMock.mockResolvedValue(buildFailedMessage());

    await resendFailedMessageAction("msg-1", "clinic-1");

    expect(messageUpdateMock).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: { status: "PENDING", scheduledFor: NOW, failReason: null },
    });
  });

  it("fora da janela de 24h (lead não responde há mais de 1 dia): NÃO reenvia", async () => {
    messageFindUniqueMock.mockResolvedValue(
      buildFailedMessage({ conversation: { clinicId: "clinic-1", lastLeadMessageAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000) } })
    );

    await resendFailedMessageAction("msg-1", "clinic-1");

    expect(messageUpdateMock).not.toHaveBeenCalled();
  });

  it("mensagem de outra clínica (clinicId não bate): NÃO reenvia — nunca confia só no id da mensagem vindo do form", async () => {
    messageFindUniqueMock.mockResolvedValue(buildFailedMessage({ conversation: { clinicId: "outra-clinica", lastLeadMessageAt: NOW } }));

    await resendFailedMessageAction("msg-1", "clinic-1");

    expect(messageUpdateMock).not.toHaveBeenCalled();
  });

  it("mensagem não está mais FAILED (já foi reenviada/resolvida por outro caminho): NÃO reenvia de novo", async () => {
    messageFindUniqueMock.mockResolvedValue(buildFailedMessage({ status: "SENT" }));

    await resendFailedMessageAction("msg-1", "clinic-1");

    expect(messageUpdateMock).not.toHaveBeenCalled();
  });

  it("mensagem inexistente: não lança, só não faz nada", async () => {
    messageFindUniqueMock.mockResolvedValue(null);

    await expect(resendFailedMessageAction("msg-inexistente", "clinic-1")).resolves.toBeUndefined();
    expect(messageUpdateMock).not.toHaveBeenCalled();
  });

  it("exige sessão interna antes de tocar no banco", async () => {
    requireInternalSessionMock.mockRejectedValue(new Error("não autenticado"));

    await expect(resendFailedMessageAction("msg-1", "clinic-1")).rejects.toThrow("não autenticado");
    expect(messageFindUniqueMock).not.toHaveBeenCalled();
  });
});
