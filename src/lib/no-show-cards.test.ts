import { describe, it, expect } from "vitest";
import {
  buildNoShowCardCandidates,
  resolveNoShowCardMessageTemplate,
  buildNoShowCardReason,
  DEFAULT_NO_SHOW_CARD_MESSAGES,
  NO_SHOW_CARD_STEPS,
  type NoShowCandidate,
} from "./no-show-cards";
import { computeReactivationWindow } from "./reactivation";

function candidate(overrides: Partial<NoShowCandidate> = {}): NoShowCandidate {
  return {
    appointmentId: "appt-1",
    leadId: "lead-1",
    conversationId: "conv-1",
    scheduledAt: new Date("2026-01-01T12:00:00.000Z"),
    noShowTriggeredAt: new Date("2026-01-05T12:00:00.000Z"),
    ...overrides,
  };
}

describe("buildNoShowCardCandidates", () => {
  it("gera um card no D3, dentro da janela de 5 dias úteis a partir de triggeredAt + 3 dias", () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z"); // segunda
    const window3 = computeReactivationWindow(triggeredAt, 3);
    const now = window3.start;

    const cards = buildNoShowCardCandidates([candidate({ noShowTriggeredAt: triggeredAt })], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(1);
  });

  it("gera um card no D10, independente do D3 (janelas em momentos diferentes)", () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z");
    const window10 = computeReactivationWindow(triggeredAt, 10);
    const now = window10.start;

    const cards = buildNoShowCardCandidates([candidate({ noShowTriggeredAt: triggeredAt })], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(2);
  });

  it("fora das duas janelas: nenhum card", () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z");
    const now = new Date("2026-01-06T12:00:00.000Z"); // 1 dia depois, antes do D3 abrir
    expect(buildNoShowCardCandidates([candidate({ noShowTriggeredAt: triggeredAt })], now)).toEqual([]);
  });

  it("os dois passos fixos são 3 e 10 dias", () => {
    expect(NO_SHOW_CARD_STEPS).toEqual([
      { step: 1, offsetDays: 3 },
      { step: 2, offsetDays: 10 },
    ]);
  });
});

describe("resolveNoShowCardMessageTemplate", () => {
  it("usa o texto customizado do D3 quando configurado", () => {
    expect(resolveNoShowCardMessageTemplate(1, { day3Content: "Texto customizado D3" })).toBe("Texto customizado D3");
  });

  it("usa o texto customizado do D10 quando configurado", () => {
    expect(resolveNoShowCardMessageTemplate(2, { day10Content: "Texto customizado D10" })).toBe("Texto customizado D10");
  });

  it("sem customização, cai pro texto padrão de cada passo", () => {
    expect(resolveNoShowCardMessageTemplate(1, {})).toBe(DEFAULT_NO_SHOW_CARD_MESSAGES[0]);
    expect(resolveNoShowCardMessageTemplate(2, {})).toBe(DEFAULT_NO_SHOW_CARD_MESSAGES[1]);
  });
});

describe("buildNoShowCardReason", () => {
  it('"Faltou há 3 dias · mensagem 1 de 2" (exemplo do pedido)', () => {
    const triggeredAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-04T12:00:00.000Z");
    expect(buildNoShowCardReason(triggeredAt, now, 1)).toBe("Faltou há 3 dias · mensagem 1 de 2");
  });

  it('1 dia: singular ("1 dia", não "1 dias")', () => {
    const triggeredAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-02T12:00:00.000Z");
    expect(buildNoShowCardReason(triggeredAt, now, 2)).toBe("Faltou há 1 dia · mensagem 2 de 2");
  });
});
