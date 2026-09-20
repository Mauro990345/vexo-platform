import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConverseRequest, ToolDefinition } from "./types";

// Testa a TRADUÇÃO entre o contrato neutro (LLMProvider) e o SDK real da
// Anthropic — mocka @anthropic-ai/sdk (nunca bate na rede) pra confirmar
// que AnthropicProvider monta a chamada certa (modelo por tier,
// cache_control na posição certa, schema de ferramenta traduzido) e
// interpreta a resposta certa (texto, stop_reason, loop de tool_use).
// Complementa anthropic.test.ts, que testa a lógica de negócio com um
// LLMProvider fake — aqui é só a camada de tradução pro SDK real.

const createMessages = vi.fn();
const createBetaMessages = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: createMessages },
      beta: { messages: { create: createBetaMessages } },
    })),
  };
});

// Import depois do vi.mock (hoisted pelo vitest, mas mantém a leitura
// óbvia de que o mock já está em vigor quando o módulo real é importado).
const { AnthropicProvider } = await import("./anthropic-provider");

function textResponse(text: string, stopReason: string = "end_turn") {
  return { content: [{ type: "text", text }], stop_reason: stopReason };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  createMessages.mockReset();
  createBetaMessages.mockReset();
});

describe("AnthropicProvider.complete", () => {
  it("usa o client `messages` estável (não beta) e devolve o texto da resposta", async () => {
    createMessages.mockResolvedValue(textResponse("classificação em JSON"));
    const provider = new AnthropicProvider();

    const result = await provider.complete({
      tier: "backstage",
      systemPrompt: "system prompt de classificação",
      userMessage: "transcript da conversa",
      maxTokens: 400,
    });

    expect(result.text).toBe("classificação em JSON");
    expect(createBetaMessages).not.toHaveBeenCalled();
    expect(createMessages).toHaveBeenCalledTimes(1);

    const call = createMessages.mock.calls.at(0)?.[0];
    expect(call.max_tokens).toBe(400);
    expect(call.system).toBe("system prompt de classificação");
    expect(call.messages).toEqual([{ role: "user", content: "transcript da conversa" }]);
    // tier "backstage" -> modelo Haiku (default), diferente do tier "conversation".
    expect(call.model).toBe("claude-haiku-4-5-20251001");
  });

  it("usa um modelo diferente para o tier conversation", async () => {
    createMessages.mockResolvedValue(textResponse("ok"));
    const provider = new AnthropicProvider();

    await provider.complete({ tier: "conversation", systemPrompt: "s", userMessage: "u", maxTokens: 10 });

    const call = createMessages.mock.calls.at(0)?.[0];
    expect(call.model).toBe("claude-sonnet-5");
  });

  it("devolve string vazia se a resposta não tiver bloco de texto", async () => {
    createMessages.mockResolvedValue({ content: [{ type: "tool_use", id: "x", name: "y", input: {} }] });
    const provider = new AnthropicProvider();

    const result = await provider.complete({ tier: "backstage", systemPrompt: "s", userMessage: "u", maxTokens: 10 });

    expect(result.text).toBe("");
  });
});

describe("AnthropicProvider.converse", () => {
  const noTools: ToolDefinition[] = [];
  const noopExecuteTool = vi.fn(async () => ({}));

  it("usa o client beta (cache_control só existe lá nesta versão do SDK) com o tier conversation", async () => {
    createBetaMessages.mockResolvedValue(textResponse("Oi! Como posso ajudar?"));
    const provider = new AnthropicProvider();

    const result = await provider.converse({
      tier: "conversation",
      cacheableSystemPrompt: "prompt da clínica",
      volatileContext: "[data atual]",
      history: [{ role: "user", content: "Oi" }],
      tools: noTools,
      executeTool: noopExecuteTool,
    });

    expect(result.text).toBe("Oi! Como posso ajudar?");
    expect(createMessages).not.toHaveBeenCalled();
    expect(createBetaMessages).toHaveBeenCalledTimes(1);

    const call = createBetaMessages.mock.calls.at(0)?.[0];
    expect(call.model).toBe("claude-sonnet-5");
    // cache_control só no bloco cacheável, nunca no volátil — é a
    // otimização inteira do cache: qualquer byte extra ali quebraria o
    // reaproveitamento do prefixo cacheado a cada chamada.
    expect(call.system).toEqual([
      { type: "text", text: "prompt da clínica", cache_control: { type: "ephemeral" } },
      { type: "text", text: "[data atual]" },
    ]);
    expect(call.messages).toEqual([{ role: "user", content: "Oi" }]);
  });

  it("traduz ToolDefinition.inputSchema pra input_schema no formato do SDK", async () => {
    createBetaMessages.mockResolvedValue(textResponse("ok"));
    const provider = new AnthropicProvider();

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

    const call = createBetaMessages.mock.calls.at(0)?.[0];
    expect(call.tools).toEqual([
      {
        name: "check_availability",
        description: "consulta agenda",
        input_schema: { type: "object", properties: { dateFrom: { type: "string" } }, required: ["dateFrom"] },
      },
    ]);
  });

  it("chama executeTool pra cada bloco tool_use e continua o loop até stop_reason != tool_use", async () => {
    const toolUseResponse = {
      content: [{ type: "tool_use", id: "tool-1", name: "check_availability", input: { dateFrom: "a" } }],
      stop_reason: "tool_use",
    };
    createBetaMessages.mockResolvedValueOnce(toolUseResponse).mockResolvedValueOnce(textResponse("Tem horário às 14h."));

    const executeTool = vi.fn(async (name: string, input: unknown) => {
      expect(name).toBe("check_availability");
      expect(input).toEqual({ dateFrom: "a" });
      return { slots: ["2026-09-18T14:00:00Z"] };
    });
    const provider = new AnthropicProvider();

    const result = await provider.converse({
      tier: "conversation",
      cacheableSystemPrompt: "s",
      volatileContext: "v",
      history: [{ role: "user", content: "Tem horário amanhã?" }],
      tools: [
        {
          name: "check_availability",
          description: "d",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      executeTool,
    });

    expect(result.text).toBe("Tem horário às 14h.");
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(createBetaMessages).toHaveBeenCalledTimes(2);

    // A segunda chamada tem que incluir o resultado da ferramenta na
    // conversa (senão o modelo repetiria a mesma pergunta pra sempre).
    const secondCall = createBetaMessages.mock.calls.at(1)?.[0];
    expect(secondCall.messages).toEqual([
      { role: "user", content: "Tem horário amanhã?" },
      { role: "assistant", content: toolUseResponse.content },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool-1", content: JSON.stringify({ slots: ["2026-09-18T14:00:00Z"] }) }],
      },
    ]);
  });

  it("respeita maxToolIterations e devolve o fallbackText se o modelo nunca parar de pedir ferramenta", async () => {
    createBetaMessages.mockResolvedValue({
      content: [{ type: "tool_use", id: "loop", name: "check_availability", input: {} }],
      stop_reason: "tool_use",
    });
    const provider = new AnthropicProvider();

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
    expect(createBetaMessages).toHaveBeenCalledTimes(2);
  });

  it("usa um texto de fallback default quando o call site não passa fallbackText", async () => {
    createBetaMessages.mockResolvedValue({
      content: [{ type: "tool_use", id: "loop", name: "x", input: {} }],
      stop_reason: "tool_use",
    });
    const provider = new AnthropicProvider();

    const result = await provider.converse({
      tier: "conversation",
      cacheableSystemPrompt: "s",
      volatileContext: "v",
      history: [],
      tools: [],
      executeTool: vi.fn(async () => ({})),
      maxToolIterations: 1,
    });

    expect(result.text.length).toBeGreaterThan(0);
  });
});
