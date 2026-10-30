import { describe, it, expect, vi, beforeEach } from "vitest";

const reactivationConfigFindUniqueMock = vi.fn();
const appointmentFindManyMock = vi.fn();
const reactivationCardSlotFindManyMock = vi.fn();
const reactivationCardSlotUpsertMock = vi.fn();
const reactivationCardSlotFindUniqueMock = vi.fn();
const reactivationCardSlotUpdateManyMock = vi.fn();
const reactivationCardSlotUpdateMock = vi.fn();
const reactivationCardSlotCountMock = vi.fn();
const reactivationCardSlotFindFirstMock = vi.fn();
const noShowCardSlotCountMock = vi.fn();
const noShowCardSlotFindFirstMock = vi.fn();
const reactivationConfigUpsertMock = vi.fn();
const leadFindManyMock = vi.fn();
const instagramAccountFindUniqueMock = vi.fn();
const reactivationShowcaseBackupFindManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    reactivationConfig: {
      findUnique: (...args: unknown[]) => reactivationConfigFindUniqueMock(...args),
      upsert: (...args: unknown[]) => reactivationConfigUpsertMock(...args),
    },
    appointment: { findMany: (...args: unknown[]) => appointmentFindManyMock(...args) },
    reactivationCardSlot: {
      findMany: (...args: unknown[]) => reactivationCardSlotFindManyMock(...args),
      upsert: (...args: unknown[]) => reactivationCardSlotUpsertMock(...args),
      findUnique: (...args: unknown[]) => reactivationCardSlotFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => reactivationCardSlotUpdateManyMock(...args),
      update: (...args: unknown[]) => reactivationCardSlotUpdateMock(...args),
      count: (...args: unknown[]) => reactivationCardSlotCountMock(...args),
      findFirst: (...args: unknown[]) => reactivationCardSlotFindFirstMock(...args),
    },
    noShowCardSlot: {
      count: (...args: unknown[]) => noShowCardSlotCountMock(...args),
      findFirst: (...args: unknown[]) => noShowCardSlotFindFirstMock(...args),
    },
    lead: { findMany: (...args: unknown[]) => leadFindManyMock(...args) },
    instagramAccount: { findUnique: (...args: unknown[]) => instagramAccountFindUniqueMock(...args) },
    // Cards "fixos" da Clínica Demo VEXO (getPinnedReactivationCandidates,
    // reactivation.ts) — vazio por padrão em todo teste (beforeEach abaixo),
    // só preenchido nos testes da própria describe("cards fixos...").
    reactivationShowcaseBackup: { findMany: (...args: unknown[]) => reactivationShowcaseBackupFindManyMock(...args) },
  },
}));

// {{primeiro_nome}}/{{data_horario}} na Reativação (ver renderMessageTemplate,
// message-template.ts) — ensureLeadFirstNameFromInstagram (busca+cache do
// nome) é mockada aqui, não a real: a implementação de verdade (Prisma
// lead.update + chamada à Graph API) já tem seus próprios testes em
// instagram.test.ts; aqui só importa COMO getReactivationCards/
// sendReactivationWhatsAppMessage usam o resultado dela.
const ensureLeadFirstNameFromInstagramMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  ensureLeadFirstNameFromInstagram: (...args: unknown[]) => ensureLeadFirstNameFromInstagramMock(...args),
}));

// Partial mock (importOriginal) — normalizeBrazilianWhatsappNumber/
// validateBrazilianPhone continuam com a implementação REAL (usadas pelos
// testes de buildReactivationWhatsAppLink mais abaixo, e pelos testes de
// sendReactivationWhatsAppMessage, que precisam da validação de telefone
// de verdade pra testar o caso "telefone inválido" de forma realista); só
// sendWhatsappMessage (a chamada de rede de verdade, Evolution API) é
// mockada.
const sendWhatsappMessageMock = vi.fn();
vi.mock("@/lib/whatsapp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp")>();
  return { ...actual, sendWhatsappMessage: (...args: unknown[]) => sendWhatsappMessageMock(...args) };
});

import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";
import {
  computeReactivationWindow,
  isWithinReactivationWindow,
  computeCalendarDayWindow,
  computeReturnContactWindow,
  selectReactivationCandidates,
  resolveAppointmentReturnPeriods,
  buildReactivationCardCandidates,
  assignReactivationCardSlots,
  cardSlotKey,
  resolveAvailableReactivationSlots,
  assignNextReactivationSlot,
  resolveReactivationMessageText,
  buildReactivationWhatsAppLink,
  buildInstagramDmLink,
  buildInstagramProfileLink,
  resolveInstagramDmLink,
  INSTAGRAM_DM_LINK_MAX_LENGTH,
  reactivationChannelForLead,
  DEFAULT_REACTIVATION_MESSAGES,
  RETURN_PERIOD_OPTIONS,
  DEFAULT_AVAILABLE_RETURN_PERIODS,
  DEFAULT_RETURN_PERIODS,
  DEFAULT_DAILY_WHATSAPP_LIMIT,
  isValidReturnPeriodDays,
  toggleReactivationSentAt,
  getReactivationCards,
  sortReactivationCardsForDisplay,
  countPendingReactivationCards,
  isReactivationWhatsAppRateLimited,
  isDailyWhatsappLimitReached,
  sendReactivationWhatsAppMessage,
  REACTIVATION_WHATSAPP_MIN_INTERVAL_MS,
  type ReactivationSourceAppointment,
  type ReactivationCandidate,
} from "./reactivation";

function appt(overrides: Partial<ReactivationSourceAppointment> = {}): ReactivationSourceAppointment {
  return {
    id: "appt-1",
    leadId: "lead-1",
    conversationId: "conv-1",
    scheduledAt: new Date("2026-05-20T12:00:00.000Z"),
    status: "SCHEDULED",
    returnPeriodDays: null,
    returnPeriodNone: false,
    ...overrides,
  };
}

describe("computeReactivationWindow / isWithinReactivationWindow — janela de 5 dias úteis (Faltou, no-show-cards.ts)", () => {
  it("completou numa segunda: janela segunda a sexta da mesma semana (sem fim de semana no meio)", () => {
    // 2026-10-19 é segunda-feira
    const window = computeReactivationWindow(new Date("2026-07-22T12:00:00.000Z"), 89); // 2026-07-22 + 89d = 2026-10-19 (segunda)
    expect(window.start.toISOString().slice(0, 10)).toBe("2026-10-19");
    expect(window.end.toISOString().slice(0, 10)).toBe("2026-10-23"); // sexta da mesma semana
  });

  it("completou numa quarta: janela atravessa o fim de semana (quarta a sexta + segunda/terça seguintes)", () => {
    // 2026-10-21 é quarta-feira
    const window = computeReactivationWindow(new Date("2026-07-22T12:00:00.000Z"), 91); // + 91d = 2026-10-21 (quarta)
    expect(window.start.toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(window.end.toISOString().slice(0, 10)).toBe("2026-10-27"); // terça da semana seguinte, pulando sáb/dom
  });

  it("completou num sábado: a janela só começa a contar na segunda seguinte", () => {
    // 2026-10-24 é sábado
    const window = computeReactivationWindow(new Date("2026-07-22T12:00:00.000Z"), 94); // + 94d = 2026-10-24 (sábado)
    expect(window.start.toISOString().slice(0, 10)).toBe("2026-10-26"); // segunda seguinte
    expect(window.end.toISOString().slice(0, 10)).toBe("2026-10-30"); // sexta da mesma semana
  });

  it("isWithinReactivationWindow: true dentro da janela (incluindo os extremos), false antes e depois", () => {
    const window = { start: new Date("2026-10-19T03:00:00.000Z"), end: new Date("2026-10-23T03:00:00.000Z") };
    expect(isWithinReactivationWindow(window, new Date("2026-10-19T15:00:00.000Z"))).toBe(true);
    expect(isWithinReactivationWindow(window, new Date("2026-10-23T23:00:00.000Z"))).toBe(true);
    expect(isWithinReactivationWindow(window, new Date("2026-10-18T15:00:00.000Z"))).toBe(false);
    expect(isWithinReactivationWindow(window, new Date("2026-10-24T15:00:00.000Z"))).toBe(false);
  });
});

describe("computeCalendarDayWindow / computeReturnContactWindow — janela em dias corridos do botão Retorno", () => {
  it("computeCalendarDayWindow: ancora em anchor+offsetDays, visível de offsetDays-beforeDays até offsetDays+afterDays", () => {
    const anchor = new Date("2026-01-01T12:00:00.000Z");
    const window = computeCalendarDayWindow(anchor, 10, 3, 3);
    expect(window.start.toISOString().slice(0, 10)).toBe("2026-01-08"); // dia 10 - 3
    expect(window.end.toISOString().slice(0, 10)).toBe("2026-01-14"); // dia 10 + 3
  });

  it("computeReturnContactWindow: data de contato = atendimento + prazo, visível 3 dias antes e 3 depois", () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window = computeReturnContactWindow(scheduledAt, 30);
    // 2026-01-01 + 30 dias = 2026-01-31
    expect(window.start.toISOString().slice(0, 10)).toBe("2026-01-28");
    expect(window.end.toISOString().slice(0, 10)).toBe("2026-02-03");
  });

  it("3 dias antes da data de contato: já dentro da janela", () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window = computeReturnContactWindow(scheduledAt, 30);
    expect(isWithinReactivationWindow(window, window.start)).toBe(true);
  });

  it("3 dias depois da data de contato: ainda dentro da janela; no 4º dia, já fora", () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window = computeReturnContactWindow(scheduledAt, 30);
    expect(isWithinReactivationWindow(window, window.end)).toBe(true);
    const oneDayAfterEnd = new Date(window.end.getTime() + 24 * 60 * 60 * 1000);
    expect(isWithinReactivationWindow(window, oneDayAfterEnd)).toBe(false);
  });

  it("4 dias antes da data de contato (antes do começo da janela): ainda fora", () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window = computeReturnContactWindow(scheduledAt, 30);
    const oneDayBeforeStart = new Date(window.start.getTime() - 24 * 60 * 60 * 1000);
    expect(isWithinReactivationWindow(window, oneDayBeforeStart)).toBe(false);
  });
});

describe("prazos de retorno — RETURN_PERIOD_OPTIONS / isValidReturnPeriodDays", () => {
  it("9 prazos fixos, de 30 a 270", () => {
    expect(RETURN_PERIOD_OPTIONS).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270]);
  });

  it("defaults do schema batem com as constantes exportadas", () => {
    expect(DEFAULT_AVAILABLE_RETURN_PERIODS).toEqual([...RETURN_PERIOD_OPTIONS]);
    expect(DEFAULT_RETURN_PERIODS).toEqual([30, 60]);
    expect(DEFAULT_DAILY_WHATSAPP_LIMIT).toBe(15);
  });

  it("isValidReturnPeriodDays: aceita todos os valores da lista", () => {
    for (const days of RETURN_PERIOD_OPTIONS) {
      expect(isValidReturnPeriodDays(days)).toBe(true);
    }
  });

  it("isValidReturnPeriodDays: rejeita valor fora da lista", () => {
    expect(isValidReturnPeriodDays(45)).toBe(false);
    expect(isValidReturnPeriodDays(0)).toBe(false);
    expect(isValidReturnPeriodDays(-30)).toBe(false);
    expect(isValidReturnPeriodDays(300)).toBe(false);
  });
});

describe("reactivationChannelForLead — sempre WhatsApp quando há telefone, Instagram como fallback", () => {
  it("com telefone: WHATSAPP", () => {
    expect(reactivationChannelForLead("11987654321")).toBe("WHATSAPP");
  });

  it("sem telefone: INSTAGRAM", () => {
    expect(reactivationChannelForLead(null)).toBe("INSTAGRAM");
  });
});

describe("selectReactivationCandidates", () => {
  it("agendamento da IA sem agendamento posterior nem marcação é candidato", () => {
    const candidates = selectReactivationCandidates([appt()]);
    expect(candidates).toEqual([
      { appointmentId: "appt-1", leadId: "lead-1", scheduledAt: appt().scheduledAt, returnPeriodDays: null, returnPeriodNone: false },
    ]);
  });

  it("exclui quem voltou — lead com agendamento posterior não vira candidato (o mais recente é o que conta)", () => {
    const older = appt({ id: "appt-old", scheduledAt: new Date("2026-05-01T12:00:00.000Z") });
    const newer = appt({ id: "appt-new", scheduledAt: new Date("2026-09-01T12:00:00.000Z") });
    const candidates = selectReactivationCandidates([older, newer]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.appointmentId).toBe("appt-new");
  });

  it("exclui quem faltou — se o agendamento mais recente do lead foi marcado Não compareceu, não gera candidato", () => {
    const candidates = selectReactivationCandidates([appt({ status: "NO_SHOW" })]);
    expect(candidates).toEqual([]);
  });

  it("não recua pro agendamento anterior quando o mais recente é NO_SHOW", () => {
    const attended = appt({ id: "appt-attended", scheduledAt: new Date("2026-05-01T12:00:00.000Z"), status: "SCHEDULED" });
    const noShow = appt({ id: "appt-no-show", scheduledAt: new Date("2026-09-01T12:00:00.000Z"), status: "NO_SHOW" });
    const candidates = selectReactivationCandidates([attended, noShow]);
    expect(candidates).toEqual([]);
  });

  it("exclui agendamento sem lead vinculado (importado do Google Calendar)", () => {
    const candidates = selectReactivationCandidates([appt({ leadId: null, conversationId: null })]);
    expect(candidates).toEqual([]);
  });

  it("exclui agendamento cancelado no Google Calendar", () => {
    const candidates = selectReactivationCandidates([appt({ status: "CANCELLED" })]);
    expect(candidates).toEqual([]);
  });

  it("carrega returnPeriodDays/returnPeriodNone do agendamento pro candidato", () => {
    const candidates = selectReactivationCandidates([appt({ returnPeriodDays: 120 })]);
    expect(candidates[0]!.returnPeriodDays).toBe(120);
  });
});

describe("resolveAppointmentReturnPeriods — qual prazo (ou prazos) gera card pra um agendamento", () => {
  it('"Sem retorno" marcado: nenhum prazo, mesmo com padrões da clínica configurados', () => {
    expect(resolveAppointmentReturnPeriods({ returnPeriodDays: null, returnPeriodNone: true }, [30, 60])).toEqual([]);
  });

  it("prazo manual marcado: só esse, ignora os padrões da clínica", () => {
    expect(resolveAppointmentReturnPeriods({ returnPeriodDays: 120, returnPeriodNone: false }, [30, 60])).toEqual([120]);
  });

  it("nada marcado: usa os padrões da clínica (pode ser mais de um)", () => {
    expect(resolveAppointmentReturnPeriods({ returnPeriodDays: null, returnPeriodNone: false }, [30, 60])).toEqual([30, 60]);
  });

  it("nada marcado e clínica sem nenhum padrão: nenhum prazo", () => {
    expect(resolveAppointmentReturnPeriods({ returnPeriodDays: null, returnPeriodNone: false }, [])).toEqual([]);
  });
});

describe("buildReactivationCardCandidates — manual vs. padrão da clínica", () => {
  function candidate(overrides: Partial<ReactivationCandidate> = {}): ReactivationCandidate {
    return {
      appointmentId: "appt-1",
      leadId: "lead-1",
      scheduledAt: new Date("2026-01-01T12:00:00.000Z"),
      returnPeriodDays: null,
      returnPeriodNone: false,
      ...overrides,
    };
  }

  it("nenhum padrão da clínica e nada marcado = nenhum card", () => {
    const now = new Date("2027-01-01T12:00:00.000Z");
    const cards = buildReactivationCardCandidates([candidate()], [], now);
    expect(cards).toEqual([]);
  });

  it('"Sem retorno" marcado: nenhum card, mesmo dentro da janela que os padrões gerariam', () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window30 = computeReturnContactWindow(scheduledAt, 30);
    const cards = buildReactivationCardCandidates([candidate({ scheduledAt, returnPeriodNone: true })], [30, 60], window30.start);
    expect(cards).toEqual([]);
  });

  it("prazo manual marcado: só um card, no prazo marcado — ignora os padrões", () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window120 = computeReturnContactWindow(scheduledAt, 120);
    const cards = buildReactivationCardCandidates([candidate({ scheduledAt, returnPeriodDays: 120 })], [30, 60], window120.start);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.thresholdDays).toBe(120);
  });

  it("nada marcado, dois padrões da clínica (30 e 60): gera um card por padrão, em momentos diferentes", () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window30 = computeReturnContactWindow(scheduledAt, 30);
    const window60 = computeReturnContactWindow(scheduledAt, 60);

    const cardsAt30 = buildReactivationCardCandidates([candidate({ scheduledAt })], [30, 60], window30.start);
    const cardsAt60 = buildReactivationCardCandidates([candidate({ scheduledAt })], [30, 60], window60.start);

    expect(cardsAt30.map((c) => c.thresholdDays)).toEqual([30]);
    expect(cardsAt60.map((c) => c.thresholdDays)).toEqual([60]);
  });

  it("janela do prazo marcado já passou: nenhum card gerado (nunca retroage)", () => {
    const scheduledAt = new Date("2020-01-01T12:00:00.000Z"); // muitíssimo tempo atrás
    const now = new Date("2026-01-01T12:00:00.000Z");
    const cards = buildReactivationCardCandidates([candidate({ scheduledAt, returnPeriodDays: 30 })], [], now);
    expect(cards).toEqual([]);
  });

  it("ordena globalmente por quem entrou na janela primeiro", () => {
    const scheduledAtA = new Date("2026-01-01T12:00:00.000Z");
    const scheduledAtB = new Date("2026-01-10T12:00:00.000Z");
    // B (agendado depois) com prazo de 30 dias completa ANTES de A (agendado
    // antes) com prazo de 60 dias — a ordem global precisa respeitar isso.
    const windowB30 = computeReturnContactWindow(scheduledAtB, 30);

    const cards = buildReactivationCardCandidates(
      [
        candidate({ appointmentId: "appt-a", scheduledAt: scheduledAtA, returnPeriodDays: 60 }),
        candidate({ appointmentId: "appt-b", scheduledAt: scheduledAtB, returnPeriodDays: 30 }),
      ],
      [],
      windowB30.start
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.appointmentId).toBe("appt-b");
  });

  it("exclusões continuam valendo (vêm de selectReactivationCandidates, aplicadas antes)", () => {
    const appointments: ReactivationSourceAppointment[] = [
      appt({ id: "voltou-antigo", scheduledAt: new Date("2026-01-01T12:00:00.000Z") }),
      appt({ id: "voltou-novo", scheduledAt: new Date("2026-06-01T12:00:00.000Z") }),
    ];
    const candidates = selectReactivationCandidates(appointments);
    const now = computeReturnContactWindow(new Date("2026-06-01T12:00:00.000Z"), 30).start;
    const cards = buildReactivationCardCandidates(candidates, [30], now);
    expect(cards.map((c) => c.appointmentId)).toEqual(["voltou-novo"]);
  });
});

describe("assignReactivationCardSlots — fixa por card E por prazo", () => {
  function cardCandidate(appointmentId: string, thresholdDays: number): ReturnType<typeof buildReactivationCardCandidates>[number] {
    return {
      appointmentId,
      leadId: "lead-1",
      scheduledAt: new Date("2026-01-01T12:00:00.000Z"),
      returnPeriodDays: thresholdDays,
      returnPeriodNone: false,
      thresholdDays,
      window: { start: new Date("2026-04-01T00:00:00.000Z"), end: new Date("2026-04-07T00:00:00.000Z") },
    };
  }

  it("1º card usa a variação 1, 2º usa a 2, em sequência", () => {
    const { cards, finalSequenceCounter } = assignReactivationCardSlots(
      [cardCandidate("appt-1", 90), cardCandidate("appt-2", 90)],
      [1, 2, 3, 4, 5],
      0,
      new Map()
    );
    expect(cards.map((c) => c.slot)).toEqual([1, 2]);
    expect(finalSequenceCounter).toBe(2);
  });

  it("o mesmo agendamento em dois prazos diferentes recebe slots INDEPENDENTES (chave appointmentId+thresholdDays)", () => {
    const { cards } = assignReactivationCardSlots([cardCandidate("appt-1", 30), cardCandidate("appt-1", 60)], [1, 2, 3], 0, new Map());
    expect(cards[0]!.slot).toBe(1); // appt-1 + 30 dias
    expect(cards[1]!.slot).toBe(2); // appt-1 + 60 dias — slot DIFERENTE, mesmo agendamento
  });

  it("reusa o slot já existente (persistido) em vez de reatribuir, e não avança o contador por isso", () => {
    const existing = new Map([[cardSlotKey("appt-1", 90), 4]]);
    const { cards, finalSequenceCounter, newlyAssigned } = assignReactivationCardSlots([cardCandidate("appt-1", 90)], [1, 2, 3, 4, 5], 7, existing);
    expect(cards[0]!.slot).toBe(4);
    expect(finalSequenceCounter).toBe(7); // não avançou — nada novo pra atribuir
    expect(newlyAssigned).toEqual([]);
  });

  it("recarregar a página (mesmo existingSlots) devolve exatamente o mesmo slot — fica fixo", () => {
    const first = assignReactivationCardSlots([cardCandidate("appt-1", 90)], [1, 2, 3], 0, new Map());
    const existing = new Map(first.newlyAssigned.map((a) => [cardSlotKey(a.appointmentId, a.thresholdDays), a.slot]));
    const second = assignReactivationCardSlots([cardCandidate("appt-1", 90)], [1, 2, 3], first.finalSequenceCounter, existing);
    expect(second.cards[0]!.slot).toBe(first.cards[0]!.slot);
  });
});

describe("rotação em sequência das mensagens", () => {
  it("resolveAvailableReactivationSlots: usa só os slots com texto configurado", () => {
    expect(resolveAvailableReactivationSlots(["a", null, "c", undefined, ""])).toEqual([1, 3]);
  });

  it("resolveAvailableReactivationSlots: sem nenhuma mensagem configurada, usa os 5 slots default", () => {
    expect(resolveAvailableReactivationSlots([null, null, null, null, null])).toEqual([1, 2, 3, 4, 5]);
  });

  it("resolveAvailableReactivationSlots: uma só configurada, usa só essa", () => {
    expect(resolveAvailableReactivationSlots([null, "única", null, null, null])).toEqual([2]);
  });

  it("assignNextReactivationSlot: 1º card usa a variação 1, 2º usa a 2, e por aí vai", () => {
    const slots = [1, 2, 3, 4, 5];
    let counter = 0;
    const assigned: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { slot, nextSequenceCounter } = assignNextReactivationSlot(slots, counter);
      assigned.push(slot);
      counter = nextSequenceCounter;
    }
    expect(assigned).toEqual([1, 2, 3, 4, 5]);
  });

  it("assignNextReactivationSlot: volta pra variação 1 depois da última", () => {
    const slots = [1, 2, 3];
    const { slot } = assignNextReactivationSlot(slots, 3); // 4º card, 3 slots -> volta pra 1
    expect(slot).toBe(1);
  });

  it("assignNextReactivationSlot: a mesma variação nunca se repete em dois cards seguidos (com mais de uma)", () => {
    const slots = [2, 4]; // só duas mensagens configuradas (slots 2 e 4)
    let counter = 10;
    let previous: number | null = null;
    for (let i = 0; i < 6; i++) {
      const { slot, nextSequenceCounter } = assignNextReactivationSlot(slots, counter);
      if (previous !== null) expect(slot).not.toBe(previous);
      previous = slot;
      counter = nextSequenceCounter;
    }
  });

  it("assignNextReactivationSlot: com um só slot disponível, repete (nada mais pra alternar)", () => {
    const slots = [3];
    const first = assignNextReactivationSlot(slots, 0);
    const second = assignNextReactivationSlot(slots, first.nextSequenceCounter);
    expect(first.slot).toBe(3);
    expect(second.slot).toBe(3);
  });

  it("resolveReactivationMessageText: usa o texto customizado do slot quando existe", () => {
    const messages = [null, "Mensagem customizada", null, null, null];
    expect(resolveReactivationMessageText(2, messages, DEFAULT_REACTIVATION_MESSAGES)).toBe("Mensagem customizada");
  });

  it("resolveReactivationMessageText: sem customização nesse slot, cai pro texto padrão (mesmo pro fallback de Instagram)", () => {
    const messages = [null, null, null, null, null];
    expect(resolveReactivationMessageText(3, messages, DEFAULT_REACTIVATION_MESSAGES)).toBe(DEFAULT_REACTIVATION_MESSAGES[2]);
  });

  it("DEFAULT_REACTIVATION_MESSAGES: 5 textos, nenhum citando serviço/procedimento, sem variável de nome", () => {
    expect(DEFAULT_REACTIVATION_MESSAGES).toHaveLength(5);
    for (const msg of DEFAULT_REACTIVATION_MESSAGES) {
      expect(msg).not.toMatch(/\{\{/);
    }
  });
});

describe("Instagram — links e botão desativado sem @", () => {
  it("buildInstagramDmLink: sem mensagem, gera o link simples ig.me/m/<@>", () => {
    expect(buildInstagramDmLink("fulano.silva")).toBe("https://ig.me/m/fulano.silva");
  });

  it("buildInstagramProfileLink: mesmo formato do perfil público usado em NeedsHumanBanner", () => {
    expect(buildInstagramProfileLink("fulano.silva")).toBe("https://www.instagram.com/fulano.silva/");
  });

  it("resolveInstagramDmLink: devolve o link simples quando há @, sem mensagem", () => {
    expect(resolveInstagramDmLink("fulano.silva")).toBe("https://ig.me/m/fulano.silva");
  });

  it("resolveInstagramDmLink: null sem @ — é o que deixa o botão Instagram desativado", () => {
    expect(resolveInstagramDmLink(null)).toBeNull();
  });

  // Pedido explícito (item 1): pré-preencher o campo da conversa via
  // ?text= (parâmetro NÃO documentado pela Meta — por isso a cópia pra
  // área de transferência, ver InstagramDmButton.tsx, continua sempre
  // acontecendo também, nunca só o link).
  describe("buildInstagramDmLink com mensagem — ?text= codificado", () => {
    it("mensagem simples: ?text=<mensagem codificada com encodeURIComponent>", () => {
      const link = buildInstagramDmLink("fulano.silva", "Oi! Tudo bem?");
      expect(link).toBe(`https://ig.me/m/fulano.silva?text=${encodeURIComponent("Oi! Tudo bem?")}`);
    });

    it("acentos: codificados corretamente, decodificam de volta pro texto original", () => {
      const message = "Oi! Como você está desde o atendimento na clínica?";
      const link = buildInstagramDmLink("fulano.silva", message);
      const textParam = new URL(link).searchParams.get("text");
      expect(textParam).toBe(message);
    });

    it("quebras de linha: preservadas (decodifica de volta igual)", () => {
      const message = "Oi!\nTudo bem?\n\nPassando só pra saber como você está.";
      const link = buildInstagramDmLink("fulano.silva", message);
      const textParam = new URL(link).searchParams.get("text");
      expect(textParam).toBe(message);
    });

    it("emoji: preservado (decodifica de volta igual, inclusive par substituto UTF-16)", () => {
      const message = "Oi! 💙 Como você está?";
      const link = buildInstagramDmLink("fulano.silva", message);
      const textParam = new URL(link).searchParams.get("text");
      expect(textParam).toBe(message);
    });

    it('aspas (simples e duplas): preservadas, nunca quebram a URL', () => {
      const message = `Oi! A "promoção" de hoje é essa: não deixe pra amanhã.`;
      const link = buildInstagramDmLink("fulano.silva", message);
      expect(() => new URL(link)).not.toThrow();
      const textParam = new URL(link).searchParams.get("text");
      expect(textParam).toBe(message);
    });

    it("mensagem vazia: tratada como ausente, link simples sem ?text=", () => {
      expect(buildInstagramDmLink("fulano.silva", "")).toBe("https://ig.me/m/fulano.silva");
    });

    it("resolveInstagramDmLink repassa a mensagem pra buildInstagramDmLink", () => {
      const link = resolveInstagramDmLink("fulano.silva", "Oi!");
      expect(link).toBe(`https://ig.me/m/fulano.silva?text=${encodeURIComponent("Oi!")}`);
    });
  });

  // Pedido explícito (item 3): link muito longo cai pro fallback sem
  // ?text= — só a cópia pra área de transferência resolve esse caso.
  describe("buildInstagramDmLink — fallback quando a URL fica longa demais", () => {
    it("mensagem curta: fica dentro do limite, mantém ?text=", () => {
      const link = buildInstagramDmLink("fulano.silva", "Oi! Tudo bem?");
      expect(link).toContain("?text=");
      expect(link.length).toBeLessThanOrEqual(INSTAGRAM_DM_LINK_MAX_LENGTH);
    });

    it("mensagem longa o bastante pra ultrapassar o teto: cai pro link SEM ?text=", () => {
      // Repetição simples, bem acima do teto mesmo depois de codificada.
      const longMessage = "Oi! Como você está desde o seu atendimento? ".repeat(80);
      const withoutText = buildInstagramDmLink("fulano.silva", longMessage);
      expect(withoutText).toBe("https://ig.me/m/fulano.silva");
      expect(withoutText).not.toContain("?text=");
      // Confirma que a mensagem realmente excederia o teto se tivesse ido
      // pro link — não é só "qualquer mensagem longa cai no fallback".
      const wouldBeLink = `https://ig.me/m/fulano.silva?text=${encodeURIComponent(longMessage)}`;
      expect(wouldBeLink.length).toBeGreaterThan(INSTAGRAM_DM_LINK_MAX_LENGTH);
    });

    it("exatamente no limite: mantém ?text= (limite é inclusivo)", () => {
      // Monta uma mensagem cujo link com ?text= fica EXATAMENTE no teto.
      const base = "https://ig.me/m/fulano.silva?text=";
      const budget = INSTAGRAM_DM_LINK_MAX_LENGTH - base.length;
      const message = "a".repeat(budget); // 'a' não precisa de encoding, 1 char = 1 char codificado
      const link = buildInstagramDmLink("fulano.silva", message);
      expect(link.length).toBe(INSTAGRAM_DM_LINK_MAX_LENGTH);
      expect(link).toContain("?text=");
    });

    it("1 caractere acima do limite: cai pro fallback", () => {
      const base = "https://ig.me/m/fulano.silva?text=";
      const budget = INSTAGRAM_DM_LINK_MAX_LENGTH - base.length + 1;
      const message = "a".repeat(budget);
      const link = buildInstagramDmLink("fulano.silva", message);
      expect(link).toBe("https://ig.me/m/fulano.silva");
    });
  });
});

describe("buildReactivationWhatsAppLink", () => {
  it("gera um link wa.me com o telefone normalizado e a mensagem codificada", () => {
    const link = buildReactivationWhatsAppLink("11987654321", "Oi! Como você está?");
    expect(link).toBe("https://wa.me/5511987654321?text=Oi!%20Como%20voc%C3%AA%20est%C3%A1%3F");
  });

  it("telefone já com 55 na frente não duplica o código do país", () => {
    const link = buildReactivationWhatsAppLink("5511987654321", "oi");
    expect(link).toBe("https://wa.me/5511987654321?text=oi");
  });

  it("mensagem com espaços, acentos e emoji sai inteiramente codificada (sem espaço cru/caractere especial)", () => {
    const link = buildReactivationWhatsAppLink("11987654321", "Oi! Tudo bem? 💙");
    const queryText = link.split("?text=")[1]!;
    expect(queryText).not.toMatch(/[ áéíóúãõ💙]/);
    expect(decodeURIComponent(queryText)).toBe("Oi! Tudo bem? 💙");
  });
});

// Clique no botão de ação (WhatsApp/Instagram) marca o card como enviado;
// clicar de novo (no "✓") desfaz — mesma semântica de toggle já usada por
// setAppointmentAttendance (appointments.ts).
describe("toggleReactivationSentAt", () => {
  const now = new Date("2026-05-20T12:00:00.000Z");

  it("pendente (null) -> marca com a data/hora do clique", () => {
    expect(toggleReactivationSentAt(null, now)).toBe(now);
  });

  it("já enviado -> desfaz (volta a null)", () => {
    const sentAt = new Date("2026-05-10T09:00:00.000Z");
    expect(toggleReactivationSentAt(sentAt, now)).toBeNull();
  });
});

describe("isDailyWhatsappLimitReached", () => {
  it("abaixo do limite: não atingido", () => {
    expect(isDailyWhatsappLimitReached(5, 15)).toBe(false);
  });

  it("exatamente no limite: atingido", () => {
    expect(isDailyWhatsappLimitReached(15, 15)).toBe(true);
  });

  it("acima do limite: atingido", () => {
    expect(isDailyWhatsappLimitReached(20, 15)).toBe(true);
  });
});

describe("getReactivationCards — sentAt, janela e limite diário", () => {
  beforeEach(() => {
    reactivationConfigFindUniqueMock.mockReset();
    appointmentFindManyMock.mockReset();
    reactivationCardSlotFindManyMock.mockReset();
    reactivationCardSlotUpsertMock.mockReset();
    reactivationConfigUpsertMock.mockReset();
    reactivationCardSlotCountMock.mockReset();
    noShowCardSlotCountMock.mockReset();
    leadFindManyMock.mockReset();
    instagramAccountFindUniqueMock.mockReset();
    ensureLeadFirstNameFromInstagramMock.mockReset();
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Fulana", igUsername: "fulana.ig", igScopedId: "ig-1", nameLookupAttempted: true, profilePictureUrl: null, phone: "11987654321" },
    ]);
    // Sem conta do Instagram conectada, por padrão — cai pro nome já em
    // cache (lead.name), sem tentar nenhuma busca viva. Testes que querem
    // exercitar a busca viva configuram isto explicitamente.
    instagramAccountFindUniqueMock.mockResolvedValue(null);
    reactivationCardSlotCountMock.mockResolvedValue(0);
    noShowCardSlotCountMock.mockResolvedValue(0);
  });

  it('um card já marcado "enviado" continua desaparecendo sozinho quando a janela vence — sentAt nunca estende nem protege a elegibilidade', async () => {
    // Mesmo atendimento, DOIS prazos padrão (30 e 90 dias) — a essa
    // altura (`now`), o prazo de 30 dias já venceu há muito, o de 90 dias
    // ainda está na janela. Os DOIS já têm ReactivationCardSlot com sentAt
    // preenchido (ambos "enviados" em algum momento) — só o de 90 dias
    // deve aparecer.
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReturnContactWindow(scheduledAt, 90);
    const now = window90.start;

    reactivationConfigFindUniqueMock.mockResolvedValue({ defaultPeriods: [30, 90], dailyWhatsappLimit: 15 });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: null, returnPeriodNone: false },
    ]);
    const sentAt30 = new Date("2026-01-10T12:00:00.000Z");
    const sentAt90 = new Date(now.getTime() - 1000);
    reactivationCardSlotFindManyMock.mockResolvedValue([
      { appointmentId: "appt-1", thresholdDays: 30, slot: 1, sentAt: sentAt30 },
      { appointmentId: "appt-1", thresholdDays: 90, slot: 1, sentAt: sentAt90 },
    ]);

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.thresholdDays).toBe(90);
    expect(cards[0]!.sentAt).toEqual(sentAt90);
    expect(reactivationCardSlotUpsertMock).not.toHaveBeenCalled();
  });

  it("card dentro da janela, nunca marcado (sem linha de slot ainda): sentAt sai null (pendente)", async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReturnContactWindow(scheduledAt, 90);
    const now = window90.start;

    reactivationConfigFindUniqueMock.mockResolvedValue({ defaultPeriods: [90], dailyWhatsappLimit: 15 });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: null, returnPeriodNone: false },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.sentAt).toBeNull();
  });

  it("prazo manual marcado (120 dias): gera card só nesse prazo, mesmo com padrões diferentes configurados", async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window120 = computeReturnContactWindow(scheduledAt, 120);
    const now = window120.start;

    reactivationConfigFindUniqueMock.mockResolvedValue({ defaultPeriods: [30, 60], dailyWhatsappLimit: 15 });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: 120, returnPeriodNone: false },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.thresholdDays).toBe(120);
  });

  it('"Sem retorno" marcado: nenhum card, mesmo dentro da janela que os padrões gerariam', async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window30 = computeReturnContactWindow(scheduledAt, 30);
    const now = window30.start;

    reactivationConfigFindUniqueMock.mockResolvedValue({ defaultPeriods: [30, 60], dailyWhatsappLimit: 15 });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: null, returnPeriodNone: true },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards).toEqual([]);
  });

  it("sem telefone cadastrado: canal INSTAGRAM, sem link de WhatsApp", async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReturnContactWindow(scheduledAt, 90);
    const now = window90.start;

    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Fulana", igUsername: "fulana.ig", igScopedId: "ig-1", nameLookupAttempted: true, profilePictureUrl: null, phone: null },
    ]);
    reactivationConfigFindUniqueMock.mockResolvedValue({ defaultPeriods: [90], dailyWhatsappLimit: 15 });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: null, returnPeriodNone: false },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards[0]!.channel).toBe("INSTAGRAM");
    expect(cards[0]!.whatsappLink).toBeNull();
    // Pedido explícito (item 1, rodada seguinte): instagramDmLink agora
    // carrega ?text=<mensagem> pra pré-preencher o campo — ver
    // describe("buildInstagramDmLink com mensagem...") pros testes
    // focados nisso; aqui só confirma que getReactivationCards repassa a
    // mensagem do card pra resolveInstagramDmLink.
    expect(cards[0]!.instagramDmLink).toBe(`https://ig.me/m/fulana.ig?text=${encodeURIComponent(cards[0]!.message)}`);
  });

  it("limite diário de WhatsApp atingido: card de canal WHATSAPP ainda pendente sai com dailyLimitReached", async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReturnContactWindow(scheduledAt, 90);
    const now = window90.start;

    reactivationConfigFindUniqueMock.mockResolvedValue({ defaultPeriods: [90], dailyWhatsappLimit: 15 });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: null, returnPeriodNone: false },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});
    reactivationCardSlotCountMock.mockResolvedValue(10);
    noShowCardSlotCountMock.mockResolvedValue(5); // 10 + 5 = 15, limite batido

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards[0]!.dailyLimitReached).toBe(true);
  });

  it("limite diário NÃO atingido: dailyLimitReached false", async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReturnContactWindow(scheduledAt, 90);
    const now = window90.start;

    reactivationConfigFindUniqueMock.mockResolvedValue({ defaultPeriods: [90], dailyWhatsappLimit: 15 });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: null, returnPeriodNone: false },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});
    reactivationCardSlotCountMock.mockResolvedValue(3);
    noShowCardSlotCountMock.mockResolvedValue(2);

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards[0]!.dailyLimitReached).toBe(false);
  });

  it("card já enviado não fica dailyLimitReached mesmo com o limite batido (continua clicável pra desfazer)", async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReturnContactWindow(scheduledAt, 90);
    const now = window90.start;

    reactivationConfigFindUniqueMock.mockResolvedValue({ defaultPeriods: [90], dailyWhatsappLimit: 15 });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: null, returnPeriodNone: false },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([{ appointmentId: "appt-1", thresholdDays: 90, slot: 1, sentAt: new Date(now.getTime() - 1000) }]);
    reactivationCardSlotCountMock.mockResolvedValue(15);
    noShowCardSlotCountMock.mockResolvedValue(0);

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards[0]!.sentAt).not.toBeNull();
    expect(cards[0]!.dailyLimitReached).toBe(false);
  });

  // Bug real reportado: mensagem de Reativação chegava com "{{primeiro_nome}}"
  // literal no WhatsApp — a Reativação nunca substituía variável nenhuma.
  it("mensagem customizada com {{primeiro_nome}}/{{data_horario}}: renderiza com o nome em cache e a data do agendamento", async () => {
    const scheduledAt = new Date("2026-01-01T15:00:00.000Z"); // quinta-feira, 12h em São Paulo (UTC-3)
    const window90 = computeReturnContactWindow(scheduledAt, 90);
    const now = window90.start;

    reactivationConfigFindUniqueMock.mockResolvedValue({
      defaultPeriods: [90],
      dailyWhatsappLimit: 15,
      message1: "Oi, {{primeiro_nome}}! Faz tempo desde {{data_horario}}.",
    });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: null, returnPeriodNone: false },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards[0]!.message).toBe("Oi, Fulana! Faz tempo desde quinta-feira (01/01) às 12h.");
    expect(cards[0]!.message).not.toMatch(/\{\{/);
  });

  it("clínica com conta do Instagram conectada: busca o nome ao vivo (ensureLeadFirstNameFromInstagram) em vez de confiar só no cache", async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReturnContactWindow(scheduledAt, 90);
    const now = window90.start;

    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: null, igUsername: null, igScopedId: "ig-1", nameLookupAttempted: false, profilePictureUrl: null, phone: "11987654321" },
    ]);
    instagramAccountFindUniqueMock.mockResolvedValue({ accessTokenEnc: "enc-token" });
    ensureLeadFirstNameFromInstagramMock.mockResolvedValue("João Pedro");
    reactivationConfigFindUniqueMock.mockResolvedValue({ defaultPeriods: [90], dailyWhatsappLimit: 15, message1: "Oi, {{primeiro_nome}}!" });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: null, returnPeriodNone: false },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});

    const cards = await getReactivationCards("clinic-1", now);

    expect(ensureLeadFirstNameFromInstagramMock).toHaveBeenCalledWith(expect.objectContaining({ id: "lead-1" }), "enc-token");
    expect(cards[0]!.message).toBe("Oi, João!");
  });
});

// Cards "fixos" da Clínica Demo VEXO (pedido explícito — usados em vídeos
// e treinamentos, precisam ficar sempre visíveis e funcionando de
// verdade). Marca reaproveitada de ReactivationShowcaseBackup (nenhuma
// migration nova) — ver getPinnedReactivationCandidates, reactivation.ts.
describe("getReactivationCards — cards fixos da Clínica Demo VEXO", () => {
  beforeEach(() => {
    reactivationConfigFindUniqueMock.mockReset();
    appointmentFindManyMock.mockReset();
    reactivationCardSlotFindManyMock.mockReset();
    reactivationCardSlotUpsertMock.mockReset();
    reactivationConfigUpsertMock.mockReset();
    reactivationCardSlotCountMock.mockReset();
    noShowCardSlotCountMock.mockReset();
    leadFindManyMock.mockReset();
    instagramAccountFindUniqueMock.mockReset();
    ensureLeadFirstNameFromInstagramMock.mockReset();
    reactivationShowcaseBackupFindManyMock.mockReset();
    instagramAccountFindUniqueMock.mockResolvedValue(null);
    reactivationCardSlotCountMock.mockResolvedValue(0);
    noShowCardSlotCountMock.mockResolvedValue(0);
    reactivationConfigFindUniqueMock.mockResolvedValue({ defaultPeriods: [30, 60], dailyWhatsappLimit: 15 });
  });

  // Item 3 (pedido explícito): "adicione teste que comprove" que a marca
  // de fixo é ignorada em qualquer clínica que não a Demo — mesmo que,
  // hipoteticamente, existisse uma linha em ReactivationShowcaseBackup
  // pra ela (nunca deveria acontecer, mas o código não deve CONFIAR
  // nisso — ver checagem explícita de clinicId em
  // getPinnedReactivationCandidates).
  it("clínica QUALQUER (não a Demo): ReactivationShowcaseBackup nem é consultada, mesmo que exista linha nela", async () => {
    const scheduledAt = new Date("2020-01-01T12:00:00.000Z"); // MUITO fora de qualquer janela
    const now = new Date("2026-06-01T12:00:00.000Z");

    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-fora-da-janela", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "CANCELLED", returnPeriodDays: 30, returnPeriodNone: false },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    leadFindManyMock.mockResolvedValue([]);
    // Mesmo que, por engano, houvesse uma linha pra "clinic-1" aqui, a
    // função nem deveria chegar a chamar findMany — ver asserção abaixo.
    reactivationShowcaseBackupFindManyMock.mockResolvedValue([{ appointmentId: "appt-fora-da-janela" }]);

    const cards = await getReactivationCards("clinic-1", now);

    expect(reactivationShowcaseBackupFindManyMock).not.toHaveBeenCalled();
    // CANCELLED + fora da janela, sem a marca de fixo valendo pra esta
    // clínica: nenhum card — comportamento normal, intocado.
    expect(cards).toEqual([]);
  });

  it("Clínica Demo, sem nenhum backup (nenhum card marcado como fixo ainda): comportamento 100% normal", async () => {
    reactivationShowcaseBackupFindManyMock.mockResolvedValue([]);
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window30 = computeReturnContactWindow(scheduledAt, 30);
    const now = window30.start;

    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED", returnPeriodDays: 30, returnPeriodNone: false },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Fulana", igUsername: "fulana.ig", igScopedId: "ig-1", nameLookupAttempted: true, profilePictureUrl: null, phone: "11987654321" },
    ]);

    const cards = await getReactivationCards(DEMO_CLINIC_ID, now);

    expect(cards).toHaveLength(1);
  });

  it("card fixo FORA da janela de ±3 dias (scheduledAt bem antigo): aparece mesmo assim", async () => {
    reactivationShowcaseBackupFindManyMock.mockResolvedValue([{ appointmentId: "appt-fixo" }]);
    const now = new Date("2026-06-01T12:00:00.000Z");
    const scheduledAtAntigo = new Date("2020-01-01T12:00:00.000Z"); // prazo de 30 dias venceu há anos

    appointmentFindManyMock
      // 1ª chamada: getPinnedReactivationCandidates (releitura direta por id)
      .mockResolvedValueOnce([{ id: "appt-fixo", leadId: "lead-1", scheduledAt: scheduledAtAntigo, returnPeriodDays: 30, returnPeriodNone: false }])
      // 2ª chamada: appointments normais da clínica (nenhum aqui — só o fixo existe)
      .mockResolvedValueOnce([]);
    reactivationCardSlotFindManyMock.mockResolvedValue([{ appointmentId: "appt-fixo", thresholdDays: 30, slot: 1, sentAt: null }]);
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Paciente Fixo", igUsername: "paciente.fixo", igScopedId: "ig-1", nameLookupAttempted: true, profilePictureUrl: null, phone: "11987654321" },
    ]);

    const cards = await getReactivationCards(DEMO_CLINIC_ID, now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.appointmentId).toBe("appt-fixo");
    expect(cards[0]!.thresholdDays).toBe(30);
  });

  it('card fixo CANCELLED: aparece mesmo assim (status nunca é checado pro caminho fixo)', async () => {
    reactivationShowcaseBackupFindManyMock.mockResolvedValue([{ appointmentId: "appt-fixo" }]);
    const now = new Date("2026-06-01T12:00:00.000Z");

    appointmentFindManyMock
      .mockResolvedValueOnce([{ id: "appt-fixo", leadId: "lead-1", scheduledAt: now, returnPeriodDays: 30, returnPeriodNone: false }])
      // normal query já filtra CANCELLED fora da seleção de qualquer forma,
      // mas nem chega a importar: appt-fixo nunca passa por ali.
      .mockResolvedValueOnce([{ id: "appt-fixo", leadId: "lead-1", conversationId: "conv-1", scheduledAt: now, status: "CANCELLED", returnPeriodDays: 30, returnPeriodNone: false }]);
    reactivationCardSlotFindManyMock.mockResolvedValue([{ appointmentId: "appt-fixo", thresholdDays: 30, slot: 1, sentAt: null }]);
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Paciente Fixo", igUsername: "paciente.fixo", igScopedId: "ig-1", nameLookupAttempted: true, profilePictureUrl: null, phone: "11987654321" },
    ]);

    const cards = await getReactivationCards(DEMO_CLINIC_ID, now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.appointmentId).toBe("appt-fixo");
  });

  it("card fixo cujo lead ganhou um agendamento mais novo depois: o fixo continua aparecendo, sem duplicar", async () => {
    reactivationShowcaseBackupFindManyMock.mockResolvedValue([{ appointmentId: "appt-fixo-antigo" }]);
    const now = new Date("2026-06-01T12:00:00.000Z");
    const scheduledAtAntigo = new Date("2025-01-01T12:00:00.000Z");
    const scheduledAtNovo = new Date("2026-05-20T12:00:00.000Z"); // recente, ainda não completou prazo nenhum

    appointmentFindManyMock
      .mockResolvedValueOnce([{ id: "appt-fixo-antigo", leadId: "lead-1", scheduledAt: scheduledAtAntigo, returnPeriodDays: 30, returnPeriodNone: false }])
      .mockResolvedValueOnce([
        { id: "appt-fixo-antigo", leadId: "lead-1", conversationId: "conv-1", scheduledAt: scheduledAtAntigo, status: "SCHEDULED", returnPeriodDays: 30, returnPeriodNone: false },
        { id: "appt-novo", leadId: "lead-1", conversationId: "conv-2", scheduledAt: scheduledAtNovo, status: "SCHEDULED", returnPeriodDays: 30, returnPeriodNone: false },
      ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([{ appointmentId: "appt-fixo-antigo", thresholdDays: 30, slot: 1, sentAt: null }]);
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Paciente Fixo", igUsername: "paciente.fixo", igScopedId: "ig-1", nameLookupAttempted: true, profilePictureUrl: null, phone: "11987654321" },
    ]);

    const cards = await getReactivationCards(DEMO_CLINIC_ID, now);

    // Só o card fixo aparece (appt-novo ainda não completou o prazo de 30
    // dias até `now`, então nem entraria pela via normal de qualquer
    // forma) — o importante aqui é que appt-fixo-antigo NÃO foi excluído
    // por não ser mais "o agendamento mais recente do lead".
    expect(cards).toHaveLength(1);
    expect(cards[0]!.appointmentId).toBe("appt-fixo-antigo");
  });

  it("card fixo reflete sentAt do ReactivationCardSlot já existente — mesmo mecanismo de toggle dos cards reais", async () => {
    reactivationShowcaseBackupFindManyMock.mockResolvedValue([{ appointmentId: "appt-fixo" }]);
    const now = new Date("2026-06-01T12:00:00.000Z");
    const sentAt = new Date("2026-05-01T12:00:00.000Z");

    appointmentFindManyMock
      .mockResolvedValueOnce([{ id: "appt-fixo", leadId: "lead-1", scheduledAt: now, returnPeriodDays: 30, returnPeriodNone: false }])
      .mockResolvedValueOnce([]);
    reactivationCardSlotFindManyMock.mockResolvedValue([{ appointmentId: "appt-fixo", thresholdDays: 30, slot: 1, sentAt }]);
    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: "Paciente Fixo", igUsername: "paciente.fixo", igScopedId: "ig-1", nameLookupAttempted: true, profilePictureUrl: null, phone: "11987654321" },
    ]);

    const cards = await getReactivationCards(DEMO_CLINIC_ID, now);

    expect(cards[0]!.sentAt).toEqual(sentAt);
    // Reusa o slot já existente — nunca cria um novo via upsert.
    expect(reactivationCardSlotUpsertMock).not.toHaveBeenCalled();
  });
});

function card(overrides: Partial<{ appointmentId: string; sentAt: Date | null }> = {}): { appointmentId: string; sentAt: Date | null } {
  return { appointmentId: "appt-x", sentAt: null, ...overrides };
}

describe("sortReactivationCardsForDisplay — pendentes primeiro, enviados no fim", () => {
  it("preserva a ordem relativa de sempre DENTRO de cada grupo (sort estável)", () => {
    const a = card({ appointmentId: "a" });
    const b = card({ appointmentId: "b", sentAt: new Date("2026-05-01T00:00:00Z") });
    const c = card({ appointmentId: "c" });
    const d = card({ appointmentId: "d", sentAt: new Date("2026-05-02T00:00:00Z") });

    const sorted = sortReactivationCardsForDisplay([a, b, c, d]);

    expect(sorted.map((x) => x.appointmentId)).toEqual(["a", "c", "b", "d"]);
  });

  it("não modifica o array original (devolve uma cópia)", () => {
    const original = [card({ appointmentId: "a", sentAt: new Date() }), card({ appointmentId: "b" })];
    const originalOrder = original.map((x) => x.appointmentId);
    sortReactivationCardsForDisplay(original);
    expect(original.map((x) => x.appointmentId)).toEqual(originalOrder);
  });
});

describe("countPendingReactivationCards — título da faixa mostra só os pendentes", () => {
  it("conta só os cards com sentAt null", () => {
    const cards = [card({ sentAt: new Date() }), card(), card(), card({ sentAt: new Date() })];
    expect(countPendingReactivationCards(cards)).toBe(2);
  });

  it("lista vazia: zero pendentes", () => {
    expect(countPendingReactivationCards([])).toBe(0);
  });
});

// Proteção do chip (pedido explícito): ~10s entre envios de WhatsApp da
// MESMA clínica. Pura — quem chama (sendReactivationWhatsAppMessage,
// abaixo) acha o sentAt mais recente só entre slots de lead com telefone.
describe("isReactivationWhatsAppRateLimited", () => {
  it("sem nenhum envio anterior (null): nunca limitado", () => {
    expect(isReactivationWhatsAppRateLimited(null, new Date())).toBe(false);
  });

  it("último envio há menos do que o intervalo mínimo: limitado", () => {
    const lastSent = new Date("2026-05-20T12:00:00.000Z");
    const now = new Date(lastSent.getTime() + REACTIVATION_WHATSAPP_MIN_INTERVAL_MS - 1);
    expect(isReactivationWhatsAppRateLimited(lastSent, now)).toBe(true);
  });

  it("último envio há mais do que o intervalo mínimo: não limitado", () => {
    const lastSent = new Date("2026-05-20T12:00:00.000Z");
    const now = new Date(lastSent.getTime() + REACTIVATION_WHATSAPP_MIN_INTERVAL_MS + 1);
    expect(isReactivationWhatsAppRateLimited(lastSent, now)).toBe(false);
  });
});

describe("sendReactivationWhatsAppMessage — envio direto pelo VEXO", () => {
  function fakeSlot(overrides: Record<string, unknown> = {}) {
    return {
      id: "slot-1",
      appointmentId: "appt-1",
      thresholdDays: 90,
      slot: 2,
      sentAt: null,
      appointment: {
        clinicId: "clinic-1",
        scheduledAt: new Date("2026-01-01T15:00:00.000Z"),
        lead: { id: "lead-1", name: "Fulana", igScopedId: "ig-1", nameLookupAttempted: true, phone: "11987654321" },
        clinic: {
          whatsappInstanceName: "clinic-1-instance",
          reactivationConfig: {
            message1: null,
            message2: "Mensagem customizada da clínica",
            message3: null,
            message4: null,
            message5: null,
          },
        },
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    reactivationCardSlotFindUniqueMock.mockReset();
    reactivationCardSlotFindFirstMock.mockReset();
    noShowCardSlotFindFirstMock.mockReset();
    reactivationCardSlotUpdateManyMock.mockReset();
    reactivationCardSlotUpdateMock.mockReset();
    reactivationCardSlotCountMock.mockReset();
    noShowCardSlotCountMock.mockReset();
    reactivationConfigFindUniqueMock.mockReset();
    sendWhatsappMessageMock.mockReset();
    reactivationCardSlotFindFirstMock.mockResolvedValue(null); // sem envio anterior = sem rate limit, por padrão
    noShowCardSlotFindFirstMock.mockResolvedValue(null);
    reactivationCardSlotUpdateManyMock.mockResolvedValue({ count: 1 }); // claim ganho, por padrão
    reactivationCardSlotCountMock.mockResolvedValue(0); // abaixo do limite diário, por padrão
    noShowCardSlotCountMock.mockResolvedValue(0);
    reactivationConfigFindUniqueMock.mockResolvedValue({ dailyWhatsappLimit: 15 });
  });

  it("sucesso: reserva, manda o texto certo (da config+slot, nunca do cliente) e marca enviado", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(fakeSlot());
    sendWhatsappMessageMock.mockResolvedValue(undefined);

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, new Date());

    expect(result).toEqual({ ok: true, alreadySent: false, clinicId: "clinic-1" });
    expect(reactivationCardSlotUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "slot-1", sentAt: null },
      data: { sentAt: expect.any(Date) },
    });
    // Texto remontado a partir de ReactivationConfig.message2 (slot=2) —
    // é exatamente o que getReactivationCards também usaria pra esse
    // card; nunca um texto vindo de fora.
    expect(sendWhatsappMessageMock).toHaveBeenCalledWith("clinic-1-instance", "5511987654321", "Mensagem customizada da clínica");
    expect(reactivationCardSlotUpdateMock).not.toHaveBeenCalled(); // nenhuma liberação de reserva
  });

  it("falha no envio (Evolution API): libera a reserva (sentAt volta a null), nunca fica marcado", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(fakeSlot());
    sendWhatsappMessageMock.mockRejectedValue(new Error("Evolution API fora do ar"));

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, new Date());

    expect(result).toEqual({ ok: false, reason: "send_failed", clinicId: "clinic-1" });
    expect(reactivationCardSlotUpdateMock).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { sentAt: null } });
  });

  it("card já marcado como enviado: não reenvia (idempotente) — nem chega a checar rate limit/limite diário ou reservar", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(fakeSlot({ sentAt: new Date("2026-05-01T00:00:00Z") }));

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, new Date());

    expect(result).toEqual({ ok: true, alreadySent: true, clinicId: "clinic-1" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
    expect(reactivationCardSlotUpdateManyMock).not.toHaveBeenCalled();
  });

  it("anti duplo clique: perde a corrida do claim atômico (count=0) — trata como já enviado, nunca manda de novo", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(fakeSlot());
    reactivationCardSlotUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, new Date());

    expect(result).toEqual({ ok: true, alreadySent: true, clinicId: "clinic-1" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("intervalo mínimo entre envios da mesma clínica: rejeita sem mandar nada, nem reserva o card", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(fakeSlot());
    const now = new Date("2026-05-20T12:00:30.000Z");
    reactivationCardSlotFindFirstMock.mockResolvedValue({ sentAt: new Date(now.getTime() - 5_000) }); // 5s atrás

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, now);

    expect(result).toEqual({ ok: false, reason: "rate_limited", clinicId: "clinic-1" });
    expect(reactivationCardSlotUpdateManyMock).not.toHaveBeenCalled();
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("limite diário de WhatsApp (Reativação + Faltou) já atingido: rejeita antes de checar rate limit ou reservar", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(fakeSlot());
    reactivationCardSlotCountMock.mockResolvedValue(10);
    noShowCardSlotCountMock.mockResolvedValue(5); // 10 + 5 = 15 = limite

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, new Date());

    expect(result).toEqual({ ok: false, reason: "daily_limit_reached", clinicId: "clinic-1" });
    expect(reactivationCardSlotUpdateManyMock).not.toHaveBeenCalled();
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it('telefone inválido: NÃO manda, libera a reserva, nunca marca como enviado', async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(fakeSlot({ appointment: { ...fakeSlot().appointment, lead: { phone: "123" } } }));

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, new Date());

    expect(result).toEqual({ ok: false, reason: "invalid_phone", clinicId: "clinic-1" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
    expect(reactivationCardSlotUpdateMock).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { sentAt: null } });
  });

  it("lead sem telefone cadastrado: mesmo tratamento de telefone inválido — é o caso que leva ao fallback de Instagram na UI", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(fakeSlot({ appointment: { ...fakeSlot().appointment, lead: null } }));

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, new Date());

    expect(result).toEqual({ ok: false, reason: "invalid_phone", clinicId: "clinic-1" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it('clínica com WhatsApp desconectado (sem instância): fallback — libera a reserva, nunca marca como enviado', async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(
      fakeSlot({ appointment: { ...fakeSlot().appointment, clinic: { ...fakeSlot().appointment.clinic, whatsappInstanceName: null } } })
    );

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, new Date());

    expect(result).toEqual({ ok: false, reason: "disconnected", clinicId: "clinic-1" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
    expect(reactivationCardSlotUpdateMock).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { sentAt: null } });
  });

  it("card inexistente: not_found, sem tocar em nada", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(null);

    const result = await sendReactivationWhatsAppMessage("appt-inexistente", 90, new Date());

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("mensagem customizada com {{primeiro_nome}}/{{data_horario}}: renderiza antes de mandar de verdade", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(
      fakeSlot({
        appointment: {
          ...fakeSlot().appointment,
          clinic: {
            ...fakeSlot().appointment.clinic,
            reactivationConfig: { message1: null, message2: "Oi, {{primeiro_nome}}! Em {{data_horario}}.", message3: null, message4: null, message5: null },
          },
        },
      })
    );
    sendWhatsappMessageMock.mockResolvedValue(undefined);

    await sendReactivationWhatsAppMessage("appt-1", 90, new Date("2026-04-01T12:00:00.000Z"));

    expect(sendWhatsappMessageMock).toHaveBeenCalledWith("clinic-1-instance", "5511987654321", "Oi, Fulana! Em quinta-feira (01/01) às 12h.");
  });
});
