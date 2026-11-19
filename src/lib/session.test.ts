import { describe, it, expect, vi, beforeEach } from "vitest";

const getServerSessionMock = vi.fn(async (): Promise<unknown> => null);
vi.mock("next-auth", () => ({ getServerSession: () => getServerSessionMock() }));

const redirectMock = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
const notFoundMock = vi.fn(() => {
  throw new Error("NOTFOUND");
});
vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirectMock(to),
  notFound: () => notFoundMock(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const findUniqueMock = vi.fn(async (_arg: unknown): Promise<{ active: boolean } | null> => ({ active: true }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (arg: unknown) => findUniqueMock(arg) } },
}));

const {
  requireSession,
  requireInternalSession,
  requireInternalOrReviewerSession,
  requireCrmAreaSession,
  requireAdminSession,
  requireClientSession,
  isInternal,
  isReviewer,
} = await import("./session");

function session(role: string, clinicId: string | null = null) {
  return { user: { id: "user-1", name: "Fulano", role, clinicId } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue(session("INTERNAL_ADMIN"));
  findUniqueMock.mockResolvedValue({ active: true });
});

describe("requireSession", () => {
  it("sem sessão: manda pro /entrar", async () => {
    getServerSessionMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("REDIRECT:/entrar");
  });

  it("usuário ativo: devolve a sessão normalmente", async () => {
    const s = await requireSession();
    expect(s.user.role).toBe("INTERNAL_ADMIN");
  });

  it("usuário DESATIVADO (User.active=false): manda pro /entrar, mesmo com sessão JWT válida", async () => {
    findUniqueMock.mockResolvedValue({ active: false });
    await expect(requireSession()).rejects.toThrow("REDIRECT:/entrar");
  });

  it("usuário sem linha no banco (deletado): trata como desativado, manda pro /entrar", async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("REDIRECT:/entrar");
  });
});

describe("requireInternalSession — Admin/Equipe inalterados, Revisor nunca passa", () => {
  it("INTERNAL_ADMIN: passa", async () => {
    getServerSessionMock.mockResolvedValue(session("INTERNAL_ADMIN"));
    const s = await requireInternalSession();
    expect(s.user.role).toBe("INTERNAL_ADMIN");
  });

  it("INTERNAL_STAFF: passa", async () => {
    getServerSessionMock.mockResolvedValue(session("INTERNAL_STAFF"));
    const s = await requireInternalSession();
    expect(s.user.role).toBe("INTERNAL_STAFF");
  });

  it("CLIENT: redireciona pro /dashboard (igual sempre foi)", async () => {
    getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1"));
    await expect(requireInternalSession()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("REVIEWER: 404 (notFound), NUNCA redirect — em QUALQUER página que ainda use requireInternalSession", async () => {
    getServerSessionMock.mockResolvedValue(session("REVIEWER", "demo-1"));
    await expect(requireInternalSession()).rejects.toThrow("NOTFOUND");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("requireInternalOrReviewerSession — exceção única, só pras 4 rotas liberadas", () => {
  it("INTERNAL_ADMIN/STAFF: passa pra qualquer clinicId (acesso total, igual sempre foi)", async () => {
    getServerSessionMock.mockResolvedValue(session("INTERNAL_ADMIN"));
    const s = await requireInternalOrReviewerSession("clinic-qualquer");
    expect(s.user.role).toBe("INTERNAL_ADMIN");
  });

  it("REVIEWER da PRÓPRIA clínica: passa", async () => {
    getServerSessionMock.mockResolvedValue(session("REVIEWER", "demo-1"));
    const s = await requireInternalOrReviewerSession("demo-1");
    expect(s.user.role).toBe("REVIEWER");
  });

  it("REVIEWER de OUTRA clínica: 404", async () => {
    getServerSessionMock.mockResolvedValue(session("REVIEWER", "demo-1"));
    await expect(requireInternalOrReviewerSession("outra-clinica")).rejects.toThrow("NOTFOUND");
  });

  it("CLIENT: 404 (não é a exceção, nem é interno)", async () => {
    getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1"));
    await expect(requireInternalOrReviewerSession("clinic-1")).rejects.toThrow("NOTFOUND");
  });
});

describe("requireCrmAreaSession — gate frouxo do layout raiz de /crm", () => {
  it("INTERNAL_ADMIN, INTERNAL_STAFF e REVIEWER passam estruturalmente", async () => {
    for (const role of ["INTERNAL_ADMIN", "INTERNAL_STAFF", "REVIEWER"]) {
      getServerSessionMock.mockResolvedValue(session(role, "demo-1"));
      const s = await requireCrmAreaSession();
      expect(s.user.role).toBe(role);
    }
  });

  it("CLIENT: redireciona pro /dashboard, igual sempre foi (requireInternalSession fazia isso antes)", async () => {
    getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1"));
    await expect(requireCrmAreaSession()).rejects.toThrow("REDIRECT:/dashboard");
  });
});

describe("requireAdminSession — só pras ações do 'Login de revisão'", () => {
  it("INTERNAL_ADMIN: passa", async () => {
    getServerSessionMock.mockResolvedValue(session("INTERNAL_ADMIN"));
    const s = await requireAdminSession();
    expect(s.user.role).toBe("INTERNAL_ADMIN");
  });

  it("INTERNAL_STAFF: redireciona pro /crm (não gerencia o login Revisor)", async () => {
    getServerSessionMock.mockResolvedValue(session("INTERNAL_STAFF"));
    await expect(requireAdminSession()).rejects.toThrow("REDIRECT:/crm");
  });

  it("REVIEWER: 404 (via requireInternalSession)", async () => {
    getServerSessionMock.mockResolvedValue(session("REVIEWER", "demo-1"));
    await expect(requireAdminSession()).rejects.toThrow("NOTFOUND");
  });
});

describe("requireClientSession — Cliente inalterado", () => {
  it("CLIENT com clinicId: passa", async () => {
    getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1"));
    const s = await requireClientSession();
    expect(s.user.role).toBe("CLIENT");
  });

  it("qualquer outro papel: redireciona pro /crm", async () => {
    getServerSessionMock.mockResolvedValue(session("INTERNAL_ADMIN"));
    await expect(requireClientSession()).rejects.toThrow("REDIRECT:/crm");
  });
});

describe("isInternal / isReviewer", () => {
  it("isInternal só ADMIN/STAFF", () => {
    expect(isInternal("INTERNAL_ADMIN")).toBe(true);
    expect(isInternal("INTERNAL_STAFF")).toBe(true);
    expect(isInternal("REVIEWER")).toBe(false);
    expect(isInternal("CLIENT")).toBe(false);
  });

  it("isReviewer só REVIEWER", () => {
    expect(isReviewer("REVIEWER")).toBe(true);
    expect(isReviewer("INTERNAL_ADMIN")).toBe(false);
  });
});
