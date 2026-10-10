import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runEvolutionDiagnostics } from "./evolution-diagnostics";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("runEvolutionDiagnostics", () => {
  beforeEach(() => {
    process.env.EVOLUTION_API_URL = "https://evolution.vexo.com.br";
    process.env.EVOLUTION_API_KEY = "fake-key-nao-deve-aparecer-no-resultado";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
  });

  it("sem EVOLUTION_API_URL/EVOLUTION_API_KEY: devolve o erro, nunca chama fetch", async () => {
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;

    const result = await runEvolutionDiagnostics("main");

    expect(result.apiUrlError).toBeTruthy();
    expect(result.apiUrlHost).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("só o HOST aparece em apiUrlHost — nunca a URL completa, nunca a API key em nenhum campo do resultado", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, [{ name: "main", connectionStatus: "open" }]));

    const result = await runEvolutionDiagnostics("main");

    expect(result.apiUrlHost).toBe("evolution.vexo.com.br");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("fake-key-nao-deve-aparecer-no-resultado");
    expect(serialized).not.toContain("https://evolution.vexo.com.br"); // só o host, nunca a URL completa
  });

  it("nome salvo bate com a lista: nameMatchesList=true, instâncias e connectionState preenchidos", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, [
          { name: "main", connectionStatus: "open" },
          { name: "clinica-x", connectionStatus: "close" },
        ])
      )
      .mockResolvedValueOnce(jsonResponse(200, { instance: { state: "open" } }));

    const result = await runEvolutionDiagnostics("main");

    expect(result.instances).toEqual([
      { name: "main", state: "open" },
      { name: "clinica-x", state: "close" },
    ]);
    expect(result.nameMatchesList).toBe(true);
    expect(result.connectionState).toEqual({ status: 200, body: JSON.stringify({ instance: { state: "open" } }) });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://evolution.vexo.com.br/instance/connectionState/main",
      expect.objectContaining({ headers: { apikey: "fake-key-nao-deve-aparecer-no-resultado" } })
    );
  });

  // Caso real investigado: nome salvo não bate com NENHUM da lista (ex.:
  // espaço ou caractere invisível copiado do manager da Evolution) — é
  // isso que explica "Connected" no manager e 404 "instance does not
  // exist" no envio pelo VEXO ao mesmo tempo.
  it("nome salvo NÃO bate com nenhum da lista: nameMatchesList=false", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{ name: "main ", connectionStatus: "open" }])) // espaço no fim
      .mockResolvedValueOnce(jsonResponse(404, { message: 'The "main" instance does not exist' }));

    const result = await runEvolutionDiagnostics("main");

    expect(result.nameMatchesList).toBe(false);
    expect(result.connectionState?.status).toBe(404);
  });

  it("fetchInstances rejeitado com 401/403: captura status e corpo, sinaliza possível problema de chave na mensagem exibida", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { state: "open" }));

    const result = await runEvolutionDiagnostics("main");

    expect(result.fetchInstancesError).toEqual({ status: 401, message: "Unauthorized" });
    expect(result.instances).toBeNull();
    expect(result.nameMatchesList).toBeNull();
  });

  it("sem nome de instância salvo: não chama connectionState, savedInstanceNameLength é null", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [{ name: "main", connectionStatus: "open" }]));

    const result = await runEvolutionDiagnostics(null);

    expect(result.savedInstanceNameLength).toBeNull();
    expect(result.connectionState).toBeNull();
    expect(result.connectionStateError).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // só fetchInstances, nunca connectionState
  });

  it("aceita o formato antigo da resposta (instance.instanceName/instance.status), não só o novo (name/connectionStatus)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{ instance: { instanceName: "main", status: "open" } }]))
      .mockResolvedValueOnce(jsonResponse(200, { state: "open" }));

    const result = await runEvolutionDiagnostics("main");

    expect(result.instances).toEqual([{ name: "main", state: "open" }]);
    expect(result.nameMatchesList).toBe(true);
  });

  it("erro de rede/timeout no fetchInstances: captura a mensagem, nunca lança", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { state: "unknown" }));

    const result = await runEvolutionDiagnostics("main");

    expect(result.fetchInstancesError).toEqual({ status: null, message: "timeout" });
    expect(result.instances).toBeNull();
  });

  it("nunca lança mesmo quando TUDO falha — sempre devolve um objeto", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new Error("Evolution fora do ar"));

    const result = await runEvolutionDiagnostics("main");

    expect(result.fetchInstancesError).toEqual({ status: null, message: "Evolution fora do ar" });
    expect(result.connectionStateError).toBe("Evolution fora do ar");
  });
});
