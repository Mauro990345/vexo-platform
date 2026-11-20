// Testa recordInboundInstagramMessage isoladamente (handleInboundInstagramMessage
// não é testável direto — ver conversation-pipeline.test.ts) — cobre o pedido
// explícito desta mudança: a mensagem do lead aparece no banco ASSIM QUE o
// webhook chega (sem esperar o debounce), nunca duplica numa reentrega do
// mesmo igMessageId, continua gravando numa conversa NEEDS_HUMAN, e o
// createdAt de uma mensagem AO VIVO nunca é o timestamp reportado pela Meta
// (cerne da correção do bug do cursor — ver message-visibility.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/google-calendar", () => ({}));
vi.mock("@/lib/instagram", () => ({
  getInstagramUserProfile: vi.fn(),
  getInstagramConversationParticipantUsername: vi.fn(),
  getInstagramProfilePicture: vi.fn(),
  getInstagramConversationHistory: vi.fn(),
}));
vi.mock("@/lib/lead-profile-picture-backfill", () => ({ PROFILE_PICTURE_REFRESH_WINDOW_MS: 1000 }));
vi.mock("@/lib/crypto", () => ({ decryptToken: (v: string) => v }));
vi.mock("@/lib/scheduler", () => ({}));
vi.mock("@/lib/default-prompt", () => ({}));
vi.mock("@/lib/whatsapp", () => ({}));
vi.mock("@/lib/chat-history", () => ({ toChatHistory: vi.fn() }));
vi.mock("@/lib/result-photo-message", () => ({}));
vi.mock("@/lib/loop-guard", () => ({}));
vi.mock("@/lib/returning-patient-context", () => ({}));
vi.mock("@/lib/card-reply-context", () => ({}));
vi.mock("@/lib/timezone", () => ({}));
vi.mock("@/lib/anthropic", () => ({}));

const getSilenceHoursMock = vi.fn();
const cancelPendingFollowUpMock = vi.fn();
vi.mock("@/lib/follow-up", () => ({
  getSilenceHours: (...args: unknown[]) => getSilenceHoursMock(...args),
  cancelPendingFollowUp: (...args: unknown[]) => cancelPendingFollowUpMock(...args),
  applyTemplateVariables: vi.fn(),
  getFollowUpWindowSettings: vi.fn(),
  isFollowUpMessage: vi.fn(),
}));

const instagramAccountFindFirstMock = vi.fn();
const leadUpsertMock = vi.fn();
const conversationFindFirstMock = vi.fn();
const conversationCreateMock = vi.fn();
const conversationUpdateMock = vi.fn();
const messageFindFirstMock = vi.fn();
const messageCreateMock = vi.fn();
const transactionMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    instagramAccount: {
      findFirst: (...args: unknown[]) => instagramAccountFindFirstMock(...args),
      findMany: vi.fn().mockResolvedValue([]),
    },
    lead: { upsert: (...args: unknown[]) => leadUpsertMock(...args) },
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirstMock(...args),
      create: (...args: unknown[]) => conversationCreateMock(...args),
      update: (...args: unknown[]) => conversationUpdateMock(...args),
    },
    message: {
      findFirst: (...args: unknown[]) => messageFindFirstMock(...args),
      create: (...args: unknown[]) => messageCreateMock(...args),
    },
    webhookLog: { update: vi.fn().mockResolvedValue({}) },
    $transaction: (ops: unknown[]) => transactionMock(ops),
  },
}));

import { recordInboundInstagramMessage } from "./conversation-pipeline";

const CLINIC = { id: "clinic-1", name: "Clínica Demo" };
const IG_ACCOUNT = { id: "ig-1", igUserId: "ig-user-1", accessTokenEnc: "token", clinic: CLINIC };

function baseParams(overrides: Partial<Parameters<typeof recordInboundInstagramMessage>[0]> = {}) {
  return {
    igUserId: "ig-user-1",
    leadIgScopedId: "lead-scoped-1",
    text: "Oi, quero saber mais",
    igMessageId: "mid-1",
    timestamp: new Date("2026-11-20T12:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  instagramAccountFindFirstMock.mockResolvedValue(IG_ACCOUNT);
  getSilenceHoursMock.mockResolvedValue(6);
  messageFindFirstMock.mockResolvedValue(null);
  leadUpsertMock.mockResolvedValue({ id: "lead-1", igScopedId: "lead-scoped-1" });
  transactionMock.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  messageCreateMock.mockResolvedValue({ id: "msg-1" });
  conversationUpdateMock.mockResolvedValue({});
});

describe("recordInboundInstagramMessage — lead novo (primeiro contato)", () => {
  it("cria Lead e Conversation quando não existem, grava a mensagem e devolve os dados gravados", async () => {
    conversationFindFirstMock.mockResolvedValue(null);
    conversationCreateMock.mockResolvedValue({ id: "conv-1", status: "NEW", lastLeadMessageAt: null, resultPhotoSentAt: null });

    const result = await recordInboundInstagramMessage(baseParams());

    expect(leadUpsertMock).toHaveBeenCalledOnce();
    expect(conversationCreateMock).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.conversationId).toBe("conv-1");
    expect(result!.clinicId).toBe("clinic-1");
    expect(result!.text).toBe("Oi, quero saber mais");
    expect(result!.igMessageId).toBe("mid-1");
    // Conversa nova nunca reengaja na primeira mensagem (lastLeadMessageAt null).
    expect(result!.reengaged).toBe(false);
  });

  it("a mensagem é gravada SEM createdAt explícito — deixa o Postgres atribuir @default(now()) no instante da gravação (correção do bug do cursor)", async () => {
    conversationFindFirstMock.mockResolvedValue(null);
    conversationCreateMock.mockResolvedValue({ id: "conv-1", status: "NEW", lastLeadMessageAt: null, resultPhotoSentAt: null });

    await recordInboundInstagramMessage(
      baseParams({ timestamp: new Date("2020-01-01T00:00:00.000Z") }) // timestamp antigo "da Meta"
    );

    const createCall = transactionMock.mock.calls[0]![0] as unknown[];
    expect(createCall.length).toBe(2);
    // messageCreateMock é chamado dentro do array passado a $transaction —
    // confirma que nenhuma das chamadas a message.create recebeu `createdAt`.
    for (const call of messageCreateMock.mock.calls) {
      const data = call[0].data as Record<string, unknown>;
      expect(data).not.toHaveProperty("createdAt");
    }
  });
});

describe("recordInboundInstagramMessage — idempotência (reentrega da Meta)", () => {
  it("mesma igMessageId já gravada: NÃO cria Lead/Conversation/Message de novo, devolve a mensagem já existente", async () => {
    messageFindFirstMock.mockResolvedValue({
      id: "msg-existing",
      conversationId: "conv-existing",
      content: "Oi, quero saber mais",
      sentAt: new Date("2026-11-20T12:00:00.000Z"),
      createdAt: new Date("2026-11-20T12:00:00.100Z"),
    });

    const result = await recordInboundInstagramMessage(baseParams());

    expect(leadUpsertMock).not.toHaveBeenCalled();
    expect(conversationCreateMock).not.toHaveBeenCalled();
    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ id: "msg-existing", conversationId: "conv-existing", igMessageId: "mid-1" })
    );
  });

  it("corrida genuína (violação P2002 na escrita, não pego pelo findFirst anterior): recupera a mensagem já gravada pelo outro processo em vez de lançar", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      status: "IN_CONVERSATION",
      lastLeadMessageAt: new Date("2026-11-20T11:59:00.000Z"),
      resultPhotoSentAt: null,
    });
    transactionMock.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    messageFindFirstMock
      .mockResolvedValueOnce(null) // pré-checagem inicial: ainda não existia
      .mockResolvedValueOnce({
        id: "msg-raced",
        conversationId: "conv-1",
        content: "Oi, quero saber mais",
        sentAt: new Date("2026-11-20T12:00:00.000Z"),
        createdAt: new Date("2026-11-20T12:00:00.050Z"),
      });

    const result = await recordInboundInstagramMessage(baseParams());

    expect(result).toEqual(expect.objectContaining({ id: "msg-raced", conversationId: "conv-1" }));
  });
});

describe("recordInboundInstagramMessage — conversa NEEDS_HUMAN", () => {
  it("continua gravando a mensagem do lead (sem os efeitos de reengajamento, que só valem pra conversa ativa na IA)", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-human",
      status: "NEEDS_HUMAN",
      lastLeadMessageAt: new Date("2026-11-20T10:00:00.000Z"),
      resultPhotoSentAt: null,
    });
    messageCreateMock.mockResolvedValue({ id: "msg-human-1" });

    const result = await recordInboundInstagramMessage(baseParams());

    expect(messageCreateMock).toHaveBeenCalledOnce();
    expect(transactionMock).not.toHaveBeenCalled(); // sem $transaction (sem conversation.update)
    expect(conversationUpdateMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: "msg-human-1", conversationId: "conv-human", reengaged: false }));
  });
});

describe("recordInboundInstagramMessage — reengajamento", () => {
  it("lead ficou calado mais que o limiar de silêncio: reengaged=true, conversation.update seta resultPhotoSentAt e promove status", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      status: "IN_CONVERSATION",
      lastLeadMessageAt: new Date("2026-11-20T00:00:00.000Z"), // 12h antes do timestamp da mensagem
      resultPhotoSentAt: null,
    });
    getSilenceHoursMock.mockResolvedValue(6); // limiar de 6h, bem menor que os 12h de silêncio

    const result = await recordInboundInstagramMessage(baseParams());

    expect(result!.reengaged).toBe(true);
    const updateCall = conversationUpdateMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(updateCall.data).toHaveProperty("resultPhotoSentAt");
  });

  it("conversa em FOLLOW_UP: reopeningFromFollowUp promove pra IN_CONVERSATION e cancela o follow-up pendente", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      status: "FOLLOW_UP",
      lastLeadMessageAt: new Date("2026-11-19T12:00:00.000Z"),
      resultPhotoSentAt: null,
    });

    await recordInboundInstagramMessage(baseParams());

    const updateCall = conversationUpdateMock.mock.calls[0]![0] as { data: { status: string } };
    expect(updateCall.data.status).toBe("IN_CONVERSATION");
    expect(cancelPendingFollowUpMock).toHaveBeenCalledOnce();
  });

  it("mensagem chegando logo em seguida (dentro do limiar): reengaged=false, status/resultPhotoSentAt não mudam por isso", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      status: "IN_CONVERSATION",
      lastLeadMessageAt: new Date("2026-11-20T11:59:00.000Z"), // 1 minuto antes
      resultPhotoSentAt: null,
    });
    getSilenceHoursMock.mockResolvedValue(6);

    const result = await recordInboundInstagramMessage(baseParams());

    expect(result!.reengaged).toBe(false);
    const updateCall = conversationUpdateMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(updateCall.data).not.toHaveProperty("resultPhotoSentAt");
  });
});
