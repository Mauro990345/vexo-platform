import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks minimalistas — mesmo padrão de conversation-pipeline.test.ts: só as
// peças que dispatchDueMessages realmente usa recebem implementação de
// verdade, o resto vira stub pra não carregar dependências pesadas.
const messageFindManyMock = vi.fn();
const messageUpdateManyMock = vi.fn();
const messageUpdateMock = vi.fn();
const messageCreateMock = vi.fn();
const conversationUpdateMock = vi.fn();
const conversationFindUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findMany: (...args: unknown[]) => messageFindManyMock(...args),
      updateMany: (...args: unknown[]) => messageUpdateManyMock(...args),
      update: (...args: unknown[]) => messageUpdateMock(...args),
      create: (...args: unknown[]) => messageCreateMock(...args),
    },
    conversation: {
      update: (...args: unknown[]) => conversationUpdateMock(...args),
      findUnique: (...args: unknown[]) => conversationFindUniqueMock(...args),
    },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

const sendInstagramMessageMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  sendInstagramMessage: (...args: unknown[]) => sendInstagramMessageMock(...args),
}));

const sendWhatsappMessageMock = vi.fn();
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsappMessage: (...args: unknown[]) => sendWhatsappMessageMock(...args),
}));

vi.mock("@/lib/uploads", () => ({
  toPublicUploadUrl: (url: string) => url,
}));

// ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS é importada de verdade (constante
// pura, sem efeitos colaterais) — evita duplicar o número 20_000 aqui e
// garante que o teste quebra se a constante mudar sem o teste acompanhar.
vi.mock("@/lib/conversation-pipeline", async () => {
  const actual = await vi.importActual<typeof import("@/lib/conversation-pipeline")>("@/lib/conversation-pipeline");
  return { ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS: actual.ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS };
});

import { dispatchDueMessages } from "@/lib/dispatch";
import { ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS } from "@/lib/conversation-pipeline";

// Mensagem base: vídeo de confirmação de presença, canal Instagram, com
// pendingAttendanceTip preenchido (ver Message.pendingAttendanceTip,
// schema.prisma, e fireAttendanceConfirmationSequence,
// conversation-pipeline.ts) — é o cenário que o bug real envolveu.
function buildVideoMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "msg-video-1",
    conversationId: "conv-1",
    channel: "INSTAGRAM",
    sender: "SYSTEM",
    content: "[vídeo de confirmação de agendamento]",
    mediaUrl: "/uploads/video.mp4",
    pendingAttendanceTip: "Cafezinho enquanto espera :)",
    createdAt: new Date("2026-10-08T10:00:00.000Z"),
    scheduledFor: new Date("2026-10-08T10:00:15.000Z"),
    conversation: {
      lead: { phone: null, igScopedId: "ig-scoped-1" },
      clinic: {
        whatsappInstanceName: null,
        instagramAccount: { accessTokenEnc: "enc-token", igUserId: "ig-user-1" },
      },
    },
    ...overrides,
  };
}

describe("dispatchDueMessages — cafezinho ancorado no envio real do vídeo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // claimMessage (updateMany PENDING -> SENDING) sempre "ganha" a corrida
    // por padrão — cada teste que precisa simular reprocessamento sobrescreve.
    messageUpdateManyMock.mockImplementation(async (args: { data?: { status?: string } }) => {
      if (args?.data?.status === "SENDING") return { count: 1 };
      // claim do pendingAttendanceTip (zera o campo) — também vence por padrão.
      return { count: 1 };
    });
    conversationFindUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    sendInstagramMessageMock.mockResolvedValue({ messageId: "ig-msg-1" });
    messageUpdateMock.mockResolvedValue({});
  });

  it("vídeo enviado com sucesso cria o cafezinho com scheduledFor = sentAt + 20s", async () => {
    const video = buildVideoMessage();
    messageFindManyMock.mockResolvedValueOnce([video]);

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(messageCreateMock).toHaveBeenCalledTimes(1);

    const createCall = messageCreateMock.mock.calls[0]![0];
    expect(createCall.data.conversationId).toBe("conv-1");
    expect(createCall.data.content).toBe("Cafezinho enquanto espera :)");
    expect(createCall.data.status).toBe("PENDING");

    // sentAt real usado pelo update SENT — pega do argumento do $transaction.
    const updateCall = messageUpdateMock.mock.calls.find((c) => c[0].data.status === "SENT");
    const sentAt: Date = updateCall![0].data.sentAt;
    expect(createCall.data.scheduledFor.getTime()).toBe(sentAt.getTime() + ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS);
  });

  it("vídeo que falha NÃO cria o cafezinho", async () => {
    const video = buildVideoMessage();
    messageFindManyMock.mockResolvedValueOnce([video]);
    sendInstagramMessageMock.mockRejectedValueOnce(new Error("Falha simulada no envio do vídeo"));

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(messageCreateMock).not.toHaveBeenCalled();
    // Mensagem do vídeo marcada como FAILED, sem campo novo pra registrar isso.
    expect(messageUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "msg-video-1" }, data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("reprocessar o envio do vídeo não duplica o cafezinho", async () => {
    // Simula duas execuções concorrentes/sequenciais processando a MESMA
    // Message do vídeo depois do envio (ex.: claimMessage já tinha passado
    // nas duas, ou um retry manual) — o claim de pendingAttendanceTip só
    // deixa a primeira criar o cafezinho.
    let tipClaimCalls = 0;
    messageUpdateManyMock.mockImplementation(async (args: { where?: { pendingAttendanceTip?: unknown }; data?: { status?: string } }) => {
      if (args?.data?.status === "SENDING") return { count: 1 };
      if (args?.where?.pendingAttendanceTip) {
        tipClaimCalls += 1;
        return { count: tipClaimCalls === 1 ? 1 : 0 };
      }
      return { count: 1 };
    });

    const video = buildVideoMessage();
    messageFindManyMock.mockResolvedValueOnce([video]);
    await dispatchDueMessages();

    messageFindManyMock.mockResolvedValueOnce([video]);
    await dispatchDueMessages();

    expect(messageCreateMock).toHaveBeenCalledTimes(1);
  });

  it("conversa em NEEDS_HUMAN no momento do envio não cria o cafezinho", async () => {
    conversationFindUniqueMock.mockResolvedValue({ status: "NEEDS_HUMAN" });
    const video = buildVideoMessage();
    messageFindManyMock.mockResolvedValueOnce([video]);

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(messageCreateMock).not.toHaveBeenCalled();
  });
});
