import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mocks minimalistas — mesmo padrão de conversation-pipeline.test.ts: só as
// peças que dispatchDueMessages realmente usa recebem implementação de
// verdade, o resto vira stub pra não carregar dependências pesadas.
const messageFindManyMock = vi.fn();
const messageUpdateManyMock = vi.fn();
const messageUpdateMock = vi.fn();
const messageCreateMock = vi.fn();
const conversationUpdateMock = vi.fn();
const conversationFindUniqueMock = vi.fn();
const appointmentFindUniqueMock = vi.fn();
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
    appointment: {
      findUnique: (...args: unknown[]) => appointmentFindUniqueMock(...args),
    },
    // Suporta as duas formas usadas por dispatch.ts: a forma em array (passo
    // WHATSAPP, sem ramificação) e a forma interativa/callback (passo
    // Instagram, que precisa ler/decidir no meio da transação pra avançar a
    // cadeia de confirmação de presença) — ver comentário grande em
    // dispatch.ts sobre por que isso precisou virar uma transação única.
    $transaction: (arg: unknown) => {
      if (typeof arg === "function") {
        return arg({
          message: {
            update: (...args: unknown[]) => messageUpdateMock(...args),
            create: (...args: unknown[]) => messageCreateMock(...args),
            updateMany: (...args: unknown[]) => messageUpdateManyMock(...args),
          },
          conversation: {
            update: (...args: unknown[]) => conversationUpdateMock(...args),
            findUnique: (...args: unknown[]) => conversationFindUniqueMock(...args),
          },
          appointment: {
            findUnique: (...args: unknown[]) => appointmentFindUniqueMock(...args),
          },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    },
  },
}));

const sendInstagramMessageMock = vi.fn();
const sendInstagramGenericTemplateCardMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  sendInstagramMessage: (...args: unknown[]) => sendInstagramMessageMock(...args),
  sendInstagramGenericTemplateCard: (...args: unknown[]) => sendInstagramGenericTemplateCardMock(...args),
}));

const sendWhatsappMessageMock = vi.fn();
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsappMessage: (...args: unknown[]) => sendWhatsappMessageMock(...args),
}));

vi.mock("@/lib/uploads", () => ({
  toPublicUploadUrl: (url: string) => url,
}));

// As constantes de delay e as funções de encode/decode de
// PendingAttendanceStep são importadas de verdade (puras, sem efeitos
// colaterais) — evita duplicar os números/formato aqui e garante que o
// teste quebra se a constante ou o formato do JSON mudar sem o teste
// acompanhar.
vi.mock("@/lib/conversation-pipeline", async () => {
  const actual = await vi.importActual<typeof import("@/lib/conversation-pipeline")>("@/lib/conversation-pipeline");
  return {
    ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS: actual.ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS,
    ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS: actual.ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS,
    ATTENDANCE_FINAL_DELAY_AFTER_TIP_MS: actual.ATTENDANCE_FINAL_DELAY_AFTER_TIP_MS,
    encodePendingAttendanceStep: actual.encodePendingAttendanceStep,
    decodePendingAttendanceStep: actual.decodePendingAttendanceStep,
    encodeClinicContactCard: actual.encodeClinicContactCard,
    decodeClinicContactCard: actual.decodeClinicContactCard,
    CLINIC_CONTACT_CARD_SUBTITLE: actual.CLINIC_CONTACT_CARD_SUBTITLE,
    CLINIC_CONTACT_CARD_BUTTON_TITLE: actual.CLINIC_CONTACT_CARD_BUTTON_TITLE,
  };
});

import { dispatchDueMessages } from "@/lib/dispatch";
import {
  ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS,
  ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS,
  ATTENDANCE_FINAL_DELAY_AFTER_TIP_MS,
  encodePendingAttendanceStep,
  encodeClinicContactCard,
  CLINIC_CONTACT_CARD_SUBTITLE,
  CLINIC_CONTACT_CARD_BUTTON_TITLE,
  type PendingAttendanceStep,
} from "@/lib/conversation-pipeline";

const APPOINTMENT_ID = "appt-1";
const SCHEDULED_AT_MS = new Date("2026-10-09T12:00:00.000Z").getTime();
const TIP_TEXT = "Cafezinho enquanto espera :)";
const FINAL_TEXT = "Perfeito, até amanhã.";

function buildMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    channel: "INSTAGRAM",
    sender: "SYSTEM",
    content: "conteúdo padrão",
    mediaUrl: null,
    pendingAttendanceStep: null,
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

// Apresentação ("vou te mandar um vídeo rápido...") — primeiro elo da
// cadeia, criado por fireAttendanceConfirmationSequence. Ao ser enviada,
// cria a Message do vídeo de verdade (próximo elo: "video").
function buildIntroMessage(step: Partial<PendingAttendanceStep & { next: "video" }> = {}) {
  return buildMessage({
    id: "msg-intro-1",
    content: "Vou te mandar um vídeo rápido mostrando como é o nosso atendimento 🙂",
    pendingAttendanceStep: encodePendingAttendanceStep({
      next: "video",
      mediaUrl: "https://cdn/video.mp4",
      tipText: TIP_TEXT,
      finalText: FINAL_TEXT,
      appointmentId: APPOINTMENT_ID,
      scheduledAtMs: SCHEDULED_AT_MS,
      ...step,
    } as PendingAttendanceStep),
  });
}

// Vídeo de confirmação — segundo elo. Ao ser enviado, cria o cafezinho
// (próximo elo: "tip").
function buildVideoMessage(step: Partial<PendingAttendanceStep & { next: "tip" }> = {}) {
  return buildMessage({
    id: "msg-video-1",
    content: "[vídeo de confirmação de agendamento]",
    mediaUrl: "/uploads/video.mp4",
    pendingAttendanceStep: encodePendingAttendanceStep({
      next: "tip",
      tipText: TIP_TEXT,
      finalText: FINAL_TEXT,
      appointmentId: APPOINTMENT_ID,
      scheduledAtMs: SCHEDULED_AT_MS,
      ...step,
    } as PendingAttendanceStep),
  });
}

// Cafezinho — terceiro elo. Ao ser enviado, cria a frase final (último
// elo, sem pendingAttendanceStep).
function buildTipMessage(step: Partial<PendingAttendanceStep & { next: "final" }> = {}) {
  return buildMessage({
    id: "msg-tip-1",
    content: TIP_TEXT,
    pendingAttendanceStep: encodePendingAttendanceStep({
      next: "final",
      finalText: FINAL_TEXT,
      appointmentId: APPOINTMENT_ID,
      scheduledAtMs: SCHEDULED_AT_MS,
      ...step,
    } as PendingAttendanceStep),
  });
}

describe("dispatchDueMessages — cadeia de confirmação de presença (apresentação -> vídeo -> cafezinho -> frase final)", () => {
  // Rastreia claims por id de mensagem (status PENDING->SENDING e o claim
  // de pendingAttendanceStep), igual ao comportamento real de um UPDATE
  // condicional no Postgres: a MESMA mensagem só pode ser reivindicada uma
  // vez — a segunda tentativa (reprocessamento, corrida com o despacho
  // antecipado, ou com outro ciclo do cron) sempre vê count:0. Testes que
  // precisam de outro comportamento sobrescrevem messageUpdateManyMock
  // localmente (ver "nada duplica", mais abaixo).
  let sendingClaims: Set<string>;
  let stepClaims: Set<string>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    sendingClaims = new Set();
    stepClaims = new Set();
    messageUpdateManyMock.mockImplementation(
      async (args: { where?: { id?: string }; data?: Record<string, unknown> }) => {
        const id = args?.where?.id;
        if (args?.data?.status === "SENDING") {
          if (!id || sendingClaims.has(id)) return { count: 0 };
          sendingClaims.add(id);
          return { count: 1 };
        }
        if (args?.data && "pendingAttendanceStep" in args.data) {
          if (!id || stepClaims.has(id)) return { count: 0 };
          stepClaims.add(id);
          return { count: 1 };
        }
        return { count: 1 };
      }
    );
    // Mensagem criada carrega um id realista (como o banco geraria) —
    // necessário pra reprocessar o próprio elo criado (claim, despacho
    // antecipado) nos novos testes de timer, abaixo.
    let createdIdCounter = 0;
    messageCreateMock.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: `created-${++createdIdCounter}`,
      ...args.data,
    }));
    conversationFindUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    appointmentFindUniqueMock.mockResolvedValue({ status: "SCHEDULED", scheduledAt: new Date(SCHEDULED_AT_MS) });
    sendInstagramMessageMock.mockResolvedValue({ messageId: "ig-msg-1" });
    messageUpdateMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("apresentação enviada com sucesso cria o vídeo (próximo elo) com scheduledFor = sentAt + 5s, levando mediaUrl e o step 'tip'", async () => {
    const intro = buildIntroMessage();
    messageFindManyMock.mockResolvedValueOnce([intro]);

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(messageCreateMock).toHaveBeenCalledTimes(1);

    const createCall = messageCreateMock.mock.calls[0]![0];
    expect(createCall.data.conversationId).toBe("conv-1");
    expect(createCall.data.content).toBe("[vídeo de confirmação de agendamento]");
    expect(createCall.data.mediaUrl).toBe("https://cdn/video.mp4");
    expect(createCall.data.status).toBe("PENDING");

    const sentAt: Date = messageUpdateMock.mock.calls[0]![0].data.sentAt;
    expect(createCall.data.scheduledFor.getTime()).toBe(sentAt.getTime() + ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS);

    const nextStep = JSON.parse(createCall.data.pendingAttendanceStep);
    expect(nextStep).toEqual({
      next: "tip",
      tipText: TIP_TEXT,
      finalText: FINAL_TEXT,
      appointmentId: APPOINTMENT_ID,
      scheduledAtMs: SCHEDULED_AT_MS,
    });
  });

  it("vídeo enviado com sucesso cria o cafezinho (próximo elo) com scheduledFor = sentAt + 10s", async () => {
    const video = buildVideoMessage();
    messageFindManyMock.mockResolvedValueOnce([video]);

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(messageCreateMock).toHaveBeenCalledTimes(1);

    const createCall = messageCreateMock.mock.calls[0]![0];
    expect(createCall.data.conversationId).toBe("conv-1");
    expect(createCall.data.content).toBe(TIP_TEXT);
    expect(createCall.data.status).toBe("PENDING");
    expect(createCall.data.mediaUrl).toBeUndefined();

    const sentAt: Date = messageUpdateMock.mock.calls[0]![0].data.sentAt;
    expect(createCall.data.scheduledFor.getTime()).toBe(sentAt.getTime() + ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS);

    const nextStep = JSON.parse(createCall.data.pendingAttendanceStep);
    expect(nextStep).toEqual({
      next: "final",
      finalText: FINAL_TEXT,
      appointmentId: APPOINTMENT_ID,
      scheduledAtMs: SCHEDULED_AT_MS,
    });
  });

  it("cafezinho enviado com sucesso cria a frase final (último elo) com scheduledFor = sentAt + 10s, sem novo pendingAttendanceStep", async () => {
    const tip = buildTipMessage();
    messageFindManyMock.mockResolvedValueOnce([tip]);

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(messageCreateMock).toHaveBeenCalledTimes(1);

    expect(appointmentFindUniqueMock).toHaveBeenCalledWith({
      where: { id: APPOINTMENT_ID },
      select: { status: true, scheduledAt: true },
    });

    const createCall = messageCreateMock.mock.calls[0]![0];
    expect(createCall.data.content).toBe(FINAL_TEXT);
    expect(createCall.data.status).toBe("PENDING");
    expect(createCall.data.pendingAttendanceStep).toBeUndefined();

    const sentAt: Date = messageUpdateMock.mock.calls[0]![0].data.sentAt;
    expect(createCall.data.scheduledFor.getTime()).toBe(sentAt.getTime() + ATTENDANCE_FINAL_DELAY_AFTER_TIP_MS);
  });

  it("remarcação entre elos corta a frase final: appointment.scheduledAt diferente do capturado na apresentação (scheduledAtMs) impede a criação do último elo", async () => {
    appointmentFindUniqueMock.mockResolvedValue({
      status: "SCHEDULED",
      scheduledAt: new Date(SCHEDULED_AT_MS + 60 * 60 * 1000), // remarcado 1h depois
    });
    const tip = buildTipMessage();
    messageFindManyMock.mockResolvedValueOnce([tip]);

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1); // a Message do cafezinho em si foi enviada normalmente
    expect(messageCreateMock).not.toHaveBeenCalled(); // mas a frase final não sai
  });

  it("agendamento cancelado entre elos também corta a frase final", async () => {
    appointmentFindUniqueMock.mockResolvedValue({ status: "CANCELLED", scheduledAt: new Date(SCHEDULED_AT_MS) });
    const tip = buildTipMessage();
    messageFindManyMock.mockResolvedValueOnce([tip]);

    await dispatchDueMessages();

    expect(messageCreateMock).not.toHaveBeenCalled();
  });

  it("agendamento não encontrado (defensivo) corta a frase final", async () => {
    appointmentFindUniqueMock.mockResolvedValue(null);
    const tip = buildTipMessage();
    messageFindManyMock.mockResolvedValueOnce([tip]);

    await dispatchDueMessages();

    expect(messageCreateMock).not.toHaveBeenCalled();
  });

  it("elo que falha (erro no envio) NÃO cria o próximo elo", async () => {
    const video = buildVideoMessage();
    messageFindManyMock.mockResolvedValueOnce([video]);
    sendInstagramMessageMock.mockRejectedValueOnce(new Error("Falha simulada no envio do vídeo"));

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(messageUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "msg-video-1" }, data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("conversa em NEEDS_HUMAN no momento do envio corta qualquer elo (apresentação -> vídeo)", async () => {
    conversationFindUniqueMock.mockResolvedValue({ status: "NEEDS_HUMAN" });
    const intro = buildIntroMessage();
    messageFindManyMock.mockResolvedValueOnce([intro]);

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(messageCreateMock).not.toHaveBeenCalled();
  });

  it("conversa em LOST no momento do envio corta qualquer elo (vídeo -> cafezinho)", async () => {
    conversationFindUniqueMock.mockResolvedValue({ status: "LOST" });
    const video = buildVideoMessage();
    messageFindManyMock.mockResolvedValueOnce([video]);

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(messageCreateMock).not.toHaveBeenCalled();
  });

  it("conversa em NEEDS_HUMAN no momento do envio corta qualquer elo (cafezinho -> frase final)", async () => {
    conversationFindUniqueMock.mockResolvedValue({ status: "NEEDS_HUMAN" });
    const tip = buildTipMessage();
    messageFindManyMock.mockResolvedValueOnce([tip]);

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(messageCreateMock).not.toHaveBeenCalled();
    // Conversa NEEDS_HUMAN/LOST é checada ANTES de consultar o agendamento.
    expect(appointmentFindUniqueMock).not.toHaveBeenCalled();
  });

  // "Nada duplica" — reprocessar a MESMA Message depois de já ter sido
  // enviada (retry manual, ou duas execuções concorrentes que passaram
  // ambas pelo claim de status) nunca cria o próximo elo duas vezes. Vale
  // pros três pontos de ramificação (video/tip/final), não só o antigo
  // vídeo->cafezinho.
  it("nada duplica: reprocessar o envio da apresentação não duplica o vídeo", async () => {
    let stepClaimCalls = 0;
    messageUpdateManyMock.mockImplementation(async (args: { where?: { pendingAttendanceStep?: unknown }; data?: { status?: string } }) => {
      if (args?.data?.status === "SENDING") return { count: 1 };
      if (args?.where?.pendingAttendanceStep) {
        stepClaimCalls += 1;
        return { count: stepClaimCalls === 1 ? 1 : 0 };
      }
      return { count: 1 };
    });

    const intro = buildIntroMessage();
    messageFindManyMock.mockResolvedValueOnce([intro]);
    await dispatchDueMessages();

    messageFindManyMock.mockResolvedValueOnce([intro]);
    await dispatchDueMessages();

    expect(messageCreateMock).toHaveBeenCalledTimes(1);
  });

  it("nada duplica: reprocessar o envio do vídeo não duplica o cafezinho", async () => {
    let stepClaimCalls = 0;
    messageUpdateManyMock.mockImplementation(async (args: { where?: { pendingAttendanceStep?: unknown }; data?: { status?: string } }) => {
      if (args?.data?.status === "SENDING") return { count: 1 };
      if (args?.where?.pendingAttendanceStep) {
        stepClaimCalls += 1;
        return { count: stepClaimCalls === 1 ? 1 : 0 };
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

  it("nada duplica: reprocessar o envio do cafezinho não duplica a frase final", async () => {
    let stepClaimCalls = 0;
    messageUpdateManyMock.mockImplementation(async (args: { where?: { pendingAttendanceStep?: unknown }; data?: { status?: string } }) => {
      if (args?.data?.status === "SENDING") return { count: 1 };
      if (args?.where?.pendingAttendanceStep) {
        stepClaimCalls += 1;
        return { count: stepClaimCalls === 1 ? 1 : 0 };
      }
      return { count: 1 };
    });

    const tip = buildTipMessage();
    messageFindManyMock.mockResolvedValueOnce([tip]);
    await dispatchDueMessages();

    messageFindManyMock.mockResolvedValueOnce([tip]);
    await dispatchDueMessages();

    expect(messageCreateMock).toHaveBeenCalledTimes(1);
  });

  // Despacho antecipado (scheduleEagerDispatch/dispatchEagerly, dispatch.ts)
  // — é o que faz o intervalo REAL entre elos bater perto do configurado,
  // sem esperar o próximo ciclo de 15s do cron. Os quatro testes abaixo
  // usam fake timers (vi.useFakeTimers, configurado no beforeEach) pra
  // controlar exatamente quando o setTimeout agendado dispara.
  describe("despacho antecipado (fire-and-forget, sem esperar o próximo ciclo de 15s)", () => {
    it("elo enviado pelo timer com sucesso: vídeo criado pela apresentação é despachado ~5s depois, sem esperar outro ciclo, e encadeia o cafezinho", async () => {
      const intro = buildIntroMessage();
      messageFindManyMock.mockResolvedValueOnce([intro]);
      await dispatchDueMessages();

      // Só a apresentação foi enviada e o vídeo criado como PENDING —
      // nenhum outro ciclo rodou ainda.
      expect(sendInstagramMessageMock).toHaveBeenCalledTimes(1);
      expect(messageCreateMock).toHaveBeenCalledTimes(1);

      // Dispara o timer agendado pra ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS
      // (5s) — sem isso, dispatchOneMessage nunca roda pro vídeo.
      await vi.advanceTimersByTimeAsync(ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS);

      // O vídeo foi enviado (pelo timer, não por um novo ciclo do cron —
      // messageFindManyMock não foi chamado de novo) e já encadeou o
      // cafezinho como o próximo PENDING.
      expect(sendInstagramMessageMock).toHaveBeenCalledTimes(2);
      expect(messageFindManyMock).toHaveBeenCalledTimes(1);
      expect(messageCreateMock).toHaveBeenCalledTimes(2);
      expect(messageCreateMock.mock.calls[1]![0].data.content).toBe(TIP_TEXT);
    });

    it("crash simulado: se o timer nunca disparar, a mensagem continua PENDING e o ciclo normal a processa sem duplicar — mesmo que o timer atrasado dispare depois", async () => {
      const intro = buildIntroMessage();
      messageFindManyMock.mockResolvedValueOnce([intro]);
      await dispatchDueMessages();

      // Timer agendado (5s) NUNCA é avançado aqui — simula o processo do
      // worker morrendo antes dele disparar (num crash real, o setTimeout
      // em memória simplesmente desaparece junto com o processo). A linha
      // criada pelo create (id + campos) + a relação de conversa (igual a
      // uma query real via fetchDueMessages, que sempre inclui essa
      // relação) é o que um ciclo normal do cron encontraria no banco.
      const videoRow = { ...(await messageCreateMock.mock.results[0]!.value), conversation: intro.conversation };

      // Ciclo normal do cron, até 15s depois, encontra a MESMA linha
      // (ainda PENDING no banco) e processa pelo caminho de sempre.
      messageFindManyMock.mockResolvedValueOnce([videoRow]);
      await dispatchDueMessages();

      expect(sendInstagramMessageMock).toHaveBeenCalledTimes(2); // apresentação + vídeo, nenhum duplicado
      expect(messageCreateMock).toHaveBeenCalledTimes(2); // vídeo + cafezinho, nenhum duplicado

      // Mesmo que o timer "atrasado" do passo 1 acabe disparando MAIS
      // TARDE (processo não morreu de verdade, só demorou) — o claim
      // atômico (já consumido pelo ciclo normal acima) garante que ele não
      // reenvia nem duplica o próximo elo.
      await vi.advanceTimersByTimeAsync(ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS);

      expect(sendInstagramMessageMock).toHaveBeenCalledTimes(2);
      expect(messageCreateMock).toHaveBeenCalledTimes(2);
    });

    it("corrida entre o timer e um ciclo normal processando a mesma mensagem: envia uma única vez, nunca duplica", async () => {
      const intro = buildIntroMessage();
      messageFindManyMock.mockResolvedValueOnce([intro]);
      await dispatchDueMessages();

      const videoRow = { ...(await messageCreateMock.mock.results[0]!.value), conversation: intro.conversation };

      // Ciclo normal "vence a corrida": processa o vídeo ANTES do timer
      // (ainda agendado pra daqui a 5s) disparar.
      messageFindManyMock.mockResolvedValueOnce([videoRow]);
      await dispatchDueMessages();

      expect(sendInstagramMessageMock).toHaveBeenCalledTimes(2);
      expect(messageCreateMock).toHaveBeenCalledTimes(2);

      // Agora o timer dispara — tenta reivindicar a MESMA linha do vídeo,
      // já SENT pelo ciclo normal; o claim atômico (status PENDING-only)
      // garante count:0, então nada é reenviado nem recriado.
      await vi.advanceTimersByTimeAsync(ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS);

      expect(sendInstagramMessageMock).toHaveBeenCalledTimes(2);
      expect(messageCreateMock).toHaveBeenCalledTimes(2);
    });

    it("conversa virou NEEDS_HUMAN entre a criação do elo e o timer disparar: o timer não envia", async () => {
      const intro = buildIntroMessage();
      messageFindManyMock.mockResolvedValueOnce([intro]);
      await dispatchDueMessages();

      // Conversa escalou pra atendimento humano no intervalo entre a
      // apresentação e o vídeo (ex.: o lead respondeu algo que precisou de
      // uma pessoa).
      conversationFindUniqueMock.mockResolvedValue({ status: "NEEDS_HUMAN" });

      await vi.advanceTimersByTimeAsync(ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS);

      // O vídeo NUNCA foi enviado (nem reivindicado) e nada mais foi
      // criado — só a apresentação, de antes. Só a apresentação está em
      // sendingClaims (reivindicada pelo próprio ciclo normal, acima); o
      // vídeo nunca chega a ser reivindicado porque dispatchEagerly
      // retorna antes de chamar dispatchOneMessage.
      expect(sendInstagramMessageMock).toHaveBeenCalledTimes(1);
      expect(messageCreateMock).toHaveBeenCalledTimes(1);
      expect(sendingClaims.size).toBe(1);
    });

    it("conversa virou LOST entre a criação do elo e o timer disparar: o timer não envia", async () => {
      const video = buildVideoMessage();
      messageFindManyMock.mockResolvedValueOnce([video]);
      await dispatchDueMessages();

      conversationFindUniqueMock.mockResolvedValue({ status: "LOST" });

      await vi.advanceTimersByTimeAsync(ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS);

      // Só o vídeo foi enviado (criando o cafezinho como PENDING) — o
      // próprio cafezinho nunca foi despachado pelo timer.
      expect(sendInstagramMessageMock).toHaveBeenCalledTimes(1);
      expect(messageCreateMock).toHaveBeenCalledTimes(1);
    });
  });
});

// Cartão de contato da clínica (Generic Template) — ver
// Message.clinicContactCard/clinicContactContext (conversation-pipeline.ts)
// e o comentário grande em dispatchOneMessage (dispatch.ts): tenta o
// cartão primeiro, cai pro fallback em texto (message.content, já pronto
// com o link /c/<id>) em QUALQUER erro, sem nunca mandar os dois nem
// falhar o turno.
describe("dispatchDueMessages — cartão de contato da clínica", () => {
  let sendingClaims: Set<string>;

  function buildClinicContactCardMessage(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "msg-card-1",
      conversationId: "conv-1",
      channel: "INSTAGRAM",
      sender: "SYSTEM",
      content: "Pra falar direto com a equipe da Clínica Bela Vida pelo WhatsApp, é só clicar aqui: https://vexo.app/c/clinic-1",
      mediaUrl: null,
      pendingAttendanceStep: null,
      clinicContactCard: encodeClinicContactCard({
        clinicId: "clinic-1",
        clinicName: "Clínica Bela Vida",
        whatsappE164: "5511987654321",
      }),
      createdAt: new Date("2026-10-09T10:00:00.000Z"),
      scheduledFor: new Date("2026-10-09T10:00:02.000Z"),
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

  beforeEach(() => {
    vi.clearAllMocks();
    sendingClaims = new Set();
    messageUpdateManyMock.mockImplementation(async (args: { where?: { id?: string }; data?: Record<string, unknown> }) => {
      const id = args?.where?.id;
      if (args?.data?.status === "SENDING") {
        if (!id || sendingClaims.has(id)) return { count: 0 };
        sendingClaims.add(id);
        return { count: 1 };
      }
      return { count: 1 };
    });
    messageUpdateMock.mockResolvedValue({});
    conversationFindUniqueMock.mockResolvedValue({ status: "ACTIVE" });
  });

  it("Meta aceita o cartão: manda o Generic Template com nome/subtítulo/botão certos e NUNCA chama sendInstagramMessage (nenhum segundo link)", async () => {
    const card = buildClinicContactCardMessage();
    messageFindManyMock.mockResolvedValueOnce([card]);
    sendInstagramGenericTemplateCardMock.mockResolvedValue({ messageId: "ig-card-msg-1" });

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(sendInstagramGenericTemplateCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientIgScopedId: "ig-scoped-1",
        title: "Clínica Bela Vida",
        subtitle: CLINIC_CONTACT_CARD_SUBTITLE,
        buttonTitle: CLINIC_CONTACT_CARD_BUTTON_TITLE,
        buttonUrl: "https://wa.me/5511987654321",
      })
    );
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(messageUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", igMessageId: "ig-card-msg-1" }) })
    );
  });

  it("Meta rejeita o cartão (ex.: feature não habilitada): cai pro fallback em texto (content com o link /c/<id>) e marca SENT normalmente, sem falhar o turno", async () => {
    const card = buildClinicContactCardMessage();
    messageFindManyMock.mockResolvedValueOnce([card]);
    sendInstagramGenericTemplateCardMock.mockRejectedValue(
      new Error("Falha ao enviar cartão de contato da clínica no Instagram (400): Template feature is not enabled for this app")
    );
    sendInstagramMessageMock.mockResolvedValue({ messageId: "ig-fallback-msg-1" });

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    // Fallback mandado como texto normal, com o CONTENT já pronto (link
    // /c/<id>) — nunca um segundo link/cartão junto.
    expect(sendInstagramMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientIgScopedId: "ig-scoped-1",
        text: card.content,
      })
    );
    expect(sendInstagramMessageMock).toHaveBeenCalledTimes(1);
    expect(messageUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", igMessageId: "ig-fallback-msg-1" }) })
    );
  });

  it("clinicContactCard corrompido (JSON inválido) também cai pro fallback em texto, sem lançar", async () => {
    const card = buildClinicContactCardMessage({ clinicContactCard: "{ json inválido" });
    messageFindManyMock.mockResolvedValueOnce([card]);
    sendInstagramMessageMock.mockResolvedValue({ messageId: "ig-fallback-msg-2" });

    const result = await dispatchDueMessages();

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(sendInstagramGenericTemplateCardMock).not.toHaveBeenCalled();
    expect(sendInstagramMessageMock).toHaveBeenCalledWith(expect.objectContaining({ text: card.content }));
  });
});
