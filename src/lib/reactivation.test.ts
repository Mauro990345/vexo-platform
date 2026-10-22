import { describe, it, expect } from "vitest";
import {
  computeReactivationWindow,
  isWithinReactivationWindow,
  selectReactivationCandidates,
  buildReactivationCardCandidates,
  assignReactivationCardSlots,
  cardSlotKey,
  resolveAvailableReactivationSlots,
  assignNextReactivationSlot,
  resolveReactivationMessageText,
  buildReactivationWhatsAppLink,
  DEFAULT_REACTIVATION_MESSAGES,
  REACTIVATION_THRESHOLD_OPTIONS,
  TEST_PERIOD_DAYS,
  isValidReactivationThresholdDays,
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
    expect(resolveReactivationMessageText(2, messages)).toBe("Mensagem customizada");
  });

  it("resolveReactivationMessageText: sem customização nesse slot, cai pro texto padrão correspondente", () => {
    const messages = [null, null, null, null, null];
    expect(resolveReactivationMessageText(3, messages)).toBe(DEFAULT_REACTIVATION_MESSAGES[2]);
  });

  it("DEFAULT_REACTIVATION_MESSAGES: 5 textos, nenhum citando serviço/procedimento, sem variável de nome", () => {
    expect(DEFAULT_REACTIVATION_MESSAGES).toHaveLength(5);
    for (const msg of DEFAULT_REACTIVATION_MESSAGES) {
      expect(msg).not.toMatch(/\{\{/);
    }
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
