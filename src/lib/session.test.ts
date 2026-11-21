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
const clinicFindUniqueMock = vi.fn(async (_arg: unknown): Promise<{ active: boolean } | null> => ({ active: true }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (arg: unknown) => findUniqueMock(arg) },
    clinic: { findUnique: (arg: unknown) => clinicFindUniqueMock(arg) },
  },
}));

const {
  requireSession,
  requireInternalSession,
  requireInternalOrReviewerSession,
  requireCrmAreaSession,
  requireAdminSession,
  requireClientSession,
  requireClientFilaSession,
  isInternal,
  isReviewer,
} = await import("./session");

function session(role: string, clinicId: string | null = null, extra: { id?: string; scope?: "fila" | null } = {}) {
  return { user: { id: extra.id ?? "user-1", name: "Fulano", role, clinicId, scope: extra.scope } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue(session("INTERNAL_ADMIN"));
  findUniqueMock.mockResolvedValue({ active: true });
  clinicFindUniqueMock.mockResolvedValue({ active: true });
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

  // Bug real corrigido nesta mudança: o sub sintético de um acesso por
  // link (ClientPanelLink/ClientFilaLink, sem User real por trás — ver
  // acesso/[token] e acesso-fila/[token]/route.ts) caía antes no MESMO
  // findUnique de User acima, que nunca acha nada pra esse id e tratava
  // qualquer acesso por link como "desativado". Agora valida pela
  // Clinic em vez do User pra esses dois prefixos.
  describe("sessão nascida de um link permanente (sub sintético, sem User real)", () => {
    it("ClientPanelLink (sub 'client-panel-link:'): valida pela Clinic, NUNCA consulta User", async () => {
      getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1", { id: "client-panel-link:clinic-1" }));
      const s = await requireSession();
      expect(s.user.clinicId).toBe("clinic-1");
      expect(findUniqueMock).not.toHaveBeenCalled();
      expect(clinicFindUniqueMock).toHaveBeenCalledWith({ where: { id: "clinic-1" }, select: { active: true } });
    });

    it("ClientFilaLink (sub 'client-fila-link:'): mesma validação pela Clinic", async () => {
      getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1", { id: "client-fila-link:clinic-1", scope: "fila" }));
      const s = await requireSession();
      expect(s.user.clinicId).toBe("clinic-1");
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it("Clinic.active=false (contrato encerrado): manda pro /entrar", async () => {
      clinicFindUniqueMock.mockResolvedValue({ active: false });
      getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1", { id: "client-panel-link:clinic-1" }));
      await expect(requireSession()).rejects.toThrow("REDIRECT:/entrar");
    });

    it("sem clinicId (nunca deveria acontecer, mas não quebra): manda pro /entrar sem consultar nada", async () => {
      getServerSessionMock.mockResolvedValue(session("CLIENT", null, { id: "client-panel-link:clinic-1" }));
      await expect(requireSession()).rejects.toThrow("REDIRECT:/entrar");
      expect(clinicFindUniqueMock).not.toHaveBeenCalled();
    });
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

describe("requireClientSession — painel completo (/dashboard)", () => {
  it("CLIENT com clinicId, sem scope (ClientPanelLink/login normal): passa", async () => {
    getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1"));
    const s = await requireClientSession();
    expect(s.user.role).toBe("CLIENT");
  });

  it("qualquer outro papel: redireciona pro /crm", async () => {
    getServerSessionMock.mockResolvedValue(session("INTERNAL_ADMIN"));
    await expect(requireClientSession()).rejects.toThrow("REDIRECT:/crm");
  });

  // Regra de segurança pedida explicitamente: quem só tem o link da Fila
  // (scope "fila") NUNCA alcança o painel, mesmo digitando a URL direto
  // (mesmo com CLIENT + clinicId válidos) — segunda camada, a principal é
  // o middleware (isFilaScopeAllowedPath).
  it("CLIENT com scope='fila' (só o link da Fila): redireciona pro /dashboard/fila, NUNCA passa", async () => {
    getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1", { id: "client-fila-link:clinic-1", scope: "fila" }));
    await expect(requireClientSession()).rejects.toThrow("REDIRECT:/dashboard/fila");
  });
});

describe("requireClientFilaSession — Fila do cliente (/dashboard/fila)", () => {
  it("CLIENT com clinicId, sem scope (link do painel completo): passa — inverso é permitido de propósito", async () => {
    getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1"));
    const s = await requireClientFilaSession();
    expect(s.user.role).toBe("CLIENT");
  });

  it("CLIENT com scope='fila' (link da Fila): passa normalmente", async () => {
    getServerSessionMock.mockResolvedValue(session("CLIENT", "clinic-1", { id: "client-fila-link:clinic-1", scope: "fila" }));
    const s = await requireClientFilaSession();
    expect(s.user.scope).toBe("fila");
  });

  it("qualquer outro papel: redireciona pro /crm", async () => {
    getServerSessionMock.mockResolvedValue(session("INTERNAL_ADMIN"));
    await expect(requireClientFilaSession()).rejects.toThrow("REDIRECT:/crm");
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
