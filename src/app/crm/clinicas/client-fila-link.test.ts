import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Segundo link de acesso do cliente (ClientFilaLink) — mesmo padrão do
// ClientPanelLink original: token reaproveitado se já existe, criar
// gera um novo, cancelar apaga a linha. Sem "regenerar" separado.
const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const clientFilaLinkFindUniqueMock = vi.fn();
const clientFilaLinkCreateMock = vi.fn();
const clientFilaLinkDeleteManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientFilaLink: {
      findUnique: (...args: unknown[]) => clientFilaLinkFindUniqueMock(...args),
      create: (...args: unknown[]) => clientFilaLinkCreateMock(...args),
      deleteMany: (...args: unknown[]) => clientFilaLinkDeleteManyMock(...args),
    },
  },
}));

const { getOrCreateClientFilaLink, revokeClientFilaLink } = await import("./actions");

const ORIGINAL_APP_URL = process.env.APP_URL;

beforeEach(() => {
  vi.clearAllMocks();
  requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
  process.env.APP_URL = "https://vexo.example.com";
});

afterAll(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = ORIGINAL_APP_URL;
});

describe("getOrCreateClientFilaLink", () => {
  it("já existe um link: devolve o MESMO token/url, nunca cria um novo", async () => {
    clientFilaLinkFindUniqueMock.mockResolvedValue({ token: "token-existente" });

    const result = await getOrCreateClientFilaLink("clinic-1");

    expect(result).toEqual({ token: "token-existente", url: "https://vexo.example.com/acesso-fila/token-existente" });
    expect(clientFilaLinkCreateMock).not.toHaveBeenCalled();
  });

  it("sem link ainda: cria um token novo e devolve a URL /acesso-fila/<token>", async () => {
    clientFilaLinkFindUniqueMock.mockResolvedValue(null);

    const result = await getOrCreateClientFilaLink("clinic-1");

    expect(clientFilaLinkCreateMock).toHaveBeenCalledTimes(1);
    const createArgs = clientFilaLinkCreateMock.mock.calls[0]![0] as { data: { clinicId: string; token: string } };
    expect(createArgs.data.clinicId).toBe("clinic-1");
    expect(result.url).toBe(`https://vexo.example.com/acesso-fila/${createArgs.data.token}`);
  });

  it("exige sessão interna", async () => {
    requireInternalSessionMock.mockRejectedValue(new Error("não autenticado"));
    await expect(getOrCreateClientFilaLink("clinic-1")).rejects.toThrow("não autenticado");
    expect(clientFilaLinkFindUniqueMock).not.toHaveBeenCalled();
  });
});

describe("revokeClientFilaLink", () => {
  it("apaga a linha desta clínica", async () => {
    await revokeClientFilaLink("clinic-1");
    expect(clientFilaLinkDeleteManyMock).toHaveBeenCalledWith({ where: { clinicId: "clinic-1" } });
  });

  it("exige sessão interna", async () => {
    requireInternalSessionMock.mockRejectedValue(new Error("não autenticado"));
    await expect(revokeClientFilaLink("clinic-1")).rejects.toThrow("não autenticado");
    expect(clientFilaLinkDeleteManyMock).not.toHaveBeenCalled();
  });
});
