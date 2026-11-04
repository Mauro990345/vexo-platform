import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildNeverScheduledCardCandidates,
  chooseNeverScheduledStep,
  resolveNeverScheduledCardMessageTemplate,
  buildNeverScheduledCardReason,
  stepDisplayPosition,
  hasPendingSilenceSteps,
  DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES,
  NEVER_SCHEDULED_CARD_STEPS,
  type NeverScheduledCandidate,
} from "./never-scheduled-cards";
import { computeReactivationWindow } from "./reactivation";

// Âncora fixa usada em todos os testes de janela abaixo (segunda-feira) —
// janelas reais (verificadas por script, não de cabeça):
//   D2  [2026-01-07, 2026-01-13]
//   D4  [2026-01-09, 2026-01-15]
//   D10 [2026-01-15, 2026-01-21]   <- D10.start == D4.end (um dia de sobreposição)
//   D30 [2026-02-04, 2026-02-10]
//   D60 [2026-03-06, 2026-03-12]
// D2 e D4 se sobrepõem por 5 dias corridos (01-09 a 01-13) — só 2 dias de
// distância entre os dois, menor que a janela de 5 dias úteis de cada um.
const ANCHOR = new Date("2026-01-05T12:00:00.000Z");

function candidate(overrides: Partial<NeverScheduledCandidate> = {}): NeverScheduledCandidate {
  return {
    conversationId: "conv-1",
    leadId: "lead-1",
    anchorAt: ANCHOR,
    existingSteps: [],
    ...overrides,
  };
}

describe("chooseNeverScheduledStep", () => {
  it("D2 isolado (D4 ainda não abriu): escolhe step 4 (D2)", () => {
    const now = new Date("2026-01-07T12:00:00.000Z");
    expect(chooseNeverScheduledStep(ANCHOR, [], now)?.step).toBe(4);
  });

  it("D4 isolado (D2 já fechou, D10 ainda não abriu): escolhe step 5 (D4)", () => {
    const now = new Date("2026-01-14T12:00:00.000Z");
    expect(chooseNeverScheduledStep(ANCHOR, [], now)?.step).toBe(5);
  });

  it("D10 isolado (D4 já fechou): escolhe step 3 (D10)", () => {
    const now = new Date("2026-01-16T12:00:00.000Z");
    expect(chooseNeverScheduledStep(ANCHOR, [], now)?.step).toBe(3);
  });

  it("D30 isolado: escolhe step 1", () => {
    const now = computeReactivationWindow(ANCHOR, 30).start;
    expect(chooseNeverScheduledStep(ANCHOR, [], now)?.step).toBe(1);
  });

  it("D60 isolado: escolhe step 2", () => {
    const now = computeReactivationWindow(ANCHOR, 60).start;
    expect(chooseNeverScheduledStep(ANCHOR, [], now)?.step).toBe(2);
  });

  it("nenhuma janela aberta (entre D10 e D30): não escolhe nada", () => {
    const now = new Date("2026-01-22T12:00:00.000Z");
    expect(chooseNeverScheduledStep(ANCHOR, [], now)).toBeNull();
  });

  // Item 1 (rodada atual) — D2/D4 só 2 dias um do outro: as janelas se
  // sobrepõem (achado ao implementar, não pedido explicitamente) — sem
  // escolher um só, o lead veria DOIS cards "Não agendou" ao mesmo tempo.
  describe("sobreposição D2/D4 (achado ao implementar — nunca mostra dois ao mesmo tempo)", () => {
    const now = new Date("2026-01-10T12:00:00.000Z"); // dentro das janelas de D2 E D4 ao mesmo tempo

    it("D2 e D4 ambos abertos, nenhum enviado: escolhe o mais cedo (D2, step 4)", () => {
      expect(chooseNeverScheduledStep(ANCHOR, [], now)?.step).toBe(4);
    });

    it("D2 já marcado enviado, D4 aberto e pendente: escolhe D4 (step 5), não repete o D2", () => {
      const existingSteps = [{ step: 4, sentAt: new Date("2026-01-07T12:00:00.000Z") }];
      expect(chooseNeverScheduledStep(ANCHOR, existingSteps, now)?.step).toBe(5);
    });

    it("os dois marcados enviados: continua mostrando o mais cedo (D2) com check, até a janela dele fechar", () => {
      const existingSteps = [
        { step: 4, sentAt: new Date("2026-01-07T12:00:00.000Z") },
        { step: 5, sentAt: new Date("2026-01-09T12:00:00.000Z") },
      ];
      expect(chooseNeverScheduledStep(ANCHOR, existingSteps, now)?.step).toBe(4);
    });
  });

  // Mesma lógica resolve a sobreposição de 1 dia entre D4 e D10 (achado
  // ao calcular as janelas reais, ver comentário no topo do arquivo).
  describe("sobreposição D4/D10 (um dia em comum: D4.end == D10.start)", () => {
    const now = new Date("2026-01-15T12:00:00.000Z"); // D4.end e D10.start, exatamente

    it("os dois abertos, nenhum enviado: escolhe o mais cedo (D4, step 5)", () => {
      expect(chooseNeverScheduledStep(ANCHOR, [], now)?.step).toBe(5);
    });

    it("D4 já enviado: passa pro D10 (step 3)", () => {
      const existingSteps = [{ step: 5, sentAt: new Date("2026-01-09T12:00:00.000Z") }];
      expect(chooseNeverScheduledStep(ANCHOR, existingSteps, now)?.step).toBe(3);
    });
  });
});

describe("buildNeverScheduledCardCandidates", () => {
  it("devolve no máximo um candidato por conversa, mesmo com D2/D4 sobrepostos", () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    const cards = buildNeverScheduledCardCandidates([candidate()], now);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(4);
  });

  it("fora de qualquer janela: nenhum card", () => {
    const now = new Date("2026-01-22T12:00:00.000Z");
    expect(buildNeverScheduledCardCandidates([candidate()], now)).toEqual([]);
  });

  it("os cinco passos fixos: 30/60/10 (rodadas anteriores) + 2/4 (rodada atual) — sem renumerar nenhum já gravado", () => {
    expect(NEVER_SCHEDULED_CARD_STEPS).toEqual([
      { step: 1, offsetDays: 30 },
      { step: 2, offsetDays: 60 },
      { step: 3, offsetDays: 10 },
      { step: 4, offsetDays: 2 },
      { step: 5, offsetDays: 4 },
    ]);
  });
});

describe("stepDisplayPosition", () => {
  it("posição de exibição é cronológica (D2=1º, D4=2º, D10=3º, D30=4º, D60=5º), independente do `step` gravado", () => {
    expect(stepDisplayPosition(4)).toBe(1); // D2
    expect(stepDisplayPosition(5)).toBe(2); // D4
    expect(stepDisplayPosition(3)).toBe(3); // D10
    expect(stepDisplayPosition(1)).toBe(4); // D30
    expect(stepDisplayPosition(2)).toBe(5); // D60
  });
});

describe("resolveNeverScheduledCardMessageTemplate", () => {
  it("usa o texto customizado do D30 quando configurado", () => {
    expect(resolveNeverScheduledCardMessageTemplate(1, { day30Content: "Texto customizado D30" })).toBe("Texto customizado D30");
  });

  it("usa o texto customizado do D60 quando configurado", () => {
    expect(resolveNeverScheduledCardMessageTemplate(2, { day60Content: "Texto customizado D60" })).toBe("Texto customizado D60");
  });

  it("usa o texto customizado do D10 quando configurado", () => {
    expect(resolveNeverScheduledCardMessageTemplate(3, { day10Content: "Texto customizado D10" })).toBe("Texto customizado D10");
  });

  it("usa o texto customizado do D2 quando configurado (item 1, rodada atual)", () => {
    expect(resolveNeverScheduledCardMessageTemplate(4, { day2Content: "Texto customizado D2" })).toBe("Texto customizado D2");
  });

  it("usa o texto customizado do D4 quando configurado (item 1, rodada atual)", () => {
    expect(resolveNeverScheduledCardMessageTemplate(5, { day4Content: "Texto customizado D4" })).toBe("Texto customizado D4");
  });

  it("sem customização, cai pro texto padrão de cada passo (os cinco textos exatos)", () => {
    for (let step = 1; step <= 5; step++) {
      expect(resolveNeverScheduledCardMessageTemplate(step, {})).toBe(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[step - 1]);
    }
    expect(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[3]).toBe("Oi, {{primeiro_nome}}. Passando para saber se posso ajudar com alguma coisa.");
    expect(DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[4]).toBe("Oi, {{primeiro_nome}}. Ainda por aqui, caso queira saber mais alguma coisa.");
  });
});

describe("buildNeverScheduledCardReason", () => {
  it('D30 (step 1) é a 4ª mensagem cronológica agora: "mensagem 4 de 5"', () => {
    const anchorAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-02-05T12:00:00.000Z"); // 35 dias depois
    expect(buildNeverScheduledCardReason(anchorAt, now, 1)).toBe("Sem agendamento há 35 dias · mensagem 4 de 5");
  });

  it('D60 (step 2) é a 5ª mensagem cronológica: "mensagem 5 de 5"', () => {
    const anchorAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-02T12:00:00.000Z");
    expect(buildNeverScheduledCardReason(anchorAt, now, 2)).toBe("Sem agendamento há 1 dia · mensagem 5 de 5");
  });

  it('D10 (step 3) é a 3ª mensagem cronológica: "mensagem 3 de 5"', () => {
    const anchorAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-11T12:00:00.000Z");
    expect(buildNeverScheduledCardReason(anchorAt, now, 3)).toBe("Sem agendamento há 10 dias · mensagem 3 de 5");
  });

  it('D2 (step 4, novo) é a 1ª mensagem cronológica: "mensagem 1 de 5"', () => {
    const anchorAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-03T12:00:00.000Z");
    expect(buildNeverScheduledCardReason(anchorAt, now, 4)).toBe("Sem agendamento há 2 dias · mensagem 1 de 5");
  });

  it('D4 (step 5, novo) é a 2ª mensagem cronológica: "mensagem 2 de 5"', () => {
    const anchorAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-05T12:00:00.000Z");
    expect(buildNeverScheduledCardReason(anchorAt, now, 5)).toBe("Sem agendamento há 4 dias · mensagem 2 de 5");
  });
});

describe("hasPendingSilenceSteps", () => {
  it("sem log SILENCE aberto: nunca pendente", () => {
    expect(hasPendingSilenceSteps([], 2)).toBe(false);
  });

  it("log aberto com passos ainda por enviar (lastStepIndex < total-1): pendente", () => {
    expect(hasPendingSilenceSteps([{ lastStepIndex: 0 }], 2)).toBe(true);
  });

  it("log aberto sem nenhum passo enviado ainda (lastStepIndex null): pendente, se houver ao menos 1 passo configurado", () => {
    expect(hasPendingSilenceSteps([{ lastStepIndex: null }], 1)).toBe(true);
  });

  it("log aberto com todos os passos já enviados (lastStepIndex == total-1): não pendente — sequência esgotada", () => {
    expect(hasPendingSilenceSteps([{ lastStepIndex: 1 }], 2)).toBe(false);
  });

  it("nenhum passo SILENCE configurado (total 0): nunca pendente, mesmo com log aberto", () => {
    expect(hasPendingSilenceSteps([{ lastStepIndex: null }], 0)).toBe(false);
  });
});

// getNeverScheduledCards/toggleNeverScheduledCardSent — com Prisma mockado,
// mesmo padrão de getReactivationCards (reactivation.test.ts). Cobre as
// exclusões pedidas (agendamento/LOST), a exclusão adicional (sinal de
// interesse do Quente), a exclusão adicional #2 (sequência SILENCE ainda
// pendente, item 3 da rodada atual) e a ÂNCORA CONGELADA.
const conversationFindManyMock = vi.fn();
const conversationUpdateMock = vi.fn();
const transactionMock = vi.fn();
const followUpStepCountMock = vi.fn();
const neverScheduledCardSettingsFindUniqueMock = vi.fn();
const leadFindManyMock = vi.fn();
const instagramAccountFindUniqueMock = vi.fn();
const neverScheduledCardSlotFindUniqueMock = vi.fn();
const neverScheduledCardSlotUpdateMock = vi.fn();
const neverScheduledCardSlotCreateMock = vi.fn();
const conversationFindUniqueMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findMany: (...args: unknown[]) => conversationFindManyMock(...args),
      findUnique: (...args: unknown[]) => conversationFindUniqueMock(...args),
      update: (...args: unknown[]) => conversationUpdateMock(...args),
    },
    followUpStep: { count: (...args: unknown[]) => followUpStepCountMock(...args) },
    neverScheduledCardSettings: { findUnique: (...args: unknown[]) => neverScheduledCardSettingsFindUniqueMock(...args) },
    lead: { findMany: (...args: unknown[]) => leadFindManyMock(...args) },
    instagramAccount: { findUnique: (...args: unknown[]) => instagramAccountFindUniqueMock(...args) },
    neverScheduledCardSlot: {
      findUnique: (...args: unknown[]) => neverScheduledCardSlotFindUniqueMock(...args),
      update: (...args: unknown[]) => neverScheduledCardSlotUpdateMock(...args),
      create: (...args: unknown[]) => neverScheduledCardSlotCreateMock(...args),
    },
    $transaction: (ops: unknown[]) => transactionMock(ops),
  },
}));

const ensureLeadFirstNameFromInstagramMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  ensureLeadFirstNameFromInstagram: (...args: unknown[]) => ensureLeadFirstNameFromInstagramMock(...args),
}));

import { getNeverScheduledCards, toggleNeverScheduledCardSent } from "./never-scheduled-cards";

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    leadId: "lead-1",
    lastMessageAt: new Date("2026-01-05T12:00:00.000Z"),
    neverScheduledAnchorAt: null,
    messages: [],
    neverScheduledCardSlots: [],
    followUps: [],
    ...overrides,
  };
}

const SOME_LEAD = { id: "lead-1", name: "Maria", igUsername: "maria.ig", igScopedId: "123", nameLookupAttempted: true, profilePictureUrl: null };

describe("getNeverScheduledCards", () => {
  beforeEach(() => {
    conversationFindManyMock.mockReset();
    conversationUpdateMock.mockReset();
    transactionMock.mockReset();
    transactionMock.mockImplementation(async (ops: unknown[]) => ops);
    followUpStepCountMock.mockReset();
    followUpStepCountMock.mockResolvedValue(0);
    neverScheduledCardSettingsFindUniqueMock.mockReset();
    leadFindManyMock.mockReset();
    instagramAccountFindUniqueMock.mockReset();
    ensureLeadFirstNameFromInstagramMock.mockReset();
    neverScheduledCardSettingsFindUniqueMock.mockResolvedValue(null);
    instagramAccountFindUniqueMock.mockResolvedValue(null);
  });

  it("consulta conversas excluindo LOST e leads com qualquer agendamento (pedido explícito)", async () => {
    conversationFindManyMock.mockResolvedValue([]);
    await getNeverScheduledCards("clinic-1", new Date());

    expect(conversationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
          status: { not: "LOST" },
          lastMessageAt: { not: null },
          lead: { appointments: { none: {} } },
        }),
      })
    );
  });

  it("lead com sinal de interesse (ex.: perguntou preço) fica de fora — é coberto pelo Quente, não aqui (exclusão adicional #1)", async () => {
    const lastMessageAt = computeReactivationWindow(new Date("2026-01-01T12:00:00.000Z"), 10).start;
    conversationFindManyMock.mockResolvedValue([
      conversationRow({ lastMessageAt, messages: [{ content: "Quanto custa o procedimento?" }] }),
    ]);

    const cards = await getNeverScheduledCards("clinic-1", lastMessageAt);
    expect(cards).toEqual([]);
  });

  it("lead sem sinal de interesse, D2 dentro da janela (item 1, rodada atual): gera o card", async () => {
    const now = new Date("2026-01-07T12:00:00.000Z"); // D2.start pra ANCHOR
    conversationFindManyMock.mockResolvedValue([conversationRow({ lastMessageAt: ANCHOR, messages: [{ content: "Oi, tudo bem?" }] })]);
    leadFindManyMock.mockResolvedValue([SOME_LEAD]);

    const cards = await getNeverScheduledCards("clinic-1", now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(4);
    expect(cards[0]!.message).toContain("Maria");
    expect(cards[0]!.instagramDmLink).toContain("ig.me/m/maria.ig");
  });

  it("lead sem sinal de interesse, D30 dentro da janela: gera o card", async () => {
    const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(lastMessageAt, 30).start;
    conversationFindManyMock.mockResolvedValue([conversationRow({ lastMessageAt, messages: [{ content: "Oi, tudo bem?" }] })]);
    leadFindManyMock.mockResolvedValue([SOME_LEAD]);

    const cards = await getNeverScheduledCards("clinic-1", now);

    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(1);
  });

  it("card já marcado enviado: sentAt vem do slot existente", async () => {
    const lastMessageAt = new Date("2026-01-05T12:00:00.000Z");
    const now = computeReactivationWindow(lastMessageAt, 30).start;
    const sentAt = new Date(now.getTime() - 1000);
    conversationFindManyMock.mockResolvedValue([
      conversationRow({ lastMessageAt, neverScheduledCardSlots: [{ step: 1, sentAt }] }),
    ]);
    leadFindManyMock.mockResolvedValue([SOME_LEAD]);

    const cards = await getNeverScheduledCards("clinic-1", now);
    expect(cards[0]!.sentAt).toEqual(sentAt);
  });

  // Item 3 (rodada atual) — sobreposição com a sequência automática
  // "Parou de responder" (SILENCE, follow-up.ts).
  describe("exclusão adicional #2 — sequência SILENCE ainda ativa (item 3)", () => {
    it("conversa com sequência SILENCE ainda com passo pendente: fica de fora, mesmo com D2 na janela", async () => {
      const now = new Date("2026-01-07T12:00:00.000Z");
      followUpStepCountMock.mockResolvedValue(2); // 2 passos configurados pra SILENCE
      conversationFindManyMock.mockResolvedValue([
        conversationRow({ lastMessageAt: ANCHOR, followUps: [{ lastStepIndex: 0 }] }), // só o passo 0 de 2 já saiu
      ]);

      const cards = await getNeverScheduledCards("clinic-1", now);
      expect(cards).toEqual([]);
    });

    it("sequência SILENCE já esgotou todos os passos configurados: card aparece normalmente", async () => {
      const now = new Date("2026-01-07T12:00:00.000Z");
      followUpStepCountMock.mockResolvedValue(2);
      conversationFindManyMock.mockResolvedValue([
        conversationRow({ lastMessageAt: ANCHOR, followUps: [{ lastStepIndex: 1 }] }), // os 2 passos (índice 0 e 1) já saíram
      ]);
      leadFindManyMock.mockResolvedValue([SOME_LEAD]);

      const cards = await getNeverScheduledCards("clinic-1", now);
      expect(cards).toHaveLength(1);
    });

    it("conversa sem nenhum log SILENCE aberto: card aparece normalmente, mesmo com passos configurados", async () => {
      const now = new Date("2026-01-07T12:00:00.000Z");
      followUpStepCountMock.mockResolvedValue(2);
      conversationFindManyMock.mockResolvedValue([conversationRow({ lastMessageAt: ANCHOR, followUps: [] })]);
      leadFindManyMock.mockResolvedValue([SOME_LEAD]);

      const cards = await getNeverScheduledCards("clinic-1", now);
      expect(cards).toHaveLength(1);
    });
  });

  // Item 1 (rodada atual) — sobreposição ENTRE os próprios passos de "Não
  // agendou" (D2/D4), achada ao implementar — ver chooseNeverScheduledStep.
  it("D2 e D4 ambos dentro da janela pro mesmo lead: só UM card aparece (o mais cedo, D2)", async () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    conversationFindManyMock.mockResolvedValue([conversationRow({ lastMessageAt: ANCHOR })]);
    leadFindManyMock.mockResolvedValue([SOME_LEAD]);

    const cards = await getNeverScheduledCards("clinic-1", now);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.step).toBe(4);
  });

  // Âncora congelada (ajuste de rodada anterior, mantido e agora testado
  // com a primeira janela em D2 — a mais precoce — em vez de D10).
  describe("âncora congelada", () => {
    it("conversa sem âncora ainda e ainda fora da primeira janela (D2): usa lastMessageAt ao vivo, sem persistir nada", async () => {
      const now = new Date("2026-01-06T12:00:00.000Z"); // 1 dia — antes do D2 abrir
      conversationFindManyMock.mockResolvedValue([conversationRow({ lastMessageAt: ANCHOR })]);

      const cards = await getNeverScheduledCards("clinic-1", now);
      expect(cards).toEqual([]);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("conversa entra na janela do D2 por primeira vez: congela a âncora em Conversation.neverScheduledAnchorAt", async () => {
      const now = new Date("2026-01-07T12:00:00.000Z"); // D2.start
      conversationFindManyMock.mockResolvedValue([conversationRow({ lastMessageAt: ANCHOR, neverScheduledAnchorAt: null })]);
      leadFindManyMock.mockResolvedValue([SOME_LEAD]);

      await getNeverScheduledCards("clinic-1", now);

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(conversationUpdateMock).toHaveBeenCalledWith({
        where: { id: "conv-1" },
        data: { neverScheduledAnchorAt: ANCHOR },
      });
    });

    it("conversa já com âncora congelada: ignora lastMessageAt ao vivo (resposta do lead sem agendar não reinicia o prazo)", async () => {
      const frozenAnchor = new Date("2026-01-05T12:00:00.000Z");
      // lastMessageAt bem mais recente (o lead respondeu depois, sem
      // agendar) — não deve afetar o card, que continua ancorado em
      // frozenAnchor.
      const laterReply = new Date("2026-02-01T12:00:00.000Z");
      const now = computeReactivationWindow(frozenAnchor, 30).start;
      conversationFindManyMock.mockResolvedValue([
        conversationRow({ lastMessageAt: laterReply, neverScheduledAnchorAt: frozenAnchor }),
      ]);
      leadFindManyMock.mockResolvedValue([SOME_LEAD]);

      const cards = await getNeverScheduledCards("clinic-1", now);

      expect(cards).toHaveLength(1);
      expect(cards[0]!.step).toBe(1); // D30, contado a partir da âncora congelada
      expect(transactionMock).not.toHaveBeenCalled(); // já estava congelada, não grava de novo
    });
  });
});

describe("toggleNeverScheduledCardSent", () => {
  beforeEach(() => {
    neverScheduledCardSlotFindUniqueMock.mockReset();
    neverScheduledCardSlotUpdateMock.mockReset();
    neverScheduledCardSlotCreateMock.mockReset();
    conversationFindUniqueMock.mockReset();
  });

  it("primeiro clique (sem linha ainda): cria o slot já marcado enviado, lazy (igual toggleNoShowCardSent)", async () => {
    neverScheduledCardSlotFindUniqueMock.mockResolvedValue(null);
    conversationFindUniqueMock.mockResolvedValue({ clinicId: "clinic-1" });
    const now = new Date();

    const result = await toggleNeverScheduledCardSent("conv-1", 1, now);

    expect(neverScheduledCardSlotCreateMock).toHaveBeenCalledWith({ data: { conversationId: "conv-1", step: 1, sentAt: now } });
    expect(result).toEqual({ clinicId: "clinic-1", sentAt: now });
  });

  it("clique num slot já enviado: desmarca (volta a sentAt null)", async () => {
    const sentAt = new Date();
    neverScheduledCardSlotFindUniqueMock.mockResolvedValue({ id: "slot-1", sentAt, conversation: { clinicId: "clinic-1" } });

    const result = await toggleNeverScheduledCardSent("conv-1", 1);

    expect(neverScheduledCardSlotUpdateMock).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { sentAt: null } });
    expect(result).toEqual({ clinicId: "clinic-1", sentAt: null });
  });

  it("conversa inexistente (primeiro clique): devolve null, não cria nada", async () => {
    neverScheduledCardSlotFindUniqueMock.mockResolvedValue(null);
    conversationFindUniqueMock.mockResolvedValue(null);

    const result = await toggleNeverScheduledCardSent("conv-inexistente", 1);

    expect(result).toBeNull();
    expect(neverScheduledCardSlotCreateMock).not.toHaveBeenCalled();
  });
});
