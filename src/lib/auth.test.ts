import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (arg: unknown) => findUniqueMock(arg) },
    clinic: { findUnique: vi.fn(async () => ({ active: true })) },
  },
}));

const { authOptions } = await import("./auth");

// CredentialsProvider (next-auth v4.24.15) devolve um `authorize` de
// propósito inofensivo no nível raiz do provider (`() => null`) — o
// `authorize` de verdade (o que foi passado em auth.ts) só existe dentro
// de `.options.authorize` (ver node_modules/next-auth/providers/
// credentials.js: `{ ..., authorize: () => null, options }`, onde
// `options` é o objeto original recebido, intacto).
type AuthorizeFn = (credentials: Record<string, string> | undefined) => Promise<unknown>;
const authorize = (authOptions.providers[0] as unknown as { options: { authorize: AuthorizeFn } }).options.authorize;

async function makeUser(overrides: Partial<{ active: boolean; role: string; clinicId: string | null }> = {}) {
  const passwordHash = await bcrypt.hash("senha-correta", 4);
  return {
    id: "user-1",
    email: "pessoa@exemplo.com",
    passwordHash,
    name: "Fulano",
    role: "INTERNAL_ADMIN",
    clinicId: null,
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("login (authorize) — User.active bloqueia o login", () => {
  it("usuário ATIVO com senha certa: entra normalmente", async () => {
    findUniqueMock.mockResolvedValue(await makeUser({ active: true }));
    const result = await authorize({ email: "pessoa@exemplo.com", password: "senha-correta" });
    expect(result).not.toBeNull();
  });

  it("usuário DESATIVADO (active=false), mesmo com a senha certa: NÃO entra", async () => {
    findUniqueMock.mockResolvedValue(await makeUser({ active: false }));
    const result = await authorize({ email: "pessoa@exemplo.com", password: "senha-correta" });
    expect(result).toBeNull();
  });

  it("senha errada continua barrada, igual sempre foi (independente de active)", async () => {
    findUniqueMock.mockResolvedValue(await makeUser({ active: true }));
    const result = await authorize({ email: "pessoa@exemplo.com", password: "senha-errada" });
    expect(result).toBeNull();
  });

  it("usuário REVIEWER ativo: entra normalmente (sem regra extra além de active)", async () => {
    findUniqueMock.mockResolvedValue(await makeUser({ active: true, role: "REVIEWER", clinicId: "demo-1" }));
    const result = await authorize({ email: "pessoa@exemplo.com", password: "senha-correta" });
    expect(result).not.toBeNull();
  });

  it("usuário inexistente: continua null, igual sempre foi", async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await authorize({ email: "ninguem@exemplo.com", password: "qualquer" });
    expect(result).toBeNull();
  });
});

// callback session() — repassa `scope` do JWT pra session.user.scope
// (ver next-auth.d.ts/session.ts). Quem GRAVA o scope é o encode()
// manual de acesso-fila/[token]/route.ts (não passa por aqui, nem por
// authorize() — este callback só LÊ o que já está no token).
describe("callback session() — repassa scope do token (segundo link da Fila)", () => {
  const baseSession = { user: { id: "", name: null, email: null, role: "CLIENT" as const, clinicId: null } };

  it("token com scope='fila': session.user.scope='fila'", async () => {
    const result = (await authOptions.callbacks!.session!({
      session: structuredClone(baseSession),
      token: { sub: "client-fila-link:clinic-1", role: "CLIENT", clinicId: "clinic-1", scope: "fila" },
    } as never)) as { user: { scope?: string | null } };
    expect(result.user.scope).toBe("fila");
  });

  it("token sem scope (login normal/ClientPanelLink): session.user.scope=null", async () => {
    const result = (await authOptions.callbacks!.session!({
      session: structuredClone(baseSession),
      token: { sub: "user-1", role: "INTERNAL_ADMIN", clinicId: null },
    } as never)) as { user: { scope?: string | null } };
    expect(result.user.scope).toBeNull();
  });
});

// BUG REAL (link "Painel completo" caindo no /entrar em vez de autenticar
// direto pelo token): sem `useSecureCookies` explícito, o NextAuth decide
// o nome do cookie de sessão olhando NEXTAUTH_URL — que pode nem existir
// como variável no serviço do Railway (só APP_URL é garantida, é o que o
// resto do app já usa pra tudo) — enquanto `acesso/[token]/route.ts`/
// `acesso-fila/[token]/route.ts` montam o cookie NA MÃO olhando APP_URL.
// Sem os dois lados usando o MESMO critério, o cookie gravado e o nome que
// `getServerSession()` procura nunca batem, e a sessão nunca é encontrada
// — por isso `useSecureCookies` precisa vir de APP_URL, nunca de
// NEXTAUTH_URL (nem do default do NextAuth). Reimporta o módulo a cada
// teste (igual acesso/[token]/route.test.ts) porque o valor é calculado
// uma vez, na carga do módulo, a partir do env atual.
describe("authOptions.useSecureCookies — deriva de APP_URL, nunca de NEXTAUTH_URL", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  it("APP_URL https (produção real): useSecureCookies=true — mesmo critério das rotas de token", async () => {
    process.env.APP_URL = "https://vexo-platform-production.up.railway.app";
    delete process.env.NEXTAUTH_URL;
    const { authOptions: freshAuthOptions } = await import("./auth");
    expect(freshAuthOptions.useSecureCookies).toBe(true);
  });

  it("NEXTAUTH_URL ausente não muda nada — só APP_URL decide (essa é a causa raiz do bug)", async () => {
    process.env.APP_URL = "https://app.vexoia.com.br";
    delete process.env.NEXTAUTH_URL;
    const { authOptions: freshAuthOptions } = await import("./auth");
    expect(freshAuthOptions.useSecureCookies).toBe(true);
  });

  it("APP_URL ausente/http (dev local): useSecureCookies=false", async () => {
    delete process.env.APP_URL;
    const { authOptions: freshAuthOptions } = await import("./auth");
    expect(freshAuthOptions.useSecureCookies).toBe(false);
  });
});
