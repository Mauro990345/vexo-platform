import { describe, it, expect } from "vitest";
import {
  computeReactivationWindow,
  isWithinReactivationWindow,
  selectReactivationCandidates,
  resolveAvailableReactivationSlots,
  assignNextReactivationSlot,
  resolveReactivationMessageText,
  buildReactivationWhatsAppLink,
  DEFAULT_REACTIVATION_MESSAGES,
  REACTIVATION_THRESHOLD_OPTIONS,
  type ReactivationSourceAppointment,
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

describe("computeReactivationWindow — os 3 prazos (90/120/150 dias)", () => {
  it("90 dias", () => {
    expect(REACTIVATION_THRESHOLD_OPTIONS).toContain(90);
    const window = computeReactivationWindow(new Date("2026-01-01T12:00:00.000Z"), 90);
    expect(window.start.getTime()).toBeGreaterThan(new Date("2026-01-01T12:00:00.000Z").getTime());
  });

  it("120 dias gera uma janela mais tarde que 90 dias pro mesmo agendamento", () => {
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const w90 = computeReactivationWindow(scheduledAt, 90);
    const w120 = computeReactivationWindow(scheduledAt, 120);
    expect(w120.start.getTime()).toBeGreaterThan(w90.start.getTime());
  });

  it("150 dias (padrão) gera uma janela mais tarde que 120 dias pro mesmo agendamento", () => {
    expect(REACTIVATION_THRESHOLD_OPTIONS).toContain(150);
    const scheduledAt = new Date("2026-01-01T12:00:00.000Z");
    const w120 = computeReactivationWindow(scheduledAt, 120);
    const w150 = computeReactivationWindow(scheduledAt, 150);
    expect(w150.start.getTime()).toBeGreaterThan(w120.start.getTime());
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
