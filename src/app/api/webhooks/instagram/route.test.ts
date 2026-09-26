import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Bug real reportado em produção: um áudio com attachment CORRETAMENTE
// detectado (payload confirmado em /crm/webhook-logs) mesmo assim
// aparecia descartado com a mensagem genérica "sem campo text e sem
// áudio reconhecido" — logicamente incorreta, já que o áudio tinha sido
// reconhecido. Causa raiz: nem o catch de erro de transcrição nem o caso
// de transcrição vazia tinham um `continue` — a execução caía direto no
// bloco de descarte genérico mais abaixo, que SOBRESCREVIA o
// matchFailureReason específico (com o erro real) pela mensagem
// genérica, escondendo a causa de verdade. Estes testes provam que cada
// desfecho grava sua própria mensagem e sai do loop, sem deixar o bloco
// genérico rodar por cima.
const verifyWebhookSignatureMock = vi.fn(() => true);
vi.mock("@/lib/instagram", () => ({
  verifyWebhookSignature: (...args: unknown[]) => verifyWebhookSignatureMock(...args),
  requestThreadControl: vi.fn(),
}));

const handleInboundInstagramMessageMock = vi.fn();
vi.mock("@/lib/conversation-pipeline", () => ({
  handleInboundInstagramMessage: (...args: unknown[]) => handleInboundInstagramMessageMock(...args),
}));

vi.mock("@/lib/conversation-lock", () => ({
  withConversationLock: (_key: string, fn: () => unknown) => fn(),
}));

const bufferForDebounceMock = vi.fn();
vi.mock("@/lib/inbound-debounce", () => ({
  bufferForDebounce: (...args: unknown[]) => bufferForDebounceMock(...args),
}));

vi.mock("@/lib/crypto", () => ({ decryptToken: (v: string) => v }));

const webhookLogCreateMock = vi.fn();
const webhookLogUpdateMock = vi.fn();
const messageFindFirstMock = vi.fn();
const instagramAccountFindFirstMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookLog: {
      create: (...args: unknown[]) => webhookLogCreateMock(...args),
      update: (...args: unknown[]) => webhookLogUpdateMock(...args),
    },
    message: { findFirst: (...args: unknown[]) => messageFindFirstMock(...args) },
    instagramAccount: { findFirst: (...args: unknown[]) => instagramAccountFindFirstMock(...args) },
  },
}));

const transcribeAudioFromUrlMock = vi.fn();
vi.mock("@/lib/speech-to-text", () => ({
  transcribeAudioFromUrl: (...args: unknown[]) => transcribeAudioFromUrlMock(...args),
}));

// Payload real capturado em produção (ver conversa) — sender é o lead,
// recipient/entry.id é a conta da clínica, message.attachments confirma
// o formato exato que a Meta usa pra nota de voz neste produto.
function buildAudioPayload() {
  return {
    entry: [
      {
        id: "17841429744434753",
        messaging: [
          {
            sender: { id: "2127850630922399" },
            recipient: { id: "17841429744434753" },
            timestamp: 1790396922863,
            message: {
              mid: "mid-audio-1",
              attachments: [{ type: "audio", payload: { url: "https://lookaside.fbsbx.com/audio.bin" } }],
            },
          },
        ],
      },
    ],
  };
}

async function postWebhook(payload: unknown) {
  const { POST } = await import("./route");
  const req = new NextRequest("https://vexo.example.com/api/webhooks/instagram", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "x-hub-signature-256": "sha256=fake" },
  });
  return POST(req);
}

describe("POST /api/webhooks/instagram — mensagem de áudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    webhookLogCreateMock.mockResolvedValue({ id: "log-1" });
    webhookLogUpdateMock.mockResolvedValue({});
    messageFindFirstMock.mockResolvedValue(null);
  });

  it("falha na transcrição grava o motivo ESPECÍFICO, sem ser sobrescrita pelo descarte genérico", async () => {
    transcribeAudioFromUrlMock.mockRejectedValue(
      new Error("Falha ao transcrever áudio via OpenRouter (400): formato não suportado")
    );

    await postWebhook(buildAudioPayload());

    const lastUpdateCall = webhookLogUpdateMock.mock.calls.at(-1);
    const reason = (lastUpdateCall?.[0] as { data: { matchFailureReason: string } })?.data.matchFailureReason;
    expect(reason).toContain("Falha ao transcrever mensagem de áudio");
    expect(reason).not.toContain("sem áudio reconhecido");
    expect(bufferForDebounceMock).not.toHaveBeenCalled();
  });

  it("transcrição vazia grava um motivo específico, também sem sobrescrita pelo descarte genérico", async () => {
    transcribeAudioFromUrlMock.mockResolvedValue("   ");

    await postWebhook(buildAudioPayload());

    const lastUpdateCall = webhookLogUpdateMock.mock.calls.at(-1);
    const reason = (lastUpdateCall?.[0] as { data: { matchFailureReason: string } })?.data.matchFailureReason;
    expect(reason).toContain("transcrição veio vazia");
    expect(reason).not.toContain("sem áudio reconhecido");
    expect(bufferForDebounceMock).not.toHaveBeenCalled();
  });

  it("transcrição bem-sucedida entra no buffer de debounce com o prefixo 🎤, nunca é descartada", async () => {
    transcribeAudioFromUrlMock.mockResolvedValue("Oi, queria saber sobre o procedimento.");

    await postWebhook(buildAudioPayload());

    expect(transcribeAudioFromUrlMock).toHaveBeenCalledWith("https://lookaside.fbsbx.com/audio.bin");
    expect(bufferForDebounceMock).toHaveBeenCalledOnce();
    const bufferedMessage = bufferForDebounceMock.mock.calls[0]?.[1] as { text: string };
    expect(bufferedMessage.text).toBe("🎤 Oi, queria saber sobre o procedimento.");
  });
});
