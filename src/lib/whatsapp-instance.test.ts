import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { whatsappInstanceExists, parseInstanceList, deleteWhatsappInstance } from "./whatsapp-instance";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

// Bug real investigado: createWhatsappInstance (e o fetchWhatsappQr logo
// depois) rodavam em TODO carregamento da tela de conexão, mesmo pra uma
// instância já existente e com sessão ativa há meses — arriscado na
// Evolution 2.3.7. whatsappInstanceExists é a checagem que evita isso (ver
// ensureWhatsappQrForClinic, whatsapp-connection.ts) — consulta
// /instance/fetchInstances (mesmo endpoint já usado por
// runEvolutionDiagnostics) e só diz "não existe" quando o nome
// genuinamente não aparece na lista.
describe("whatsappInstanceExists", () => {
  beforeEach(() => {
    process.env.EVOLUTION_API_URL = "https://evolution.vexo.com.br";
    process.env.EVOLUTION_API_KEY = "fake-key-de-teste";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
  });

  it("nome aparece na lista de instâncias: true", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse(200, [
        { name: "main", connectionStatus: "connecting" },
        { name: "outra-clinica", connectionStatus: "open" },
      ])
    );

    expect(await whatsappInstanceExists("main")).toBe(true);
  });

  it("nome NÃO aparece na lista: false — só aqui createWhatsappInstance deveria ser chamada depois", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, [{ name: "outra-clinica", connectionStatus: "open" }]));

    expect(await whatsappInstanceExists("clinica-nova")).toBe(false);
  });

  it("lista vazia (nenhuma instância ainda na Evolution): false", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    expect(await whatsappInstanceExists("main")).toBe(false);
  });

  it("erro HTTP da Evolution: ambíguo, assume que EXISTE (nunca arrisca recriar)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "falha interna" }));

    expect(await whatsappInstanceExists("main")).toBe(true);
  });

  it("erro de rede (fetch lança): ambíguo, assume que EXISTE", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new Error("timeout"));

    expect(await whatsappInstanceExists("main")).toBe(true);
  });

  it("resposta em formato inesperado (não é array): ambíguo, assume que EXISTE", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { unexpected: "shape" }));

    expect(await whatsappInstanceExists("main")).toBe(true);
  });
});

// "Reiniciar pareamento" (status "connecting") precisa APAGAR a
// instância, não só deslogar — logoutWhatsappInstance (já existente) não
// limpa uma sessão/credenciais corrompidas do lado da Evolution. Endpoint
// confirmado contra o código-fonte da Evolution API (instance.router.ts,
// rota DELETE routerPath('delete')).
describe("deleteWhatsappInstance", () => {
  beforeEach(() => {
    process.env.EVOLUTION_API_URL = "https://evolution.vexo.com.br";
    process.env.EVOLUTION_API_KEY = "fake-key-de-teste";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
  });

  it("chama DELETE /instance/delete/{instanceName} com a apikey", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "SUCCESS", error: false, message: "Instance deleted" }));

    await deleteWhatsappInstance("clinica-demo");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://evolution.vexo.com.br/instance/delete/clinica-demo",
      expect.objectContaining({ method: "DELETE", headers: { apikey: "fake-key-de-teste" } })
    );
  });

  it("404 (instância já não existe): sucesso silencioso, não lança", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(404, { message: "Instance not found" }));

    await expect(deleteWhatsappInstance("clinica-demo")).resolves.toBeUndefined();
  });

  it("outro erro HTTP: lança", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(500, { message: "falha interna" }));

    await expect(deleteWhatsappInstance("clinica-demo")).rejects.toThrow();
  });
});

describe("parseInstanceList", () => {
  it("aceita as variantes conhecidas de nome/estado entre versões da Evolution API", () => {
    const parsed = parseInstanceList([
      { name: "a", connectionStatus: "open" },
      { instance: { instanceName: "b", status: "close" } },
      { instanceName: "c", status: "connecting" },
    ]);
    expect(parsed).toEqual([
      { name: "a", state: "open" },
      { name: "b", state: "close" },
      { name: "c", state: "connecting" },
    ]);
  });

  it("entrada que não é array: lista vazia", () => {
    expect(parseInstanceList({ not: "an array" })).toEqual([]);
  });
});
