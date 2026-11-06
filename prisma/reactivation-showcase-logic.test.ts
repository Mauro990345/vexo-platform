import { describe, it, expect } from "vitest";
import {
  selectShowcaseCandidates,
  assignShowcasePeriods,
  maskPhone,
  selectForcedInstagramCandidates,
  type ShowcaseCandidate,
} from "./reactivation-showcase-logic";

function candidate(id: string, leadId: string, daysAgo: number, hasPhone: boolean): ShowcaseCandidate {
  return { appointmentId: id, leadId, scheduledAt: new Date(Date.now() - daysAgo * 86_400_000), hasPhone };
}

describe("selectShowcaseCandidates", () => {
  it("separa por canal e pega os N mais recentes de cada grupo", () => {
    const candidates = [
      candidate("ig-old", "lead-1", 40, false),
      candidate("ig-new", "lead-2", 5, false),
      candidate("wa-1", "lead-3", 10, true),
      candidate("wa-2", "lead-4", 3, true),
      candidate("wa-3", "lead-5", 20, true),
      candidate("wa-4", "lead-6", 1, true),
    ];
    const result = selectShowcaseCandidates(candidates, 2, 3);
    expect(result.instagram.map((c) => c.appointmentId)).toEqual(["ig-new", "ig-old"]);
    expect(result.whatsapp.map((c) => c.appointmentId)).toEqual(["wa-4", "wa-2", "wa-1"]);
    expect(result.warnings).toEqual([]);
  });

  it("avisa (sem lançar erro) quando um grupo não tem candidatos suficientes", () => {
    const candidates = [candidate("ig-1", "lead-1", 5, false), candidate("wa-1", "lead-2", 5, true)];
    const result = selectShowcaseCandidates(candidates, 2, 3);
    expect(result.instagram).toHaveLength(1);
    expect(result.whatsapp).toHaveLength(1);
    expect(result.warnings).toEqual(["not_enough_instagram", "not_enough_whatsapp"]);
  });

  it("desempate estável por appointmentId quando scheduledAt empata", () => {
    const sameDate = new Date();
    const candidates: ShowcaseCandidate[] = [
      { appointmentId: "b", leadId: "lead-1", scheduledAt: sameDate, hasPhone: true },
      { appointmentId: "a", leadId: "lead-2", scheduledAt: sameDate, hasPhone: true },
    ];
    const result = selectShowcaseCandidates(candidates, 0, 2);
    expect(result.whatsapp.map((c) => c.appointmentId)).toEqual(["a", "b"]);
  });
});

describe("assignShowcasePeriods", () => {
  it("2 Instagram + 3 WhatsApp: 5 prazos distintos, só o 3º item (1º WhatsApp) já enviado", () => {
    const selection = {
      instagram: [candidate("ig-1", "lead-1", 5, false), candidate("ig-2", "lead-2", 10, false)],
      whatsapp: [candidate("wa-1", "lead-3", 5, true), candidate("wa-2", "lead-4", 10, true), candidate("wa-3", "lead-5", 15, true)],
      warnings: [],
    };
    const assignments = assignShowcasePeriods(selection);
    expect(assignments).toHaveLength(5);
    expect(assignments.filter((a) => a.channel === "INSTAGRAM")).toHaveLength(2);
    expect(assignments.filter((a) => a.channel === "WHATSAPP")).toHaveLength(3);

    const periods = assignments.map((a) => a.periodDays);
    expect(new Set(periods).size).toBe(5);

    const sent = assignments.filter((a) => a.alreadySent);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.appointmentId).toBe("wa-1");
    expect(sent[0]!.channel).toBe("WHATSAPP");
  });

  it("determinístico: mesma seleção de entrada produz sempre a mesma atribuição (re-execução)", () => {
    const selection = {
      instagram: [candidate("ig-1", "lead-1", 5, false)],
      whatsapp: [candidate("wa-1", "lead-2", 5, true)],
      warnings: [],
    };
    const first = assignShowcasePeriods(selection);
    const second = assignShowcasePeriods(selection);
    expect(second).toEqual(first);
  });
});

describe("maskPhone", () => {
  it("mantém DDD+início e os 2 últimos dígitos, esconde o meio", () => {
    expect(maskPhone("11999998888")).toBe("1199*****88");
  });

  it("funciona com +55 na frente (normaliza só dígitos)", () => {
    expect(maskPhone("+5511999998888")).toBe("5511*******88");
  });

  it("telefone curto demais: mascara tudo, sem lançar erro", () => {
    expect(maskPhone("123")).toBe("***");
  });
});

describe("selectForcedInstagramCandidates", () => {
  it("escolhe os N mais recentes COM telefone, excluindo os já escolhidos", () => {
    const pool = [
      candidate("wa-already-1", "lead-1", 5, true),
      candidate("wa-already-2", "lead-2", 10, true),
      candidate("wa-already-3", "lead-3", 15, true),
      candidate("wa-extra-new", "lead-4", 3, true),
      candidate("wa-extra-old", "lead-5", 25, true),
    ];
    const result = selectForcedInstagramCandidates(pool, ["wa-already-1", "wa-already-2", "wa-already-3"], 2);
    expect(result.map((c) => c.appointmentId)).toEqual(["wa-extra-new", "wa-extra-old"]);
  });

  it("nunca escolhe quem já tem telefone removido (hasPhone false já excluído do pool)", () => {
    const pool = [candidate("ig-1", "lead-1", 5, false), candidate("wa-1", "lead-2", 5, true)];
    const result = selectForcedInstagramCandidates(pool, [], 5);
    expect(result.map((c) => c.appointmentId)).toEqual(["wa-1"]);
  });

  it("count=0: não escolhe ninguém", () => {
    const pool = [candidate("wa-1", "lead-1", 5, true)];
    expect(selectForcedInstagramCandidates(pool, [], 0)).toEqual([]);
  });

  it("pool insuficiente: devolve o que tiver, sem lançar erro", () => {
    const pool = [candidate("wa-1", "lead-1", 5, true)];
    const result = selectForcedInstagramCandidates(pool, [], 3);
    expect(result).toHaveLength(1);
  });
});
