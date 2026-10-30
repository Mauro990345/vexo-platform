import { evolutionBaseConfig } from "@/lib/whatsapp";

// Gerenciamento de instâncias na Evolution API — uma instância por clínica
// (número de WhatsApp próprio, isolado das demais). Só a criação/pareamento
// (QR code) vive aqui; o envio de mensagens continua em src/lib/whatsapp.ts.
//
// Os nomes de campo na resposta variam um pouco entre versões da Evolution
// API — por isso as funções abaixo aceitam mais de uma variante conhecida em
// vez de assumir um formato único.

export type WhatsappConnectionState = "open" | "connecting" | "close" | "unknown";

// 8s por chamada (AbortSignal.timeout) — mesmo valor/padrão de
// evolution-diagnostics.ts. Bug real investigado: a consulta de
// /instance/fetchInstances ficou dando timeout em produção (Evolution nova,
// v2.3.7) sem nenhum limite, o que deixava a tela de conexão pendurada
// esperando. Com o limite, um timeout vira só mais um tipo de falha
// (tratada como ambígua/indeterminada — ver whatsappInstanceExists abaixo),
// nunca uma espera sem fim.
const REQUEST_TIMEOUT_MS = 8_000;

// Dois jeitos "a instância existe mas está quebrada" que a Evolution 2.3.7
// devolve (bug real investigado em produção, depois da troca pra v2.3.7 com
// patch do baileys): "instância fantasma" — existe no banco da Evolution e
// aparece no Manager, mas não está carregada em memória, então
// connect/connectionState/delete devolvem 404 OU 400 "The '<nome>' instance
// does not exist" (a Evolution não é consistente sobre qual dos dois status
// usa); e "nome já em uso" — o /instance/create de um nome que já existe
// (tipicamente a MESMA instância fantasma barrando o nome de ser reusado).
// ensureWhatsappQrForClinic (whatsapp-connection.ts) reage a cada um dos
// dois pra se recuperar sozinho, sem precisar abrir o Manager.
export class EvolutionInstanceNotFoundError extends Error {
  constructor(instanceName: string) {
    super(`A instância "${instanceName}" não existe (ou não está carregada) na Evolution API.`);
    this.name = "EvolutionInstanceNotFoundError";
  }
}

export class EvolutionInstanceNameInUseError extends Error {
  constructor(instanceName: string) {
    super(`O nome "${instanceName}" já está em uso na Evolution API.`);
    this.name = "EvolutionInstanceNameInUseError";
  }
}

// A Evolution 2.3.7 não é consistente entre 400 e 404 pra "essa instância
// não existe" (confirmado em produção: os dois apareceram pro mesmo caso de
// instância fantasma) — por isso checa os dois status, e só confia no texto
// da mensagem quando o status for 400 (um 404 puro já é confiável sozinho).
function isInstanceNotFoundResponse(status: number, body: string): boolean {
  return status === 404 || (status === 400 && /does not exist/i.test(body));
}

function isNameInUseResponse(body: string): boolean {
  return /already in use/i.test(body);
}

function normalizeQrBase64(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
}

// Movido de evolution-diagnostics.ts (ver lá — ficava ao lado do único
// outro lugar que lia /instance/fetchInstances) pra cá: whatsappInstanceExists,
// abaixo, também precisa listar as instâncias reais, e esta é a camada de
// baixo nível certa pra isso (evolution-diagnostics.ts já importa daqui,
// nunca o contrário). O formato da resposta varia entre versões da
// Evolution API (mesmo motivo documentado nas outras funções deste
// arquivo) — aceita as variantes conhecidas em vez de assumir uma só.
export type EvolutionInstanceInfo = { name: string; state: string | null };

export function parseInstanceList(data: unknown): EvolutionInstanceInfo[] {
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

// Bug real investigado: /instance/create (e o /instance/connect logo
// depois) rodavam em TODO carregamento da tela de conexão, mesmo pra uma
// instância já existente e com sessão ativa há meses — arriscado na
// Evolution 2.3.7 (recriar por cima de uma sessão existente é um caminho
// não documentado como seguro, diferente de só pedir um QR novo numa
// instância já criada). Consulta /instance/fetchInstances (mesmo endpoint
// já usado por runEvolutionDiagnostics, evolution-diagnostics.ts) e só
// diz "não existe" quando o nome salvo genuinamente não aparece na lista
// devolvida pela Evolution — qualquer ambiguidade (timeout, erro de rede,
// resposta em formato inesperado) devolve `true` ("talvez exista, não
// force criação"). Isso NÃO significa "assume que está tudo bem": quem
// chama (ensureWhatsappQrForClinic, whatsapp-connection.ts) sempre tenta o
// /instance/connect de verdade logo em seguida e reage ao erro real que
// vier de lá (inclusive recriando sozinho se a resposta for "não existe")
// — é essa reação ao connect, não o palpite desta função, que decide de
// fato (pedido explícito, item "c": "trate como indeterminado, tente o
// connect, e aja pelo erro retornado").
export async function whatsappInstanceExists(instanceName: string): Promise<boolean> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  try {
    const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return true;
    const data = await res.json();
    // parseInstanceList devolve [] tanto pra "lista vazia de verdade"
    // quanto pra "formato inesperado" (ver o próprio fallback dela) — os
    // dois NÃO são o mesmo caso aqui: lista vazia de verdade é uma
    // resposta válida (nenhuma instância ainda, pode criar), formato
    // inesperado é ambíguo (assume que existe). Por isso o Array.isArray
    // é checado aqui, antes de chamar parseInstanceList, em vez de
    // confiar no fallback dela.
    if (!Array.isArray(data)) return true;
    const instances = parseInstanceList(data);
    return instances.some((i) => i.name === instanceName);
  } catch {
    return true;
  }
}

// `tolerateConflict` (default true): se a instância já existir, a
// Evolution API normalmente responde 403/409 — não tratamos isso como
// falha no caminho NORMAL (chamada depois de whatsappInstanceExists
// confirmar que a instância NÃO existe, ver ensureWhatsappQrForClinic);
// continua como rede de segurança pra uma corrida genuína (duas abas
// abrindo a tela ao mesmo tempo). Já "nome já em uso" (texto da
// mensagem, não status) SEMPRE lança EvolutionInstanceNameInUseError,
// mesmo com tolerateConflict=true — é o sinal que ensureWhatsappQrForClinic
// usa pra saber quando desistir do nome atual e gerar um novo (pedido
// explícito, item "a"). `tolerateConflict: false` é usado só no caminho de
// recuperação (depois de um /instance/connect confirmar "não existe"):
// ali, QUALQUER conflito (403/409 que não seja "already in use") também
// deve subir como erro real, nunca ser silenciado — se a instância
// realmente não existia, um create que falhe por outro motivo é
// informação nova, não ruído a ignorar.
export async function createWhatsappInstance(
  instanceName: string,
  { tolerateConflict = true }: { tolerateConflict?: boolean } = {}
): Promise<void> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  const res = await fetch(`${baseUrl}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.ok) return;

  const body = await res.text();

  if (isNameInUseResponse(body)) {
    throw new EvolutionInstanceNameInUseError(instanceName);
  }

  if (tolerateConflict && (res.status === 403 || res.status === 409)) return;

  throw new Error(`Falha ao criar instância "${instanceName}" na Evolution API (${res.status}): ${body}`);
}

// O pareamento também retorna um "pairingCode" (equivalente a uma chave de
// sessão) — deliberadamente não o expomos aqui: só o QR visual sai desta
// função, pra não correr o risco de alguém exibir esse valor em algum lugar.
export async function fetchWhatsappQr(instanceName: string): Promise<{ qrBase64: string | null }> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  const res = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    if (isInstanceNotFoundResponse(res.status, body)) {
      throw new EvolutionInstanceNotFoundError(instanceName);
    }
    throw new Error(`Falha ao buscar QR code da instância "${instanceName}" (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { qrBase64: normalizeQrBase64(data?.base64 ?? data?.qrcode?.base64 ?? data?.qr) };
}

export async function fetchWhatsappConnectionState(instanceName: string): Promise<WhatsappConnectionState> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  const res = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) return "unknown";

  const data = await res.json();
  const state = data?.instance?.state ?? data?.state;
  return state === "open" || state === "connecting" || state === "close" ? state : "unknown";
}

// Desconecta o número sem apagar a instância — o próximo /instance/connect
// gera um QR code novo para reparear. Continua usada pelo botão
// "Desconectar" (status "open" — soltar um número já funcionando, ver
// WhatsappConnectionPanel.tsx).
export async function logoutWhatsappInstance(instanceName: string): Promise<void> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  const res = await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
    method: "DELETE",
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Falha ao desconectar instância "${instanceName}" (${res.status}): ${body}`);
  }
}

// Apaga a instância de verdade (não só desloga) — endpoint confirmado
// contra o código-fonte da Evolution API (src/api/routes/instance.router.ts,
// rota DELETE routerPath('delete')). Usada pelo botão "Reiniciar
// pareamento" (ver WhatsappConnectionPanel.tsx/resetWhatsappPairing em
// whatsapp-connection.ts): logout sozinho NÃO limpa uma sessão/credenciais
// corrompidas do lado da Evolution; apagar e deixar o próximo carregamento
// da tela recriar do zero (ensureWhatsappQrForClinic) é o que garante uma
// sessão genuinamente nova.
// Devolve { notFound: true } (em vez de lançar) quando a Evolution diz que
// a instância não existe (404, ou 400 "does not exist") — esse É o estado
// final desejado (ela já não está lá), mas quem chama (resetWhatsappPairing)
// usa esse sinal pra saber que o NOME atual pode estar "queimado" (a mesma
// instância fantasma investigada — existe no banco da Evolution e no
// Manager, mas não carregada em memória) e decidir gerar um nome novo em
// vez de insistir no mesmo (pedido explícito, item "b").
export async function deleteWhatsappInstance(instanceName: string): Promise<{ notFound: boolean }> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  const res = await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
    method: "DELETE",
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.ok) return { notFound: false };

  const body = await res.text();
  if (isInstanceNotFoundResponse(res.status, body)) return { notFound: true };

  throw new Error(`Falha ao apagar instância "${instanceName}" na Evolution API (${res.status}): ${body}`);
}
