import { describe, it, expect, vi, afterEach } from "vitest";
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

  it("CLIENT sem scope (link do painel completo): passa direto, fora de /dashboard", async () => {
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

// Segundo gate: segundo link de acesso do cliente (ClientFilaLink,
// `scope: "fila"`) — regra de segurança pedida explicitamente: nunca
// alcança /dashboard (o painel), mesmo digitando a URL direto.
describe("middleware — gate do segundo link de acesso (scope='fila')", () => {
  it("CLIENT com scope='fila' abrindo /dashboard/fila (a própria tela liberada): passa direto", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "CLIENT", clinicId: "clinic-1", scope: "fila" });
    const res = await middleware(req("/dashboard/fila"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("CLIENT com scope='fila' tentando /dashboard (o painel inteiro): redireciona pra /dashboard/fila", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "CLIENT", clinicId: "clinic-1", scope: "fila" });
    const res = await middleware(req("/dashboard"));
    expect(res.headers.get("location")).toContain("/dashboard/fila");
  });

  it("CLIENT com scope='fila' tentando /dashboard/bonus: também redireciona pra /dashboard/fila", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "CLIENT", clinicId: "clinic-1", scope: "fila" });
    const res = await middleware(req("/dashboard/bonus"));
    expect(res.headers.get("location")).toContain("/dashboard/fila");
  });

  it("CLIENT SEM scope (link do painel completo) em /dashboard: passa direto — o inverso é permitido", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "CLIENT", clinicId: "clinic-1" });
    const res = await middleware(req("/dashboard"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("CLIENT SEM scope em /dashboard/fila (abriu a partir do botão do painel): passa direto também", async () => {
    getTokenMock.mockResolvedValueOnce({ role: "CLIENT", clinicId: "clinic-1" });
    const res = await middleware(req("/dashboard/fila"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("sem token em /dashboard: passa direto (requireClientFilaSession/requireClientSession cuidam disso)", async () => {
    getTokenMock.mockResolvedValueOnce(null);
    const res = await middleware(req("/dashboard"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

// BUG REAL (link "Painel completo" caindo no /entrar): getToken() decide
// sozinho o nome do cookie de sessão (com ou sem "__Secure-") olhando
// NEXTAUTH_URL por padrão — variável que pode nem existir no serviço do
// Railway. As rotas de login automático por token (acesso/[token],
// acesso-fila/[token]) montam o cookie NA MÃO olhando APP_URL. Sem o MESMO
// critério dos dois lados, o cookie nunca é encontrado. Este teste prova
// que o middleware passa `secureCookie` explícito pro getToken(), derivado
// de APP_URL (não do default do NextAuth) — mesmo critério de
// src/lib/auth.ts (`useSecureCookies`, ver auth.test.ts).
describe("middleware — secureCookie do getToken() deriva de APP_URL (mesmo critério das rotas de token)", () => {
  const ORIGINAL_APP_URL = process.env.APP_URL;

  afterEach(() => {
    if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = ORIGINAL_APP_URL;
  });

  it("APP_URL https: getToken() recebe secureCookie=true", async () => {
    process.env.APP_URL = "https://vexo-platform-production.up.railway.app";
    getTokenMock.mockResolvedValueOnce(null);
    await middleware(req("/crm"));
    expect(getTokenMock).toHaveBeenCalledWith(expect.objectContaining({ secureCookie: true }));
  });

  it("APP_URL ausente: getToken() recebe secureCookie=false", async () => {
    delete process.env.APP_URL;
    getTokenMock.mockResolvedValueOnce(null);
    await middleware(req("/crm"));
    expect(getTokenMock).toHaveBeenCalledWith(expect.objectContaining({ secureCookie: false }));
  });
});
