import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildNoShowCardCandidates,
  chooseNoShowStep,
  resolveNoShowCardMessageTemplate,
  buildNoShowCardReason,
  DEFAULT_NO_SHOW_CARD_MESSAGES,
  NO_SHOW_CARD_STEPS,
  type NoShowCandidate,
} from "./no-show-cards";
import { computeReactivationWindow } from "./reactivation";

// Âncora fixa usada nos testes de janela abaixo (segunda-feira) — janelas
// reais (verificadas por script, não de cabeça):
//   D3  [2026-01-08, 2026-01-14]
//   D7  [2026-01-12, 2026-01-16]
//   D15 [2026-01-20, 2026-01-26]
// D3 e D7 se sobrepõem (01-12 a 01-14) — só 4 dias de distância, menor
// que a janela de 5 dias úteis de cada um. D7 e D15 não se sobrepõem (8
// dias de distância).
const TRIGGERED_AT = new Date("2026-01-05T12:00:00.000Z");

function candidate(overrides: Partial<NoShowCandidate> = {}): NoShowCandidate {
  return {
    appointmentId: "appt-1",
    leadId: "lead-1",
    conversationId: "conv-1",
    scheduledAt: new Date("2026-01-01T12:00:00.000Z"),
    noShowTriggeredAt: TRIGGERED_AT,
    existingSteps: [],
    ...overrides,
  };
}

describe("chooseNoShowStep", () => {
  it("D3 isolado (D7 ainda não abriu): escolhe o passo 1", () => {
    const now = new Date("2026-01-08T12:00:00.000Z");
    expect(chooseNoShowStep(TRIGGERED_AT, [], now)?.step).toBe(1);
  });

  it("D7 isolado (D3 já fechou): escolhe o passo 2", () => {
    const now = new Date("2026-01-15T12:00:00.000Z"); // D3 fechou dia 14, D7 ainda aberto
    expect(chooseNoShowStep(TRIGGERED_AT, [], now)?.step).toBe(2);
  });

  it("D15 isolado (D7 já fechou): escolhe o passo 3", () => {
    const now = new Date("2026-01-21T12:00:00.000Z");
    expect(chooseNoShowStep(TRIGGERED_AT, [], now)?.step).toBe(3);
  });

  it("fora de qualquer janela: não escolhe nada", () => {
    const now = new Date("2026-01-17T12:00:00.000Z"); // entre D7 (fecha 01-16) e D15 (abre 01-20)
    expect(chooseNoShowStep(TRIGGERED_AT, [], now)).toBeNull();
  });

  // Verificação pedida (item 3) — D3/D7 só 4 dias um do outro: as janelas
  // se sobrepõem (confirmado numericamente) — sem escolher um só, o lead
  // veria DOIS cards "Faltou" ao mesmo tempo. Mesma solução do "Não
  // agendou" (D2/D4): sempre o mais cedo pendente.
  describe("sobreposição D3/D7 (achado ao trocar a cadência — nunca mostra dois ao mesmo tempo)", () => {
    const now = new Date("2026-01-13T12:00:00.000Z"); // dentro das janelas de D3 E D7 ao mesmo tempo

    it("D3 e D7 ambos abertos, nenhum enviado: escolhe o mais cedo (D3, passo 1)", () => {
      expect(chooseNoShowStep(TRIGGERED_AT, [], now)?.step).toBe(1);
    });

    it("D3 já marcado enviado, D7 aberto e pendente: escolhe D7 (passo 2), não repete o D3", () => {
      const existingSteps = [{ step: 1, sentAt: new Date("2026-01-08T12:00:00.000Z") }];
      expect(chooseNoShowStep(TRIGGERED_AT, existingSteps, now)?.step).toBe(2);
    });

    it("os dois marcados enviados: continua mostrando o mais cedo (D3) com check, até a janela dele fechar", () => {
      const existingSteps = [
        { step: 1, sentAt: new Date("2026-01-08T12:00:00.000Z") },
        { step: 2, sentAt: new Date("2026-01-12T12:00:00.000Z") },
      ];
      expect(chooseNoShowStep(TRIGGERED_AT, existingSteps, now)?.step).toBe(1);
    });
  });
});

describe("buildNoShowCardCandidates", () => {
  it("gera um card no D3, dentro da janela de 5 dias úteis a partir de triggeredAt + 3 dias", () => {
    const window3 = computeReactivationWindow(TRIGGERED_AT, 3);
    const now = window3.start;

    const cards = buildNoShowCardCandidates([candidate()], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(1);
  });

  it("gera um card no D7, independente do D3 quando o D3 já fechou", () => {
    const now = new Date("2026-01-15T12:00:00.000Z");

    const cards = buildNoShowCardCandidates([candidate()], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(2);
  });

  it("gera um card no D15, independente dos outros dois", () => {
    const window15 = computeReactivationWindow(TRIGGERED_AT, 15);
    const now = window15.start;

    const cards = buildNoShowCardCandidates([candidate()], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(3);
  });

  it("fora de qualquer janela: nenhum card", () => {
    const now = new Date("2026-01-06T12:00:00.000Z"); // 1 dia depois, antes do D3 abrir
    expect(buildNoShowCardCandidates([candidate()], now)).toEqual([]);
  });

  it("devolve no máximo um candidato por agendamento, mesmo com D3/D7 sobrepostos", () => {
    const now = new Date("2026-01-13T12:00:00.000Z");
    const cards = buildNoShowCardCandidates([candidate()], now);
    expect(cards).toHaveLength(1);
  });

  it("os três passos fixos são 3, 7 e 15 dias (era 3, 10 e 30 — pedido explícito, reaproveitando os mesmos passos/step)", () => {
    expect(NO_SHOW_CARD_STEPS).toEqual([
      { step: 1, offsetDays: 3 },
      { step: 2, offsetDays: 7 },
      { step: 3, offsetDays: 15 },
    ]);
  });
});

describe("resolveNoShowCardMessageTemplate", () => {
  it("usa o texto customizado do passo 1 (D3) quando configurado", () => {
    expect(resolveNoShowCardMessageTemplate(1, { day3Content: "Texto customizado D3" })).toBe("Texto customizado D3");
  });

  it("usa o texto customizado do passo 2 (D7, coluna day10Content reaproveitada) quando configurado", () => {
    expect(resolveNoShowCardMessageTemplate(2, { day10Content: "Texto customizado D7" })).toBe("Texto customizado D7");
  });

  it("usa o texto customizado do passo 3 (D15, coluna day30Content reaproveitada) quando configurado", () => {
    expect(resolveNoShowCardMessageTemplate(3, { day30Content: "Texto customizado D15" })).toBe("Texto customizado D15");
  });

  it("sem customização, cai pro texto padrão de cada passo", () => {
    expect(resolveNoShowCardMessageTemplate(1, {})).toBe(DEFAULT_NO_SHOW_CARD_MESSAGES[0]);
    expect(resolveNoShowCardMessageTemplate(2, {})).toBe(DEFAULT_NO_SHOW_CARD_MESSAGES[1]);
    expect(resolveNoShowCardMessageTemplate(3, {})).toBe(DEFAULT_NO_SHOW_CARD_MESSAGES[2]);
  });

  it('texto padrão do passo 3 (D15) não cita o nome da Dra. — "a nossa agenda" (sem variável de nome disponível)', () => {
    expect(DEFAULT_NO_SHOW_CARD_MESSAGES[2]).toBe(
      "Oi, {{primeiro_nome}}. Passando para avisar que a nossa agenda segue com horários abertos. Quando fizer sentido, é só me chamar por aqui."
    );
  });
});

describe("buildNoShowCardReason", () => {
  it('"Faltou há 3 dias · mensagem 1 de 3"', () => {
    const triggeredAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-04T12:00:00.000Z");
    expect(buildNoShowCardReason(triggeredAt, now, 1)).toBe("Faltou há 3 dias · mensagem 1 de 3");
  });

  it('1 dia: singular ("1 dia", não "1 dias")', () => {
    const triggeredAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-02T12:00:00.000Z");
    expect(buildNoShowCardReason(triggeredAt, now, 2)).toBe("Faltou há 1 dia · mensagem 2 de 3");
  });

  it("mensagem 3 de 3 (D15)", () => {
    const triggeredAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-16T12:00:00.000Z");
    expect(buildNoShowCardReason(triggeredAt, now, 3)).toBe("Faltou há 15 dias · mensagem 3 de 3");
  });
});

// getNoShowCards — elegibilidade não depende de FollowUpLog.respondedAt
// (que a sequência automática usa pra outro fim, ver follow-up.ts) —
// depende de o agendamento NO_SHOW ainda ser o MAIS RECENTE do lead e da
// conversa não estar LOST. Uma resposta do lead, sozinha, não derruba
// nenhuma dessas duas condições.
const appointmentFindManyMock = vi.fn();
const appointmentCountMock = vi.fn();
const noShowCardSettingsFindUniqueMock = vi.fn();
const leadFindManyMock = vi.fn();
const instagramAccountFindUniqueMock = vi.fn();
const reactivationConfigFindUniqueMock = vi.fn();
const reactivationCardSlotCountMock = vi.fn();
const noShowCardSlotCountMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findMany: (...args: unknown[]) => appointmentFindManyMock(...args),
      count: (...args: unknown[]) => appointmentCountMock(...args),
    },
    noShowCardSettings: { findUnique: (...args: unknown[]) => noShowCardSettingsFindUniqueMock(...args) },
    lead: { findMany: (...args: unknown[]) => leadFindManyMock(...args) },
    instagramAccount: { findUnique: (...args: unknown[]) => instagramAccountFindUniqueMock(...args) },
    noShowCardSlot: { count: (...args: unknown[]) => noShowCardSlotCountMock(...args) },
    reactivationConfig: { findUnique: (...args: unknown[]) => reactivationConfigFindUniqueMock(...args) },
    reactivationCardSlot: { count: (...args: unknown[]) => reactivationCardSlotCountMock(...args) },
  },
}));

const ensureLeadFirstNameFromInstagramMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  ensureLeadFirstNameFromInstagram: (...args: unknown[]) => ensureLeadFirstNameFromInstagramMock(...args),
}));

import { getNoShowCards } from "./no-show-cards";

function apptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    leadId: "lead-1",
    conversationId: "conv-1",
    scheduledAt: new Date("2026-01-01T12:00:00.000Z"),
    status: "NO_SHOW",
    noShowCardSlots: [],
    conversation: { status: "FOLLOW_UP", followUps: [{ triggeredAt: TRIGGERED_AT }] },
    ...overrides,
  };
}

describe("getNoShowCards", () => {
  beforeEach(() => {
    appointmentFindManyMock.mockReset();
    appointmentCountMock.mockReset();
    noShowCardSettingsFindUniqueMock.mockReset();
    leadFindManyMock.mockReset();
    instagramAccountFindUniqueMock.mockReset();
    reactivationConfigFindUniqueMock.mockReset();
    reactivationCardSlotCountMock.mockReset();
    noShowCardSlotCountMock.mockReset();
    ensureLeadFirstNameFromInstagramMock.mockReset();
    noShowCardSettingsFindUniqueMock.mockResolvedValue(null);
    instagramAccountFindUniqueMock.mockResolvedValue(null);
    reactivationConfigFindUniqueMock.mockResolvedValue(null);
    reactivationCardSlotCountMock.mockResolvedValue(0);
    noShowCardSlotCountMock.mockResolvedValue(0);
    leadFindManyMock.mockResolvedValue([{ id: "lead-1", name: "Beatriz", igUsername: "bea.ig", igScopedId: null, nameLookupAttempted: true, profilePictureUrl: null, phone: "+5511999999999" }]);
  });

  it("lead que só respondeu (sem remarcar): continua elegível — card não some", async () => {
    const now = computeReactivationWindow(TRIGGERED_AT, 3).start;
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt: TRIGGERED_AT }] } })]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards).toHaveLength(1);
  });

  it("lead remarcou (novo Appointment mais recente que o NO_SHOW): card some", async () => {
    const now = computeReactivationWindow(TRIGGERED_AT, 3).start;
    appointmentFindManyMock.mockResolvedValue([
      apptRow({ id: "appt-1", scheduledAt: new Date("2026-01-01T12:00:00.000Z"), status: "NO_SHOW", conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt: TRIGGERED_AT }] } }),
      apptRow({ id: "appt-2", scheduledAt: new Date("2026-01-20T12:00:00.000Z"), status: "SCHEDULED", conversation: { status: "IN_CONVERSATION", followUps: [] } }),
    ]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards).toEqual([]);
  });

  it("conversa marcada como perdida (LOST): card some", async () => {
    const now = computeReactivationWindow(TRIGGERED_AT, 3).start;
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "LOST", followUps: [{ triggeredAt: TRIGGERED_AT }] } })]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards).toEqual([]);
  });

  // Item 2 (rodada atual, substitui a decisão da rodada anterior) — D15
  // (passo 3) é SEMPRE Instagram, manual, nunca WhatsApp — mesmo com o
  // lead tendo telefone cadastrado.
  it("passo 3 (D15): canal sempre INSTAGRAM, mesmo com telefone cadastrado", async () => {
    const now = computeReactivationWindow(TRIGGERED_AT, 15).start;
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt: TRIGGERED_AT }] } })]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(3);
    expect(cards[0]!.channel).toBe("INSTAGRAM");
    expect(cards[0]!.whatsappLink).toBeNull();
  });

  it("passo 1 (D3): canal WhatsApp quando o lead tem telefone (comportamento de antes, intocado)", async () => {
    const now = computeReactivationWindow(TRIGGERED_AT, 3).start;
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt: TRIGGERED_AT }] } })]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards[0]!.channel).toBe("WHATSAPP");
  });

  it("passo 2 (D7): canal WhatsApp quando o lead tem telefone, Instagram sem telefone (mesmo fallback do D3)", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt: TRIGGERED_AT }] } })]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards[0]!.step).toBe(2);
    expect(cards[0]!.channel).toBe("WHATSAPP");

    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Beatriz", igUsername: "bea.ig", igScopedId: null, nameLookupAttempted: true, profilePictureUrl: null, phone: null },
    ]);
    const cardsNoPhone = await getNoShowCards("clinic-1", now);
    expect(cardsNoPhone[0]!.channel).toBe("INSTAGRAM");
  });

  // Item 3 (rodada atual) — D3/D7 sobrepostos: só UM card aparece.
  it("D3 e D7 ambos dentro da janela pro mesmo agendamento: só UM card aparece (o mais cedo, D3)", async () => {
    const now = new Date("2026-01-13T12:00:00.000Z");
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt: TRIGGERED_AT }] } })]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(1);
  });

  it("D3 já enviado (slot gravado), D7 também dentro da janela: mostra o D7, não repete o D3", async () => {
    const now = new Date("2026-01-13T12:00:00.000Z");
    appointmentFindManyMock.mockResolvedValue([
      apptRow({
        noShowCardSlots: [{ step: 1, sentAt: new Date("2026-01-08T12:00:00.000Z") }],
        conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt: TRIGGERED_AT }] },
      }),
    ]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(2);
  });

  it("card já marcado enviado: sentAt vem do slot já gravado (sem consulta extra)", async () => {
    const now = computeReactivationWindow(TRIGGERED_AT, 3).start;
    const sentAt = new Date(now.getTime() - 1000);
    appointmentFindManyMock.mockResolvedValue([
      apptRow({ noShowCardSlots: [{ step: 1, sentAt }], conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt: TRIGGERED_AT }] } }),
    ]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards[0]!.sentAt).toEqual(sentAt);
  });
});
