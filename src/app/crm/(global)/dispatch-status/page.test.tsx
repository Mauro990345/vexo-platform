import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Pedido explícito: botão "Descartar" ao lado de cada mensagem em
// "Mensagens que falharam ao enviar" (página GLOBAL) — marca dismissedAt
// sem apagar nada; a query de recentFailed passa a filtrar dismissedAt:
// null (nunca mais lista/conta uma descartada).
vi.mock("@/lib/session", () => ({ requireInternalSession: vi.fn(async () => ({})) }));
vi.mock("@/lib/follow-up", () => ({ getSilenceHours: vi.fn(async () => 6) }));
vi.mock("./actions", () => ({ closeStuckFollowUpLogAction: vi.fn(), dismissFailedMessageAction: vi.fn() }));

const messageFindManyMock = vi.fn();
const conversationFindManyMock = vi.fn();
const followUpLogFindManyMock = vi.fn();
const followUpStepCountMock = vi.fn();
const followUpSettingsFindUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { findMany: (...args: unknown[]) => messageFindManyMock(...args) },
    conversation: { findMany: (...args: unknown[]) => conversationFindManyMock(...args) },
    followUpLog: { findMany: (...args: unknown[]) => followUpLogFindManyMock(...args) },
    followUpStep: { count: (...args: unknown[]) => followUpStepCountMock(...args) },
    followUpSettings: { findUnique: (...args: unknown[]) => followUpSettingsFindUniqueMock(...args) },
  },
}));

function failedMessage() {
  return {
    id: "msg-1",
    content: "Oi, tudo bem?",
    createdAt: new Date("2026-11-20T10:00:00Z"),
    failReason: "token expirado",
    conversationId: "conv-1",
    conversation: { clinic: { name: "Clínica Demo" }, lead: { name: "Fulano", igUsername: "fulano.ig" } },
  };
}

describe("DispatchStatusPage — botão Descartar nas falhas (página global)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationFindManyMock.mockResolvedValue([]);
    followUpLogFindManyMock.mockResolvedValue([]);
    followUpStepCountMock.mockResolvedValue(0);
    followUpSettingsFindUniqueMock.mockResolvedValue(null);
  });

  it("consulta recentFailed com dismissedAt: null (nunca mostra/conta uma descartada)", async () => {
    messageFindManyMock.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ("status" in args.where && args.where.status === "FAILED") return [failedMessage()];
      return [];
    });
    const { default: DispatchStatusPage } = await import("./page");
    await DispatchStatusPage();

    const failedCall = messageFindManyMock.mock.calls.find(([args]) => (args.where as Record<string, unknown>).status === "FAILED");
    expect(failedCall![0].where).toEqual({ status: "FAILED", dismissedAt: null });
  });

  it("mostra o botão 'Descartar' ao lado de cada mensagem falhada", async () => {
    messageFindManyMock.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ("status" in args.where && args.where.status === "FAILED") return [failedMessage()];
      return [];
    });
    const { default: DispatchStatusPage } = await import("./page");
    const markup = renderToStaticMarkup(await DispatchStatusPage());

    expect(markup).toContain(">Descartar<");
  });
});
