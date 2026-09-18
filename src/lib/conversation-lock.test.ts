import { describe, it, expect, vi } from "vitest";
import { withConversationLock } from "./conversation-lock";

// Controla manualmente quando cada fn() "termina" — sem isso, dar certo
// só por sorte de timing (setTimeout curto) tornaria o teste flaky.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("withConversationLock", () => {
  it("executa fn() normalmente quando não há concorrência", async () => {
    const result = await withConversationLock("a", async () => 42);
    expect(result).toBe(42);
  });

  it("serializa duas chamadas com a MESMA chave — a segunda só começa depois que a primeira termina", async () => {
    const order: string[] = [];
    const first = deferred<void>();

    const call1 = withConversationLock("mesma-chave", async () => {
      order.push("call1-start");
      await first.promise;
      order.push("call1-end");
    });

    // Dá um "tick" pra call1 realmente começar antes de disparar call2 —
    // sem isso não daria pra garantir que call1 já está "dentro" do lock.
    await Promise.resolve();

    const call2 = withConversationLock("mesma-chave", async () => {
      order.push("call2-start");
    });

    // Ainda não deveria ter começado — call1 não terminou.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["call1-start"]);

    first.resolve();
    await Promise.all([call1, call2]);

    expect(order).toEqual(["call1-start", "call1-end", "call2-start"]);
  });

  it("NÃO serializa chamadas com chaves DIFERENTES — podem rodar concorrentemente", async () => {
    const order: string[] = [];
    const first = deferred<void>();

    const call1 = withConversationLock("lead-a", async () => {
      order.push("a-start");
      await first.promise;
      order.push("a-end");
    });

    await Promise.resolve();

    const call2 = withConversationLock("lead-b", async () => {
      order.push("b-start");
    });

    await call2;
    // "b-start" aconteceu ANTES de "a-end" — não esperou a chave "lead-a".
    expect(order).toEqual(["a-start", "b-start"]);

    first.resolve();
    await call1;
  });

  it("uma chamada que lança erro não trava a fila pras próximas com a mesma chave", async () => {
    const call1 = withConversationLock("chave-com-erro", async () => {
      throw new Error("falha proposital");
    });
    await expect(call1).rejects.toThrow("falha proposital");

    // Se a fila tivesse travado, isso nunca resolveria.
    const call2 = await withConversationLock("chave-com-erro", async () => "ok depois do erro");
    expect(call2).toBe("ok depois do erro");
  });

  it("devolve o resultado de fn() pra cada chamador, mesmo em fila", async () => {
    const results = await Promise.all([
      withConversationLock("fila", async () => 1),
      withConversationLock("fila", async () => 2),
      withConversationLock("fila", async () => 3),
    ]);
    expect(results).toEqual([1, 2, 3]);
  });

  it("executa três chamadas concorrentes com a mesma chave estritamente em ordem de chegada", async () => {
    const order: number[] = [];
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];

    const calls = [0, 1, 2].map((i) =>
      withConversationLock("tres-chamadas", async () => {
        order.push(i);
        await gates[i]!.promise;
      })
    );

    // Libera na ordem 0, 1, 2 — se o lock estivesse quebrado, a ordem de
    // início não seguiria a ordem de chegada.
    for (const g of gates) {
      await Promise.resolve();
      g.resolve();
    }
    await Promise.all(calls);

    expect(order).toEqual([0, 1, 2]);
  });
});
