import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildNeverScheduledCardCandidates,
  resolveNeverScheduledCardMessageTemplate,
  buildNeverScheduledCardReason,
  stepDisplayPosition,
  DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES,
  NEVER_SCHEDULED_CARD_STEPS,
  type NeverScheduledCandidate,
} from "./never-scheduled-cards";
import { computeReactivationWindow } from "./reactivation";

function candidate(overrides: Partial<NeverScheduledCandidate> = {}): NeverScheduledCandidate {
  return {
    conversationId: "conv-1",
    leadId: "lead-1",
    anchorAt: new Date("2026-01-01T12:00:00.000Z"),
    ...overrides,
  };
}

// Mesma forma de buildNoShowCardCandidates (no-show-cards.test.ts), só
// que ancorada em anchorAt (congelado — ver comentário grande no topo de
// never-scheduled-cards.ts) em vez de noShowTriggeredAt, com offsets
// 10/30/60 (item 2, rodada atual, acrescentou o D10) — mesma função de
// janela (computeReactivationWindow, 5 dias úteis), "mesmo estilo do card
// Faltou" (pedido explícito).
describe("buildNeverScheduledCardCandidates", () => {
  it("gera um card no D10 (item 2, rodada atual), dentro da janela de 5 dias úteis a partir de anchorAt + 10 dias", () => {
    const anchorAt = new Date("2026-01-05T12:00:00.000Z"); // segunda
    const window10 = computeReactivationWindow(anchorAt, 10);
    const now = window10.start;

    const cards = buildNeverScheduledCardCandidates([candidate({ anchorAt })], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(3);
  });

  it("gera um card no D30, dentro da janela de 5 dias úteis a partir de anchorAt + 30 dias", () => {
    const anchorAt = new Date("2026-01-05T12:00:00.000Z");
    const window30 = computeReactivationWindow(anchorAt, 30);
    const now = window30.start;

    const cards = buildNeverScheduledCardCandidates([candidate({ anchorAt })], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(1);
  });

  it("gera um card no D60, independente dos outros (janelas em momentos diferentes)", () => {
    const anchorAt = new Date("2026-01-05T12:00:00.000Z");
    const window60 = computeReactivationWindow(anchorAt, 60);
    const now = window60.start;

    const cards = buildNeverScheduledCardCandidates([candidate({ anchorAt })], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(2);
  });

  it("fora das três janelas: nenhum card", () => {
    const anchorAt = new Date("2026-01-05T12:00:00.000Z");
    const now = new Date("2026-01-06T12:00:00.000Z"); // bem antes do D10 abrir
    expect(buildNeverScheduledCardCandidates([candidate({ anchorAt })], now)).toEqual([]);
  });

  it("os três passos fixos são 30 (step 1), 60 (step 2) e 10 (step 3, novo) dias — D30/D60 não foram renumerados", () => {
    expect(NEVER_SCHEDULED_CARD_STEPS).toEqual([
      { step: 1, offsetDays: 30 },
      { step: 2, offsetDays: 60 },
      { step: 3, offsetDays: 10 },
    ]);
  });
});

describe("stepDisplayPosition", () => {
  it("posição de exibição é cronológica (D10=1º, D30=2º, D60=3º), independente do `step` gravado", () => {
    expect(stepDisplayPosition(3)).toBe(1); // D10
    expect(stepDisplayPosition(1)).toBe(2); // D30
    expect(stepDisplayPosition(2)).toBe(3); // D60
  });
});

describe("resolveNeverScheduledCardMessageTemplate", () => {
  it("usa o texto customizado do D30 quando configurado", () => {
    expect(resolveNeverScheduledCardMessageTemplate(1, { day30Content: "Texto customizado D30" })).toBe("Texto customizado D30");
  });

  it("usa o texto customizado do D60 quando configurado", () => {
    expect(resolveNeverScheduledCardMessageTemplate(2, { day60Content: "Texto customizado D60" })).toBe("Texto customizado D60");
  });

  it("usa o texto customizado do D10 quando configurado (item 2, rodada atual)", () => {
    expect(resolveNeverScheduledCardMessageTemplate(3, { day10Content: "Texto customizado D10" })).toBe("Texto customizado D10");
  });

  it("sem customização, cai pro texto padrão de cada passo (os três textos exatos do pedido)", () => {
    expect(resolveNeverScheduledCardMessageTemplate(1, {})).toBe(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[0]);
    expect(resolveNeverScheduledCardMessageTemplate(2, {})).toBe(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[1]);
    expect(resolveNeverScheduledCardMessageTemplate(3, {})).toBe(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[2]);
    expect(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[0]).toBe(
      "Oi, {{primeiro_nome}}. Passando por aqui rapidinho para te desejar uma excelente semana."
    );
    expect(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[1]).toBe(
      "Oi, {{primeiro_nome}}. Passando para desejar uma ótima semana. Quando fizer sentido, estamos por aqui."
    );
    expect(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[2]).toBe(
      "Oi, {{primeiro_nome}}. Passando por aqui para saber se ficou alguma dúvida sobre a avaliação. Estou à disposição."
    );
  });
});

describe("buildNeverScheduledCardReason", () => {
  it('D30 (step 1) é a 2ª mensagem cronológica agora: "mensagem 2 de 3"', () => {
    const anchorAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-02-05T12:00:00.000Z"); // 35 dias depois
    expect(buildNeverScheduledCardReason(anchorAt, now, 1)).toBe("Sem agendamento há 35 dias · mensagem 2 de 3");
  });

  it('D60 (step 2) é a 3ª mensagem cronológica: "mensagem 3 de 3"', () => {
    const anchorAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-02T12:00:00.000Z");
    expect(buildNeverScheduledCardReason(anchorAt, now, 2)).toBe("Sem agendamento há 1 dia · mensagem 3 de 3");
  });

  it('D10 (step 3, novo) é a 1ª mensagem cronológica: "mensagem 1 de 3"', () => {
    const anchorAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-11T12:00:00.000Z"); // 10 dias depois
    expect(buildNeverScheduledCardReason(anchorAt, now, 3)).toBe("Sem agendamento há 10 dias · mensagem 1 de 3");
  });
});

// getNeverScheduledCards/toggleNeverScheduledCardSent — com Prisma mockado,
// mesmo padrão de getReactivationCards (reactivation.test.ts). Foco nas
// DUAS exclusões pedidas explicitamente ("já tenham qualquer agendamento"
// — aqui coberta pelo WHERE `lead: { appointments: { none: {} } }`
// passado ao Prisma, conferido abaixo — e "marcados como perdidos", WHERE
// `status: { not: "LOST" }`), na exclusão ADICIONAL (sinal de interesse do
// Quente) e na ÂNCORA CONGELADA (item 4, rodada atual).
const conversationFindManyMock = vi.fn();
const conversationUpdateMock = vi.fn();
const transactionMock = vi.fn();
const neverScheduledCardSettingsFindUniqueMock = vi.fn();
const leadFindManyMock = vi.fn();
const instagramAccountFindUniqueMock = vi.fn();
const neverScheduledCardSlotFindUniqueMock = vi.fn();
const neverScheduledCardSlotUpdateMock = vi.fn();
const neverScheduledCardSlotCreateMock = vi.fn();
const conversationFindUniqueMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findMany: (...args: unknown[]) => conversationFindManyMock(...args),
      findUnique: (...args: unknown[]) => conversationFindUniqueMock(...args),
      update: (...args: unknown[]) => conversationUpdateMock(...args),
    },
    neverScheduledCardSettings: { findUnique: (...args: unknown[]) => neverScheduledCardSettingsFindUniqueMock(...args) },
    lead: { findMany: (...args: unknown[]) => leadFindManyMock(...args) },
    instagramAccount: { findUnique: (...args: unknown[]) => instagramAccountFindUniqueMock(...args) },
    neverScheduledCardSlot: {
      findUnique: (...args: unknown[]) => neverScheduledCardSlotFindUniqueMock(...args),
      update: (...args: unknown[]) => neverScheduledCardSlotUpdateMock(...args),
      create: (...args: unknown[]) => neverScheduledCardSlotCreateMock(...args),
    },
    $transaction: (ops: unknown[]) => transactionMock(ops),
  },
}));

const ensureLeadFirstNameFromInstagramMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  ensureLeadFirstNameFromInstagram: (...args: unknown[]) => ensureLeadFirstNameFromInstagramMock(...args),
}));

import { getNeverScheduledCards, toggleNeverScheduledCardSent } from "./never-scheduled-cards";

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    leadId: "lead-1",
    lastMessageAt: new Date("2026-01-05T12:00:00.000Z"),
    neverScheduledAnchorAt: null,
    messages: [],
    neverScheduledCardSlots: [],
    ...overrides,
  };
}

describe("getNeverScheduledCards", () => {
  beforeEach(() => {
    conversationFindManyMock.mockReset();
    conversationUpdateMock.mockReset();
    transactionMock.mockReset();
    transactionMock.mockImplementation(async (ops: unknown[]) => ops);
    neverScheduledCardSettingsFindUniqueMock.mockReset();
    leadFindManyMock.mockReset();
    instagramAccountFindUniqueMock.mockReset();
    ensureLeadFirstNameFromInstagramMock.mockReset();
    neverScheduledCardSettingsFindUniqueMock.mockResolvedValue(null);
    instagramAccountFindUniqueMock.mockResolvedValue(null);
  });

  it("consulta conversas excluindo LOST e leads com qualquer agendamento (pedido explícito, itens 1)", async () => {
    conversationFindManyMock.mockResolvedValue([]);
    await getNeverScheduledCards("clinic-1", new Date());

    expect(conversationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
          status: { not: "LOST" },
          lastMessageAt: { not: null },
          lead: { appointments: { none: {} } },
        }),
      })
    );
  });

  it("lead com sinal de interesse (ex.: perguntou preço) fica de fora — é coberto pelo Quente, não aqui (exclusão adicional)", async () => {
    const lastMessageAt = computeReactivationWindow(new Date("2026-01-01T12:00:00.000Z"), 10).start;
    conversationFindManyMock.mockResolvedValue([
      conversationRow({ lastMessageAt, messages: [{ content: "Quanto custa o procedimento?" }] }),
    ]);

    const cards = await getNeverScheduledCards("clinic-1", lastMessageAt);
    expect(cards).toEqual([]);
  });

  it("lead sem nenhum sinal de interesse, D10 dentro da janela: gera o card (item 2, rodada atual)", async () => {
    const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(lastMessageAt, 10).start;
    conversationFindManyMock.mockResolvedValue([conversationRow({ lastMessageAt, messages: [{ content: "Oi, tudo bem?" }] })]);
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Maria", igUsername: "maria.ig", igScopedId: "123", nameLookupAttempted: true, profilePictureUrl: null },
    ]);

    const cards = await getNeverScheduledCards("clinic-1", now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(3);
    expect(cards[0]!.message).toContain("Maria");
    expect(cards[0]!.instagramDmLink).toContain("ig.me/m/maria.ig");
  });

  it("lead sem nenhum sinal de interesse, D30 dentro da janela: gera o card", async () => {
    const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(lastMessageAt, 30).start;
    conversationFindManyMock.mockResolvedValue([conversationRow({ lastMessageAt, messages: [{ content: "Oi, tudo bem?" }] })]);
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Maria", igUsername: "maria.ig", igScopedId: "123", nameLookupAttempted: true, profilePictureUrl: null },
    ]);

    const cards = await getNeverScheduledCards("clinic-1", now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(1);
  });

  it("card já marcado enviado: sentAt vem do slot existente", async () => {
    const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(lastMessageAt, 30).start;
    const sentAt = new Date(now.getTime() - 1000);
    conversationFindManyMock.mockResolvedValue([
      conversationRow({ lastMessageAt, neverScheduledCardSlots: [{ step: 1, sentAt }] }),
    ]);
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Maria", igUsername: "maria.ig", igScopedId: "123", nameLookupAttempted: true, profilePictureUrl: null },
    ]);

    const cards = await getNeverScheduledCards("clinic-1", now);
    expect(cards[0]!.sentAt).toEqual(sentAt);
  });

  // Item 4 (rodada atual) — âncora congelada: o card não deve sumir nem
  // reiniciar o prazo quando o lead responde sem agendar.
  describe("âncora congelada (item 4)", () => {
    it("conversa sem âncora ainda e ainda fora da primeira janela (D10): usa lastMessageAt ao vivo, sem persistir nada", async () => {
      const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
      const now = new Date("2026-01-08T12:00:00.000Z"); // 3 dias — bem antes do D10
      conversationFindManyMock.mockResolvedValue([conversationRow({ lastMessageAt })]);

      const cards = await getNeverScheduledCards("clinic-1", now);
      expect(cards).toEqual([]);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("conversa entra na janela do D10 por primeira vez: congela a âncora em Conversation.neverScheduledAnchorAt", async () => {
      const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
      const now = computeReactivationWindow(lastMessageAt, 10).start;
      conversationFindManyMock.mockResolvedValue([conversationRow({ lastMessageAt, neverScheduledAnchorAt: null })]);
      leadFindManyMock.mockResolvedValue([
        { id: "lead-1", name: "Maria", igUsername: "maria.ig", igScopedId: "123", nameLookupAttempted: true, profilePictureUrl: null },
      ]);

      await getNeverScheduledCards("clinic-1", now);

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(conversationUpdateMock).toHaveBeenCalledWith({
        where: { id: "conv-1" },
        data: { neverScheduledAnchorAt: lastMessageAt },
      });
    });

    it("conversa já com âncora congelada: ignora lastMessageAt ao vivo (resposta do lead sem agendar não reinicia o prazo)", async () => {
      const frozenAnchor = new Date("2026-01-05T12:00:00.000Z");
      // lastMessageAt bem mais recente (o lead respondeu depois, sem
      // agendar) — não deve afetar o card, que continua ancorado em
      // frozenAnchor.
      const laterReply = new Date("2026-02-01T12:00:00.000Z");
      const now = computeReactivationWindow(frozenAnchor, 30).start;
      conversationFindManyMock.mockResolvedValue([
        conversationRow({ lastMessageAt: laterReply, neverScheduledAnchorAt: frozenAnchor }),
      ]);
      leadFindManyMock.mockResolvedValue([
        { id: "lead-1", name: "Maria", igUsername: "maria.ig", igScopedId: "123", nameLookupAttempted: true, profilePictureUrl: null },
      ]);

      const cards = await getNeverScheduledCards("clinic-1", now);

      expect(cards).toHaveLength(1);
      expect(cards[0]!.step).toBe(1); // D30, contado a partir da âncora congelada
      expect(transactionMock).not.toHaveBeenCalled(); // já estava congelada, não grava de novo
    });
  });
});

describe("toggleNeverScheduledCardSent", () => {
  beforeEach(() => {
    neverScheduledCardSlotFindUniqueMock.mockReset();
    neverScheduledCardSlotUpdateMock.mockReset();
    neverScheduledCardSlotCreateMock.mockReset();
    conversationFindUniqueMock.mockReset();
  });

  it("primeiro clique (sem linha ainda): cria o slot já marcado enviado, lazy (igual toggleNoShowCardSent)", async () => {
    neverScheduledCardSlotFindUniqueMock.mockResolvedValue(null);
    conversationFindUniqueMock.mockResolvedValue({ clinicId: "clinic-1" });
    const now = new Date();

    const result = await toggleNeverScheduledCardSent("conv-1", 1, now);

    expect(neverScheduledCardSlotCreateMock).toHaveBeenCalledWith({ data: { conversationId: "conv-1", step: 1, sentAt: now } });
    expect(result).toEqual({ clinicId: "clinic-1", sentAt: now });
  });

  it("clique num slot já enviado: desmarca (volta a sentAt null)", async () => {
    const sentAt = new Date();
    neverScheduledCardSlotFindUniqueMock.mockResolvedValue({ id: "slot-1", sentAt, conversation: { clinicId: "clinic-1" } });

    const result = await toggleNeverScheduledCardSent("conv-1", 1);

    expect(neverScheduledCardSlotUpdateMock).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { sentAt: null } });
    expect(result).toEqual({ clinicId: "clinic-1", sentAt: null });
  });

  it("conversa inexistente (primeiro clique): devolve null, não cria nada", async () => {
    neverScheduledCardSlotFindUniqueMock.mockResolvedValue(null);
    conversationFindUniqueMock.mockResolvedValue(null);

    const result = await toggleNeverScheduledCardSent("conv-inexistente", 1);

    expect(result).toBeNull();
    expect(neverScheduledCardSlotCreateMock).not.toHaveBeenCalled();
  });
});
