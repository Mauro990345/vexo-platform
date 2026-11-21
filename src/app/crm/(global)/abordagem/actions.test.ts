import { describe, it, expect, vi, beforeEach } from "vitest";

// getApproachBoardForClinicAction (Fila por clínica, pedido explícito:
// operar várias clínicas ao mesmo tempo, um perfil do Chrome por clínica)
// — prova o ponto central do pedido: funciona mesmo com
// ApproachQueueConfig.activeInQueue desligado, porque chama
// getApproachBoardAccount DIRETO, nunca passa pela lista de contas
// ativas que o board GLOBAL (getApproachBoard) usa.
const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const getApproachBoardAccountMock = vi.fn();
const getApproachWindowMock = vi.fn();
vi.mock("@/lib/approach-queue-db", () => ({
  getApproachBoardAccount: (...args: unknown[]) => getApproachBoardAccountMock(...args),
  getApproachWindow: (...args: unknown[]) => getApproachWindowMock(...args),
  // Mesmo valor real de CLINIC_FILA_STACK_SIZE (approach-queue-db.ts) —
  // precisa ser o valor de verdade aqui (não um vi.fn()), já que
  // getApproachBoardForClinicAction repassa ele direto pro 4º argumento
  // de getApproachBoardAccount.
  CLINIC_FILA_STACK_SIZE: 5,
  // Resto do módulo não usado por esta action — mocks mínimos só pra não
  // quebrar a importação dos outros exports usados por actions.ts.
  getApproachBoard: vi.fn(),
  confirmApproachSend: vi.fn(),
  undoLastApproachSend: vi.fn(),
  skipApproachItem: vi.fn(),
  setApproachPaused: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/follower-tool", () => ({ isFollowerToolEnabled: vi.fn(() => false), renderFollowerToolScript: vi.fn() }));
vi.mock("@/lib/approach-queue", () => ({ parseApproachTimeToMinutes: vi.fn(), validateApproachWindow: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const WINDOW = { startMinute: 0, endMinute: 23 * 60 + 59 };

beforeEach(() => {
  vi.clearAllMocks();
  requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
  getApproachWindowMock.mockResolvedValue(WINDOW);
});

describe("getApproachBoardForClinicAction", () => {
  it("devolve a conta desta clínica (via getApproachBoardAccount direto, nunca pela lista de contas ATIVAS NA FILA)", async () => {
    const account = { clinicId: "clinic-1", name: "Clínica Demo", igUsername: "clinica.demo", profilePictureUrl: null, dailyLimit: 60, sentToday: 0, leadsRemaining: 1, state: { kind: "READY" }, items: [] };
    getApproachBoardAccountMock.mockResolvedValue(account);

    const { getApproachBoardForClinicAction } = await import("./actions");
    const result = await getApproachBoardForClinicAction("clinic-1");

    expect(result).toEqual({ account, window: WINDOW });
    expect(getApproachBoardAccountMock).toHaveBeenCalledWith("clinic-1", expect.any(Date), WINDOW, 5);
  });

  // Pedido explícito: mostrar os próximos leads empilhados (não só 1,
  // como a Fila global) nesta tela por clínica.
  it("pede CLINIC_FILA_STACK_SIZE itens (não 1, como a Fila global pede por padrão)", async () => {
    getApproachBoardAccountMock.mockResolvedValue({ clinicId: "clinic-1", name: "Clínica Demo", igUsername: null, profilePictureUrl: null, dailyLimit: 60, sentToday: 0, leadsRemaining: 0, state: { kind: "READY" }, items: [] });

    const { getApproachBoardForClinicAction } = await import("./actions");
    await getApproachBoardForClinicAction("clinic-1");

    expect(getApproachBoardAccountMock).toHaveBeenCalledWith("clinic-1", expect.any(Date), WINDOW, 5);
  });

  it("clínica sem ApproachQueueConfig.activeInQueue (desligada na Preparação) continua funcionando — getApproachBoardAccount não recebe nem checa esse campo", async () => {
    getApproachBoardAccountMock.mockResolvedValue({ clinicId: "clinic-2", name: "Clínica Sem Toggle", igUsername: null, profilePictureUrl: null, dailyLimit: 60, sentToday: 0, leadsRemaining: 0, state: { kind: "READY" }, items: [] });

    const { getApproachBoardForClinicAction } = await import("./actions");
    const result = await getApproachBoardForClinicAction("clinic-2");

    expect(result.account?.clinicId).toBe("clinic-2");
    const call = getApproachBoardAccountMock.mock.calls[0]!;
    expect(call).not.toContain("activeInQueue");
  });

  it("clínica inexistente: getApproachBoardAccount devolve null, a action repassa null (a página decide notFound())", async () => {
    getApproachBoardAccountMock.mockResolvedValue(null);

    const { getApproachBoardForClinicAction } = await import("./actions");
    const result = await getApproachBoardForClinicAction("clinic-inexistente");

    expect(result.account).toBeNull();
  });

  it("exige sessão interna, igual a toda outra action da Fila", async () => {
    requireInternalSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT /crm"));

    const { getApproachBoardForClinicAction } = await import("./actions");
    await expect(getApproachBoardForClinicAction("clinic-1")).rejects.toThrow();
    expect(getApproachBoardAccountMock).not.toHaveBeenCalled();
  });
});
