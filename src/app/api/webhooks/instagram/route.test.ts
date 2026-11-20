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
const verifyWebhookSignatureMock = vi.fn((..._args: unknown[]) => true);
vi.mock("@/lib/instagram", () => ({
  verifyWebhookSignature: (...args: unknown[]) => verifyWebhookSignatureMock(...args),
  requestThreadControl: vi.fn(),
}));

const handleInboundInstagramMessageMock = vi.fn();
// recordInboundInstagramMessage por padrão "grava" a mensagem e devolve um
// RecordedInboundMessage plausível, ecoando os parâmetros recebidos — cada
// teste pode sobrescrever isso (mockResolvedValueOnce) quando precisa de um
// comportamento específico (ex.: devolver null pra simular conta não
// encontrada).
const recordInboundInstagramMessageMock = vi.fn();
vi.mock("@/lib/conversation-pipeline", () => ({
  handleInboundInstagramMessage: (...args: unknown[]) => handleInboundInstagramMessageMock(...args),
  recordInboundInstagramMessage: (...args: unknown[]) => recordInboundInstagramMessageMock(...args),
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

let nextMessageId = 0;
function recordedMessageFor(params: { text: string; igMessageId?: string }) {
  nextMessageId += 1;
  return {
    id: `msg-${nextMessageId}`,
    conversationId: "conv-1",
    clinicId: "clinic-1",
    igUserId: "17841429744434753",
    leadIgScopedId: "2127850630922399",
    leadIgUsername: undefined,
    text: params.text,
    igMessageId: params.igMessageId,
    sentAt: new Date("2026-11-20T12:00:00.000Z"),
    reengaged: false,
  };
}

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

function buildTextPayload(messages: { mid: string; text: string }[]) {
  return {
    entry: [
      {
        id: "17841429744434753",
        messaging: messages.map((m, index) => ({
          sender: { id: "2127850630922399" },
          recipient: { id: "17841429744434753" },
          timestamp: 1790396922863 + index,
          message: { mid: m.mid, text: m.text },
        })),
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

beforeEach(() => {
  vi.clearAllMocks();
  nextMessageId = 0;
  webhookLogCreateMock.mockResolvedValue({ id: "log-1" });
  webhookLogUpdateMock.mockResolvedValue({});
  messageFindFirstMock.mockResolvedValue(null);
  recordInboundInstagramMessageMock.mockImplementation(async (params: { text: string; igMessageId?: string }) =>
    recordedMessageFor(params)
  );
});

describe("POST /api/webhooks/instagram — mensagem de áudio", () => {
  it("falha na transcrição grava o motivo ESPECÍFICO, sem ser sobrescrita pelo descarte genérico", async () => {
    transcribeAudioFromUrlMock.mockRejectedValue(
      new Error("Falha ao transcrever áudio via OpenRouter (400): formato não suportado")
    );

    await postWebhook(buildAudioPayload());

    const lastUpdateCall = webhookLogUpdateMock.mock.calls.at(-1);
    const reason = (lastUpdateCall?.[0] as { data: { matchFailureReason: string } })?.data.matchFailureReason;
    expect(reason).toContain("Falha ao transcrever mensagem de áudio");
    expect(reason).not.toContain("sem áudio reconhecido");
    expect(recordInboundInstagramMessageMock).not.toHaveBeenCalled();
    expect(bufferForDebounceMock).not.toHaveBeenCalled();
  });

  it("transcrição vazia grava um motivo específico, também sem sobrescrita pelo descarte genérico", async () => {
    transcribeAudioFromUrlMock.mockResolvedValue("   ");

    await postWebhook(buildAudioPayload());

    const lastUpdateCall = webhookLogUpdateMock.mock.calls.at(-1);
    const reason = (lastUpdateCall?.[0] as { data: { matchFailureReason: string } })?.data.matchFailureReason;
    expect(reason).toContain("transcrição veio vazia");
    expect(reason).not.toContain("sem áudio reconhecido");
    expect(recordInboundInstagramMessageMock).not.toHaveBeenCalled();
    expect(bufferForDebounceMock).not.toHaveBeenCalled();
  });

  it("transcrição bem-sucedida grava a mensagem (com o prefixo 🎤) e SÓ DEPOIS entra no buffer de debounce", async () => {
    transcribeAudioFromUrlMock.mockResolvedValue("Oi, queria saber sobre o procedimento.");

    await postWebhook(buildAudioPayload());

    expect(transcribeAudioFromUrlMock).toHaveBeenCalledWith("https://lookaside.fbsbx.com/audio.bin");
    expect(recordInboundInstagramMessageMock).toHaveBeenCalledOnce();
    expect(recordInboundInstagramMessageMock.mock.calls[0]![0]).toMatchObject({
      text: "🎤 Oi, queria saber sobre o procedimento.",
      igMessageId: "mid-audio-1",
    });
    expect(bufferForDebounceMock).toHaveBeenCalledOnce();
    // A gravação (recordInboundInstagramMessage) termina ANTES do buffer
    // de debounce ser armado — é o pedido central desta mudança: a
    // mensagem já existe no banco (e já aparece no CRM) nesse ponto, bem
    // antes do debounce decidir QUANDO a IA processa o lote.
    const recordOrder = recordInboundInstagramMessageMock.mock.invocationCallOrder[0]!;
    const bufferOrder = bufferForDebounceMock.mock.invocationCallOrder[0]!;
    expect(recordOrder).toBeLessThan(bufferOrder);

    const bufferedMessage = bufferForDebounceMock.mock.calls[0]?.[1] as { text: string };
    expect(bufferedMessage.text).toBe("🎤 Oi, queria saber sobre o procedimento.");
  });
});

describe("POST /api/webhooks/instagram — gravação imediata e idempotência", () => {
  it("grava a mensagem (recordInboundInstagramMessage) mesmo que o processamento da IA só aconteça bem depois", async () => {
    await postWebhook(buildTextPayload([{ mid: "mid-1", text: "Oi" }]));

    expect(recordInboundInstagramMessageMock).toHaveBeenCalledOnce();
    expect(handleInboundInstagramMessageMock).not.toHaveBeenCalled(); // só dispara quando o debounce flushar
  });

  it("reentrega do MESMO igMessageId (já processado antes): nem grava de novo, nem bufferiza", async () => {
    messageFindFirstMock.mockResolvedValue({ id: "msg-already" });

    await postWebhook(buildTextPayload([{ mid: "mid-1", text: "Oi" }]));

    expect(recordInboundInstagramMessageMock).not.toHaveBeenCalled();
    expect(bufferForDebounceMock).not.toHaveBeenCalled();
  });

  it("recordInboundInstagramMessage devolve null (conta do Instagram não encontrada): não bufferiza nada", async () => {
    recordInboundInstagramMessageMock.mockResolvedValueOnce(null);

    await postWebhook(buildTextPayload([{ mid: "mid-1", text: "Oi" }]));

    expect(bufferForDebounceMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/instagram — lote do debounce gera UMA única chamada à IA", () => {
  it("duas mensagens do mesmo lead, agrupadas pelo debounce num único flush, chamam handleInboundInstagramMessage UMA vez com as duas", async () => {
    await postWebhook(
      buildTextPayload([
        { mid: "mid-1", text: "Oi" },
        { mid: "mid-2", text: "Ainda não pensei nisso" },
      ])
    );

    expect(recordInboundInstagramMessageMock).toHaveBeenCalledTimes(2);
    expect(bufferForDebounceMock).toHaveBeenCalledTimes(2);

    // Simula o debounce real fechando a janela com as DUAS mensagens já
    // gravadas (o papel de bufferForDebounce, aqui mockado, é só agrupar —
    // ver inbound-debounce.ts) — chama o onFlush da ÚLTIMA vez como o
    // debounce faria, passando o lote completo.
    const recordedMessages = bufferForDebounceMock.mock.calls.map((call) => call[1]);
    const lastOnFlush = bufferForDebounceMock.mock.calls.at(-1)![2] as (messages: unknown[]) => void;
    lastOnFlush(recordedMessages);

    // flushInboundBatch roda de forma assíncrona (não é awaited na própria
    // chamada) — espera o microtask resolver antes de checar.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handleInboundInstagramMessageMock).toHaveBeenCalledOnce();
    const event = handleInboundInstagramMessageMock.mock.calls[0]![0] as { messages: unknown[] };
    expect(event.messages).toHaveLength(2);
  });
});
