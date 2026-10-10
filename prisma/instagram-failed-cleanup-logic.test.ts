import { describe, it, expect } from "vitest";
import {
  RETENTION_WINDOW_MS,
  computeCutoff,
  matchesCleanupCriteria,
  cleanupWhereClause,
  failReasonPrefix,
  groupByReason,
  countDistinctConversations,
  type FailedMessageRow,
} from "./instagram-failed-cleanup-logic";

const NOW = new Date("2026-10-12T12:00:00.000Z");

function row(overrides: Partial<FailedMessageRow> = {}): FailedMessageRow {
  return {
    id: "msg-1",
    channel: "INSTAGRAM",
    conversationId: "conv-1",
    createdAt: new Date(NOW.getTime() - 72 * 60 * 60 * 1000), // 72h atrás, fora da janela
    failReason: "Clínica sem conta do Instagram conectada.",
    ...overrides,
  };
}

describe("computeCutoff", () => {
  it("é sempre now - 48h, nunca uma data fixa", () => {
    expect(computeCutoff(NOW).getTime()).toBe(NOW.getTime() - RETENTION_WINDOW_MS);
  });
});

describe("matchesCleanupCriteria", () => {
  it("bate: INSTAGRAM, mais antiga que 48h", () => {
    expect(matchesCleanupCriteria(row(), NOW)).toBe(true);
  });

  it("NUNCA bate pra WHATSAPP, mesmo mais antiga que 48h", () => {
    expect(matchesCleanupCriteria(row({ channel: "WHATSAPP" }), NOW)).toBe(false);
  });

  it("NÃO bate numa falha do Instagram DENTRO das últimas 48h", () => {
    const within = new Date(NOW.getTime() - 10 * 60 * 60 * 1000); // 10h atrás
    expect(matchesCleanupCriteria(row({ createdAt: within }), NOW)).toBe(false);
  });

  it("NÃO bate exatamente no instante do corte (comparação estrita <)", () => {
    expect(matchesCleanupCriteria(row({ createdAt: computeCutoff(NOW) }), NOW)).toBe(false);
  });

  it("bate 1ms antes do corte", () => {
    const justBefore = new Date(computeCutoff(NOW).getTime() - 1);
    expect(matchesCleanupCriteria(row({ createdAt: justBefore }), NOW)).toBe(true);
  });

  it("o filtro não depende do failReason — bate mesmo sem motivo registrado (null)", () => {
    expect(matchesCleanupCriteria(row({ failReason: null }), NOW)).toBe(true);
  });
});

describe("cleanupWhereClause", () => {
  it("monta um WHERE do Prisma com os mesmos critérios de matchesCleanupCriteria, sem filtro de failReason", () => {
    const where = cleanupWhereClause(NOW);
    expect(where).toEqual({
      status: "FAILED",
      channel: "INSTAGRAM",
      createdAt: { lt: computeCutoff(NOW) },
    });
  });
});

describe("failReasonPrefix", () => {
  it("corta na primeira quebra de linha", () => {
    expect(failReasonPrefix("erro: algo deu errado\nat foo.js:10")).toBe("erro: algo deu errado");
  });

  it("sem failReason: devolve um rótulo fixo", () => {
    expect(failReasonPrefix(null)).toBe("(sem motivo registrado)");
  });
});

describe("groupByReason", () => {
  it("agrupa por motivo, com total, oldest/newest e divisão dentro/fora da janela de retenção", () => {
    const outsideA = new Date(NOW.getTime() - 72 * 60 * 60 * 1000); // fora (mais antiga)
    const outsideB = new Date(NOW.getTime() - 50 * 60 * 60 * 1000); // fora (mais nova das de fora)
    const inside = new Date(NOW.getTime() - 5 * 60 * 60 * 1000); // dentro das 48h

    const rows = [
      row({ id: "a", failReason: "motivo X", createdAt: outsideA }),
      row({ id: "b", failReason: "motivo X", createdAt: outsideB }),
      row({ id: "c", failReason: "motivo X", createdAt: inside }),
      row({ id: "d", failReason: "motivo Y", createdAt: outsideA }),
    ];

    const groups = groupByReason(rows, NOW);

    const groupX = groups.find((g) => g.reason === "motivo X")!;
    expect(groupX.total).toBe(3);
    expect(groupX.oldest).toEqual(outsideA);
    expect(groupX.newest).toEqual(inside);
    expect(groupX.withinRetentionWindow).toBe(1);
    expect(groupX.olderThanRetentionWindow).toBe(2);

    const groupY = groups.find((g) => g.reason === "motivo Y")!;
    expect(groupY.total).toBe(1);
    expect(groupY.withinRetentionWindow).toBe(0);
    expect(groupY.olderThanRetentionWindow).toBe(1);
  });

  it("vem ordenado do grupo maior pro menor", () => {
    const rows = [
      row({ id: "a", failReason: "raro" }),
      row({ id: "b", failReason: "comum" }),
      row({ id: "c", failReason: "comum" }),
      row({ id: "d", failReason: "comum" }),
    ];
    const groups = groupByReason(rows, NOW);
    expect(groups[0]!.reason).toBe("comum");
    expect(groups[0]!.total).toBe(3);
    expect(groups[1]!.reason).toBe("raro");
  });

  it("lista vazia: devolve array vazio, sem lançar", () => {
    expect(groupByReason([], NOW)).toEqual([]);
  });
});

describe("countDistinctConversations", () => {
  it("conta conversas únicas, não linhas", () => {
    const rows = [
      row({ id: "a", conversationId: "conv-1" }),
      row({ id: "b", conversationId: "conv-1" }),
      row({ id: "c", conversationId: "conv-2" }),
    ];
    expect(countDistinctConversations(rows)).toBe(2);
  });

  it("lista vazia: devolve 0", () => {
    expect(countDistinctConversations([])).toBe(0);
  });
});
