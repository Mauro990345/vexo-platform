import { evolutionBaseConfig } from "@/lib/whatsapp";

// Diagnóstico SOMENTE LEITURA da Evolution API, por clínica — nunca envia
// mensagem, nunca grava nada no banco. Criado pra investigar um caso real:
// o envio pelo VEXO falhava com 404 "instance does not exist", mas a
// mesma instância aparecia "Connected" no próprio manager da Evolution
// (aberto direto no navegador do dono, não pelo servidor do VEXO). Isso
// descarta "a instância está desconectada" e aponta pra uma das duas
// causas abaixo, que esta tela existe pra distinguir sem adivinhar:
//   1. O servidor do VEXO está falando com uma URL/chave diferente da que
//      o manager usa (ambiente errado, chave revogada só pro servidor,
//      etc.) — ver apiUrlHost/fetchInstancesError.
//   2. O nome salvo em Clinic.whatsappInstanceName não bate EXATAMENTE
//      com o nome real na Evolution (espaço, maiúscula/minúscula, ou
//      caractere invisível colado do manager) — ver nameMatchesList.
//
// Cada chamada é isolada em try/catch — a falha de uma nunca impede as
// outras nem derruba a página; cada campo é null quando não foi possível
// obter aquele dado específico. 8s de timeout por chamada (AbortSignal.timeout)
// pra nunca deixar a aba "Status" inteira pendurada esperando uma Evolution
// fora do ar — timeout vira só mais um tipo de erro mostrado na tela.
export type EvolutionInstanceInfo = { name: string; state: string | null };

export type EvolutionDiagnostics = {
  apiUrlHost: string | null;
  apiUrlError: string | null;
  savedInstanceName: string | null;
  savedInstanceNameLength: number | null;
  instances: EvolutionInstanceInfo[] | null;
  fetchInstancesError: { status: number | null; message: string } | null;
  nameMatchesList: boolean | null;
  connectionState: { status: number; body: string } | null;
  connectionStateError: string | null;
};

const REQUEST_TIMEOUT_MS = 8_000;

// Só o host (ex.: "evolution.vexo.com.br") — nunca a URL completa (pode
// conter credencial embutida em algum setup) nem, em nenhuma hipótese, a
// API key. Pedido explícito.
function extractHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return rawUrl;
  }
}

// O formato da resposta de /instance/fetchInstances varia entre versões
// da Evolution API (mesmo motivo já documentado em whatsapp-instance.ts)
// — aceita as variantes conhecidas em vez de assumir uma só.
function parseInstanceList(data: unknown): EvolutionInstanceInfo[] {
  if (!Array.isArray(data)) return [];
  return data.map((item): EvolutionInstanceInfo => {
    const record = (item ?? {}) as Record<string, unknown>;
    const nested = record.instance as Record<string, unknown> | undefined;
    const name =
      (typeof record.name === "string" && record.name) ||
      (typeof nested?.instanceName === "string" && nested.instanceName) ||
      (typeof record.instanceName === "string" && record.instanceName) ||
      "(sem nome)";
    const state =
      (typeof record.connectionStatus === "string" && record.connectionStatus) ||
      (typeof nested?.status === "string" && nested.status) ||
      (typeof record.status === "string" && record.status) ||
      null;
    return { name, state };
  });
}

export async function runEvolutionDiagnostics(savedInstanceName: string | null): Promise<EvolutionDiagnostics> {
  const result: EvolutionDiagnostics = {
    apiUrlHost: null,
    apiUrlError: null,
    savedInstanceName,
    savedInstanceNameLength: savedInstanceName?.length ?? null,
    instances: null,
    fetchInstancesError: null,
    nameMatchesList: null,
    connectionState: null,
    connectionStateError: null,
  };

  let baseUrl: string;
  let apiKey: string;
  try {
    ({ baseUrl, apiKey } = evolutionBaseConfig());
    result.apiUrlHost = extractHost(baseUrl);
  } catch (err) {
    // EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes — nenhuma chamada abaixo
    // tem como ser feita.
    result.apiUrlError = err instanceof Error ? err.message : String(err);
    return result;
  }

  try {
    const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text();
      result.fetchInstancesError = { status: res.status, message: body.slice(0, 500) };
    } else {
      result.instances = parseInstanceList(await res.json());
    }
  } catch (err) {
    result.fetchInstancesError = { status: null, message: err instanceof Error ? err.message : String(err) };
  }

  if (result.instances && savedInstanceName) {
    result.nameMatchesList = result.instances.some((i) => i.name === savedInstanceName);
  }

  if (savedInstanceName) {
    try {
      const res = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(savedInstanceName)}`, {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await res.text();
      result.connectionState = { status: res.status, body: body.slice(0, 1000) };
    } catch (err) {
      result.connectionStateError = err instanceof Error ? err.message : String(err);
    }
  }

  return result;
}
