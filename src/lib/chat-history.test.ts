import { describe, it, expect } from "vitest";
import { toChatHistory, toLabeledChatHistory } from "./chat-history";

describe("toChatHistory", () => {
  it("converte mensagens alternadas normalmente, sem juntar nada", () => {
    const turns = toChatHistory([
      { sender: "LEAD", content: "Oi" },
      { sender: "AI", content: "Oi! Como posso ajudar?" },
      { sender: "LEAD", content: "Queria agendar" },
    ]);
    expect(turns).toEqual([
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Oi! Como posso ajudar?" },
      { role: "user", content: "Queria agendar" },
    ]);
  });

  it("junta mensagens consecutivas do LEAD num único turno — caso do debounce de mensagens rápidas", () => {
    const turns = toChatHistory([
      { sender: "LEAD", content: "Oi" },
      { sender: "LEAD", content: "Ainda não pensei nisso" },
    ]);
    expect(turns).toEqual([{ role: "user", content: "Oi\nAinda não pensei nisso" }]);
  });

  it("junta mais de duas mensagens consecutivas do mesmo papel, na ordem", () => {
    const turns = toChatHistory([
      { sender: "LEAD", content: "Oi" },
      { sender: "LEAD", content: "tudo bem?" },
      { sender: "LEAD", content: "queria saber sobre o botox" },
    ]);
    expect(turns).toEqual([{ role: "user", content: "Oi\ntudo bem?\nqueria saber sobre o botox" }]);
  });

  it("trata AI e HUMAN como o mesmo papel (assistant) pra fins de junção", () => {
    const turns = toChatHistory([
      { sender: "AI", content: "Temos 9h ou 10h" },
      { sender: "HUMAN", content: "(operador assumiu) Posso te ajudar melhor por aqui" },
    ]);
    expect(turns).toEqual([{ role: "assistant", content: "Temos 9h ou 10h\n(operador assumiu) Posso te ajudar melhor por aqui" }]);
  });

  it("ignora mensagens SYSTEM sem quebrar a junção ao redor delas", () => {
    const turns = toChatHistory([
      { sender: "LEAD", content: "Oi" },
      { sender: "SYSTEM", content: "[vídeo de confirmação]" },
      { sender: "LEAD", content: "recebi o vídeo" },
    ]);
    // SYSTEM não vira turno — as duas mensagens do LEAD ficam adjacentes
    // no resultado e, por isso, se juntam num turno só (comportamento
    // correto: da perspectiva do modelo, são consecutivas mesmo).
    expect(turns).toEqual([{ role: "user", content: "Oi\nrecebi o vídeo" }]);
  });

  it("devolve lista vazia pra histórico vazio", () => {
    expect(toChatHistory([])).toEqual([]);
  });
});

// Bug real reportado (lead "Leonardo da Silva"): a IA respondeu a um lead
// que retornava depois de uma sequência de follow-up como se fosse o
// primeiro contato — o histórico cru (toChatHistory, acima) não dava
// nenhuma pista de autor/tempo pro modelo distinguir isso. Esta variante
// rotula cada mensagem; os testes abaixo cobrem exatamente essa distinção.
describe("toLabeledChatHistory", () => {
  it("rotula cada mensagem com autor e data/hora em Brasília, sem alterar o texto original", () => {
    const turns = toLabeledChatHistory([
      { sender: "LEAD", content: "Percebo rugas, queria saber sobre botox", createdAt: new Date("2026-10-14T12:00:00Z") },
      { sender: "AI", content: "Claro! Podemos agendar uma avaliação.", createdAt: new Date("2026-10-14T12:05:00Z") },
    ]);
    expect(turns).toEqual([
      { role: "user", content: "[14/10/2026 09:00 — Lead] Percebo rugas, queria saber sobre botox" },
      { role: "assistant", content: "[14/10/2026 09:05 — IA] Claro! Podemos agendar uma avaliação." },
    ]);
  });

  it('rotula mensagem AI marcada isFollowUp como "Follow-up automático", não "IA"', () => {
    const turns = toLabeledChatHistory([
      {
        sender: "AI",
        content: "Essa é a última vez que vou te escrever sobre isso :)",
        createdAt: new Date("2026-10-20T12:00:00Z"),
        isFollowUp: true,
      },
    ]);
    expect(turns).toEqual([
      { role: "assistant", content: "[20/10/2026 09:00 — Follow-up automático] Essa é a última vez que vou te escrever sobre isso :)" },
    ]);
  });

  it("rotula HUMAN como Atendente humano (papel assistant, igual AI)", () => {
    const turns = toLabeledChatHistory([
      { sender: "HUMAN", content: "Posso te ajudar por aqui", createdAt: new Date("2026-10-14T12:00:00Z") },
    ]);
    expect(turns[0]!.role).toBe("assistant");
    expect(turns[0]!.content).toContain("Atendente humano");
  });

  it("junta mensagens consecutivas do mesmo papel em linhas separadas, cada uma com seu próprio rótulo", () => {
    const turns = toLabeledChatHistory([
      { sender: "LEAD", content: "Oi", createdAt: new Date("2026-10-14T12:00:00Z") },
      { sender: "LEAD", content: "tudo bem?", createdAt: new Date("2026-10-14T12:00:05Z") },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.content).toBe(
      "[14/10/2026 09:00 — Lead] Oi\n[14/10/2026 09:00 — Lead] tudo bem?"
    );
  });

  it("ignora mensagens SYSTEM, igual toChatHistory", () => {
    const turns = toLabeledChatHistory([
      { sender: "LEAD", content: "Oi", createdAt: new Date("2026-10-14T12:00:00Z") },
      { sender: "SYSTEM", content: "[vídeo]", createdAt: new Date("2026-10-14T12:01:00Z") },
      { sender: "LEAD", content: "recebi o vídeo", createdAt: new Date("2026-10-14T12:02:00Z") },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.role).toBe("user");
  });

  it("devolve lista vazia pra histórico vazio", () => {
    expect(toLabeledChatHistory([])).toEqual([]);
  });
});
