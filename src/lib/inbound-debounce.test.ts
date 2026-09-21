import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bufferForDebounce, pendingDebounceCount, MAX_DEBOUNCE_TOTAL_WAIT_MS } from "./inbound-debounce";

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

  it("bug real: um lead 'verborrágico' mandando mensagens curtas antes da janela terminar nunca deixava o lote disparar — agora um teto força o flush", () => {
    const onFlush = vi.fn();
    bufferForDebounce("lead-a", "msg-1", onFlush, 6_000);

    // Cada nova mensagem chega ANTES da janela de 6s da anterior terminar
    // (reiniciando o timer sempre) — sem o teto, isso nunca deixaria a
    // janela completar, e o lote nunca dispararia.
    for (let i = 2; i <= 5; i++) {
      vi.advanceTimersByTime(4_000);
      bufferForDebounce("lead-a", `msg-${i}`, onFlush, 6_000);
      expect(onFlush).not.toHaveBeenCalled();
    }

    // 4 mensagens x 4s = 16s desde a primeira — ainda dentro do teto de
    // 20s, mas o PRÓXIMO reset (mais 6s de janela normal) ultrapassaria.
    // O teto força o flush aos 20s desde a primeira mensagem, não aos
    // 6s desde a última.
    vi.advanceTimersByTime(MAX_DEBOUNCE_TOTAL_WAIT_MS - 16_000);
    expect(onFlush).toHaveBeenCalledOnce();
    expect(onFlush).toHaveBeenCalledWith(["msg-1", "msg-2", "msg-3", "msg-4", "msg-5"]);
  });

  it("dentro do teto total, o comportamento de reiniciar a janela continua idêntico (sem regressão pro caso comum)", () => {
    const onFlush = vi.fn();
    bufferForDebounce("lead-a", "oi", onFlush, 6_000);

    vi.advanceTimersByTime(3_000);
    bufferForDebounce("lead-a", "ainda não pensei nisso", onFlush, 6_000);

    vi.advanceTimersByTime(6_000 - 1);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledOnce();
    expect(onFlush).toHaveBeenCalledWith(["oi", "ainda não pensei nisso"]);
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
