import { describe, it, expect, vi } from "vitest";
import { buildConversationContext, withOlderSummary, HISTORY_WINDOW_SIZE } from "@/lib/conversation-context";

// Gera N mensagens alternando LEAD/AI, no formato mínimo que
// buildConversationContext espera (o mesmo shape de Message no banco,
// só os dois campos que toChatHistory de fato lê).
function makeMessages(count: number): { sender: string; content: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    sender: i % 2 === 0 ? "LEAD" : "AI",
    content: `mensagem ${i + 1}`,
  }));
}

describe("buildConversationContext", () => {
  it("conversa curta (menor que a janela): não resume, manda tudo", async () => {
    const messages = makeMessages(6);
    const summarize = vi.fn().mockResolvedValue("não deveria ser chamado");

    const context = await buildConversationContext(messages, summarize);

    expect(context.olderSummary).toBeNull();
    expect(context.recentHistory).toHaveLength(6);
    expect(context.recentHistory[0]).toEqual({ role: "user", content: "mensagem 1" });
    expect(context.recentHistory[5]).toEqual({ role: "assistant", content: "mensagem 6" });
    expect(summarize).not.toHaveBeenCalled();
  });

  it("conversa do tamanho exato da janela: ainda não resume (limite é <=, não <)", async () => {
    const messages = makeMessages(HISTORY_WINDOW_SIZE);
    const summarize = vi.fn().mockResolvedValue("não deveria ser chamado");

    const context = await buildConversationContext(messages, summarize);

    expect(context.olderSummary).toBeNull();
    expect(context.recentHistory).toHaveLength(HISTORY_WINDOW_SIZE);
    expect(summarize).not.toHaveBeenCalled();
  });

  it("conversa longa (maior que a janela): resume só o que ficou de fora", async () => {
    const totalTurns = HISTORY_WINDOW_SIZE + 10; // 10 turnos vão pro resumo
    const messages = makeMessages(totalTurns);
    const summarize = vi.fn().mockResolvedValue("resumo gerado pela IA");

    const context = await buildConversationContext(messages, summarize);

    expect(context.olderSummary).toBe("resumo gerado pela IA");
    expect(context.recentHistory).toHaveLength(HISTORY_WINDOW_SIZE);
    // As 20 mais recentes são exatamente as últimas 20 mensagens (11..30).
    expect(context.recentHistory[0]).toEqual({ role: "user", content: "mensagem 11" });
    expect(context.recentHistory[HISTORY_WINDOW_SIZE - 1]).toEqual({
      role: "assistant",
      content: `mensagem ${totalTurns}`,
    });

    // O resumo recebeu exatamente os 10 turnos mais antigos, na ordem certa
    // — nem um a mais (não deveria incluir nada da janela recente), nem um
    // a menos.
    expect(summarize).toHaveBeenCalledTimes(1);
    const olderTurnsArg = summarize.mock.calls.at(0)?.[0];
    expect(olderTurnsArg).toHaveLength(10);
    expect(olderTurnsArg?.[0]).toEqual({ role: "user", content: "mensagem 1" });
    expect(olderTurnsArg?.[9]).toEqual({ role: "assistant", content: "mensagem 10" });
  });

  it("um turno só além da janela: resume exatamente esse único turno mais antigo", async () => {
    const totalTurns = HISTORY_WINDOW_SIZE + 1;
    const messages = makeMessages(totalTurns);
    const summarize = vi.fn().mockResolvedValue("resumo de um turno só");

    const context = await buildConversationContext(messages, summarize);

    expect(context.olderSummary).toBe("resumo de um turno só");
    expect(context.recentHistory).toHaveLength(HISTORY_WINDOW_SIZE);
    expect(summarize).toHaveBeenCalledWith([{ role: "user", content: "mensagem 1" }]);
  });

  it("ignora mensagens SYSTEM ao contar a janela (elas nunca viram turno)", async () => {
    const messages = [
      ...makeMessages(6),
      { sender: "SYSTEM", content: "[vídeo de confirmação]" },
      { sender: "SYSTEM", content: "[nota do sistema]" },
    ];
    const summarize = vi.fn();

    const context = await buildConversationContext(messages, summarize);

    // As duas mensagens SYSTEM não contam como turno — ainda é uma
    // conversa "curta" (6 turnos reais), sem resumo.
    expect(context.recentHistory).toHaveLength(6);
    expect(context.olderSummary).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
  });
});

describe("withOlderSummary", () => {
  it("sem resumo: retorna o histórico recente sem mexer em nada", () => {
    const recentHistory = [
      { role: "user" as const, content: "oi" },
      { role: "assistant" as const, content: "olá!" },
    ];

    const result = withOlderSummary({ recentHistory, olderSummary: null });

    expect(result).toBe(recentHistory);
  });

  it("com resumo: prepende um turno 'user' com o resumo, deixando claro que não é o lead", () => {
    const recentHistory = [
      { role: "assistant" as const, content: "primeira mensagem da janela é da IA" },
      { role: "user" as const, content: "resposta do lead" },
    ];

    const result = withOlderSummary({ recentHistory, olderSummary: "lead já perguntou sobre botox" });

    expect(result).toHaveLength(3);
    const [summaryTurn, ...rest] = result;
    expect(summaryTurn?.role).toBe("user");
    expect(summaryTurn?.content).toContain("lead já perguntou sobre botox");
    expect(summaryTurn?.content).toContain("NÃO é uma mensagem do lead");
    // O restante do array continua exatamente igual, na mesma ordem —
    // inclusive quando o turno mais antigo da janela é da IA (o array só
    // fica com role "user" primeiro por causa do resumo prepended, nunca
    // porque a janela em si foi reordenada).
    expect(rest).toEqual(recentHistory);
  });
});
