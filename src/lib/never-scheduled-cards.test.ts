import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildNeverScheduledCardCandidates,
  resolveNeverScheduledCardMessageTemplate,
  buildNeverScheduledCardReason,
  DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES,
  NEVER_SCHEDULED_CARD_STEPS,
  type NeverScheduledCandidate,
} from "./never-scheduled-cards";
import { computeReactivationWindow } from "./reactivation";

function candidate(overrides: Partial<NeverScheduledCandidate> = {}): NeverScheduledCandidate {
  return {
    conversationId: "conv-1",
    leadId: "lead-1",
    lastMessageAt: new Date("2026-01-01T12:00:00.000Z"),
    ...overrides,
  };
}

// Mesma forma de buildNoShowCardCandidates (no-show-cards.test.ts), só
// que ancorada em lastMessageAt (qualquer lado da conversa) em vez de
// noShowTriggeredAt, com offsets 30/60 em vez de 3/10 — mesma função de
// janela (computeReactivationWindow, 5 dias úteis), "mesmo estilo do card
// Faltou" (pedido explícito).
describe("buildNeverScheduledCardCandidates", () => {
  it("gera um card no D30, dentro da janela de 5 dias úteis a partir de lastMessageAt + 30 dias", () => {
    const lastMessageAt = new Date("2026-01-05T12:00:00.000Z"); // segunda
    const window30 = computeReactivationWindow(lastMessageAt, 30);
    const now = window30.start;

    const cards = buildNeverScheduledCardCandidates([candidate({ lastMessageAt })], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(1);
  });

  it("gera um card no D60, independente do D30 (janelas em momentos diferentes)", () => {
    const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
    const window60 = computeReactivationWindow(lastMessageAt, 60);
    const now = window60.start;

    const cards = buildNeverScheduledCardCandidates([candidate({ lastMessageAt })], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(2);
  });

  it("fora das duas janelas: nenhum card", () => {
    const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
    const now = new Date("2026-01-10T12:00:00.000Z"); // bem antes do D30 abrir
    expect(buildNeverScheduledCardCandidates([candidate({ lastMessageAt })], now)).toEqual([]);
  });

  it("os dois passos fixos são 30 e 60 dias", () => {
    expect(NEVER_SCHEDULED_CARD_STEPS).toEqual([
      { step: 1, offsetDays: 30 },
      { step: 2, offsetDays: 60 },
    ]);
  });
});

describe("resolveNeverScheduledCardMessageTemplate", () => {
  it("usa o texto customizado do D30 quando configurado", () => {
    expect(resolveNeverScheduledCardMessageTemplate(1, { day30Content: "Texto customizado D30" })).toBe("Texto customizado D30");
  });

  it("usa o texto customizado do D60 quando configurado", () => {
    expect(resolveNeverScheduledCardMessageTemplate(2, { day60Content: "Texto customizado D60" })).toBe("Texto customizado D60");
  });

  it("sem customização, cai pro texto padrão de cada passo (os dois textos exatos do pedido)", () => {
    expect(resolveNeverScheduledCardMessageTemplate(1, {})).toBe(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[0]);
    expect(resolveNeverScheduledCardMessageTemplate(2, {})).toBe(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[1]);
    expect(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[0]).toBe(
      "Oi, {{primeiro_nome}}. Passando por aqui rapidinho para te desejar uma excelente semana."
    );
    expect(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[1]).toBe(
      "Oi, {{primeiro_nome}}. Passando para desejar uma ótima semana. Quando fizer sentido, estamos por aqui."
    );
  });
});

describe("buildNeverScheduledCardReason", () => {
  it('"Sem agendamento há 35 dias · mensagem 1 de 2"', () => {
    const lastMessageAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-02-05T12:00:00.000Z"); // 35 dias depois
    expect(buildNeverScheduledCardReason(lastMessageAt, now, 1)).toBe("Sem agendamento há 35 dias · mensagem 1 de 2");
  });

  it('1 dia: singular ("1 dia", não "1 dias")', () => {
    const lastMessageAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-02T12:00:00.000Z");
    expect(buildNeverScheduledCardReason(lastMessageAt, now, 2)).toBe("Sem agendamento há 1 dia · mensagem 2 de 2");
  });
});

// getNeverScheduledCards/toggleNeverScheduledCardSent — com Prisma mockado,
// mesmo padrão de getReactivationCards (reactivation.test.ts). Foco nas
// DUAS exclusões pedidas explicitamente ("já tenham qualquer agendamento"
// — aqui coberta pelo WHERE `lead: { appointments: { none: {} } }`
// passado ao Prisma, conferido abaixo — e "marcados como perdidos", WHERE
// `status: { not: "LOST" }`) e na exclusão ADICIONAL que apliquei (sinal
// de interesse do Quente, JS puro, testada de verdade — não só o WHERE).
const conversationFindManyMock = vi.fn();
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
    },
    neverScheduledCardSettings: { findUnique: (...args: unknown[]) => neverScheduledCardSettingsFindUniqueMock(...args) },
    lead: { findMany: (...args: unknown[]) => leadFindManyMock(...args) },
    instagramAccount: { findUnique: (...args: unknown[]) => instagramAccountFindUniqueMock(...args) },
    neverScheduledCardSlot: {
      findUnique: (...args: unknown[]) => neverScheduledCardSlotFindUniqueMock(...args),
      update: (...args: unknown[]) => neverScheduledCardSlotUpdateMock(...args),
      create: (...args: unknown[]) => neverScheduledCardSlotCreateMock(...args),
    },
  },
}));

const ensureLeadFirstNameFromInstagramMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  ensureLeadFirstNameFromInstagram: (...args: unknown[]) => ensureLeadFirstNameFromInstagramMock(...args),
}));

import { getNeverScheduledCards, toggleNeverScheduledCardSent } from "./never-scheduled-cards";

describe("getNeverScheduledCards", () => {
  beforeEach(() => {
    conversationFindManyMock.mockReset();
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
    const lastMessageAt = computeReactivationWindow(new Date("2026-01-01T12:00:00.000Z"), 30).start;
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        leadId: "lead-1",
        lastMessageAt,
        messages: [{ content: "Quanto custa o procedimento?" }],
        neverScheduledCardSlots: [],
      },
    ]);

    const cards = await getNeverScheduledCards("clinic-1", lastMessageAt);
    expect(cards).toEqual([]);
  });

  it("lead sem nenhum sinal de interesse, D30 dentro da janela: gera o card", async () => {
    const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(lastMessageAt, 30).start;
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        leadId: "lead-1",
        lastMessageAt,
        messages: [{ content: "Oi, tudo bem?" }],
        neverScheduledCardSlots: [],
      },
    ]);
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Maria", igUsername: "maria.ig", igScopedId: "123", nameLookupAttempted: true, profilePictureUrl: null },
    ]);

    const cards = await getNeverScheduledCards("clinic-1", now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(1);
    expect(cards[0]!.message).toContain("Maria");
    expect(cards[0]!.instagramDmLink).toContain("ig.me/m/maria.ig");
  });

  it("card já marcado enviado: sentAt vem do slot existente", async () => {
    const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(lastMessageAt, 30).start;
    const sentAt = new Date(now.getTime() - 1000);
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        leadId: "lead-1",
        lastMessageAt,
        messages: [],
        neverScheduledCardSlots: [{ step: 1, sentAt }],
      },
    ]);
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Maria", igUsername: "maria.ig", igScopedId: "123", nameLookupAttempted: true, profilePictureUrl: null },
    ]);

    const cards = await getNeverScheduledCards("clinic-1", now);
    expect(cards[0]!.sentAt).toEqual(sentAt);
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
