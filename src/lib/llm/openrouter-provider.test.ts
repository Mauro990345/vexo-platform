import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterProvider } from "./openrouter-provider";
import type { ToolDefinition } from "./types";

// Mesmo espírito de anthropic-provider.test.ts — testa a TRADUÇÃO entre o
// contrato neutro (LLMProvider) e o dialeto OpenAI-compatible da
// OpenRouter, mockando fetch global (nunca bate na rede).

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function chatResponse(message: Record<string, unknown>, finishReason = "stop") {
  return jsonResponse({ choices: [{ message, finish_reason: finishReason }] });
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenRouterProvider.complete", () => {
  it("chama /chat/completions com Bearer token e devolve o texto da resposta", async () => {
    fetchMock.mockResolvedValue(chatResponse({ role: "assistant", content: "classificação em JSON" }));
    const provider = new OpenRouterProvider();

    const result = await provider.complete({
      tier: "backstage",
      systemPrompt: "system prompt de classificação",
      userMessage: "transcript da conversa",
      maxTokens: 400,
    });

    expect(result.text).toBe("classificação em JSON");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls.at(0) as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer sk-or-v1-test" });

    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(400);
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt de classificação" },
      { role: "user", content: "transcript da conversa" },
    ]);
    // tier "backstage" -> mesmo default de modelo que "conversation" hoje
    // (só um modelo configurado pro teste, ver DEFAULT_MODEL) — os dois
    // são configuráveis separadamente via env var.
    expect(body.model).toBe("openai/gpt-5.6-luna");
  });

  it("lança um erro claro se a resposta não for OK", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "chave inválida" }, false, 401));
    const provider = new OpenRouterProvider();

    await expect(
      provider.complete({ tier: "backstage", systemPrompt: "s", userMessage: "u", maxTokens: 10 })
    ).rejects.toThrow(/Falha ao chamar a OpenRouter \(401\)/);
  });

  it("lança um erro claro se OPENROUTER_API_KEY não estiver configurada", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const provider = new OpenRouterProvider();

    await expect(
      provider.complete({ tier: "backstage", systemPrompt: "s", userMessage: "u", maxTokens: 10 })
    ).rejects.toThrow("OPENROUTER_API_KEY não configurada.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("devolve string vazia se a mensagem não tiver conteúdo", async () => {
    fetchMock.mockResolvedValue(chatResponse({ role: "assistant", content: null }));
    const provider = new OpenRouterProvider();

    const result = await provider.complete({ tier: "backstage", systemPrompt: "s", userMessage: "u", maxTokens: 10 });

    expect(result.text).toBe("");
  });
});

describe("OpenRouterProvider.converse", () => {
  const noopExecuteTool = vi.fn(async () => ({}));

  it("junta cacheableSystemPrompt e volatileContext num único system message", async () => {
    fetchMock.mockResolvedValue(chatResponse({ role: "assistant", content: "Oi! Como posso ajudar?" }));
    const provider = new OpenRouterProvider();

    const result = await provider.converse({
      tier: "conversation",
      cacheableSystemPrompt: "prompt da clínica",
      volatileContext: "[data atual]",
      history: [{ role: "user", content: "Oi" }],
      tools: [],
      executeTool: noopExecuteTool,
    });

    expect(result.text).toBe("Oi! Como posso ajudar?");

    const [, init] = fetchMock.mock.calls.at(0) as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([
      { role: "system", content: "prompt da clínica\n\n[data atual]" },
      { role: "user", content: "Oi" },
    ]);
  });

  it("traduz ToolDefinition pro formato de function-calling da OpenAI", async () => {
    fetchMock.mockResolvedValue(chatResponse({ role: "assistant", content: "ok" }));
    const provider = new OpenRouterProvider();

    const tools: ToolDefinition[] = [
      {
        name: "check_availability",
        description: "consulta agenda",
        inputSchema: { type: "object", properties: { dateFrom: { type: "string" } }, required: ["dateFrom"] },
      },
    ];

    await provider.converse({
      tier: "conversation",
      cacheableSystemPrompt: "s",
      volatileContext: "v",
      history: [],
      tools,
      executeTool: noopExecuteTool,
    });

    const [, init] = fetchMock.mock.calls.at(0) as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "check_availability",
          description: "consulta agenda",
          parameters: { type: "object", properties: { dateFrom: { type: "string" } }, required: ["dateFrom"] },
        },
      },
    ]);
  });

  it("chama executeTool pra cada tool_call e continua o loop até finish_reason != tool_calls", async () => {
    const toolCallMessage = {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call-1", type: "function", function: { name: "check_availability", arguments: '{"dateFrom":"a"}' } }],
    };
    fetchMock
      .mockResolvedValueOnce(chatResponse(toolCallMessage, "tool_calls"))
      .mockResolvedValueOnce(chatResponse({ role: "assistant", content: "Tem horário às 14h." }));

    const executeTool = vi.fn(async (name: string, input: unknown) => {
      expect(name).toBe("check_availability");
      expect(input).toEqual({ dateFrom: "a" });
      return { slots: ["2026-09-18T14:00:00Z"] };
    });
    const provider = new OpenRouterProvider();

    const result = await provider.converse({
      tier: "conversation",
      cacheableSystemPrompt: "s",
      volatileContext: "v",
      history: [{ role: "user", content: "Tem horário amanhã?" }],
      tools: [{ name: "check_availability", description: "d", inputSchema: { type: "object", properties: {} } }],
      executeTool,
    });

    expect(result.text).toBe("Tem horário às 14h.");
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, secondInit] = fetchMock.mock.calls.at(1) as [string, RequestInit];
    const secondBody = JSON.parse(secondInit.body as string);
    expect(secondBody.messages).toEqual([
      { role: "system", content: "s\n\nv" },
      { role: "user", content: "Tem horário amanhã?" },
      toolCallMessage,
      { role: "tool", tool_call_id: "call-1", content: JSON.stringify({ slots: ["2026-09-18T14:00:00Z"] }) },
    ]);
  });

  it("respeita maxToolIterations e devolve o fallbackText se o modelo nunca parar de pedir ferramenta", async () => {
    fetchMock.mockResolvedValue(
      chatResponse(
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "loop", type: "function", function: { name: "check_availability", arguments: "{}" } }],
        },
        "tool_calls"
      )
    );
    const provider = new OpenRouterProvider();

    const result = await provider.converse({
      tier: "conversation",
      cacheableSystemPrompt: "s",
      volatileContext: "v",
      history: [],
      tools: [{ name: "check_availability", description: "d", inputSchema: { type: "object", properties: {} } }],
      executeTool: vi.fn(async () => ({})),
      maxToolIterations: 2,
      fallbackText: "texto de fallback customizado",
    });

    expect(result.text).toBe("texto de fallback customizado");
    expect(result.truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
