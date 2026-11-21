import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Pedido explícito: botão "Descartar" sempre visível ao lado de
// "Reenviar"/"Fora da janela" em "Falharam ao enviar" (aba Status de
// UMA clínica) — a query de recentFailed passa a filtrar
// dismissedAt: null (nunca mais lista/conta uma descartada desta clínica).
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireInternalSession: vi.fn(async () => ({})) }));
vi.mock("@/lib/follow-up", () => ({ getSilenceHours: vi.fn(async () => 6) }));
vi.mock("@/lib/evolution-diagnostics", () => ({
  runEvolutionDiagnostics: vi.fn(async () => ({ apiUrlError: "não configurada neste ambiente" })),
}));
vi.mock("@/app/crm/(global)/dispatch-status/actions", () => ({
  closeStuckFollowUpLogForClinicAction: vi.fn(),
  resendFailedMessageAction: vi.fn(),
  dismissFailedMessageForClinicAction: vi.fn(),
}));

const clinicFindUniqueMock = vi.fn();
const messageFindManyMock = vi.fn();
const conversationFindManyMock = vi.fn();
const followUpLogFindManyMock = vi.fn();
const followUpStepCountMock = vi.fn();
const followUpSettingsFindUniqueMock = vi.fn();
const webhookLogFindManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: { findUnique: (...args: unknown[]) => clinicFindUniqueMock(...args) },
    message: { findMany: (...args: unknown[]) => messageFindManyMock(...args) },
    conversation: { findMany: (...args: unknown[]) => conversationFindManyMock(...args) },
    followUpLog: { findMany: (...args: unknown[]) => followUpLogFindManyMock(...args) },
    followUpStep: { count: (...args: unknown[]) => followUpStepCountMock(...args) },
    followUpSettings: { findUnique: (...args: unknown[]) => followUpSettingsFindUniqueMock(...args) },
    webhookLog: { findMany: (...args: unknown[]) => webhookLogFindManyMock(...args) },
  },
}));

function failedMessage() {
  return {
    id: "msg-1",
    content: "Oi, tudo bem?",
    createdAt: new Date("2026-11-20T10:00:00Z"),
    failReason: "token expirado",
    conversationId: "conv-1",
    conversation: { lead: { name: "Fulano", igUsername: "fulano.ig" }, lastLeadMessageAt: new Date(Date.now() - 60 * 60 * 1000) },
  };
}

describe("ClinicStatusPage — botão Descartar nas falhas (aba Status de UMA clínica)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clinicFindUniqueMock.mockResolvedValue({ id: "clinic-1", whatsappInstanceName: null, instagramAccount: null });
    conversationFindManyMock.mockResolvedValue([]);
    followUpLogFindManyMock.mockResolvedValue([]);
    followUpStepCountMock.mockResolvedValue(0);
    followUpSettingsFindUniqueMock.mockResolvedValue(null);
    webhookLogFindManyMock.mockResolvedValue([]);
  });

  it("consulta recentFailed com dismissedAt: null, filtrado por esta clínica", async () => {
    messageFindManyMock.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ("status" in args.where && args.where.status === "FAILED") return [failedMessage()];
      return [];
    });
    const { default: ClinicStatusPage } = await import("./page");
    await ClinicStatusPage({ params: { id: "clinic-1" } });

    const failedCall = messageFindManyMock.mock.calls.find(([args]) => (args.where as Record<string, unknown>).status === "FAILED");
    expect(failedCall![0].where).toEqual({
      status: "FAILED",
      dismissedAt: null,
      conversation: { clinicId: "clinic-1" },
    });
  });

  it("mostra o botão 'Descartar' sempre, ao lado de 'Reenviar'", async () => {
    messageFindManyMock.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ("status" in args.where && args.where.status === "FAILED") return [failedMessage()];
      return [];
    });
    const { default: ClinicStatusPage } = await import("./page");
    const markup = renderToStaticMarkup(await ClinicStatusPage({ params: { id: "clinic-1" } }));

    expect(markup).toContain(">Descartar<");
    expect(markup).toContain(">Reenviar<");
  });

  it("mostra 'Descartar' também quando fora da janela de 24h (sem 'Reenviar')", async () => {
    messageFindManyMock.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ("status" in args.where && args.where.status === "FAILED") {
        const m = failedMessage();
        return [{ ...m, conversation: { ...m.conversation, lastLeadMessageAt: new Date("2026-01-01T00:00:00Z") } }];
      }
      return [];
    });
    const { default: ClinicStatusPage } = await import("./page");
    const markup = renderToStaticMarkup(await ClinicStatusPage({ params: { id: "clinic-1" } }));

    expect(markup).toContain(">Descartar<");
    expect(markup).not.toContain(">Reenviar<");
    expect(markup).toContain("Fora da janela de 24h da Meta");
  });
});
