import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const followUpStepFindManyMock = vi.fn();
const followUpSettingsFindUniqueMock = vi.fn();
const followUpLogFindManyMock = vi.fn();
const messageCreateMock = vi.fn();
const followUpLogUpdateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    followUpStep: { findMany: (...args: unknown[]) => followUpStepFindManyMock(...args) },
    followUpSettings: { findUnique: (...args: unknown[]) => followUpSettingsFindUniqueMock(...args) },
    followUpLog: {
      findMany: (...args: unknown[]) => followUpLogFindManyMock(...args),
      update: (...args: unknown[]) => followUpLogUpdateMock(...args),
    },
    message: { create: (...args: unknown[]) => messageCreateMock(...args) },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

import { leadFirstName, applyTemplateVariables, dispatchFollowUpSteps } from "@/lib/follow-up";

// Bug real corrigido: ao cair pro igUsername (Lead.name ausente), o nome
// saía com o @ inteiro sempre que ele tinha ponto (ex.: "mauro.iphone") —
// o split por espaço de antes não tinha efeito nenhum nesse caso, já que
// usernames do Instagram não têm espaço. Essa função alimenta
// {{primeiro_nome}} tanto nos templates de follow-up/lembrete quanto no
// prompt de conversação da IA (ver applyTemplateVariables em
// conversation-pipeline.ts).
describe("leadFirstName", () => {
  it("@ com ponto usa só a parte antes do primeiro ponto", () => {
    expect(leadFirstName({ name: null, igUsername: "mauro.iphone" })).toBe("mauro");
  });

  it("@ sem ponto usa ele inteiro", () => {
    expect(leadFirstName({ name: null, igUsername: "luiscarlos" })).toBe("luiscarlos");
  });

  it("@ com mais de um ponto usa só a parte antes do PRIMEIRO ponto", () => {
    expect(leadFirstName({ name: null, igUsername: "ana.paula.clinica" })).toBe("ana");
  });

  it("Lead.name tem prioridade sobre o @ — continua pegando o primeiro nome por espaço, sem aplicar a regra do ponto", () => {
    expect(leadFirstName({ name: "Maria Silva", igUsername: "maria.silva.oficial" })).toBe("Maria");
  });

  it("sem nome nem @, devolve string vazia", () => {
    expect(leadFirstName({ name: null, igUsername: null })).toBe("");
  });

  it("nome em branco (só espaços) cai pro @ normalmente", () => {
    expect(leadFirstName({ name: "   ", igUsername: "joao.pedro" })).toBe("joao");
  });
});

describe("applyTemplateVariables", () => {
  it("substitui {{primeiro_nome}} pelo nome derivado do @ quando não há Lead.name", () => {
    const result = applyTemplateVariables("Oi, {{primeiro_nome}}! Tudo bem?", { name: null, igUsername: "mauro.iphone" });
    expect(result).toBe("Oi, mauro! Tudo bem?");
  });
});

// Bug real corrigido: um passo de follow-up que vencia com a janela de
// envio fechada (ver FollowUpSettings.windowStart/EndMinute, /crm/follow-up)
// era ADIADO pro próximo horário válido — a mensagem saía mesmo assim, só
// mais tarde. Comportamento pedido: nesse caso o passo deve ser DESCARTADO
// (pulado), nunca enviado quando a janela abrir depois.
describe("dispatchFollowUpSteps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followUpSettingsFindUniqueMock.mockResolvedValue(null); // usa os defaults: seg-sex, 08:00-18:00 (Brasília)
    followUpLogUpdateMock.mockResolvedValue({});
    messageCreateMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockOneSilenceStep(now: Date) {
    followUpStepFindManyMock.mockImplementation(({ where }: { where: { trigger: string } }) =>
      Promise.resolve(
        where.trigger === "SILENCE"
          ? [{ id: "step-1", order: 0, offsetHours: 0, content: "Oi {{primeiro_nome}}, tudo bem?", attachmentUrl: null, channel: "INSTAGRAM" }]
          : []
      )
    );
    followUpLogFindManyMock.mockResolvedValue([
      {
        id: "log-1",
        trigger: "SILENCE",
        lastStepIndex: null,
        lastStepSentAt: null,
        triggeredAt: new Date(now.getTime() - 60_000), // já venceu (offsetHours=0)
        conversationId: "conv-1",
        conversation: {
          lastLeadMessageAt: null,
          lead: { name: "Ana", igUsername: null, phone: null },
          appointments: [],
        },
      },
    ]);
  }

  it("passo vence com a janela de envio FECHADA: é descartado (sem mensagem), e a sequência avança mesmo assim", async () => {
    // 2026-01-06 é terça — 07:30 UTC = 04:30 em Brasília (UTC-3), antes da
    // janela padrão abrir (08:00).
    const now = new Date("2026-01-06T07:30:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockOneSilenceStep(now);

    const dispatched = await dispatchFollowUpSteps();

    expect(dispatched).toBe(0);
    expect(messageCreateMock).not.toHaveBeenCalled();
    // A sequência avança (lastStepIndex=0) mesmo sem enviar nada — o próximo
    // passo da sequência continua contado a partir de AGORA, não do horário
    // em que a janela eventualmente abriria.
    expect(followUpLogUpdateMock).toHaveBeenCalledWith({
      where: { id: "log-1" },
      data: { lastStepIndex: 0, lastStepSentAt: now },
    });
  });

  it("passo vence com a janela de envio ABERTA: é enviado normalmente", async () => {
    // Mesmo dia — 13:00 UTC = 10:00 em Brasília, dentro da janela 08:00-18:00.
    const now = new Date("2026-01-06T13:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockOneSilenceStep(now);

    const dispatched = await dispatchFollowUpSteps();

    expect(dispatched).toBe(1);
    expect(messageCreateMock).toHaveBeenCalledTimes(1);
    expect(messageCreateMock.mock.calls[0]![0]).toMatchObject({
      data: {
        conversationId: "conv-1",
        content: "Oi Ana, tudo bem?",
        status: "PENDING",
        scheduledFor: now,
      },
    });
    expect(followUpLogUpdateMock).toHaveBeenCalledWith({
      where: { id: "log-1" },
      data: { lastStepIndex: 0, lastStepSentAt: now },
    });
  });
});
