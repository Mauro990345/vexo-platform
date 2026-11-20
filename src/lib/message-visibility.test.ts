import { describe, it, expect } from "vitest";
import {
  isMessageVisible,
  messageVisibleAt,
  compareByVisibleAt,
  isAfterVisibleCursor,
  selectMessagesAfterCursor,
} from "./message-visibility";

describe("isMessageVisible", () => {
  it("PENDING e SENDING nunca são visíveis", () => {
    expect(isMessageVisible("PENDING")).toBe(false);
    expect(isMessageVisible("SENDING")).toBe(false);
  });

  it("SENT e FAILED são visíveis", () => {
    expect(isMessageVisible("SENT")).toBe(true);
    expect(isMessageVisible("FAILED")).toBe(true);
  });
});

describe("messageVisibleAt", () => {
  const createdAt = new Date("2026-01-01T10:00:00.000Z");
  const updatedAt = new Date("2026-01-01T10:05:00.000Z");

  it("entrada (INBOUND): sempre createdAt, mesmo com sentAt diferente", () => {
    const sentAt = new Date("2026-01-01T09:59:00.000Z");
    expect(messageVisibleAt({ direction: "INBOUND", sentAt, createdAt, updatedAt })).toEqual(createdAt);
  });

  it("saída (OUTBOUND) SENT: usa sentAt, não createdAt (resposta criada PENDING minutos antes)", () => {
    const sentAt = new Date("2026-01-01T10:04:30.000Z");
    expect(messageVisibleAt({ direction: "OUTBOUND", sentAt, createdAt, updatedAt })).toEqual(sentAt);
  });

  it("saída (OUTBOUND) que FALHOU (sentAt nulo): usa updatedAt — o instante da própria falha, não createdAt", () => {
    expect(messageVisibleAt({ direction: "OUTBOUND", sentAt: null, createdAt, updatedAt })).toEqual(updatedAt);
  });
});

describe("compareByVisibleAt", () => {
  it("ordena por visibleAt crescente", () => {
    const a = { id: "a", visibleAt: new Date("2026-01-01T10:00:00.000Z") };
    const b = { id: "b", visibleAt: new Date("2026-01-01T10:01:00.000Z") };
    expect([b, a].sort(compareByVisibleAt)).toEqual([a, b]);
  });

  it("empate em visibleAt: desempata por id crescente", () => {
    const sameTime = new Date("2026-01-01T10:00:00.000Z");
    const a = { id: "aaa", visibleAt: sameTime };
    const b = { id: "bbb", visibleAt: sameTime };
    expect([b, a].sort(compareByVisibleAt)).toEqual([a, b]);
  });
});

describe("isAfterVisibleCursor", () => {
  const cursorAt = new Date("2026-01-01T10:00:00.000Z");

  it("visibleAt depois do cursor: true", () => {
    expect(isAfterVisibleCursor({ id: "x", visibleAt: new Date("2026-01-01T10:00:01.000Z") }, cursorAt, "qualquer")).toBe(true);
  });

  it("visibleAt antes do cursor: false", () => {
    expect(isAfterVisibleCursor({ id: "x", visibleAt: new Date("2026-01-01T09:59:59.000Z") }, cursorAt, "qualquer")).toBe(false);
  });

  it("visibleAt igual ao cursor, id maior: true (desempate)", () => {
    expect(isAfterVisibleCursor({ id: "zzz", visibleAt: cursorAt }, cursorAt, "aaa")).toBe(true);
  });

  it("visibleAt igual ao cursor, id menor ou igual: false", () => {
    expect(isAfterVisibleCursor({ id: "aaa", visibleAt: cursorAt }, cursorAt, "zzz")).toBe(false);
    expect(isAfterVisibleCursor({ id: "aaa", visibleAt: cursorAt }, cursorAt, "aaa")).toBe(false);
  });
});

// O bug real que esta mudança resolve: uma mensagem de SAÍDA criada em T0
// (escondida, PENDING), o LEAD manda outra mensagem em T0+2s (o cursor da
// tela avança pra T0+2s), e só em T0+10s a resposta da IA sai de verdade
// (SENT, sentAt=T0+10s). Mesmo com createdAt=T0 (antes do cursor atual),
// ela precisa aparecer no próximo polling — é exatamente isso que
// selectMessagesAfterCursor (usando visibleAt=sentAt, não createdAt)
// garante.
describe("selectMessagesAfterCursor — caso do cursor (mensagem criada ANTES do cursor, visível DEPOIS)", () => {
  it("mensagem de saída com createdAt anterior ao cursor, mas sentAt posterior: aparece", () => {
    const t0 = new Date("2026-01-01T10:00:00.000Z");
    const cursorAt = new Date(t0.getTime() + 2_000); // cursor avançou com a mensagem do lead em T0+2s
    const sentAt = new Date(t0.getTime() + 10_000); // só saiu de verdade em T0+10s

    const aiReply = { id: "msg-ai", visibleAt: sentAt };
    const result = selectMessagesAfterCursor([aiReply], cursorAt, "cursor-id");

    expect(result).toEqual([aiReply]);
  });

  it("filtra o que já foi visto e ordena o resto por visibleAt", () => {
    const cursorAt = new Date("2026-01-01T10:00:00.000Z");
    const old = { id: "old", visibleAt: new Date("2026-01-01T09:59:00.000Z") }; // antes do cursor, fora
    const second = { id: "second", visibleAt: new Date("2026-01-01T10:02:00.000Z") };
    const first = { id: "first", visibleAt: new Date("2026-01-01T10:01:00.000Z") };

    const result = selectMessagesAfterCursor([old, second, first], cursorAt, "cursor-id");
    expect(result).toEqual([first, second]);
  });
});
