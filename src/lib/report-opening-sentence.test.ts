import { describe, it, expect } from "vitest";
import { buildOpeningSentence } from "./report-opening-sentence";
import { computeMonthlyPeriod, computeBiweeklyPeriod } from "./report-period";
import type { ReportFunnel } from "./report-metrics";

const MONTHLY_PERIOD = computeMonthlyPeriod(new Date("2026-10-15T12:00:00.000Z")); // outubro/2026

function funnel(overrides: Partial<ReportFunnel> = {}): ReportFunnel {
  return { contacted: 0, inConversation: 0, scheduled: 0, attended: 0, noShow: 0, ...overrides };
}

describe("buildOpeningSentence — frase de abertura (item 2)", () => {
  it("mensal, todos os números presentes e plurais: mesmo exemplo do pedido", () => {
    const sentence = buildOpeningSentence("MONTHLY", MONTHLY_PERIOD, funnel({ contacted: 21, scheduled: 10, attended: 9 }));
    expect(sentence).toBe("Em outubro, o VEXO IA abordou 21 pessoas, 10 agendaram e 9 compareceram.");
  });

  it("quinzenal, 1ª quinzena: mesmo exemplo do pedido (início da frase)", () => {
    const period = computeBiweeklyPeriod(new Date("2026-11-05T12:00:00.000Z"));
    const sentence = buildOpeningSentence("BIWEEKLY", period, funnel({ contacted: 8, scheduled: 4, attended: 3 }));
    expect(sentence.startsWith("Na 1ª quinzena de novembro, o VEXO IA abordou")).toBe(true);
  });

  it("singular correto quando os 3 números são 1: '1 pessoa', '1 agendou', '1 compareceu'", () => {
    const sentence = buildOpeningSentence("MONTHLY", MONTHLY_PERIOD, funnel({ contacted: 1, scheduled: 1, attended: 1 }));
    expect(sentence).toBe("Em outubro, o VEXO IA abordou 1 pessoa, 1 agendou e 1 compareceu.");
  });

  it("plural de 'pessoa' mesmo com só 2", () => {
    const sentence = buildOpeningSentence("MONTHLY", MONTHLY_PERIOD, funnel({ contacted: 2, scheduled: 1, attended: 1 }));
    expect(sentence).toContain("2 pessoas");
  });

  it("abordados=0: uma única linha neutra, sem mês/quinzena e sem citar os outros números", () => {
    const sentence = buildOpeningSentence("MONTHLY", MONTHLY_PERIOD, funnel());
    expect(sentence).toBe("Neste período ainda não houve abordagens registradas.");
  });

  it("abordados=0 mesmo que (por inconsistência externa) outro número viesse positivo: ainda assim só a linha neutra", () => {
    const sentence = buildOpeningSentence("MONTHLY", MONTHLY_PERIOD, funnel({ contacted: 0, scheduled: 2 }));
    expect(sentence).toBe("Neste período ainda não houve abordagens registradas.");
  });

  it("agendaram=0 (abordados>0): frase com abordados + frase neutra de agendamento, nunca '0 agendaram'", () => {
    const sentence = buildOpeningSentence("MONTHLY", MONTHLY_PERIOD, funnel({ contacted: 5, scheduled: 0 }));
    expect(sentence).toBe("Em outubro, o VEXO IA abordou 5 pessoas. Neste período ainda não houve agendamentos.");
  });

  it("compareceram=0 (agendaram>0): frase com abordados+agendaram + frase neutra de comparecimento, nunca '0 compareceram'", () => {
    const sentence = buildOpeningSentence("MONTHLY", MONTHLY_PERIOD, funnel({ contacted: 5, scheduled: 2, attended: 0 }));
    expect(sentence).toBe("Em outubro, o VEXO IA abordou 5 pessoas e 2 agendaram. Ainda não houve comparecimentos neste período.");
  });

  it("nunca produz '0 pessoas'/'0 agendaram'/'0 compareceram' em nenhum caso", () => {
    const cases: ReportFunnel[] = [
      funnel(),
      funnel({ contacted: 5 }),
      funnel({ contacted: 5, scheduled: 3 }),
      funnel({ contacted: 5, scheduled: 3, attended: 2 }),
    ];
    for (const f of cases) {
      const sentence = buildOpeningSentence("MONTHLY", MONTHLY_PERIOD, f);
      expect(sentence).not.toContain("0 pessoa");
      expect(sentence).not.toContain("0 agendaram");
      expect(sentence).not.toContain("0 compareceram");
    }
  });
});
