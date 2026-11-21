import { describe, it, expect, vi, beforeEach } from "vitest";

// Mesmas 5 actions do CRM interno (abordagem/actions.ts), gated por
// CLIENT (requireClientFilaSession) em vez de INTERNAL_ADMIN/STAFF —
// pedido explícito: segundo link de acesso do cliente, só pra Fila.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const notFoundMock = vi.fn(() => {
  throw new Error("NOTFOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFoundMock() }));

const requireClientFilaSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireClientFilaSession: (...args: unknown[]) => requireClientFilaSessionMock(...args),
}));

const getApproachBoardAccountMock = vi.fn();
const getApproachWindowMock = vi.fn();
const confirmApproachSendMock = vi.fn();
const undoLastApproachSendMock = vi.fn();
const skipApproachItemMock = vi.fn();
const setApproachPausedMock = vi.fn();
vi.mock("@/lib/approach-queue-db", () => ({
  getApproachBoardAccount: (...args: unknown[]) => getApproachBoardAccountMock(...args),
  getApproachWindow: (...args: unknown[]) => getApproachWindowMock(...args),
  confirmApproachSend: (...args: unknown[]) => confirmApproachSendMock(...args),
  undoLastApproachSend: (...args: unknown[]) => undoLastApproachSendMock(...args),
  skipApproachItem: (...args: unknown[]) => skipApproachItemMock(...args),
  setApproachPaused: (...args: unknown[]) => setApproachPausedMock(...args),
  CLINIC_FILA_STACK_SIZE: 5,
}));

const {
  getApproachBoardForClinicClientAction,
  confirmApproachSendClientAction,
  undoApproachSendClientAction,
  skipApproachItemClientAction,
  setApproachPausedClientAction,
} = await import("./actions");

const WINDOW = { startMinute: 0, endMinute: 1439 };
const ACCOUNT = { clinicId: "clinic-1", name: "Clínica Demo", igUsername: null, profilePictureUrl: null, dailyLimit: 60, sentToday: 0, leadsRemaining: 0, state: { kind: "READY" }, items: [] };

beforeEach(() => {
  vi.clearAllMocks();
  requireClientFilaSessionMock.mockResolvedValue({ user: { clinicId: "clinic-1" } });
  getApproachWindowMock.mockResolvedValue(WINDOW);
  getApproachBoardAccountMock.mockResolvedValue(ACCOUNT);
});

describe("getApproachBoardForClinicClientAction", () => {
  it("CLIENT da própria clínica: busca com CLINIC_FILA_STACK_SIZE (5), não 1", async () => {
    const board = await getApproachBoardForClinicClientAction("clinic-1");
    expect(getApproachBoardAccountMock).toHaveBeenCalledWith("clinic-1", expect.any(Date), WINDOW, 5);
    expect(board).toEqual({ account: ACCOUNT, window: WINDOW });
  });

  it("clinicId não bate com a clínica da sessão: 404, nunca busca o board de outra clínica", async () => {
    requireClientFilaSessionMock.mockResolvedValue({ user: { clinicId: "outra-clinica" } });
    await expect(getApproachBoardForClinicClientAction("clinic-1")).rejects.toThrow("NOTFOUND");
    expect(getApproachBoardAccountMock).not.toHaveBeenCalled();
  });
});

describe("confirmApproachSendClientAction", () => {
  it("delega pra confirmApproachSend/getApproachBoardAccount, igual a action interna", async () => {
    confirmApproachSendMock.mockResolvedValue({ ok: true });
    const result = await confirmApproachSendClientAction("clinic-1", "item-1");
    expect(confirmApproachSendMock).toHaveBeenCalledWith("clinic-1", "item-1", expect.any(Date));
    expect(result).toEqual({ ok: true, account: ACCOUNT });
  });

  it("recusado (ex: corrida com Pular): devolve reason, não lança", async () => {
    confirmApproachSendMock.mockResolvedValue({ ok: false, reason: "já enviado" });
    const result = await confirmApproachSendClientAction("clinic-1", "item-1");
    expect(result).toEqual({ ok: false, reason: "já enviado" });
  });

  it("clinicId de outra clínica: 404, nunca confirma envio de outra clínica", async () => {
    requireClientFilaSessionMock.mockResolvedValue({ user: { clinicId: "outra-clinica" } });
    await expect(confirmApproachSendClientAction("clinic-1", "item-1")).rejects.toThrow("NOTFOUND");
    expect(confirmApproachSendMock).not.toHaveBeenCalled();
  });
});

describe("undoApproachSendClientAction / skipApproachItemClientAction / setApproachPausedClientAction", () => {
  it("undo: delega pra undoLastApproachSend", async () => {
    await undoApproachSendClientAction("clinic-1");
    expect(undoLastApproachSendMock).toHaveBeenCalledWith("clinic-1");
  });

  it("skip: delega pra skipApproachItem com o itemId", async () => {
    await skipApproachItemClientAction("clinic-1", "item-1");
    expect(skipApproachItemMock).toHaveBeenCalledWith("item-1");
  });

  it("pause: delega pra setApproachPaused com o booleano", async () => {
    await setApproachPausedClientAction("clinic-1", true);
    expect(setApproachPausedMock).toHaveBeenCalledWith("clinic-1", true);
  });

  it("qualquer uma das três com clinicId de outra clínica: 404", async () => {
    requireClientFilaSessionMock.mockResolvedValue({ user: { clinicId: "outra-clinica" } });
    await expect(undoApproachSendClientAction("clinic-1")).rejects.toThrow("NOTFOUND");
    await expect(skipApproachItemClientAction("clinic-1", "item-1")).rejects.toThrow("NOTFOUND");
    await expect(setApproachPausedClientAction("clinic-1", true)).rejects.toThrow("NOTFOUND");
    expect(undoLastApproachSendMock).not.toHaveBeenCalled();
    expect(skipApproachItemMock).not.toHaveBeenCalled();
    expect(setApproachPausedMock).not.toHaveBeenCalled();
  });
});
