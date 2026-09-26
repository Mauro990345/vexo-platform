import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Bug real relatado em produção: os redirects desta rota usavam
// `new URL(path, req.url)` — atrás do proxy do Railway, req.url pode vir
// com esquema "http:" mesmo a conexão real sendo https, e o link
// simplesmente não abria. Este teste prova que a rota NUNCA deriva a URL
// de destino da requisição — só de process.env.APP_URL — construindo a
// NextRequest com um host propositalmente diferente (localhost:3000, sem
// nenhuma relação com APP_URL) pra garantir que ele não vaza pro Location.
const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clientPanelLink: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

const getServerSessionMock = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => getServerSessionMock(...args) }));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const APP_URL = "https://vexo-platform-production.up.railway.app";

describe("GET /acesso/[token]", () => {
  beforeEach(() => {
    vi.resetModules();
    findUniqueMock.mockReset();
    getServerSessionMock.mockReset();
    process.env.APP_URL = APP_URL;
    process.env.NEXTAUTH_SECRET = "test-secret-pelo-menos-32-caracteres-de-comprimento";
  });

  it("token inexistente/inativo redireciona pra APP_URL/login, nunca pro host da requisição", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/acesso/token-invalido");
    const res = await GET(req, { params: { token: "token-invalido" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login`);
  });

  it("clínica inativa (contrato encerrado) também redireciona pro login, sem gerar cookie", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue({ clinic: { id: "clinic-1", name: "Clínica X", active: false } });

    const req = new NextRequest("http://localhost:3000/acesso/abc");
    const res = await GET(req, { params: { token: "abc" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login`);
    expect(res.cookies.get("__Secure-next-auth.session-token")).toBeUndefined();
  });

  it("equipe interna logada no mesmo navegador vai pro preview, sem ter a própria sessão sobrescrita", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue({ clinic: { id: "clinic-1", name: "Clínica X", active: true } });
    getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });

    const req = new NextRequest("http://localhost:3000/acesso/abc");
    const res = await GET(req, { params: { token: "abc" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/crm/painel-cliente/clinic-1`);
    expect(res.cookies.get("__Secure-next-auth.session-token")).toBeUndefined();
  });

  it("cliente real (sem sessão prévia) recebe o cookie de sessão CLIENT e vai pro APP_URL/dashboard", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue({ clinic: { id: "clinic-1", name: "Clínica X", active: true } });
    getServerSessionMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/acesso/abc");
    const res = await GET(req, { params: { token: "abc" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/dashboard`);

    const cookie = res.cookies.get("__Secure-next-auth.session-token");
    expect(cookie).toBeDefined();
    expect(cookie?.value.length).toBeGreaterThan(0);

    const setCookieHeader = res.headers.get("set-cookie") ?? "";
    expect(setCookieHeader).toContain("HttpOnly");
    expect(setCookieHeader).toContain("Secure");
    expect(setCookieHeader).toContain("SameSite=lax");
  });
});
