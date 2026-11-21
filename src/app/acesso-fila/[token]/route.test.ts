import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";

// Mesmo padrão de teste do /acesso/[token] original (route.test.ts) —
// incluindo a mesma prova de que a URL de destino nunca vem de req.url,
// só de process.env.APP_URL (mesmo bug real já corrigido lá).
const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clientFilaLink: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

const getServerSessionMock = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => getServerSessionMock(...args) }));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const APP_URL = "https://vexo-platform-production.up.railway.app";

describe("GET /acesso-fila/[token]", () => {
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

    const req = new NextRequest("http://localhost:3000/acesso-fila/token-invalido");
    const res = await GET(req, { params: { token: "token-invalido" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login`);
  });

  it("clínica inativa (contrato encerrado) também redireciona pro login, sem gerar cookie", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue({ clinic: { id: "clinic-1", name: "Clínica X", active: false } });

    const req = new NextRequest("http://localhost:3000/acesso-fila/abc");
    const res = await GET(req, { params: { token: "abc" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login`);
    expect(res.cookies.get("__Secure-next-auth.session-token")).toBeUndefined();
  });

  it("equipe interna logada no mesmo navegador vai pra Fila INTERNA desta clínica, sem ter a própria sessão sobrescrita", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue({ clinic: { id: "clinic-1", name: "Clínica X", active: true } });
    getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });

    const req = new NextRequest("http://localhost:3000/acesso-fila/abc");
    const res = await GET(req, { params: { token: "abc" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/crm/clinicas/clinic-1/abordagem/fila`);
    expect(res.cookies.get("__Secure-next-auth.session-token")).toBeUndefined();
  });

  it("cliente real (sem sessão prévia) recebe o cookie com scope='fila' e vai pro APP_URL/dashboard/fila", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue({ clinic: { id: "clinic-1", name: "Clínica X", active: true } });
    getServerSessionMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/acesso-fila/abc");
    const res = await GET(req, { params: { token: "abc" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/dashboard/fila`);

    const cookie = res.cookies.get("__Secure-next-auth.session-token");
    expect(cookie).toBeDefined();
    expect(cookie?.value.length).toBeGreaterThan(0);

    const setCookieHeader = res.headers.get("set-cookie") ?? "";
    expect(setCookieHeader).toContain("HttpOnly");
    expect(setCookieHeader).toContain("Secure");
    expect(setCookieHeader).toContain("SameSite=lax");

    // O claim que de fato trava /dashboard pra este link (ver
    // client-fila-access.ts/middleware.ts) — prova que ele vai pro token
    // de verdade, não só que o cookie existe.
    const decoded = await decode({ token: cookie!.value, secret: process.env.NEXTAUTH_SECRET! });
    expect(decoded?.scope).toBe("fila");
    expect(decoded?.role).toBe("CLIENT");
    expect(decoded?.clinicId).toBe("clinic-1");
    expect(decoded?.sub).toBe("client-fila-link:clinic-1");
  });
});
