import { describe, it, expect } from "vitest";
import { shouldPoll, nextPollCursor, dedupeIncomingMessages, isNearBottom } from "./conversation-polling";

describe("shouldPoll", () => {
  it("busca quando a aba está visível e não há busca em voo", () => {
    expect(shouldPoll("visible", false)).toBe(true);
  });

  it("pausa com a aba escondida, mesmo sem busca em voo", () => {
    expect(shouldPoll("hidden", false)).toBe(false);
  });

  it("nunca deixa duas buscas em paralelo, mesmo com a aba visível", () => {
    expect(shouldPoll("visible", true)).toBe(false);
  });

  it("aba escondida e busca em voo ao mesmo tempo também pausa", () => {
    expect(shouldPoll("hidden", true)).toBe(false);
  });
});

describe("nextPollCursor", () => {
  it("sem mensagem nenhuma, usa um cursor que qualquer mensagem real passa", () => {
    const cursor = nextPollCursor([]);
    expect(cursor.afterVisibleAt).toBe(new Date(0).toISOString());
    expect(cursor.afterId).toBe("");
  });

  it("usa visibleAt/id da ÚLTIMA mensagem, não da primeira", () => {
    const cursor = nextPollCursor([
      { id: "a", visibleAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", visibleAt: "2026-01-02T00:00:00.000Z" },
    ]);
    expect(cursor).toEqual({ afterVisibleAt: "2026-01-02T00:00:00.000Z", afterId: "b" });
  });
});

describe("dedupeIncomingMessages", () => {
  it("remove da resposta tudo que já existe localmente", () => {
    const current = [{ id: "a" }, { id: "b" }];
    const incoming = [{ id: "b" }, { id: "c" }];
    expect(dedupeIncomingMessages(current, incoming)).toEqual([{ id: "c" }]);
  });

  it("sem sobreposição, devolve tudo", () => {
    const current = [{ id: "a" }];
    const incoming = [{ id: "b" }, { id: "c" }];
    expect(dedupeIncomingMessages(current, incoming)).toEqual([{ id: "b" }, { id: "c" }]);
  });

  it("tudo duplicado, devolve lista vazia", () => {
    const current = [{ id: "a" }];
    const incoming = [{ id: "a" }];
    expect(dedupeIncomingMessages(current, incoming)).toEqual([]);
  });
});

describe("isNearBottom", () => {
  it("true quando scrollY + innerHeight alcança o fim dentro da margem", () => {
    // scrollHeight=1000, innerHeight=800, scrollY=180 -> 980, margem 64 -> dentro
    expect(isNearBottom(180, 800, 1000, 64)).toBe(true);
  });

  it("false quando ainda falta mais que a margem pro fim (lendo mensagens antigas)", () => {
    // scrollHeight=2000, innerHeight=800, scrollY=0 -> 800, bem longe de 2000-64
    expect(isNearBottom(0, 800, 2000, 64)).toBe(false);
  });

  it("exatamente na margem conta como perto do fim", () => {
    expect(isNearBottom(136, 800, 1000, 64)).toBe(true);
  });
});
