import { describe, it, expect, vi, beforeEach } from "vitest";

const conversationFindManyMock = vi.fn();
const hotLeadConfigFindUniqueMock = vi.fn();
const hotLeadConfigUpsertMock = vi.fn();
const leadFindManyMock = vi.fn();
const instagramAccountFindUniqueMock = vi.fn();
const hotLeadCardSlotCountMock = vi.fn();
const hotLeadCardSlotFindUniqueMock = vi.fn();
const hotLeadCardSlotUpdateMock = vi.fn();
const transactionMock = vi.fn();
const upsertCallsMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { findMany: (...args: unknown[]) => conversationFindManyMock(...args) },
    hotLeadConfig: {
      findUnique: (...args: unknown[]) => hotLeadConfigFindUniqueMock(...args),
      upsert: (...args: unknown[]) => hotLeadConfigUpsertMock(...args),
    },
    lead: { findMany: (...args: unknown[]) => leadFindManyMock(...args) },
    instagramAccount: { findUnique: (...args: unknown[]) => instagramAccountFindUniqueMock(...args) },
    hotLeadCardSlot: {
      count: (...args: unknown[]) => hotLeadCardSlotCountMock(...args),
      findUnique: (...args: unknown[]) => hotLeadCardSlotFindUniqueMock(...args),
      update: (...args: unknown[]) => hotLeadCardSlotUpdateMock(...args),
      upsert: (...args: unknown[]) => upsertCallsMock(...args),
    },
    $transaction: (ops: unknown[]) => transactionMock(ops),
  },
}));

const ensureLeadFirstNameFromInstagramMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  ensureLeadFirstNameFromInstagram: (...args: unknown[]) => ensureLeadFirstNameFromInstagramMock(...args),
}));

import {
  HOT_LEAD_STEP_DAYS,
  HOT_LEAD_STEP_COUNT,
  HOT_LEAD_WINDOW_AFTER_DAYS,
  isHotLeadSequenceStale,
  chooseHotLeadStep,
  buildHotLeadCardCandidates,
  buildHotLeadCardReason,
  isHotLeadDailyLimitReached,
  DEFAULT_HOT_LEAD_STEP_MESSAGES,
  getHotLeadCards,
  toggleHotLeadCardSent,
  type HotLeadConversationInput,
} from "./hot-lead-cards";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-01-20T12:00:00.000Z");

function input(overrides: Partial<HotLeadConversationInput> = {}): HotLeadConversationInput {
  return {
    conversationId: "conv-1",
    leadId: "lead-1",
    lastLeadMessageAt: new Date(NOW.getTime() - 2 * DAY_MS), // passo 1 (2 dias) no dia exato
    leadMessageContents: ["Qual o horário de vocês?"],
    existingSteps: [],
    ...overrides,
  };
}

describe("HOT_LEAD_STEP_DAYS — cadência fixa 2/4/30", () => {
  it("3 passos, nessa ordem", () => {
    expect(HOT_LEAD_STEP_DAYS).toEqual([2, 4, 30]);
    expect(HOT_LEAD_STEP_COUNT).toBe(3);
    expect(HOT_LEAD_WINDOW_AFTER_DAYS).toBe(3);
  });
});

describe("isHotLeadSequenceStale", () => {
  it("lead nunca mandou mensagem depois da âncora: não stale", () => {
    const anchor = new Date("2026-01-01T00:00:00.000Z");
    expect(isHotLeadSequenceStale(anchor, anchor)).toBe(false);
  });

  it("lead mandou mensagem DEPOIS da âncora: stale (respondeu, cancela os passos pendentes)", () => {
    const anchor = new Date("2026-01-01T00:00:00.000Z");
    const laterMessage = new Date("2026-01-05T00:00:00.000Z");
    expect(isHotLeadSequenceStale(anchor, laterMessage)).toBe(true);
  });

  it("sem lastLeadMessageAt: não stale", () => {
    expect(isHotLeadSequenceStale(new Date(), null)).toBe(false);
  });
});

describe("chooseHotLeadStep — qual passo mostrar agora (sequência nova)", () => {
  it("passo 1 no dia exato (2 dias desde a última mensagem): elegível", () => {
    const choice = chooseHotLeadStep(input({ lastLeadMessageAt: new Date(NOW.getTime() - 2 * DAY_MS) }), NOW);
    expect(choice?.step).toBe(1);
    expect(choice?.category).toBe("horario");
  });

  it("1 dia desde a última mensagem (antes do passo 1 abrir): nada ainda", () => {
    const choice = chooseHotLeadStep(input({ lastLeadMessageAt: new Date(NOW.getTime() - 1 * DAY_MS) }), NOW);
    expect(choice).toBeNull();
  });

  it("5 dias (ainda dentro da janela do passo 1, +3 dias): elegível no passo 1", () => {
    const choice = chooseHotLeadStep(input({ lastLeadMessageAt: new Date(NOW.getTime() - 5 * DAY_MS) }), NOW);
    expect(choice?.step).toBe(1);
  });

  it("6 dias (janela do passo 1 fechou, passo 2 ainda não abriu — 6 não está em [4,7]? está — passo 2 aberto)", () => {
    // Passo 2 = dia 4, janela [4,7] — dia 6 cai dentro, então elegível no passo 2
    // (nenhum passo 1 nunca foi criado pra esta conversa — primeira vez vista).
    const choice = chooseHotLeadStep(input({ lastLeadMessageAt: new Date(NOW.getTime() - 6 * DAY_MS) }), NOW);
    expect(choice?.step).toBe(2);
  });

  it("8 dias (depois das janelas dos passos 1 e 2, antes do passo 3): nada", () => {
    const choice = chooseHotLeadStep(input({ lastLeadMessageAt: new Date(NOW.getTime() - 8 * DAY_MS) }), NOW);
    expect(choice).toBeNull();
  });

  it("30 dias (passo 3 no dia exato): elegível no passo 3", () => {
    const choice = chooseHotLeadStep(input({ lastLeadMessageAt: new Date(NOW.getTime() - 30 * DAY_MS) }), NOW);
    expect(choice?.step).toBe(3);
  });

  it("34 dias (depois da janela do passo 3): nada — sequência encerrada, nenhuma nova tentativa", () => {
    const choice = chooseHotLeadStep(input({ lastLeadMessageAt: new Date(NOW.getTime() - 34 * DAY_MS) }), NOW);
    expect(choice).toBeNull();
  });

  it("sem sinal de interesse: nenhum passo, mesmo no dia exato de um passo", () => {
    const choice = chooseHotLeadStep(input({ lastLeadMessageAt: new Date(NOW.getTime() - 2 * DAY_MS), leadMessageContents: ["Oi, tudo bem?"] }), NOW);
    expect(choice).toBeNull();
  });

  it("pediu pra parar: nenhum passo, mesmo com sinal de interesse", () => {
    const choice = chooseHotLeadStep(
      input({ lastLeadMessageAt: new Date(NOW.getTime() - 2 * DAY_MS), leadMessageContents: ["Qual horário?", "Pare de mandar mensagem"] }),
      NOW
    );
    expect(choice).toBeNull();
  });

  it("sinal de preço/endereço: categoria preco_endereco", () => {
    const choice = chooseHotLeadStep(input({ lastLeadMessageAt: new Date(NOW.getTime() - 2 * DAY_MS), leadMessageContents: ["Qual o valor?"] }), NOW);
    expect(choice?.category).toBe("preco_endereco");
  });
});

describe("chooseHotLeadStep — sequência já começada (âncora congelada)", () => {
  const anchor = new Date(NOW.getTime() - 5 * DAY_MS); // passo 1 aberto nesse instante

  it("âncora congelada é usada, não a lastLeadMessageAt atual — 'uma sequência por lead', não reinicia", () => {
    const choice = chooseHotLeadStep(
      input({
        lastLeadMessageAt: anchor, // lead ainda não respondeu desde então
        leadMessageContents: ["mensagem antiga que já nem bate mais keyword nenhuma"],
        existingSteps: [{ step: 1, slot: 2, sentAt: null, category: "preco_endereco", sequenceAnchorAt: anchor }],
      }),
      NOW
    );
    // categoria vem da âncora (preco_endereco), não recalculada a partir
    // do texto atual (que nem teria sinal nenhum).
    expect(choice?.category).toBe("preco_endereco");
    expect(choice?.step).toBe(1);
  });

  it("passo 1 já enviado: pula pro passo 2 se a janela dele já abriu", () => {
    const anchorStep2 = new Date(NOW.getTime() - 4 * DAY_MS); // passo 2 no dia exato
    const choice = chooseHotLeadStep(
      input({
        lastLeadMessageAt: anchorStep2,
        existingSteps: [{ step: 1, slot: 1, sentAt: new Date(NOW.getTime() - 1 * DAY_MS), category: "horario", sequenceAnchorAt: anchorStep2 }],
      }),
      NOW
    );
    expect(choice?.step).toBe(2);
  });

  it("lead respondeu DEPOIS da âncora (sequência stale): nenhum passo pendente aparece — cancelado", () => {
    const olderAnchor = new Date(NOW.getTime() - 5 * DAY_MS);
    const newerMessage = new Date(NOW.getTime() - 1 * DAY_MS); // respondeu depois
    const choice = chooseHotLeadStep(
      input({
        lastLeadMessageAt: newerMessage,
        existingSteps: [{ step: 1, slot: 1, sentAt: null, category: "horario", sequenceAnchorAt: olderAnchor }],
      }),
      NOW
    );
    expect(choice).toBeNull();
  });

  it("depois do passo 3 (enviado ou janela fechada): nenhuma nova tentativa, mesmo com sinal de interesse de novo", () => {
    const anchor30 = new Date(NOW.getTime() - 30 * DAY_MS);
    const choice = chooseHotLeadStep(
      input({
        lastLeadMessageAt: anchor30,
        existingSteps: [
          { step: 1, slot: 1, sentAt: new Date(), category: "horario", sequenceAnchorAt: anchor30 },
          { step: 2, slot: 1, sentAt: new Date(), category: "horario", sequenceAnchorAt: anchor30 },
          { step: 3, slot: 1, sentAt: new Date(), category: "horario", sequenceAnchorAt: anchor30 },
        ],
      }),
      NOW
    );
    expect(choice).toBeNull();
  });

  it('"só um card pendente por lead": passo 1 ainda pendente e dentro da janela vence mesmo com a janela do passo 2 também aberta', () => {
    // dia 5 desde a âncora: passo 1 [2,5] ainda aberto, passo 2 [4,7] também
    // aberto — com o passo 1 ainda sem nenhuma linha (nunca criado nem
    // enviado), ele é o escolhido (menor número).
    const anchorOverlap = new Date(NOW.getTime() - 5 * DAY_MS);
    const choice = chooseHotLeadStep(input({ lastLeadMessageAt: anchorOverlap, existingSteps: [] }), NOW);
    expect(choice?.step).toBe(1);
  });
});

describe("buildHotLeadCardCandidates", () => {
  it("ordena horário antes de preço/endereço quando entraram na janela ao mesmo tempo", () => {
    const lastMsg = new Date(NOW.getTime() - 2 * DAY_MS);
    const conversations = [
      input({ conversationId: "conv-preco", leadId: "lead-preco", lastLeadMessageAt: lastMsg, leadMessageContents: ["Qual o valor?"] }),
      input({ conversationId: "conv-horario", leadId: "lead-horario", lastLeadMessageAt: lastMsg, leadMessageContents: ["Que horário?"] }),
    ];

    const cards = buildHotLeadCardCandidates(conversations, NOW);

    expect(cards.map((c) => c.category)).toEqual(["horario", "preco_endereco"]);
  });

  it("não elegíveis não entram na lista", () => {
    const cards = buildHotLeadCardCandidates([input({ leadMessageContents: ["Oi, tudo bem?"] })], NOW);
    expect(cards).toEqual([]);
  });
});

describe("buildHotLeadCardReason", () => {
  it('"Perguntou sobre horário · há 6 dias · passo 2 de 3"', () => {
    const anchor = new Date(NOW.getTime() - 6 * DAY_MS);
    expect(buildHotLeadCardReason("horario", anchor, NOW, 2)).toBe("Perguntou sobre horário · há 6 dias · passo 2 de 3");
  });

  it('"Perguntou preço/endereço · há 6 dias · passo 1 de 3"', () => {
    const anchor = new Date(NOW.getTime() - 6 * DAY_MS);
    expect(buildHotLeadCardReason("preco_endereco", anchor, NOW, 1)).toBe("Perguntou preço/endereço · há 6 dias · passo 1 de 3");
  });
});

describe("isHotLeadDailyLimitReached", () => {
  it("abaixo do limite: false", () => {
    expect(isHotLeadDailyLimitReached(3, 5)).toBe(false);
  });

  it("no limite: true", () => {
    expect(isHotLeadDailyLimitReached(5, 5)).toBe(true);
  });
});

describe("DEFAULT_HOT_LEAD_STEP_MESSAGES", () => {
  it("3 passos, 3 variações cada, nenhum com variável quebrada", () => {
    expect(DEFAULT_HOT_LEAD_STEP_MESSAGES).toHaveLength(3);
    for (const stepMessages of DEFAULT_HOT_LEAD_STEP_MESSAGES) {
      expect(stepMessages).toHaveLength(3);
      for (const msg of stepMessages) {
        expect(msg).not.toMatch(/\{\{/);
      }
    }
  });
});

describe("getHotLeadCards — wrapper Prisma", () => {
  beforeEach(() => {
    conversationFindManyMock.mockReset();
    hotLeadConfigFindUniqueMock.mockReset();
    hotLeadConfigUpsertMock.mockReset();
    leadFindManyMock.mockReset();
    instagramAccountFindUniqueMock.mockReset();
    hotLeadCardSlotCountMock.mockReset();
    transactionMock.mockReset();
    ensureLeadFirstNameFromInstagramMock.mockReset();

    leadFindManyMock.mockResolvedValue([{ id: "lead-1", name: "Fulana", igUsername: "fulana.ig", igScopedId: "ig-1", nameLookupAttempted: true, profilePictureUrl: null }]);
    instagramAccountFindUniqueMock.mockResolvedValue(null);
    hotLeadCardSlotCountMock.mockResolvedValue(0);
    hotLeadConfigFindUniqueMock.mockResolvedValue({ dailyLimit: 5 });
    transactionMock.mockResolvedValue([]);
  });

  it("conversa nova, sinal de horário, 2 dias parado: cria o passo 1", async () => {
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        leadId: "lead-1",
        lastLeadMessageAt: new Date(NOW.getTime() - 2 * DAY_MS),
        messages: [{ content: "Que horário vocês atendem?" }],
        hotLeadCardSlots: [],
      },
    ]);

    const cards = await getHotLeadCards("clinic-1", NOW);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(1);
    expect(cards[0]!.sentAt).toBeNull();
    expect(transactionMock).toHaveBeenCalled();
  });

  it("sequência já com passo 1 enviado: mostra o passo 2 quando a janela dele abre", async () => {
    const anchor = new Date(NOW.getTime() - 4 * DAY_MS); // passo 2 no dia exato
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        leadId: "lead-1",
        lastLeadMessageAt: anchor,
        messages: [{ content: "Que horário vocês atendem?" }],
        hotLeadCardSlots: [{ step: 1, slot: 1, sentAt: new Date(NOW.getTime() - 1 * DAY_MS), category: "horario", sequenceAnchorAt: anchor }],
      },
    ]);

    const cards = await getHotLeadCards("clinic-1", NOW);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(2);
  });

  it("lead respondeu depois da âncora (stale): nenhum card, mesmo com passo pendente na janela", async () => {
    const anchor = new Date(NOW.getTime() - 5 * DAY_MS);
    const newerMessage = new Date(NOW.getTime() - 1 * DAY_MS);
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        leadId: "lead-1",
        lastLeadMessageAt: newerMessage,
        messages: [{ content: "obrigado, mas já resolvi" }],
        hotLeadCardSlots: [{ step: 1, slot: 1, sentAt: null, category: "horario", sequenceAnchorAt: anchor }],
      },
    ]);

    const cards = await getHotLeadCards("clinic-1", NOW);

    expect(cards).toEqual([]);
  });

  it("limite diário atingido: dailyLimitReached true pro card pendente", async () => {
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        leadId: "lead-1",
        lastLeadMessageAt: new Date(NOW.getTime() - 2 * DAY_MS),
        messages: [{ content: "Que horário vocês atendem?" }],
        hotLeadCardSlots: [],
      },
    ]);
    hotLeadCardSlotCountMock.mockResolvedValue(5); // igual ao dailyLimit (5)

    const cards = await getHotLeadCards("clinic-1", NOW);

    expect(cards[0]!.dailyLimitReached).toBe(true);
  });

  it("nenhuma conversa elegível: lista vazia, sem tocar em config/lead", async () => {
    conversationFindManyMock.mockResolvedValue([]);

    const cards = await getHotLeadCards("clinic-1", NOW);

    expect(cards).toEqual([]);
    expect(leadFindManyMock).not.toHaveBeenCalled();
  });
});

describe("toggleHotLeadCardSent — chave (conversationId, step)", () => {
  beforeEach(() => {
    hotLeadCardSlotFindUniqueMock.mockReset();
    hotLeadCardSlotUpdateMock.mockReset();
    hotLeadCardSlotCountMock.mockReset();
    hotLeadConfigFindUniqueMock.mockReset();
  });

  it("card inexistente pra esse passo: not_found", async () => {
    hotLeadCardSlotFindUniqueMock.mockResolvedValue(null);

    const result = await toggleHotLeadCardSent("conv-1", 2, NOW);

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("marca enviado quando pendente e dentro do limite diário", async () => {
    hotLeadCardSlotFindUniqueMock.mockResolvedValue({ id: "slot-1", sentAt: null, conversation: { clinicId: "clinic-1" } });
    hotLeadConfigFindUniqueMock.mockResolvedValue({ dailyLimit: 5 });
    hotLeadCardSlotCountMock.mockResolvedValue(2);

    const result = await toggleHotLeadCardSent("conv-1", 1, NOW);

    expect(result).toEqual({ ok: true, clinicId: "clinic-1", sentAt: NOW });
    expect(hotLeadCardSlotUpdateMock).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { sentAt: NOW } });
  });

  it("limite diário batido: rejeita, não marca", async () => {
    hotLeadCardSlotFindUniqueMock.mockResolvedValue({ id: "slot-1", sentAt: null, conversation: { clinicId: "clinic-1" } });
    hotLeadConfigFindUniqueMock.mockResolvedValue({ dailyLimit: 5 });
    hotLeadCardSlotCountMock.mockResolvedValue(5);

    const result = await toggleHotLeadCardSent("conv-1", 1, NOW);

    expect(result).toEqual({ ok: false, reason: "daily_limit_reached", clinicId: "clinic-1" });
    expect(hotLeadCardSlotUpdateMock).not.toHaveBeenCalled();
  });

  it("já enviado: desfaz sem reconferir limite diário (idempotente pra fora, toggle pra dentro)", async () => {
    hotLeadCardSlotFindUniqueMock.mockResolvedValue({ id: "slot-1", sentAt: new Date("2026-01-01T00:00:00Z"), conversation: { clinicId: "clinic-1" } });

    const result = await toggleHotLeadCardSent("conv-1", 1, NOW);

    expect(result).toEqual({ ok: true, clinicId: "clinic-1", sentAt: null });
    expect(hotLeadConfigFindUniqueMock).not.toHaveBeenCalled();
  });
});
