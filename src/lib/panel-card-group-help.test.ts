import { describe, it, expect } from "vitest";
import { noShowGroupHelp, neverScheduledGroupHelp, hotLeadGroupHelp, REACTIVATION_GROUP_HELP } from "./panel-card-group-help";
import { NO_SHOW_CARD_STEPS } from "./no-show-cards";
import { NEVER_SCHEDULED_CARD_STEPS } from "./never-scheduled-cards";
import { HOT_LEAD_STEP_DAYS } from "./hot-lead-cards";

// Pedido explícito: os dias no texto vêm das CONSTANTES de cadência, não
// de números fixos na string — confirma isso lendo as constantes de
// verdade (não um valor copiado à mão) e montando o texto esperado com a
// mesma formatação em português ("x, y e z").
function expectedDayList(days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 1) return `${sorted[0]}`;
  return `${sorted.slice(0, -1).join(", ")} e ${sorted[sorted.length - 1]}`;
}

describe("noShowGroupHelp (Faltou)", () => {
  it("texto exato pedido, com os dias (e o 'D15: Instagram') vindos de NO_SHOW_CARD_STEPS", () => {
    const days = NO_SHOW_CARD_STEPS.map((s) => s.offsetDays);
    const instagramOnlyDay = NO_SHOW_CARD_STEPS.find((s) => s.step === 3)!.offsetDays;
    expect(noShowGroupHelp()).toBe(
      `Leads que faltaram à consulta. Resgate para remarcar nos dias ${expectedDayList(days)}. Canal: WhatsApp (D${instagramOnlyDay}: Instagram).`
    );
  });

  it("texto atual bate com os dias 3, 7 e 15, canal WhatsApp com D15 ressalvado como Instagram (estado de hoje de NO_SHOW_CARD_STEPS)", () => {
    expect(noShowGroupHelp()).toBe(
      "Leads que faltaram à consulta. Resgate para remarcar nos dias 3, 7 e 15. Canal: WhatsApp (D15: Instagram)."
    );
  });
});

describe("neverScheduledGroupHelp (Não agendou)", () => {
  it("texto exato pedido, com os dias vindos de NEVER_SCHEDULED_CARD_STEPS", () => {
    const days = NEVER_SCHEDULED_CARD_STEPS.map((s) => s.offsetDays);
    expect(neverScheduledGroupHelp()).toBe(
      `Leads que conversaram e não agendaram. Mensagens nos dias ${expectedDayList(days)} convidando a agendar. Canal: Instagram.`
    );
  });

  it("texto atual bate com os dias 2, 4, 10, 30 e 60 (estado de hoje de NEVER_SCHEDULED_CARD_STEPS)", () => {
    expect(neverScheduledGroupHelp()).toBe(
      "Leads que conversaram e não agendaram. Mensagens nos dias 2, 4, 10, 30 e 60 convidando a agendar. Canal: Instagram."
    );
  });
});

describe("hotLeadGroupHelp (Quente)", () => {
  it("texto exato pedido, com os dias vindos de HOT_LEAD_STEP_DAYS", () => {
    expect(hotLeadGroupHelp()).toBe(
      `Leads que demonstraram interesse (perguntaram preço ou endereço) e não agendaram. Mensagens nos dias ${expectedDayList([...HOT_LEAD_STEP_DAYS])}. Canal: Instagram.`
    );
  });

  it("texto atual bate com os dias 2, 4 e 15 (estado de hoje de HOT_LEAD_STEP_DAYS)", () => {
    expect(hotLeadGroupHelp()).toBe(
      "Leads que demonstraram interesse (perguntaram preço ou endereço) e não agendaram. Mensagens nos dias 2, 4 e 15. Canal: Instagram."
    );
  });
});

describe("REACTIVATION_GROUP_HELP (Reativação)", () => {
  it("texto exato pedido, sem nenhum dia nem menção à janela de ±3 dias", () => {
    expect(REACTIVATION_GROUP_HELP).toBe("Pacientes atendidos que devem retornar. Canal: WhatsApp.");
    expect(REACTIVATION_GROUP_HELP).not.toMatch(/dia|janela|±|3 dias/i);
  });
});
