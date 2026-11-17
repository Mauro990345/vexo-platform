import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getServerSessionMock = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => getServerSessionMock(...args) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const notFoundMock = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFoundMock() }));

const getFollowerToolClinicsActionMock = vi.fn();
vi.mock("../actions", () => ({
  getFollowerToolClinicsAction: (...args: unknown[]) => getFollowerToolClinicsActionMock(...args),
}));

vi.mock("./SeguidoresView", () => ({ SeguidoresView: () => null }));

const { default: SeguidoresPage } = await import("./page");

const ORIGINAL_ENV = process.env.FOLLOWER_TOOL_ENABLED;

// Rota /crm/abordagem/seguidores — atrás do interruptor
// FOLLOWER_TOOL_ENABLED (ver DESIGN.md/follower-tool.ts). 404 em vez de
// redirect de propósito: nunca revela que a rota existe pra quem não devia
// ver, inclusive admin enquanto o interruptor está desligado (análise da
// Meta).
describe("SeguidoresPage — 404 conforme o interruptor e o papel", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    getFollowerToolClinicsActionMock.mockReset().mockResolvedValue([]);
    notFoundMock.mockClear();
    delete process.env.FOLLOWER_TOOL_ENABLED;
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.FOLLOWER_TOOL_ENABLED;
    else process.env.FOLLOWER_TOOL_ENABLED = ORIGINAL_ENV;
  });

  it("interruptor desligado: 404 mesmo pra admin, sem nem consultar a sessão", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
    await expect(SeguidoresPage()).rejects.toThrow("NOT_FOUND");
    expect(getServerSessionMock).not.toHaveBeenCalled();
    expect(getFollowerToolClinicsActionMock).not.toHaveBeenCalled();
  });

  describe("interruptor ligado", () => {
    beforeEach(() => {
      process.env.FOLLOWER_TOOL_ENABLED = "true";
    });

    it("admin acessa normalmente", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
      await expect(SeguidoresPage()).resolves.toBeTruthy();
      expect(notFoundMock).not.toHaveBeenCalled();
    });

    it("STAFF (não admin) recebe 404", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_STAFF" } });
      await expect(SeguidoresPage()).rejects.toThrow("NOT_FOUND");
      expect(getFollowerToolClinicsActionMock).not.toHaveBeenCalled();
    });

    it("sem sessão: 404", async () => {
      getServerSessionMock.mockResolvedValue(null);
      await expect(SeguidoresPage()).rejects.toThrow("NOT_FOUND");
    });
  });
});
