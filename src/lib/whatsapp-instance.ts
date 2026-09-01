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

// Idempotente: se a instância já existir, a Evolution API normalmente
// responde 403/409 — não tratamos isso como falha, quem chama segue
// direto pro /instance/connect de qualquer forma.
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
