import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const getTokenMock = vi.fn();
vi.mock("next-auth/jwt", () => ({ getToken: (...args: unknown[]) => getTokenMock(...args) }));

const { middleware } = await import("./middleware");

function req(pathname: string): NextRequest {
  return new NextRequest(new URL(`https://app.vexoia.com.br${pathname}`));
}

describe("middleware — gate do login Revisor", () => {
  it("sem token (sem sessão): passa direto, sem mexer em nada", async () => {
    getTokenMock.mockResolvedValueOnce(null);
    const res = await middleware(req("/crm/abordagem/fila"));
    expect(res.status).toBe(200);
    // next() não seta location nem corpo de rewrite.
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("papel que não é REVIEWER (ex: INTERNAL_ADMIN): passa direto por qualquer rota", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "INTERNAL_ADMIN", clinicId: null });
    const res = await middleware(req("/crm/abordagem/fila"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("CLIENT: passa direto (este arquivo não mexe no papel Cliente)", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "CLIENT", clinicId: "clinic-1" });
    const res = await middleware(req("/crm/abordagem/fila"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("REVIEWER numa página liberada da PRÓPRIA clínica: passa direto", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "REVIEWER", clinicId: "demo-1" });
    const res = await middleware(req("/crm/clinicas/demo-1/conexoes"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("REVIEWER numa página FORA da lista (página): reescreve pra um caminho que não existe (404 real, sem redirect)", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "REVIEWER", clinicId: "demo-1" });
    const res = await middleware(req("/crm/abordagem/fila"));
    expect(res.headers.get("location")).toBeNull();
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).not.toBeNull();
    expect(rewrite).not.toContain("/crm/abordagem/fila");
  });

  it("REVIEWER na clínica ERRADA (conexões de outra clínica): também nega", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "REVIEWER", clinicId: "demo-1" });
    const res = await middleware(req("/crm/clinicas/outra-clinica/conexoes"));
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).not.toBeNull();
  });

  it("REVIEWER numa rota de API fora da lista: 404 em JSON, nunca HTML", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "REVIEWER", clinicId: "demo-1" });
    const res = await middleware(req("/api/webhooks/instagram"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({ error: "not_found" });
  });

  it("REVIEWER em /api/conversas/[id]/mensagens: passa direto (dono checado na própria rota)", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "REVIEWER", clinicId: "demo-1" });
    const res = await middleware(req("/api/conversas/conv-xyz/mensagens"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("REVIEWER em /api/clinicas/[id]/pipeline da PRÓPRIA clínica: passa direto (polling do Pipeline)", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "REVIEWER", clinicId: "demo-1" });
    const res = await middleware(req("/api/clinicas/demo-1/pipeline"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("REVIEWER em /api/clinicas/[id]/pipeline de OUTRA clínica: 404 em JSON", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "REVIEWER", clinicId: "demo-1" });
    const res = await middleware(req("/api/clinicas/outra-clinica/pipeline"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "not_found" });
  });
});
