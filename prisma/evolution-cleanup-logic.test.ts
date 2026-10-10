import { describe, it, expect } from "vitest";
import {
  CORRECTION_CUTOFF_UTC,
  failReasonPrefix,
  matchesCleanupCriteria,
  cleanupWhereClause,
  breakdownByChannelAndReason,
  type FailedMessageRow,
} from "./evolution-cleanup-logic";

function row(overrides: Partial<FailedMessageRow> = {}): FailedMessageRow {
  return {
    id: "msg-1",
    channel: "WHATSAPP",
    createdAt: new Date("2026-10-09T20:00:00.000Z"), // antes do corte
    failReason:
      'Falha ao enviar WhatsApp via Evolution API (404): {"message":"The \\"main\\" instance does not exist"}\nat ...',
    ...overrides,
  };
}

describe("matchesCleanupCriteria", () => {
  it("bate: WHATSAPP, antes do corte, Evolution API + instance does not exist", () => {
    expect(matchesCleanupCriteria(row())).toBe(true);
  });

  it("bate: WHATSAPP, antes do corte, Evolution API + Connection Closed", () => {
    expect(
      matchesCleanupCriteria(
        row({ failReason: "Falha ao enviar WhatsApp via Evolution API (500): Connection Closed" })
      )
    ).toBe(true);
  });

  it("NUNCA bate pra Instagram, mesmo com o mesmo texto de erro", () => {
    expect(matchesCleanupCriteria(row({ channel: "INSTAGRAM" }))).toBe(false);
  });

  it("NUNCA bate pra WhatsApp com outro motivo de falha (lead sem telefone)", () => {
    expect(matchesCleanupCriteria(row({ failReason: "Lead sem telefone cadastrado." }))).toBe(false);
  });

  it("NUNCA bate pra WhatsApp com outro motivo de falha (clínica sem WhatsApp conectado)", () => {
    expect(matchesCleanupCriteria(row({ failReason: "Clínica sem WhatsApp conectado." }))).toBe(false);
  });

  it("NUNCA bate se o failReason menciona Evolution API mas NÃO um dos dois motivos conhecidos", () => {
    expect(
      matchesCleanupCriteria(row({ failReason: "Falha ao enviar WhatsApp via Evolution API (429): rate limited" }))
    ).toBe(false);
  });

  it("NUNCA bate se faltar a marca 'Evolution API', mesmo mencionando 'Connection Closed'", () => {
    expect(matchesCleanupCriteria(row({ failReason: "Connection Closed em algum outro contexto" }))).toBe(false);
  });

  it("NUNCA bate sem failReason nenhum (null)", () => {
    expect(matchesCleanupCriteria(row({ failReason: null }))).toBe(false);
  });

  it("NÃO bate numa linha criada EXATAMENTE no instante do corte (comparação estrita >=)", () => {
    expect(matchesCleanupCriteria(row({ createdAt: CORRECTION_CUTOFF_UTC }))).toBe(false);
  });

  it("NÃO bate numa linha criada DEPOIS do corte, mesmo com o mesmo erro — é um problema de verdade, não da causa já corrigida", () => {
    const afterCutoff = new Date(CORRECTION_CUTOFF_UTC.getTime() + 60_000);
    expect(matchesCleanupCriteria(row({ createdAt: afterCutoff }))).toBe(false);
  });

  it("bate numa linha criada bem antes do corte", () => {
    const wayBefore = new Date(CORRECTION_CUTOFF_UTC.getTime() - 24 * 60 * 60 * 1000);
    expect(matchesCleanupCriteria(row({ createdAt: wayBefore }))).toBe(true);
  });
});

describe("cleanupWhereClause", () => {
  it("monta um WHERE do Prisma com os mesmos critérios de matchesCleanupCriteria", () => {
    const where = cleanupWhereClause();
    expect(where).toMatchObject({
      status: "FAILED",
      channel: "WHATSAPP",
      createdAt: { lt: CORRECTION_CUTOFF_UTC },
      failReason: { contains: "Evolution API" },
    });
    expect(where.OR).toEqual([
      { failReason: { contains: "instance does not exist" } },
      { failReason: { contains: "Connection Closed" } },
    ]);
  });
});

describe("failReasonPrefix", () => {
  it("corta na primeira quebra de linha, descartando a stack trace", () => {
    expect(failReasonPrefix("erro: algo deu errado\nat foo.js:10\nat bar.js:20")).toBe("erro: algo deu errado");
  });

  it("corta em 100 caracteres quando a primeira linha é mais longa que isso", () => {
    const longLine = "x".repeat(150);
    const result = failReasonPrefix(longLine);
    expect(result.length).toBe(101); // 100 chars + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("sem failReason: devolve um rótulo fixo, nunca string vazia", () => {
    expect(failReasonPrefix(null)).toBe("(sem motivo registrado)");
  });
});

describe("breakdownByChannelAndReason", () => {
  it("agrupa corretamente por canal e por canal+motivo, com contagens certas", () => {
    const rows = [
      row({ id: "a", channel: "WHATSAPP", failReason: "erro X" }),
      row({ id: "b", channel: "WHATSAPP", failReason: "erro X" }),
      row({ id: "c", channel: "INSTAGRAM", failReason: "erro Y" }),
    ];

    const result = breakdownByChannelAndReason(rows);

    expect(result.total).toBe(3);
    expect(result.byChannel.get("WHATSAPP")).toBe(2);
    expect(result.byChannel.get("INSTAGRAM")).toBe(1);
    expect(result.byChannelAndReason.get("[WHATSAPP] erro X")).toBe(2);
    expect(result.byChannelAndReason.get("[INSTAGRAM] erro Y")).toBe(1);
  });

  it("lista vazia: total 0, mapas vazios, sem lançar", () => {
    const result = breakdownByChannelAndReason([]);
    expect(result.total).toBe(0);
    expect(result.byChannel.size).toBe(0);
    expect(result.byChannelAndReason.size).toBe(0);
  });
});
