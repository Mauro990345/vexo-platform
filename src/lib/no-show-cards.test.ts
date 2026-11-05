import { describe, it, expect, vi, beforeEach } from "vitest";
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

  // Item 1 (rodada atual) — novo 3º passo, D30.
  it("gera um card no D30, independente dos outros dois", () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z");
    const window30 = computeReactivationWindow(triggeredAt, 30);
    const now = window30.start;

    const cards = buildNoShowCardCandidates([candidate({ noShowTriggeredAt: triggeredAt })], now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(3);
  });

  it("fora das três janelas: nenhum card", () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z");
    const now = new Date("2026-01-06T12:00:00.000Z"); // 1 dia depois, antes do D3 abrir
    expect(buildNoShowCardCandidates([candidate({ noShowTriggeredAt: triggeredAt })], now)).toEqual([]);
  });

  it("os três passos fixos são 3, 10 e 30 dias", () => {
    expect(NO_SHOW_CARD_STEPS).toEqual([
      { step: 1, offsetDays: 3 },
      { step: 2, offsetDays: 10 },
      { step: 3, offsetDays: 30 },
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

  it("usa o texto customizado do D30 quando configurado (item 1, rodada atual)", () => {
    expect(resolveNoShowCardMessageTemplate(3, { day30Content: "Texto customizado D30" })).toBe("Texto customizado D30");
  });

  it("sem customização, cai pro texto padrão de cada passo", () => {
    expect(resolveNoShowCardMessageTemplate(1, {})).toBe(DEFAULT_NO_SHOW_CARD_MESSAGES[0]);
    expect(resolveNoShowCardMessageTemplate(2, {})).toBe(DEFAULT_NO_SHOW_CARD_MESSAGES[1]);
    expect(resolveNoShowCardMessageTemplate(3, {})).toBe(DEFAULT_NO_SHOW_CARD_MESSAGES[2]);
  });

  it('texto padrão do D30 não cita o nome da Dra. — "a nossa agenda" (sem variável de nome disponível)', () => {
    expect(DEFAULT_NO_SHOW_CARD_MESSAGES[2]).toBe(
      "Oi, {{primeiro_nome}}. Passando para avisar que a nossa agenda segue com horários abertos. Quando fizer sentido, é só me chamar por aqui."
    );
  });
});

describe("buildNoShowCardReason", () => {
  it('"Faltou há 3 dias · mensagem 1 de 3" (3 passos agora, após o D30)', () => {
    const triggeredAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-04T12:00:00.000Z");
    expect(buildNoShowCardReason(triggeredAt, now, 1)).toBe("Faltou há 3 dias · mensagem 1 de 3");
  });

  it('1 dia: singular ("1 dia", não "1 dias")', () => {
    const triggeredAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-02T12:00:00.000Z");
    expect(buildNoShowCardReason(triggeredAt, now, 2)).toBe("Faltou há 1 dia · mensagem 2 de 3");
  });

  it("mensagem 3 de 3 (D30)", () => {
    const triggeredAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-31T12:00:00.000Z");
    expect(buildNoShowCardReason(triggeredAt, now, 3)).toBe("Faltou há 30 dias · mensagem 3 de 3");
  });
});

// getNoShowCards — item 4 (rodada atual): elegibilidade não depende mais
// de FollowUpLog.respondedAt (que a sequência automática usa pra outro
// fim, ver follow-up.ts) — depende de o agendamento NO_SHOW ainda ser o
// MAIS RECENTE do lead (nenhuma remarcação/novo agendamento desde a
// falta) e da conversa não estar LOST. Uma resposta do lead, sozinha, não
// derruba nenhuma dessas duas condições.
const appointmentFindManyMock = vi.fn();
const appointmentCountMock = vi.fn();
const noShowCardSettingsFindUniqueMock = vi.fn();
const leadFindManyMock = vi.fn();
const instagramAccountFindUniqueMock = vi.fn();
const noShowCardSlotFindManyMock = vi.fn();
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
    noShowCardSlot: {
      findMany: (...args: unknown[]) => noShowCardSlotFindManyMock(...args),
      count: (...args: unknown[]) => noShowCardSlotCountMock(...args),
    },
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
    conversation: { status: "FOLLOW_UP", followUps: [{ triggeredAt: new Date("2026-01-05T12:00:00.000Z") }] },
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
    noShowCardSlotFindManyMock.mockReset();
    reactivationConfigFindUniqueMock.mockReset();
    reactivationCardSlotCountMock.mockReset();
    noShowCardSlotCountMock.mockReset();
    ensureLeadFirstNameFromInstagramMock.mockReset();
    noShowCardSettingsFindUniqueMock.mockResolvedValue(null);
    instagramAccountFindUniqueMock.mockResolvedValue(null);
    noShowCardSlotFindManyMock.mockResolvedValue([]);
    reactivationConfigFindUniqueMock.mockResolvedValue(null);
    reactivationCardSlotCountMock.mockResolvedValue(0);
    noShowCardSlotCountMock.mockResolvedValue(0);
    leadFindManyMock.mockResolvedValue([{ id: "lead-1", name: "Beatriz", igUsername: "bea.ig", igScopedId: null, nameLookupAttempted: true, profilePictureUrl: null, phone: "+5511999999999" }]);
  });

  it("lead que só respondeu (sem remarcar): continua elegível — card não some (item 4)", async () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(triggeredAt, 3).start;
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt }] } })]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards).toHaveLength(1);
  });

  it("lead remarcou (novo Appointment mais recente que o NO_SHOW): card some", async () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(triggeredAt, 3).start;
    appointmentFindManyMock.mockResolvedValue([
      apptRow({ id: "appt-1", scheduledAt: new Date("2026-01-01T12:00:00.000Z"), status: "NO_SHOW", conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt }] } }),
      apptRow({ id: "appt-2", scheduledAt: new Date("2026-01-20T12:00:00.000Z"), status: "SCHEDULED", conversation: { status: "IN_CONVERSATION", followUps: [] } }),
    ]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards).toEqual([]);
  });

  it("conversa marcada como perdida (LOST): card some", async () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(triggeredAt, 3).start;
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "LOST", followUps: [{ triggeredAt }] } })]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards).toEqual([]);
  });

  // Item 2 (rodada atual) — D30 passa a usar o MESMO critério de canal
  // dos outros dois passos (WhatsApp se o lead tiver telefone, Instagram
  // como fallback). Tinha sido forçado só-Instagram numa rodada anterior
  // (pedido explícito daquela vez, sem motivo técnico); revertido agora
  // (pedido explícito desta rodada).
  it("passo 3 (D30): canal WhatsApp quando o lead tem telefone, igual aos passos 1 e 2", async () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(triggeredAt, 30).start;
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt }] } })]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(3);
    expect(cards[0]!.channel).toBe("WHATSAPP");
    expect(cards[0]!.whatsappLink).not.toBeNull();
  });

  it("passo 3 (D30): canal Instagram quando o lead NÃO tem telefone (mesmo fallback dos outros passos)", async () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(triggeredAt, 30).start;
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt }] } })]);
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Beatriz", igUsername: "bea.ig", igScopedId: null, nameLookupAttempted: true, profilePictureUrl: null, phone: null },
    ]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards[0]!.channel).toBe("INSTAGRAM");
    expect(cards[0]!.whatsappLink).toBeNull();
  });

  it("passo 1 (D3): canal WhatsApp quando o lead tem telefone (comportamento de antes, intocado)", async () => {
    const triggeredAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(triggeredAt, 3).start;
    appointmentFindManyMock.mockResolvedValue([apptRow({ conversation: { status: "IN_CONVERSATION", followUps: [{ triggeredAt }] } })]);

    const cards = await getNoShowCards("clinic-1", now);
    expect(cards[0]!.channel).toBe("WHATSAPP");
  });
});
