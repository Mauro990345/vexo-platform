import { describe, it, expect } from "vitest";
import {
  evaluateHotLeadEligibility,
  buildHotLeadCardCandidates,
  buildHotLeadCardReason,
  isHotLeadIdleWindowOpen,
  isHotLeadDailyLimitReached,
  HOT_LEAD_MIN_IDLE_DAYS,
  HOT_LEAD_MAX_IDLE_DAYS,
  DEFAULT_HOT_LEAD_MESSAGES,
  type HotLeadConversationInput,
} from "./hot-lead-cards";

const NOW = new Date("2026-01-20T12:00:00.000Z");

function input(overrides: Partial<HotLeadConversationInput> = {}): HotLeadConversationInput {
  return {
    conversationId: "conv-1",
    leadId: "lead-1",
    everScheduled: false,
    status: "FOLLOW_UP",
    lastLeadMessageAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 dias parado
    leadMessageContents: ["Qual o horário de vocês?"],
    ...overrides,
  };
}

describe("isHotLeadIdleWindowOpen", () => {
  it("menos de 3 dias: fechada", () => {
    const lastMsg = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
    expect(isHotLeadIdleWindowOpen(lastMsg, NOW)).toBe(false);
  });

  it("exatamente 3 dias: aberta", () => {
    const lastMsg = new Date(NOW.getTime() - HOT_LEAD_MIN_IDLE_DAYS * 24 * 60 * 60 * 1000);
    expect(isHotLeadIdleWindowOpen(lastMsg, NOW)).toBe(true);
  });

  it("21 dias: ainda aberta (limite)", () => {
    const lastMsg = new Date(NOW.getTime() - HOT_LEAD_MAX_IDLE_DAYS * 24 * 60 * 60 * 1000);
    expect(isHotLeadIdleWindowOpen(lastMsg, NOW)).toBe(true);
  });

  it("mais de 21 dias: fechada", () => {
    const lastMsg = new Date(NOW.getTime() - (HOT_LEAD_MAX_IDLE_DAYS + 1) * 24 * 60 * 60 * 1000);
    expect(isHotLeadIdleWindowOpen(lastMsg, NOW)).toBe(false);
  });

  it("nunca mandou mensagem (null): fechada", () => {
    expect(isHotLeadIdleWindowOpen(null, NOW)).toBe(false);
  });
});

describe("evaluateHotLeadEligibility", () => {
  it("elegível: nunca agendou, parado 3-21 dias, com sinal, sem pedir pra parar", () => {
    expect(evaluateHotLeadEligibility(input(), NOW)).toEqual({ category: "horario" });
  });

  it("já agendou (everScheduled): não elegível", () => {
    expect(evaluateHotLeadEligibility(input({ everScheduled: true }), NOW)).toBeNull();
  });

  it("status SCHEDULED: não elegível (defesa a mais, mesmo critério de everScheduled)", () => {
    expect(evaluateHotLeadEligibility(input({ status: "SCHEDULED" }), NOW)).toBeNull();
  });

  it("status NEEDS_HUMAN: não elegível (humano já está cuidando)", () => {
    expect(evaluateHotLeadEligibility(input({ status: "NEEDS_HUMAN" }), NOW)).toBeNull();
  });

  it("parado há menos de 3 dias: não elegível", () => {
    expect(
      evaluateHotLeadEligibility(input({ lastLeadMessageAt: new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000) }), NOW)
    ).toBeNull();
  });

  it("pediu pra parar: não elegível mesmo com sinal de interesse", () => {
    expect(
      evaluateHotLeadEligibility(
        input({ leadMessageContents: ["Qual o horário?", "Na verdade pare de mandar mensagem"] }),
        NOW
      )
    ).toBeNull();
  });

  it("sem nenhum sinal de interesse: não elegível", () => {
    expect(evaluateHotLeadEligibility(input({ leadMessageContents: ["Oi, tudo bem?"] }), NOW)).toBeNull();
  });

  it("sinal de preço/endereço: categoria preco_endereco", () => {
    expect(evaluateHotLeadEligibility(input({ leadMessageContents: ["Qual o valor?"] }), NOW)).toEqual({
      category: "preco_endereco",
    });
  });
});

describe("buildHotLeadCardCandidates", () => {
  it("ordena horário antes de preço/endereço quando entraram na janela ao mesmo tempo", () => {
    const lastMsg = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000);
    const conversations = [
      input({ conversationId: "conv-preco", leadId: "lead-preco", lastLeadMessageAt: lastMsg, leadMessageContents: ["Qual o valor?"] }),
      input({ conversationId: "conv-horario", leadId: "lead-horario", lastLeadMessageAt: lastMsg, leadMessageContents: ["Que horário?"] }),
    ];

    const cards = buildHotLeadCardCandidates(conversations, NOW);

    expect(cards.map((c) => c.category)).toEqual(["horario", "preco_endereco"]);
  });

  it("não elegíveis não entram na lista", () => {
    const cards = buildHotLeadCardCandidates([input({ everScheduled: true })], NOW);
    expect(cards).toEqual([]);
  });
});

describe("buildHotLeadCardReason", () => {
  it('"Perguntou sobre horário · há 6 dias"', () => {
    const lastMsg = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
    expect(buildHotLeadCardReason("horario", lastMsg, NOW)).toBe("Perguntou sobre horário · há 6 dias");
  });

  it('"Perguntou preço/endereço · há 6 dias"', () => {
    const lastMsg = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
    expect(buildHotLeadCardReason("preco_endereco", lastMsg, NOW)).toBe("Perguntou preço/endereço · há 6 dias");
  });
});

describe("isHotLeadDailyLimitReached", () => {
  it("abaixo do limite: false", () => {
    expect(isHotLeadDailyLimitReached(3, 5)).toBe(false);
  });

  it("no limite: true", () => {
    expect(isHotLeadDailyLimitReached(5, 5)).toBe(true);
  });

  it("acima do limite: true", () => {
    expect(isHotLeadDailyLimitReached(6, 5)).toBe(true);
  });
});

describe("DEFAULT_HOT_LEAD_MESSAGES", () => {
  it("5 textos, nenhum com variável quebrada", () => {
    expect(DEFAULT_HOT_LEAD_MESSAGES).toHaveLength(5);
    for (const msg of DEFAULT_HOT_LEAD_MESSAGES) {
      expect(msg).not.toMatch(/\{\{/);
    }
  });
});
