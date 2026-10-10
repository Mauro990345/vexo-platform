import { describe, it, expect } from "vitest";
import { failReasonPrefix, breakdownByChannelAndReason, type FailedMessageRow } from "./all-failed-messages-cleanup-logic";

function row(overrides: Partial<FailedMessageRow> = {}): FailedMessageRow {
  return { id: "msg-1", channel: "INSTAGRAM", failReason: "erro genérico", ...overrides };
}

describe("failReasonPrefix", () => {
  it("corta na primeira quebra de linha", () => {
    expect(failReasonPrefix("erro: algo deu errado\nat foo.js:10")).toBe("erro: algo deu errado");
  });

  it("corta em 100 caracteres quando a primeira linha é mais longa", () => {
    const result = failReasonPrefix("x".repeat(150));
    expect(result.length).toBe(101);
    expect(result.endsWith("…")).toBe(true);
  });

  it("sem failReason: devolve um rótulo fixo, nunca string vazia", () => {
    expect(failReasonPrefix(null)).toBe("(sem motivo registrado)");
  });
});

describe("breakdownByChannelAndReason", () => {
  it("agrupa por canal e por canal+motivo, com contagens certas", () => {
    const rows = [
      row({ id: "a", channel: "WHATSAPP", failReason: "erro X" }),
      row({ id: "b", channel: "WHATSAPP", failReason: "erro X" }),
      row({ id: "c", channel: "INSTAGRAM", failReason: "erro Y" }),
      row({ id: "d", channel: "INSTAGRAM", failReason: null }),
    ];

    const result = breakdownByChannelAndReason(rows);

    expect(result.total).toBe(4);
    expect(result.byChannel.get("WHATSAPP")).toBe(2);
    expect(result.byChannel.get("INSTAGRAM")).toBe(2);
    expect(result.byChannelAndReason.get("[WHATSAPP] erro X")).toBe(2);
    expect(result.byChannelAndReason.get("[INSTAGRAM] erro Y")).toBe(1);
    expect(result.byChannelAndReason.get("[INSTAGRAM] (sem motivo registrado)")).toBe(1);
  });

  it("lista vazia: total 0, mapas vazios, sem lançar", () => {
    const result = breakdownByChannelAndReason([]);
    expect(result.total).toBe(0);
    expect(result.byChannel.size).toBe(0);
    expect(result.byChannelAndReason.size).toBe(0);
  });
});
