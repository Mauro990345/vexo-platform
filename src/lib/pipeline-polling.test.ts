import { describe, it, expect } from "vitest";
import { shouldPoll, snapshotsEqual, isInteracting, resolvePipelineUpdate, type PipelineSnapshot } from "./pipeline-polling";

function makeSnapshot(overrides: Partial<PipelineSnapshot> = {}): PipelineSnapshot {
  return {
    conversations: [
      {
        id: "conv-1",
        status: "NEW",
        lastMessageAt: "2026-01-01T10:00:00.000Z",
        lead: { name: "Maria", igUsername: "maria.ig", profilePictureUrl: null },
        appointmentScheduledAt: null,
      },
    ],
    metrics: { newContacts: 1, responded: 0, scheduled: 0, completed: 0, noShow: 0 },
    ...overrides,
  };
}

describe("shouldPoll (reaproveitado de conversation-polling, mesma técnica)", () => {
  it("nunca dispara com a aba escondida", () => {
    expect(shouldPoll("hidden", false)).toBe(false);
  });

  it("nunca dispara com uma busca já em voo", () => {
    expect(shouldPoll("visible", true)).toBe(false);
  });

  it("dispara com a aba visível e sem busca em voo", () => {
    expect(shouldPoll("visible", false)).toBe(true);
  });
});

describe("snapshotsEqual", () => {
  it("retratos idênticos: true", () => {
    expect(snapshotsEqual(makeSnapshot(), makeSnapshot())).toBe(true);
  });

  it("card mudou de coluna (status): false", () => {
    const a = makeSnapshot();
    const b = makeSnapshot({ conversations: [{ ...a.conversations[0]!, status: "IN_CONVERSATION" }] });
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it("card novo (lista cresceu): false", () => {
    const a = makeSnapshot();
    const b = makeSnapshot({
      conversations: [
        ...a.conversations,
        { id: "conv-2", status: "NEW", lastMessageAt: null, lead: { name: "Novo Lead", igUsername: null, profilePictureUrl: null }, appointmentScheduledAt: null },
      ],
    });
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it("contador mudou: false", () => {
    const a = makeSnapshot();
    const b = makeSnapshot({ metrics: { ...a.metrics, newContacts: 2 } });
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it("última mensagem/horário mudou: false", () => {
    const a = makeSnapshot();
    const b = makeSnapshot({ conversations: [{ ...a.conversations[0]!, lastMessageAt: "2026-01-01T11:00:00.000Z" }] });
    expect(snapshotsEqual(a, b)).toBe(false);
  });
});

describe("isInteracting", () => {
  it("botão do mouse apertado: true (ex: arrastando a rolagem horizontal)", () => {
    expect(isInteracting(true, "None")).toBe(true);
  });

  it("texto selecionado (Range): true (ex: copiando o nome de um lead)", () => {
    expect(isInteracting(false, "Range")).toBe(true);
  });

  it("sem botão apertado e sem seleção (None/Caret): false", () => {
    expect(isInteracting(false, "None")).toBe(false);
    expect(isInteracting(false, "Caret")).toBe(false);
  });
});

describe("resolvePipelineUpdate", () => {
  it("retrato igual ao atual: não aplica nada (evita re-renderizar à toa)", () => {
    const current = makeSnapshot();
    const incoming = makeSnapshot();
    expect(resolvePipelineUpdate(current, incoming, false)).toEqual({ apply: false, pending: null });
  });

  it("retrato diferente, sem interação em andamento: aplica na hora", () => {
    const current = makeSnapshot();
    const incoming = makeSnapshot({ metrics: { ...current.metrics, newContacts: 2 } });
    expect(resolvePipelineUpdate(current, incoming, false)).toEqual({ apply: true, pending: null });
  });

  it("retrato diferente, COM interação em andamento: não aplica agora, guarda pra depois", () => {
    const current = makeSnapshot();
    const incoming = makeSnapshot({ metrics: { ...current.metrics, newContacts: 2 } });
    expect(resolvePipelineUpdate(current, incoming, true)).toEqual({ apply: false, pending: incoming });
  });
});
