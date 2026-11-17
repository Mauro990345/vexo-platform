import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getServerSessionMock = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => getServerSessionMock(...args) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const clinicFindManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinic: { findMany: (...args: unknown[]) => clinicFindManyMock(...args) } },
}));

import { isFollowerToolAvailableAction, getFollowerToolClinicsAction, generateFollowerToolScriptAction } from "./actions";

const ORIGINAL_ENV = process.env.FOLLOWER_TOOL_ENABLED;

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// "Buscar seguidores" (ver DESIGN.md/follower-tool.ts) — atrás do
// interruptor FOLLOWER_TOOL_ENABLED, que PRECISA ficar desligado durante a
// análise da Meta. Desligado: toda ação recusa, mesmo pra admin. Ligado:
// só INTERNAL_ADMIN.
describe("Buscar seguidores — gate do interruptor + papel", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    clinicFindManyMock.mockReset().mockResolvedValue([]);
    delete process.env.FOLLOWER_TOOL_ENABLED;
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.FOLLOWER_TOOL_ENABLED;
    else process.env.FOLLOWER_TOOL_ENABLED = ORIGINAL_ENV;
  });

  describe("interruptor DESLIGADO (padrão)", () => {
    it("isFollowerToolAvailableAction -> false, mesmo logado como admin", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
      expect(await isFollowerToolAvailableAction()).toBe(false);
    });

    it("getFollowerToolClinicsAction recusa, mesmo pra admin", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
      await expect(getFollowerToolClinicsAction()).rejects.toThrow();
      expect(clinicFindManyMock).not.toHaveBeenCalled();
    });

    it("generateFollowerToolScriptAction recusa, mesmo pra admin — NUNCA devolve o texto do script", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
      await expect(generateFollowerToolScriptAction(formData({ limit: "300", restart: "false" }))).rejects.toThrow();
    });
  });

  describe("interruptor LIGADO", () => {
    beforeEach(() => {
      process.env.FOLLOWER_TOOL_ENABLED = "true";
    });

    it("admin acessa normalmente", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
      expect(await isFollowerToolAvailableAction()).toBe(true);
      await expect(getFollowerToolClinicsAction()).resolves.toEqual([]);
    });

    it("STAFF (não admin) recebe recusa — só INTERNAL_ADMIN, diferente das outras ações da Fila", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_STAFF" } });
      expect(await isFollowerToolAvailableAction()).toBe(false);
      await expect(getFollowerToolClinicsAction()).rejects.toThrow();
    });

    it("CLIENT recebe recusa", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "CLIENT", clinicId: "clinic-1" } });
      await expect(generateFollowerToolScriptAction(formData({ limit: "300", restart: "false" }))).rejects.toThrow();
    });

    it("sem sessão nenhuma recebe recusa", async () => {
      getServerSessionMock.mockResolvedValue(null);
      expect(await isFollowerToolAvailableAction()).toBe(false);
      await expect(getFollowerToolClinicsAction()).rejects.toThrow();
    });

    it("gera o script com LIMITE e RECOMECAR preenchidos a partir do formulário", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
      const script = await generateFollowerToolScriptAction(formData({ limit: "250", restart: "on" }));
      expect(script).toContain("const LIMITE = 250;");
      expect(script).toContain("const RECOMECAR = true;");
    });

    it("quantidade fora de 50-500 é recusada pelo servidor", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
      await expect(generateFollowerToolScriptAction(formData({ limit: "9999", restart: "false" }))).rejects.toThrow();
      await expect(generateFollowerToolScriptAction(formData({ limit: "10", restart: "false" }))).rejects.toThrow();
    });

    it("clínicas vêm com id/nome/@ do Instagram conectado", async () => {
      getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
      clinicFindManyMock.mockResolvedValue([{ id: "clinic-1", name: "Clínica Demo", instagramAccount: { igUsername: "clinica.demo" } }]);
      const clinics = await getFollowerToolClinicsAction();
      expect(clinics).toEqual([{ id: "clinic-1", name: "Clínica Demo", igUsername: "clinica.demo" }]);
    });
  });
});
