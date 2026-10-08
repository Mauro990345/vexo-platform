import { describe, it, expect } from "vitest";
import { resolveBatchTimestamps } from "@/lib/message-batch-timestamps";
import { toChatHistory } from "@/lib/chat-history";

describe("resolveBatchTimestamps", () => {
  it("timestamp inválido (ausente, NaN, ou muito fora do horário atual) cai no horário atual", () => {
    const now = () => new Date("2026-10-08T12:00:00.000Z");

    const resolved = resolveBatchTimestamps(
      [
        undefined, // ausente
        new Date(NaN), // inválido
        new Date("2020-01-01T00:00:00.000Z"), // válido, mas muito fora do horário atual (> 24h)
        new Date("2026-10-08T11:59:50.000Z"), // válido e plausível — não deve cair no fallback
      ],
      now
    );

    expect(resolved[0]!.sentAt).toEqual(now());
    expect(resolved[1]!.sentAt).toEqual(now());
    expect(resolved[2]!.sentAt).toEqual(now());
    expect(resolved[3]!.sentAt).toEqual(new Date("2026-10-08T11:59:50.000Z"));
  });

  it("ordem preservada com timestamps iguais — createdAt sai estritamente crescente na ordem de chegada", () => {
    const tied = new Date("2026-10-08T09:00:00.000Z");

    const resolved = resolveBatchTimestamps([tied, tied, tied]);

    // sentAt pode legitimamente repetir (é só informativo)
    expect(resolved.map((r) => r.sentAt.getTime())).toEqual([tied.getTime(), tied.getTime(), tied.getTime()]);

    // createdAt nunca repete, e nunca inverte a ordem de chegada
    const createdAtMs = resolved.map((r) => r.createdAt.getTime());
    expect(createdAtMs[0]).toBe(tied.getTime());
    expect(createdAtMs[1]).toBeGreaterThan(createdAtMs[0]!);
    expect(createdAtMs[2]).toBeGreaterThan(createdAtMs[1]!);
  });

  it("timestamps já crescentes e distintos não são alterados", () => {
    const t1 = new Date("2026-10-08T09:00:00.000Z");
    const t2 = new Date("2026-10-08T09:00:05.000Z");

    const resolved = resolveBatchTimestamps([t1, t2]);

    expect(resolved[0]!.createdAt).toEqual(t1);
    expect(resolved[1]!.createdAt).toEqual(t2);
  });

  it("lote de 2 mensagens com createdAt empatado chega ao modelo na ordem certa (reprodução do bug real)", () => {
    // Mesmo cenário investigado: lead manda "Bom dia" e "Nunca" no mesmo
    // lote do debounce — a Meta reporta o mesmo timestamp (resolução de
    // segundos) pras duas. Antes desta correção, createdAt saía empatado
    // (now()/CURRENT_TIMESTAMP congelado por transação no Postgres) e o
    // ORDER BY sem desempate não garantia a ordem de volta — toChatHistory
    // podia mesclar como "Nunca\nBom dia" em vez de "Bom dia\nNunca".
    const tied = new Date("2026-10-08T09:00:00.000Z");
    const resolved = resolveBatchTimestamps([tied, tied]);

    // Simula a Message já persistida (mesmos campos que toChatHistory lê) —
    // na ORDEM que a query devolveria depois do desempate por id, que é a
    // mesma ordem de chegada no webhook, já que createdAt agora é
    // estritamente crescente nessa ordem.
    const persistedRows = [
      { sender: "LEAD", content: "Bom dia", createdAt: resolved[0]!.createdAt },
      { sender: "LEAD", content: "Nunca", createdAt: resolved[1]!.createdAt },
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const turns = toChatHistory(persistedRows);

    expect(turns).toEqual([{ role: "user", content: "Bom dia\nNunca" }]);
  });
});
