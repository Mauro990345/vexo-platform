import { describe, it, expect } from "vitest";
import { mergePanelCards, reactivationCardReason, reactivationCardReasonShort, truncateNameToTwoWords } from "./panel-cards";
import type { ReactivationCard } from "./reactivation";
import type { NoShowCard } from "./no-show-cards";
import type { HotLeadCard } from "./hot-lead-cards";

function hotLeadCard(overrides: Partial<HotLeadCard> = {}): HotLeadCard {
  return {
    conversationId: "conv-1",
    leadId: "lead-1",
    step: 1,
    slot: 1,
    category: "horario",
    name: "Ana",
    igUsername: "ana.ig",
    profilePictureUrl: null,
    message: "Oi!",
    instagramDmLink: "https://ig.me/m/ana.ig",
    instagramProfileLink: "https://www.instagram.com/ana.ig/",
    reason: "Perguntou sobre horário · há 6 dias · passo 1 de 3",
    sentAt: null,
    dailyLimitReached: false,
    ...overrides,
  };
}

function noShowCard(overrides: Partial<NoShowCard> = {}): NoShowCard {
  return {
    appointmentId: "appt-1",
    step: 1,
    leadId: "lead-2",
    name: "Beatriz",
    igUsername: null,
    profilePictureUrl: null,
    message: "Oi, Beatriz!",
    channel: "WHATSAPP",
    whatsappLink: null,
    instagramDmLink: null,
    instagramProfileLink: null,
    reason: "Faltou há 3 dias · mensagem 1 de 2",
    noShowTriggeredAt: new Date(),
    sentAt: null,
    dailyLimitReached: false,
    ...overrides,
  };
}

function reactivationCard(overrides: Partial<ReactivationCard> = {}): ReactivationCard {
  return {
    appointmentId: "appt-2",
    leadId: "lead-3",
    name: "Carla",
    igUsername: null,
    profilePictureUrl: null,
    message: "Oi, Carla!",
    channel: "WHATSAPP",
    whatsappLink: "https://wa.me/5511999999999",
    instagramDmLink: null,
    instagramProfileLink: null,
    completionDate: new Date(),
    thresholdDays: 120,
    sentAt: null,
    dailyLimitReached: false,
    ...overrides,
  };
}

describe("reactivationCardReason", () => {
  it('"120 dias após o procedimento" (exemplo do pedido) — intocado, serve o desktop', () => {
    expect(reactivationCardReason(120)).toBe("120 dias após o procedimento");
  });
});

describe("reactivationCardReasonShort", () => {
  it('"120 dias após" — sem "o procedimento" (pedido explícito, só celular)', () => {
    expect(reactivationCardReasonShort(120)).toBe("120 dias após");
  });

  it('"30 dias após" (outro exemplo do pedido)', () => {
    expect(reactivationCardReasonShort(30)).toBe("30 dias após");
  });
});

describe("truncateNameToTwoWords", () => {
  it('"Espaçolaser Depilação a Laser" -> "Espaçolaser Depilação…" (exemplo do pedido)', () => {
    expect(truncateNameToTwoWords("Espaçolaser Depilação a Laser")).toBe("Espaçolaser Depilação…");
  });

  it("nome de 1 palavra: devolve igual, sem reticências", () => {
    expect(truncateNameToTwoWords("Ana")).toBe("Ana");
  });

  it("nome de exatamente 2 palavras: devolve igual, sem reticências", () => {
    expect(truncateNameToTwoWords("Ana Silva")).toBe("Ana Silva");
  });

  it("nome de 4 palavras: primeiras 2 + reticências", () => {
    expect(truncateNameToTwoWords("Ana Beatriz Silva Santos")).toBe("Ana Beatriz…");
  });

  it("espaços extras entre palavras: não afeta o resultado", () => {
    expect(truncateNameToTwoWords("Ana   Beatriz   Silva")).toBe("Ana Beatriz…");
  });
});

describe("mergePanelCards", () => {
  it("ordena Quente, Faltou, Reativação, nessa ordem fixa", () => {
    const merged = mergePanelCards({
      hotLeadCards: [hotLeadCard()],
      noShowCards: [noShowCard()],
      reactivationCards: [reactivationCard()],
    });

    expect(merged.map((c) => c.kind)).toEqual(["HOT_LEAD", "NO_SHOW", "REACTIVATION"]);
  });

  it("preserva a ordem interna de cada lista de origem (já vem ordenada por urgência)", () => {
    const merged = mergePanelCards({
      hotLeadCards: [hotLeadCard({ conversationId: "conv-a" }), hotLeadCard({ conversationId: "conv-b" })],
      noShowCards: [],
      reactivationCards: [],
    });
    expect(merged.map((c) => c.cardKey)).toEqual(["hot:conv-a:1", "hot:conv-b:1"]);
  });

  it("cardKey do Quente inclui o passo — a mesma conversa gera chaves diferentes em passos diferentes", () => {
    const merged = mergePanelCards({
      hotLeadCards: [hotLeadCard({ conversationId: "conv-a", step: 2 })],
      noShowCards: [],
      reactivationCards: [],
    });
    expect(merged[0]!.cardKey).toBe("hot:conv-a:2");
    expect((merged[0]!.actionKey as { kind: "HOT_LEAD"; conversationId: string; step: number }).step).toBe(2);
  });

  it("card do Quente no limite diário (sem ainda ter sido marcado) vem com disabledReason", () => {
    const merged = mergePanelCards({
      hotLeadCards: [hotLeadCard({ dailyLimitReached: true })],
      noShowCards: [],
      reactivationCards: [],
    });
    expect(merged[0]!.disabledReason).toBe("Limite diário atingido");
  });

  it("card do Quente já enviado nunca fica desabilitado, mesmo com limite atingido (não impede desfazer)", () => {
    const merged = mergePanelCards({
      hotLeadCards: [hotLeadCard({ dailyLimitReached: true, sentAt: new Date() })],
      noShowCards: [],
      reactivationCards: [],
    });
    expect(merged[0]!.disabledReason).toBeUndefined();
  });

  it("card de Faltou no limite diário de WhatsApp (sem ainda ter sido marcado) vem com disabledReason", () => {
    const merged = mergePanelCards({ hotLeadCards: [], noShowCards: [noShowCard({ dailyLimitReached: true })], reactivationCards: [] });
    expect(merged[0]!.disabledReason).toBe("Limite diário atingido");
  });

  it("card de Reativação no limite diário de WhatsApp (sem ainda ter sido marcado) vem com disabledReason", () => {
    const merged = mergePanelCards({ hotLeadCards: [], noShowCards: [], reactivationCards: [reactivationCard({ dailyLimitReached: true })] });
    expect(merged[0]!.disabledReason).toBe("Limite diário atingido");
  });

  it("card de Faltou/Reativação já enviado nunca fica desabilitado, mesmo com limite atingido", () => {
    const merged = mergePanelCards({
      hotLeadCards: [],
      noShowCards: [noShowCard({ dailyLimitReached: true, sentAt: new Date() })],
      reactivationCards: [reactivationCard({ dailyLimitReached: true, sentAt: new Date() })],
    });
    expect(merged.every((c) => c.disabledReason === undefined)).toBe(true);
  });

  it("sem limite diário atingido: nenhum dos três tipos fica desabilitado", () => {
    const merged = mergePanelCards({ hotLeadCards: [hotLeadCard()], noShowCards: [noShowCard()], reactivationCards: [reactivationCard()] });
    expect(merged.every((c) => c.disabledReason === undefined)).toBe(true);
  });

  it("listas vazias: lista vazia", () => {
    expect(mergePanelCards({ hotLeadCards: [], noShowCards: [], reactivationCards: [] })).toEqual([]);
  });

  it('reasonShort do Quente: só a categoria, sem "· há N dias · passo X de Y" (pedido explícito, só celular)', () => {
    const merged = mergePanelCards({
      hotLeadCards: [hotLeadCard({ category: "horario", reason: "Perguntou sobre horário · há 6 dias · passo 1 de 3" })],
      noShowCards: [],
      reactivationCards: [],
    });
    expect(merged[0]!.reasonShort).toBe("Perguntou sobre horário");
    expect(merged[0]!.reason).toBe("Perguntou sobre horário · há 6 dias · passo 1 de 3"); // reason (desktop) intocado
  });

  it("reasonShort do Quente: categoria preco_endereco", () => {
    const merged = mergePanelCards({
      hotLeadCards: [hotLeadCard({ category: "preco_endereco" })],
      noShowCards: [],
      reactivationCards: [],
    });
    expect(merged[0]!.reasonShort).toBe("Perguntou preço/endereço");
  });

  it("reasonShort do Faltou: igual ao reason completo (pedido explícito, nada a encurtar)", () => {
    const merged = mergePanelCards({
      hotLeadCards: [],
      noShowCards: [noShowCard({ reason: "Faltou há 3 dias · mensagem 1 de 2" })],
      reactivationCards: [],
    });
    expect(merged[0]!.reasonShort).toBe("Faltou há 3 dias · mensagem 1 de 2");
    expect(merged[0]!.reasonShort).toBe(merged[0]!.reason);
  });

  it('reasonShort da Reativação: "N dias após", sem "o procedimento"', () => {
    const merged = mergePanelCards({
      hotLeadCards: [],
      noShowCards: [],
      reactivationCards: [reactivationCard({ thresholdDays: 90 })],
    });
    expect(merged[0]!.reasonShort).toBe("90 dias após");
    expect(merged[0]!.reason).toBe("90 dias após o procedimento"); // reason (desktop) intocado
  });
});
