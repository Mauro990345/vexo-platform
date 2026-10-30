import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  whatsappInstanceExists,
  parseInstanceList,
  deleteWhatsappInstance,
  createWhatsappInstance,
  fetchWhatsappQr,
  EvolutionInstanceNotFoundError,
  EvolutionInstanceNameInUseError,
} from "./whatsapp-instance";

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

  it("200 (apagou de verdade): { notFound: false }", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "SUCCESS", error: false, message: "Instance deleted" }));

    await expect(deleteWhatsappInstance("clinica-demo")).resolves.toEqual({ notFound: false });
  });

  it("404 (instância já não existe): sucesso silencioso, { notFound: true } — não lança", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(404, { message: "Instance not found" }));

    await expect(deleteWhatsappInstance("clinica-demo")).resolves.toEqual({ notFound: true });
  });

  // Bug real investigado (Evolution 2.3.7, instância fantasma): o "não
  // existe" às vezes vem como 400 com a mensagem, não 404 — resetWhatsappPairing
  // (whatsapp-connection.ts) depende de { notFound: true } nos dois casos
  // pra saber que precisa gerar um nome novo em vez de insistir no atual.
  it('400 "does not exist" (instância fantasma): também { notFound: true }', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(400, { message: 'The "main" instance does not exist' }));

    await expect(deleteWhatsappInstance("main")).resolves.toEqual({ notFound: true });
  });

  it("outro erro HTTP: lança", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(500, { message: "falha interna" }));

    await expect(deleteWhatsappInstance("clinica-demo")).rejects.toThrow();
  });
});

// Bug real investigado (produção, depois da troca pra Evolution 2.3.7):
// instância "fantasma" — existe no banco da Evolution e aparece no
// Manager, mas não está carregada em memória — connect/connectionState
// devolvem 404 OU 400 "does not exist" (a Evolution não é consistente
// sobre qual dos dois). ensureWhatsappQrForClinic (whatsapp-connection.ts)
// reage a EvolutionInstanceNotFoundError pra se recuperar sozinho.
describe("fetchWhatsappQr — detecção de instância inexistente", () => {
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

  it("404: lança EvolutionInstanceNotFoundError", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(404, { message: 'The "main" instance does not exist' }));

    await expect(fetchWhatsappQr("main")).rejects.toThrow(EvolutionInstanceNotFoundError);
  });

  it('400 "does not exist" (o outro status visto em produção pro mesmo caso): lança EvolutionInstanceNotFoundError', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(400, { message: 'The "main" instance does not exist' }));

    await expect(fetchWhatsappQr("main")).rejects.toThrow(EvolutionInstanceNotFoundError);
  });

  it("400 com outra mensagem (não 'does not exist'): erro genérico, não EvolutionInstanceNotFoundError", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(400, { message: "Bad request" }));

    await expect(fetchWhatsappQr("main")).rejects.toThrow(/Falha ao buscar QR code/);
  });

  it("200: devolve o QR normalmente", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { base64: "xyz" }));

    await expect(fetchWhatsappQr("main")).resolves.toEqual({ qrBase64: "data:image/png;base64,xyz" });
  });
});

// Bug real investigado: criar com um nome que já existe devolve "This
// name ... is already in use" (texto, nem sempre o mesmo status) —
// ensureWhatsappQrForClinic (whatsapp-connection.ts) reage a
// EvolutionInstanceNameInUseError pra desistir do nome atual e gerar um
// novo.
describe("createWhatsappInstance — detecção de nome já em uso", () => {
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

  it('"already in use": lança EvolutionInstanceNameInUseError mesmo com tolerateConflict (default true)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(403, { message: 'This name "main" is already in use' }));

    await expect(createWhatsappInstance("main")).rejects.toThrow(EvolutionInstanceNameInUseError);
  });

  it("403/409 SEM ser 'already in use' + tolerateConflict (default): tolera, não lança (corrida genuína)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(409, { message: "conflict" }));

    await expect(createWhatsappInstance("main")).resolves.toBeUndefined();
  });

  it("403/409 SEM ser 'already in use' + tolerateConflict:false (caminho de recuperação): lança", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(409, { message: "conflict" }));

    await expect(createWhatsappInstance("main", { tolerateConflict: false })).rejects.toThrow();
  });

  it("200: sucesso, não lança", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { instance: { instanceName: "main" } }));

    await expect(createWhatsappInstance("main")).resolves.toBeUndefined();
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
