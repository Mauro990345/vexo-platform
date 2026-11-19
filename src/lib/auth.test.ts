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
