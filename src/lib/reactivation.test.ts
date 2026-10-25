import { describe, it, expect, vi, beforeEach } from "vitest";

const reactivationConfigFindUniqueMock = vi.fn();
const appointmentFindManyMock = vi.fn();
const reactivationCardSlotFindManyMock = vi.fn();
const reactivationCardSlotUpsertMock = vi.fn();
const reactivationCardSlotFindUniqueMock = vi.fn();
const reactivationCardSlotUpdateManyMock = vi.fn();
const reactivationCardSlotUpdateMock = vi.fn();
const reactivationConfigUpsertMock = vi.fn();
const leadFindManyMock = vi.fn();
const instagramAccountFindUniqueMock = vi.fn();
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
    },
    lead: { findMany: (...args: unknown[]) => leadFindManyMock(...args) },
    instagramAccount: { findUnique: (...args: unknown[]) => instagramAccountFindUniqueMock(...args) },
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
// testes de buildReactivationWhatsAppLink já existentes mais abaixo, e
// pelos novos testes de sendReactivationWhatsAppMessage, que precisam da
// validação de telefone de verdade pra testar o caso "telefone inválido"
// de forma realista); só sendWhatsappMessage (a chamada de rede de
// verdade, Evolution API) é mockada.
const sendWhatsappMessageMock = vi.fn();
vi.mock("@/lib/whatsapp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp")>();
  return { ...actual, sendWhatsappMessage: (...args: unknown[]) => sendWhatsappMessageMock(...args) };
});

import {
  computeReactivationWindow,
  isWithinReactivationWindow,
  selectReactivationCandidates,
  buildReactivationCardCandidates,
  assignReactivationCardSlots,
  assignReactivationCardSlotsByChannel,
  cardSlotKey,
  resolveAvailableReactivationSlots,
  assignNextReactivationSlot,
  resolveReactivationMessageText,
  buildReactivationWhatsAppLink,
  buildInstagramDmLink,
  buildInstagramProfileLink,
  resolveInstagramDmLink,
  reactivationChannelForThreshold,
  REACTIVATION_CHANNEL_BY_THRESHOLD,
  DEFAULT_WHATSAPP_REACTIVATION_MESSAGES,
  DEFAULT_INSTAGRAM_REACTIVATION_MESSAGES,
  REACTIVATION_THRESHOLD_OPTIONS,
  TEST_PERIOD_DAYS,
  isValidReactivationThresholdDays,
  toggleReactivationSentAt,
  getReactivationCards,
  sortReactivationCardsForDisplay,
  countPendingReactivationCards,
  isReactivationWhatsAppRateLimited,
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
    ...overrides,
  };
}

describe("computeReactivationWindow / isWithinReactivationWindow — janela de 5 dias úteis", () => {
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

  it("completou num domingo: a janela também só começa a contar na segunda seguinte", () => {
    // 2026-10-25 é domingo
    const window = computeReactivationWindow(new Date("2026-07-22T12:00:00.000Z"), 95); // + 95d = 2026-10-25 (domingo)
    expect(window.start.toISOString().slice(0, 10)).toBe("2026-10-26");
    expect(window.end.toISOString().slice(0, 10)).toBe("2026-10-30");
  });

  it("isWithinReactivationWindow: true dentro da janela (incluindo os extremos), false antes e depois", () => {
    const window = { start: new Date("2026-10-19T03:00:00.000Z"), end: new Date("2026-10-23T03:00:00.000Z") };
    expect(isWithinReactivationWindow(window, new Date("2026-10-19T15:00:00.000Z"))).toBe(true);
    expect(isWithinReactivationWindow(window, new Date("2026-10-23T23:00:00.000Z"))).toBe(true);
    expect(isWithinReactivationWindow(window, new Date("2026-10-18T15:00:00.000Z"))).toBe(false);
    expect(isWithinReactivationWindow(window, new Date("2026-10-24T15:00:00.000Z"))).toBe(false);
  });
});

describe("computeReactivationWindow — os 7 prazos (7/10/30/60/90/120/150 dias)", () => {
  it("todos os 7 prazos existem, na ordem certa, com 7/10/30/60 marcados como teste", () => {
    expect(REACTIVATION_THRESHOLD_OPTIONS).toEqual([7, 10, 30, 60, 90, 120, 150]);
    expect(TEST_PERIOD_DAYS).toEqual([7, 10, 30, 60]);
  });

  it("REACTIVATION_THRESHOLD_OPTIONS sempre inclui todo item de TEST_PERIOD_DAYS — removê-los da constante basta pra tirar o chip e a validação", () => {
    for (const days of TEST_PERIOD_DAYS) {
      expect(REACTIVATION_THRESHOLD_OPTIONS).toContain(days);
    }
  });

  it("isValidReactivationThresholdDays: aceita todos os valores válidos (teste e normais)", () => {
    for (const days of REACTIVATION_THRESHOLD_OPTIONS) {
      expect(isValidReactivationThresholdDays(days)).toBe(true);
    }
  });

  it("isValidReactivationThresholdDays: rejeita valor inválido", () => {
    expect(isValidReactivationThresholdDays(45)).toBe(false);
    expect(isValidReactivationThresholdDays(0)).toBe(false);
    expect(isValidReactivationThresholdDays(-30)).toBe(false);
    expect(isValidReactivationThresholdDays(200)).toBe(false);
  });

  it("cada prazo seguinte gera uma janela mais tarde pro mesmo agendamento", () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const windows = REACTIVATION_THRESHOLD_OPTIONS.map((days) => computeReactivationWindow(scheduledAt, days));
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i]!.start.getTime()).toBeGreaterThan(windows[i - 1]!.start.getTime());
    }
  });
});

describe("selectReactivationCandidates", () => {
  it("agendamento da IA sem agendamento posterior nem marcação é candidato", () => {
    const candidates = selectReactivationCandidates([appt()]);
    expect(candidates).toEqual([{ appointmentId: "appt-1", leadId: "lead-1", scheduledAt: appt().scheduledAt }]);
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
});

describe("buildReactivationCardCandidates — vários períodos marcados", () => {
  function candidate(overrides: Partial<ReactivationCandidate> = {}): ReactivationCandidate {
    return {
      appointmentId: "appt-1",
      leadId: "lead-1",
      scheduledAt: new Date("2026-01-01T12:00:00.000Z"),
      ...overrides,
    };
  }

  it("nenhum período marcado (lista vazia) = Reativação desligada, nenhum card", () => {
    const now = new Date("2027-01-01T12:00:00.000Z"); // bem depois de qualquer prazo, só pra garantir que não é a janela que está zerando
    const cards = buildReactivationCardCandidates([candidate()], [], now);
    expect(cards).toEqual([]);
  });

  it("cada período marcado funciona de forma independente — só entra na faixa quem está dentro da janela DAQUELE período", () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReactivationWindow(scheduledAt, 90);
    const now = window90.start; // dentro da janela de 90 dias, mas bem antes da janela de 150

    const cards = buildReactivationCardCandidates([candidate({ scheduledAt })], [90, 150], now);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.thresholdDays).toBe(90);
  });

  it("o mesmo paciente pode ter dois cards se completar dois períodos marcados em momentos diferentes", () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReactivationWindow(scheduledAt, 90);
    const window150 = computeReactivationWindow(scheduledAt, 150);

    const candidates = [candidate({ scheduledAt })];
    const cardsAt90 = buildReactivationCardCandidates(candidates, [90, 150], window90.start);
    const cardsAt150 = buildReactivationCardCandidates(candidates, [90, 150], window150.start);

    expect(cardsAt90.map((c) => c.thresholdDays)).toEqual([90]);
    expect(cardsAt150.map((c) => c.thresholdDays)).toEqual([150]);
    // As duas janelas nunca se sobrepõem — por isso em cada momento só um
    // dos dois cards (90 ou 150) existe, nunca os dois ao mesmo tempo, mas
    // o MESMO agendamento gera um card em cada momento.
    expect(window90.end.getTime()).toBeLessThan(window150.start.getTime());
  });

  it("ordena globalmente por quem completou primeiro, entre todos os períodos juntos", () => {
    const scheduledAtA = new Date("2026-01-01T12:00:00.000Z");
    const scheduledAtB = new Date("2026-01-10T12:00:00.000Z");
    // B (agendado depois) com prazo de 30 dias completa ANTES de A (agendado
    // antes) com prazo de 150 dias — a ordem global precisa respeitar isso.
    const windowB30 = computeReactivationWindow(scheduledAtB, 30);
    const now = windowB30.start;

    const cards = buildReactivationCardCandidates(
      [candidate({ appointmentId: "appt-a", scheduledAt: scheduledAtA }), candidate({ appointmentId: "appt-b", scheduledAt: scheduledAtB })],
      [30, 150],
      now
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.appointmentId).toBe("appt-b");
    expect(cards[0]!.thresholdDays).toBe(30);
  });

  it("exclusões continuam valendo (vêm de selectReactivationCandidates, aplicadas antes)", () => {
    const appointments: ReactivationSourceAppointment[] = [
      appt({ id: "voltou-antigo", scheduledAt: new Date("2026-01-01T12:00:00.000Z") }),
      appt({ id: "voltou-novo", scheduledAt: new Date("2026-06-01T12:00:00.000Z") }),
    ];
    const candidates = selectReactivationCandidates(appointments);
    const now = computeReactivationWindow(new Date("2026-06-01T12:00:00.000Z"), 30).start;
    const cards = buildReactivationCardCandidates(candidates, [30], now);
    expect(cards.map((c) => c.appointmentId)).toEqual(["voltou-novo"]);
  });
});

describe("assignReactivationCardSlots — fixa por card E por período", () => {
  function cardCandidate(appointmentId: string, thresholdDays: number): ReturnType<typeof buildReactivationCardCandidates>[number] {
    return {
      appointmentId,
      leadId: "lead-1",
      scheduledAt: new Date("2026-01-01T12:00:00.000Z"),
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

  it("o mesmo agendamento em dois períodos diferentes recebe slots INDEPENDENTES (chave appointmentId+thresholdDays)", () => {
    const { cards } = assignReactivationCardSlots(
      [cardCandidate("appt-1", 30), cardCandidate("appt-1", 150)],
      [1, 2, 3],
      0,
      new Map()
    );
    expect(cards[0]!.slot).toBe(1); // appt-1 + 30 dias
    expect(cards[1]!.slot).toBe(2); // appt-1 + 150 dias — slot DIFERENTE, mesmo agendamento
  });

  it("reusa o slot já existente (persistido) em vez de reatribuir, e não avança o contador por isso", () => {
    const existing = new Map([[cardSlotKey("appt-1", 90), 4]]);
    const { cards, finalSequenceCounter, newlyAssigned } = assignReactivationCardSlots(
      [cardCandidate("appt-1", 90)],
      [1, 2, 3, 4, 5],
      7,
      existing
    );
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
    expect(resolveReactivationMessageText(2, messages, DEFAULT_WHATSAPP_REACTIVATION_MESSAGES)).toBe("Mensagem customizada");
  });

  it("resolveReactivationMessageText: sem customização nesse slot, cai pro texto padrão do canal (WhatsApp)", () => {
    const messages = [null, null, null, null, null];
    expect(resolveReactivationMessageText(3, messages, DEFAULT_WHATSAPP_REACTIVATION_MESSAGES)).toBe(
      DEFAULT_WHATSAPP_REACTIVATION_MESSAGES[2]
    );
  });

  it("resolveReactivationMessageText: sem customização nesse slot, cai pro texto padrão do canal (Instagram) — conjunto DIFERENTE do WhatsApp", () => {
    const messages = [null, null, null, null, null];
    const result = resolveReactivationMessageText(3, messages, DEFAULT_INSTAGRAM_REACTIVATION_MESSAGES);
    expect(result).toBe(DEFAULT_INSTAGRAM_REACTIVATION_MESSAGES[2]);
    expect(result).not.toBe(DEFAULT_WHATSAPP_REACTIVATION_MESSAGES[2]);
  });

  it("DEFAULT_WHATSAPP_REACTIVATION_MESSAGES e DEFAULT_INSTAGRAM_REACTIVATION_MESSAGES: 5 textos cada, nenhum citando serviço/procedimento, sem variável de nome", () => {
    for (const set of [DEFAULT_WHATSAPP_REACTIVATION_MESSAGES, DEFAULT_INSTAGRAM_REACTIVATION_MESSAGES]) {
      expect(set).toHaveLength(5);
      for (const msg of set) {
        expect(msg).not.toMatch(/\{\{/);
      }
    }
  });
});

describe("canal por período (Instagram vs. WhatsApp)", () => {
  it("7, 30 e 60 dias são Instagram; 10, 90, 120 e 150 são WhatsApp", () => {
    expect(reactivationChannelForThreshold(7)).toBe("INSTAGRAM");
    expect(reactivationChannelForThreshold(30)).toBe("INSTAGRAM");
    expect(reactivationChannelForThreshold(60)).toBe("INSTAGRAM");
    expect(reactivationChannelForThreshold(10)).toBe("WHATSAPP");
    expect(reactivationChannelForThreshold(90)).toBe("WHATSAPP");
    expect(reactivationChannelForThreshold(120)).toBe("WHATSAPP");
    expect(reactivationChannelForThreshold(150)).toBe("WHATSAPP");
  });

  it("todo período em REACTIVATION_THRESHOLD_OPTIONS tem um canal mapeado em REACTIVATION_CHANNEL_BY_THRESHOLD", () => {
    for (const days of REACTIVATION_THRESHOLD_OPTIONS) {
      expect(["INSTAGRAM", "WHATSAPP"]).toContain(REACTIVATION_CHANNEL_BY_THRESHOLD[days]);
    }
  });
});

describe("assignReactivationCardSlotsByChannel — contador SEPARADO por canal", () => {
  function cardCandidate(appointmentId: string, thresholdDays: number): ReturnType<typeof buildReactivationCardCandidates>[number] {
    return {
      appointmentId,
      leadId: "lead-1",
      scheduledAt: new Date("2026-01-01T12:00:00.000Z"),
      thresholdDays,
      window: { start: new Date("2026-04-01T00:00:00.000Z"), end: new Date("2026-04-07T00:00:00.000Z") },
    };
  }

  it("as mensagens do Instagram rodam entre si e as do WhatsApp entre si — contadores não se misturam", () => {
    // 2 cards de Instagram (7 dias) + 2 cards de WhatsApp (90 dias), nessa
    // ordem — cada canal deveria recomeçar sua própria sequência do zero.
    const { cards, finalCounters } = assignReactivationCardSlotsByChannel(
      [cardCandidate("appt-ig-1", 7), cardCandidate("appt-ig-2", 30), cardCandidate("appt-wa-1", 90), cardCandidate("appt-wa-2", 120)],
      [1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5],
      { whatsapp: 0, instagram: 0 },
      new Map()
    );
    const slotFor = (appointmentId: string) => cards.find((c) => c.appointmentId === appointmentId)!.slot;
    expect(slotFor("appt-ig-1")).toBe(1);
    expect(slotFor("appt-ig-2")).toBe(2);
    expect(slotFor("appt-wa-1")).toBe(1); // recomeça do slot 1 — contador do WhatsApp é outro
    expect(slotFor("appt-wa-2")).toBe(2);
    expect(finalCounters).toEqual({ whatsapp: 2, instagram: 2 });
  });

  it("contador de um canal avançando não afeta o contador do outro", () => {
    const { finalCounters } = assignReactivationCardSlotsByChannel(
      [cardCandidate("appt-ig-1", 7)],
      [1, 2, 3],
      [1, 2, 3],
      { whatsapp: 5, instagram: 0 },
      new Map()
    );
    expect(finalCounters).toEqual({ whatsapp: 5, instagram: 1 }); // whatsapp intocado
  });

  it("devolve os cards na ordem global original (não agrupados por canal)", () => {
    const { cards } = assignReactivationCardSlotsByChannel(
      [cardCandidate("appt-wa-1", 90), cardCandidate("appt-ig-1", 7), cardCandidate("appt-wa-2", 120)],
      [1, 2, 3],
      [1, 2, 3],
      { whatsapp: 0, instagram: 0 },
      new Map()
    );
    expect(cards.map((c) => c.appointmentId)).toEqual(["appt-wa-1", "appt-ig-1", "appt-wa-2"]);
  });
});

describe("Instagram — links e botão desativado sem @", () => {
  it("buildInstagramDmLink: gera o link ig.me/m/<@>", () => {
    expect(buildInstagramDmLink("fulano.silva")).toBe("https://ig.me/m/fulano.silva");
  });

  it("buildInstagramProfileLink: mesmo formato do perfil público usado em NeedsHumanBanner", () => {
    expect(buildInstagramProfileLink("fulano.silva")).toBe("https://www.instagram.com/fulano.silva/");
  });

  it("resolveInstagramDmLink: devolve o link quando há @", () => {
    expect(resolveInstagramDmLink("fulano.silva")).toBe("https://ig.me/m/fulano.silva");
  });

  it("resolveInstagramDmLink: null sem @ — é o que deixa o botão Instagram desativado", () => {
    expect(resolveInstagramDmLink(null)).toBeNull();
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

describe("getReactivationCards — sentAt e janela de 5 dias úteis", () => {
  beforeEach(() => {
    reactivationConfigFindUniqueMock.mockReset();
    appointmentFindManyMock.mockReset();
    reactivationCardSlotFindManyMock.mockReset();
    reactivationCardSlotUpsertMock.mockReset();
    reactivationConfigUpsertMock.mockReset();
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
  });

  it(
    'um card já marcado "enviado" continua desaparecendo sozinho quando a janela de 5 dias úteis vence — ' +
      "sentAt nunca estende nem protege a elegibilidade, exatamente como um card nunca marcado",
    async () => {
      // Mesmo atendimento, DOIS períodos marcados (7 e 90 dias) — a essa
      // altura (`now`), o período de 7 dias já venceu há muito (sua janela
      // de 5 dias úteis é bem mais curta que o intervalo entre os dois
      // thresholds), o de 90 dias ainda está na janela. Os DOIS já têm
      // ReactivationCardSlot com sentAt preenchido (ambos "enviados" em
      // algum momento) — só o de 90 dias deve aparecer.
      const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
      const window90 = computeReactivationWindow(scheduledAt, 90);
      const now = window90.start;

      reactivationConfigFindUniqueMock.mockResolvedValue({ thresholdDaysList: [7, 90] });
      appointmentFindManyMock.mockResolvedValue([
        { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED" },
      ]);
      const sentAt7 = new Date("2026-01-10T12:00:00.000Z");
      const sentAt90 = new Date(now.getTime() - 1000);
      reactivationCardSlotFindManyMock.mockResolvedValue([
        { appointmentId: "appt-1", thresholdDays: 7, slot: 1, sentAt: sentAt7 },
        { appointmentId: "appt-1", thresholdDays: 90, slot: 1, sentAt: sentAt90 },
      ]);

      const cards = await getReactivationCards("clinic-1", now);

      expect(cards).toHaveLength(1);
      expect(cards[0]!.thresholdDays).toBe(90);
      expect(cards[0]!.sentAt).toEqual(sentAt90);
      // Nenhum slot novo precisou ser criado (os dois já existiam) — prova
      // de que este teste não depende de upsert nenhum pra valer.
      expect(reactivationCardSlotUpsertMock).not.toHaveBeenCalled();
    }
  );

  it("card dentro da janela, nunca marcado (sem linha de slot ainda): sentAt sai null (pendente)", async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReactivationWindow(scheduledAt, 90);
    const now = window90.start;

    reactivationConfigFindUniqueMock.mockResolvedValue({ thresholdDaysList: [90] });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED" },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.sentAt).toBeNull();
  });

  // Bug real reportado: mensagem de Reativação chegava com "{{primeiro_nome}}"
  // literal no WhatsApp — a Reativação nunca substituía variável nenhuma.
  // Estes dois testes cobrem a wiring de getReactivationCards com
  // renderMessageTemplate (a lógica de limpeza em si já é testada à parte
  // em message-template.test.ts).
  it("mensagem customizada com {{primeiro_nome}}/{{data_horario}}: renderiza com o nome em cache e a data do agendamento", async () => {
    const scheduledAt = new Date("2026-01-01T15:00:00.000Z"); // quinta-feira, 12h em São Paulo (UTC-3)
    const window90 = computeReactivationWindow(scheduledAt, 90);
    const now = window90.start;

    reactivationConfigFindUniqueMock.mockResolvedValue({
      thresholdDaysList: [90],
      message1: "Oi, {{primeiro_nome}}! Faz tempo desde {{data_horario}}.",
    });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED" },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards[0]!.message).toBe("Oi, Fulana! Faz tempo desde quinta-feira (01/01) às 12h.");
    expect(cards[0]!.message).not.toMatch(/\{\{/);
  });

  it('nome desconhecido (sem cache, sem conta do Instagram pra buscar): remove "{{primeiro_nome}}" com limpeza — nunca sai literal', async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReactivationWindow(scheduledAt, 90);
    const now = window90.start;

    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: null, igUsername: null, igScopedId: "ig-1", nameLookupAttempted: true, profilePictureUrl: null, phone: "11987654321" },
    ]);
    reactivationConfigFindUniqueMock.mockResolvedValue({
      thresholdDaysList: [90],
      message1: "Oi, {{primeiro_nome}}! Como você está?",
    });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED" },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});

    const cards = await getReactivationCards("clinic-1", now);

    expect(cards[0]!.message).toBe("Oi! Como você está?");
    expect(cards[0]!.message).not.toMatch(/\{\{/);
  });

  it("clínica com conta do Instagram conectada: busca o nome ao vivo (ensureLeadFirstNameFromInstagram) em vez de confiar só no cache", async () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const window90 = computeReactivationWindow(scheduledAt, 90);
    const now = window90.start;

    leadFindManyMock.mockResolvedValue([
      { id: "lead-1", name: null, igUsername: null, igScopedId: "ig-1", nameLookupAttempted: false, profilePictureUrl: null, phone: "11987654321" },
    ]);
    instagramAccountFindUniqueMock.mockResolvedValue({ accessTokenEnc: "enc-token" });
    ensureLeadFirstNameFromInstagramMock.mockResolvedValue("João Pedro");
    reactivationConfigFindUniqueMock.mockResolvedValue({
      thresholdDaysList: [90],
      message1: "Oi, {{primeiro_nome}}!",
    });
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-1", leadId: "lead-1", conversationId: "conv-1", scheduledAt, status: "SCHEDULED" },
    ]);
    reactivationCardSlotFindManyMock.mockResolvedValue([]);
    reactivationCardSlotUpsertMock.mockResolvedValue({});

    const cards = await getReactivationCards("clinic-1", now);

    expect(ensureLeadFirstNameFromInstagramMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lead-1" }),
      "enc-token"
    );
    expect(cards[0]!.message).toBe("Oi, João!");
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

  it("lista já toda pendente ou já toda enviada: ordem inalterada", () => {
    const pendingOnly = [card({ appointmentId: "a" }), card({ appointmentId: "b" })];
    expect(sortReactivationCardsForDisplay(pendingOnly).map((x) => x.appointmentId)).toEqual(["a", "b"]);

    const sentOnly = [
      card({ appointmentId: "a", sentAt: new Date() }),
      card({ appointmentId: "b", sentAt: new Date() }),
    ];
    expect(sortReactivationCardsForDisplay(sentOnly).map((x) => x.appointmentId)).toEqual(["a", "b"]);
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

  it("todos enviados: zero pendentes", () => {
    const cards = [card({ sentAt: new Date() }), card({ sentAt: new Date() })];
    expect(countPendingReactivationCards(cards)).toBe(0);
  });

  it("lista vazia: zero pendentes", () => {
    expect(countPendingReactivationCards([])).toBe(0);
  });
});

// Proteção do chip (pedido explícito): ~10s entre envios de WhatsApp da
// MESMA clínica. Pura — quem chama (sendReactivationWhatsAppMessage,
// abaixo) acha o sentAt mais recente só entre slots de canal WHATSAPP.
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

describe("sendReactivationWhatsAppMessage — envio direto pelo VEXO (canal WhatsApp)", () => {
  function fakeSlot(overrides: Record<string, unknown> = {}) {
    return {
      id: "slot-1",
      appointmentId: "appt-1",
      thresholdDays: 90, // WHATSAPP (ver REACTIVATION_CHANNEL_BY_THRESHOLD)
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
    reactivationCardSlotFindManyMock.mockReset();
    reactivationCardSlotUpdateManyMock.mockReset();
    reactivationCardSlotUpdateMock.mockReset();
    sendWhatsappMessageMock.mockReset();
    reactivationCardSlotFindManyMock.mockResolvedValue([]); // sem envio anterior = sem rate limit, por padrão
    reactivationCardSlotUpdateManyMock.mockResolvedValue({ count: 1 }); // claim ganho, por padrão
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

  it('card já marcado como enviado: não reenvia (idempotente) — nem chega a checar rate limit ou reservar', async () => {
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
    reactivationCardSlotFindManyMock.mockResolvedValue([
      { thresholdDays: 90, sentAt: new Date(now.getTime() - 5_000) }, // 5s atrás, canal WHATSAPP — dentro do limite
    ]);

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, now);

    expect(result).toEqual({ ok: false, reason: "rate_limited", clinicId: "clinic-1" });
    expect(reactivationCardSlotUpdateManyMock).not.toHaveBeenCalled();
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("envio recente só de card de Instagram (canal diferente) não conta pro limite do WhatsApp", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(fakeSlot());
    const now = new Date("2026-05-20T12:00:30.000Z");
    reactivationCardSlotFindManyMock.mockResolvedValue([
      { thresholdDays: 30, sentAt: new Date(now.getTime() - 1_000) }, // 1s atrás, mas canal INSTAGRAM
    ]);
    sendWhatsappMessageMock.mockResolvedValue(undefined);

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, now);

    expect(result.ok).toBe(true);
    expect(sendWhatsappMessageMock).toHaveBeenCalled();
  });

  it('telefone inválido: NÃO manda, libera a reserva, nunca marca como enviado', async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(
      fakeSlot({ appointment: { ...fakeSlot().appointment, lead: { phone: "123" } } })
    );

    const result = await sendReactivationWhatsAppMessage("appt-1", 90, new Date());

    expect(result).toEqual({ ok: false, reason: "invalid_phone", clinicId: "clinic-1" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
    expect(reactivationCardSlotUpdateMock).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { sentAt: null } });
  });

  it("lead sem telefone cadastrado: mesmo tratamento de telefone inválido", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(
      fakeSlot({ appointment: { ...fakeSlot().appointment, lead: null } })
    );

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

  // Bug real reportado (mesmo mecanismo de getReactivationCards, acima) —
  // o envio direto nunca substituía variável nenhuma no texto configurado.
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

    expect(sendWhatsappMessageMock).toHaveBeenCalledWith(
      "clinic-1-instance",
      "5511987654321",
      "Oi, Fulana! Em quinta-feira (01/01) às 12h."
    );
  });

  it("nome desconhecido (sem cache, sem conta do Instagram): remove {{primeiro_nome}} com limpeza antes de mandar — nunca literal", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(
      fakeSlot({
        appointment: {
          ...fakeSlot().appointment,
          lead: { id: "lead-1", name: null, igScopedId: "ig-1", nameLookupAttempted: true, phone: "11987654321" },
          clinic: {
            ...fakeSlot().appointment.clinic,
            reactivationConfig: { message1: null, message2: "Oi, {{primeiro_nome}}! Como vai?", message3: null, message4: null, message5: null },
          },
        },
      })
    );
    sendWhatsappMessageMock.mockResolvedValue(undefined);

    await sendReactivationWhatsAppMessage("appt-1", 90, new Date());

    expect(sendWhatsappMessageMock).toHaveBeenCalledWith("clinic-1-instance", "5511987654321", "Oi! Como vai?");
  });

  it("defesa em profundidade: período de canal Instagram nunca manda WhatsApp, mesmo se chamado diretamente", async () => {
    reactivationCardSlotFindUniqueMock.mockResolvedValue(fakeSlot({ thresholdDays: 30 })); // 30 = INSTAGRAM

    const result = await sendReactivationWhatsAppMessage("appt-1", 30, new Date());

    expect(result).toEqual({ ok: false, reason: "wrong_channel", clinicId: "clinic-1" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });
});
