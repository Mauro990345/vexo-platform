import { describe, it, expect } from "vitest";
import { toChatHistory } from "./chat-history";

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
