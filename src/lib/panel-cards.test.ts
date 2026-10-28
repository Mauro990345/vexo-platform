import { describe, it, expect } from "vitest";
import { mergePanelCards, reactivationCardReason } from "./panel-cards";
import type { ReactivationCard } from "./reactivation";
import type { NoShowCard } from "./no-show-cards";
import type { HotLeadCard } from "./hot-lead-cards";

function hotLeadCard(overrides: Partial<HotLeadCard> = {}): HotLeadCard {
  return {
    conversationId: "conv-1",
    leadId: "lead-1",
    slot: 1,
    category: "horario",
    name: "Ana",
    igUsername: "ana.ig",
    profilePictureUrl: null,
    message: "Oi!",
    instagramDmLink: "https://ig.me/m/ana.ig",
    instagramProfileLink: "https://www.instagram.com/ana.ig/",
    reason: "Perguntou sobre horário · há 6 dias",
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
    ...overrides,
  };
}

describe("reactivationCardReason", () => {
  it('"120 dias após o procedimento" (exemplo do pedido)', () => {
    expect(reactivationCardReason(120)).toBe("120 dias após o procedimento");
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
    expect(merged.map((c) => c.cardKey)).toEqual(["hot:conv-a", "hot:conv-b"]);
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

  it("Faltou e Reativação nunca têm disabledReason", () => {
    const merged = mergePanelCards({ hotLeadCards: [], noShowCards: [noShowCard()], reactivationCards: [reactivationCard()] });
    expect(merged.every((c) => c.disabledReason === undefined)).toBe(true);
  });

  it("listas vazias: lista vazia", () => {
    expect(mergePanelCards({ hotLeadCards: [], noShowCards: [], reactivationCards: [] })).toEqual([]);
  });
});
