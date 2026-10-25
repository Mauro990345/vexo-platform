import { evolutionBaseConfig } from "@/lib/whatsapp";

// Gerenciamento de instâncias na Evolution API — uma instância por clínica
// (número de WhatsApp próprio, isolado das demais). Só a criação/pareamento
// (QR code) vive aqui; o envio de mensagens continua em src/lib/whatsapp.ts.
//
// Os nomes de campo na resposta variam um pouco entre versões da Evolution
// API — por isso as funções abaixo aceitam mais de uma variante conhecida em
// vez de assumir um formato único.

export type WhatsappConnectionState = "open" | "connecting" | "close" | "unknown";

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
// devolvida pela Evolution — qualquer ambiguidade (erro de rede, resposta
// em formato inesperado) devolve `true` (assume que existe): o custo de
// pular uma criação desnecessária por engano é ZERO (createWhatsappInstance
// continua tolerando 403/409 como rede de segurança, ver abaixo); o custo
// de recriar por engano uma instância que já existia é o bug que motivou
// esta função — por isso o lado seguro do empate é sempre "não criar".
export async function whatsappInstanceExists(instanceName: string): Promise<boolean> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  try {
    const res = await fetch(`${baseUrl}/instance/fetchInstances`, { headers: { apikey: apiKey } });
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

// Idempotente: se a instância já existir, a Evolution API normalmente
// responde 403/409 — não tratamos isso como falha. Hoje só é chamada
// depois de whatsappInstanceExists confirmar que a instância NÃO existe
// (ver ensureWhatsappQrForClinic, whatsapp-connection.ts); a tolerância a
// 403/409 continua como rede de segurança pra uma corrida genuína (duas
// abas abrindo a tela ao mesmo tempo, por exemplo), não como o caminho
// principal.
export async function createWhatsappInstance(instanceName: string): Promise<void> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  const res = await fetch(`${baseUrl}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });

  if (!res.ok && res.status !== 403 && res.status !== 409) {
    const body = await res.text();
    throw new Error(`Falha ao criar instância "${instanceName}" na Evolution API (${res.status}): ${body}`);
  }
}

// O pareamento também retorna um "pairingCode" (equivalente a uma chave de
// sessão) — deliberadamente não o expomos aqui: só o QR visual sai desta
// função, pra não correr o risco de alguém exibir esse valor em algum lugar.
export async function fetchWhatsappQr(instanceName: string): Promise<{ qrBase64: string | null }> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  const res = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
    headers: { apikey: apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao buscar QR code da instância "${instanceName}" (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { qrBase64: normalizeQrBase64(data?.base64 ?? data?.qrcode?.base64 ?? data?.qr) };
}

export async function fetchWhatsappConnectionState(instanceName: string): Promise<WhatsappConnectionState> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  const res = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
    headers: { apikey: apiKey },
  });

  if (!res.ok) return "unknown";

  const data = await res.json();
  const state = data?.instance?.state ?? data?.state;
  return state === "open" || state === "connecting" || state === "close" ? state : "unknown";
}

// Desconecta o número sem apagar a instância — o próximo /instance/connect
// gera um QR code novo para reparear.
export async function logoutWhatsappInstance(instanceName: string): Promise<void> {
  const { baseUrl, apiKey } = evolutionBaseConfig();

  const res = await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
    method: "DELETE",
    headers: { apikey: apiKey },
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Falha ao desconectar instância "${instanceName}" (${res.status}): ${body}`);
  }
}
