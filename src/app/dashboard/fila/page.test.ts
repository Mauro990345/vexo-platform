import { describe, it, expect, vi, beforeEach } from "vitest";

// Fila do CLIENTE (segundo link de acesso, ver DESIGN.md) — mesmo padrão
// de teste da versão interna (crm/clinicas/[id]/abordagem/fila/page.test.ts),
// só que o clinicId SEMPRE vem da sessão (session.user.clinicId), nunca
// de um :id de rota.
const requireClientFilaSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireClientFilaSession: (...args: unknown[]) => requireClientFilaSessionMock(...args),
}));

const clinicFindUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinic: { findUnique: (...args: unknown[]) => clinicFindUniqueMock(...args) } },
}));

const getApproachBoardForClinicClientActionMock = vi.fn();
vi.mock("./actions", () => ({
  getApproachBoardForClinicClientAction: (...args: unknown[]) => getApproachBoardForClinicClientActionMock(...args),
  confirmApproachSendClientAction: vi.fn(),
  undoApproachSendClientAction: vi.fn(),
  skipApproachItemClientAction: vi.fn(),
  setApproachPausedClientAction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireClientFilaSessionMock.mockResolvedValue({ user: { role: "CLIENT", clinicId: "clinic-1" } });
});

const WINDOW = { startMinute: 0, endMinute: 23 * 60 + 59 };

describe("ClientFilaPage — bloqueio no servidor e resolução da própria clínica (via sessão, nunca via :id)", () => {
  it("sem sessão CLIENT válida: requireClientFilaSession rejeita antes de ler a clínica ou o board", async () => {
    requireClientFilaSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT /crm"));

    const { default: ClientFilaPage } = await import("./page");
    await expect(ClientFilaPage()).rejects.toThrow();

    expect(clinicFindUniqueMock).not.toHaveBeenCalled();
    expect(getApproachBoardForClinicClientActionMock).not.toHaveBeenCalled();
  });

  it("clínica inexistente (edge case — clinicId da sessão não bate com nenhuma): notFound", async () => {
    clinicFindUniqueMock.mockResolvedValue(null);

    const { default: ClientFilaPage } = await import("./page");
    await expect(ClientFilaPage()).rejects.toThrow();

    expect(getApproachBoardForClinicClientActionMock).not.toHaveBeenCalled();
  });

  it("clínica existente: busca o board da clínica DA SESSÃO, renderiza ClinicFilaView sem o link global", async () => {
    clinicFindUniqueMock.mockResolvedValue({ id: "clinic-1", name: "Clínica Demo" });
    getApproachBoardForClinicClientActionMock.mockResolvedValue({
      account: {
        clinicId: "clinic-1",
        name: "Clínica Demo",
        igUsername: "clinica.demo",
        profilePictureUrl: null,
        dailyLimit: 60,
        sentToday: 0,
        leadsRemaining: 0,
        state: { kind: "READY" },
        items: [],
      },
      window: WINDOW,
    });

    const { default: ClientFilaPage } = await import("./page");
    const element = await ClientFilaPage();

    expect(getApproachBoardForClinicClientActionMock).toHaveBeenCalledWith("clinic-1");
    // props.children -> o wrapper min-h-screen/max-w-6xl -> ClinicFilaView
    const clinicFilaViewElement = element.props.children.props.children;
    expect(clinicFilaViewElement.props.clinicId).toBe("clinic-1");
    expect(clinicFilaViewElement.props.clinicName).toBe("Clínica Demo");
    expect(clinicFilaViewElement.props.initialAccount?.igUsername).toBe("clinica.demo");
    expect(clinicFilaViewElement.props.showGlobalFilaLink).toBe(false);
  });
});
