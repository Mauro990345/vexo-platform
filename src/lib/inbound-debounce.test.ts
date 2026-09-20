import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bufferForDebounce, pendingDebounceCount } from "./inbound-debounce";

describe("bufferForDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispara o callback com o item único depois da janela, se nada mais chegar", () => {
    const onFlush = vi.fn();
    bufferForDebounce("lead-a", "oi", onFlush, 6_000);

    vi.advanceTimersByTime(5_999);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledOnce();
    expect(onFlush).toHaveBeenCalledWith(["oi"]);
  });

  it("agrupa itens que chegam DENTRO da janela numa única chamada, em ordem", () => {
    const onFlush = vi.fn();
    bufferForDebounce("lead-a", "oi", onFlush, 6_000);

    vi.advanceTimersByTime(3_000);
    bufferForDebounce("lead-a", "ainda não pensei nisso", onFlush, 6_000);

    // A segunda mensagem REINICIA a janela — 6s depois da PRIMEIRA
    // mensagem (9s no total) ainda não deveria ter disparado.
    vi.advanceTimersByTime(6_000 - 1);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledOnce();
    expect(onFlush).toHaveBeenCalledWith(["oi", "ainda não pensei nisso"]);
  });

  it("mantém lotes de chaves DIFERENTES totalmente independentes", () => {
    const onFlushA = vi.fn();
    const onFlushB = vi.fn();
    bufferForDebounce("lead-a", "msg-a", onFlushA, 6_000);
    bufferForDebounce("lead-b", "msg-b", onFlushB, 6_000);

    vi.advanceTimersByTime(6_000);
    expect(onFlushA).toHaveBeenCalledOnce();
    expect(onFlushA).toHaveBeenCalledWith(["msg-a"]);
    expect(onFlushB).toHaveBeenCalledOnce();
    expect(onFlushB).toHaveBeenCalledWith(["msg-b"]);
  });

  it("libera a chave depois do flush — não fica preso no Map pra sempre", () => {
    const onFlush = vi.fn();
    bufferForDebounce("lead-a", "oi", onFlush, 6_000);
    expect(pendingDebounceCount()).toBe(1);

    vi.advanceTimersByTime(6_000);
    expect(pendingDebounceCount()).toBe(0);
  });

  it("uma terceira mensagem bem depois do flush começa um lote NOVO, não reaproveita o antigo", () => {
    const onFlush = vi.fn();
    bufferForDebounce("lead-a", "primeiro lote", onFlush, 6_000);
    vi.advanceTimersByTime(6_000);
    expect(onFlush).toHaveBeenCalledOnce();
    expect(onFlush).toHaveBeenCalledWith(["primeiro lote"]);

    bufferForDebounce("lead-a", "segundo lote", onFlush, 6_000);
    vi.advanceTimersByTime(6_000);
    expect(onFlush).toHaveBeenCalledTimes(2);
    expect(onFlush).toHaveBeenNthCalledWith(2, ["segundo lote"]);
  });
});
