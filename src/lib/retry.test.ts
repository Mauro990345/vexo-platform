import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, RetryableError } from "./retry";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna direto no sucesso da primeira tentativa, sem nenhum delay", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { label: "teste" });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("tenta de novo com backoff exponencial num erro retryable, e devolve o resultado quando uma tentativa seguinte funciona", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RetryableError("rate limit"))
      .mockRejectedValueOnce(new RetryableError("rate limit de novo"))
      .mockResolvedValueOnce("ok na 3ª");

    const promise = withRetry(fn, { label: "teste", maxAttempts: 3, baseDelayMs: 500 });

    // 1ª tentativa falha na hora (síncrono até o catch) — ainda não deveria
    // ter feito a 2ª tentativa antes do delay de 500ms passar.
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(fn).toHaveBeenCalledTimes(2);

    // Backoff exponencial: 2º delay é o dobro do 1º (1000ms, não 500ms de novo).
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    expect(await promise).toBe("ok na 3ª");
  });

  it("esgota maxAttempts e lança o último erro retryable, sem tentar de novo depois disso", async () => {
    const fn = vi.fn().mockRejectedValue(new RetryableError("sempre falha"));

    const promise = withRetry(fn, { label: "teste", maxAttempts: 3, baseDelayMs: 10 });
    const assertion = expect(promise).rejects.toThrow("sempre falha");

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);

    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("erro de rede (TypeError, como o que fetch() lança em falha de conexão) é retryable automaticamente", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { label: "teste", maxAttempts: 3, baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(10);

    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("erro NÃO retryable (Error comum) falha na primeira tentativa, sem nenhum retry", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("token inválido — erro permanente"));

    await expect(withRetry(fn, { label: "teste", maxAttempts: 3 })).rejects.toThrow("token inválido");
    expect(fn).toHaveBeenCalledOnce();
  });
});
