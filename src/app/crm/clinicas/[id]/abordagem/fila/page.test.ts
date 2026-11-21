import { describe, it, expect, vi, beforeEach } from "vitest";

// Fila por clínica (pedido explícito, ver DESIGN.md) — rota irmã da Fila
// global, mostrando só o card desta clínica, independente do toggle
// "ativa na fila" (ver actions.test.ts, getApproachBoardForClinicAction).
const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const clinicFindUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinic: { findUnique: (...args: unknown[]) => clinicFindUniqueMock(...args) } },
}));

const getApproachBoardForClinicActionMock = vi.fn();
vi.mock("@/app/crm/(global)/abordagem/actions", () => ({
  getApproachBoardForClinicAction: (...args: unknown[]) => getApproachBoardForClinicActionMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
});

const WINDOW = { startMinute: 0, endMinute: 23 * 60 + 59 };

describe("ClinicFilaPage — bloqueio no servidor e resolução da clínica", () => {
  it("sessão não-interna: requireInternalSession rejeita antes de ler a clínica ou o board", async () => {
    requireInternalSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT /crm"));

    const { default: ClinicFilaPage } = await import("./page");
    await expect(ClinicFilaPage({ params: { id: "clinic-1" } })).rejects.toThrow();

    expect(clinicFindUniqueMock).not.toHaveBeenCalled();
    expect(getApproachBoardForClinicActionMock).not.toHaveBeenCalled();
  });

  it("clínica inexistente: notFound (lança NEXT_NOT_FOUND)", async () => {
    clinicFindUniqueMock.mockResolvedValue(null);

    const { default: ClinicFilaPage } = await import("./page");
    await expect(ClinicFilaPage({ params: { id: "clinic-inexistente" } })).rejects.toThrow();

    expect(getApproachBoardForClinicActionMock).not.toHaveBeenCalled();
  });

  it("clínica existente: busca o board SÓ desta clínica (pelo id certo) e renderiza", async () => {
    clinicFindUniqueMock.mockResolvedValue({ id: "clinic-1", name: "Clínica Demo" });
    getApproachBoardForClinicActionMock.mockResolvedValue({
      account: { clinicId: "clinic-1", name: "Clínica Demo", igUsername: "clinica.demo", profilePictureUrl: null, dailyLimit: 60, sentToday: 0, leadsRemaining: 0, state: { kind: "READY" }, items: [] },
      window: WINDOW,
    });

    const { default: ClinicFilaPage } = await import("./page");
    const element = await ClinicFilaPage({ params: { id: "clinic-1" } });

    expect(getApproachBoardForClinicActionMock).toHaveBeenCalledWith("clinic-1");
    expect(element.props.clinicId).toBe("clinic-1");
    expect(element.props.clinicName).toBe("Clínica Demo");
    expect(element.props.initialAccount?.igUsername).toBe("clinica.demo");
  });
});
