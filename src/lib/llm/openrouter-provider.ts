import type {
  CompleteRequest,
  CompleteResult,
  ConverseRequest,
  ConverseResult,
  LLMProvider,
  ModelTier,
  ToolDefinition,
} from "./types";
import { withRetry, RetryableError } from "@/lib/retry";

// Segunda implementação de LLMProvider — fala com a OpenRouter (API
// compatível com o formato de chat completions da OpenAI). Começou como
// experimento (testar um modelo em paralelo ao par Sonnet/Haiku da
// Anthropic, ver AnthropicProvider) mas hoje é o provedor real em uso
// neste deployment (modelo "Luna") — entra em uso quando
// LLM_PROVIDER=openrouter estiver setada no ambiente (ver getLLMProvider,
// provider.ts). Setar isso é POR SERVIÇO no Railway (web e worker são
// processos separados, cada um com suas próprias variáveis) — esquecer
// de setar num dos dois não dá erro aqui, só faz getLLMProvider() cair
// de volta no default "anthropic" NAQUELE serviço específico (ver o
// aviso explícito pra esse caso em provider.ts).
//
// fetch puro (sem SDK) — mesmo padrão já usado no projeto pra integrações
// externas (ver sendWhatsappMessage em src/lib/whatsapp.ts,
// sendInstagramMessage em src/lib/instagram.ts). A OpenRouter não tem SDK
// oficial em Node, e o endpoint é só um POST no formato OpenAI-compatible
// — não precisa de um cliente dedicado.
//
// BYOK (chave da OpenAI cadastrada como "provider key" priorizada na
// OpenRouter) é configuração inteira do lado da OpenRouter — daqui só
// manda a OPENROUTER_API_KEY normal como Bearer token; é a OpenRouter
// quem decide, do lado dela, rotear a chamada usando a chave da OpenAI
// cadastrada em vez de créditos compartilhados.

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
// Modelo usado no teste que motivou esta implementação — trocar de
// modelo (outro da OpenAI, ou qualquer outro disponível na OpenRouter) é
// só mudar OPENROUTER_CONVERSATION_MODEL/OPENROUTER_BACKSTAGE_MODEL no
// ambiente, sem precisar mexer em código.
const DEFAULT_MODEL = "openai/gpt-5.6-luna";

const CONVERSATION_MODEL = process.env.OPENROUTER_CONVERSATION_MODEL ?? DEFAULT_MODEL;
const BACKSTAGE_MODEL = process.env.OPENROUTER_BACKSTAGE_MODEL ?? DEFAULT_MODEL;

const DEFAULT_MAX_TOOL_ITERATIONS = 4;
const DEFAULT_FALLBACK_TEXT = "Só um momento, já te retorno com os detalhes.";

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAiChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
};

function toOpenAiTool(tool: ToolDefinition) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

export class OpenRouterProvider implements LLMProvider {
  private baseUrl(): string {
    return (process.env.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private apiKey(): string {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error("OPENROUTER_API_KEY não configurada.");
    }
    return key;
  }

  // Público (não mais private) — ver comentário em LLMProvider.modelForTier,
  // src/lib/llm/types.ts, pro motivo (permitir log de qual modelo real
  // está servindo uma chamada, sem duplicar esta resolução em quem chama).
  modelForTier(tier: ModelTier): string {
    return tier === "conversation" ? CONVERSATION_MODEL : BACKSTAGE_MODEL;
  }

  // Retry com backoff exponencial (ver src/lib/retry.ts) — 429 (rate limit)
  // e 5xx (erro passageiro do lado da OpenRouter/do provedor por trás dela)
  // tentam de novo automaticamente; qualquer outro erro (401 chave
  // inválida, 400 payload malformado, 404 modelo inexistente etc.) é
  // permanente e falha direto, sem retry inútil — tentar de novo não muda
  // uma chave errada. Erro de rede (fetch() lançando TypeError) também
  // tenta de novo, tratado dentro de withRetry, sem precisar de nada extra
  // aqui.
  private async chatCompletion(
    body: Record<string, unknown>
  ): Promise<{ message: OpenAiChatMessage; finishReason: string }> {
    return withRetry(
      async () => {
        const res = await fetch(`${this.baseUrl()}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey()}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const detail = await res.text();
          const message = `Falha ao chamar a OpenRouter (${res.status}): ${detail}`;
          if (res.status === 429 || res.status >= 500) {
            throw new RetryableError(message);
          }
          throw new Error(message);
        }

        const data = (await res.json()) as {
          choices?: { message: OpenAiChatMessage; finish_reason: string }[];
        };
        const choice = data.choices?.[0];
        if (!choice) {
          throw new Error(`Resposta da OpenRouter sem nenhuma choice: ${JSON.stringify(data)}`);
        }
        return { message: choice.message, finishReason: choice.finish_reason };
      },
      { label: `OpenRouter chat/completions (model=${body.model})` }
    );
  }

  async complete(request: CompleteRequest): Promise<CompleteResult> {
    const { message } = await this.chatCompletion({
      model: this.modelForTier(request.tier),
      max_tokens: request.maxTokens,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userMessage },
      ],
    });

    return { text: message.content ?? "" };
  }

  async converse(request: ConverseRequest): Promise<ConverseResult> {
    // Sem conceito de cache_control aqui — a OpenRouter/OpenAI não
    // expõem esse controle explícito por bloco (quando fazem caching de
    // prompt, é automático pelo prefixo inteiro da requisição), então os
    // dois blocos viram um único system message — ver comentário em
    // ConverseRequest.cacheableSystemPrompt (src/lib/llm/types.ts) sobre
    // por que isso é aceitável pra um provedor sem esse controle.
    const messages: OpenAiChatMessage[] = [
      { role: "system", content: `${request.cacheableSystemPrompt}\n\n${request.volatileContext}` },
      ...request.history.map((t) => ({ role: t.role, content: t.content })),
    ];

    const tools = request.tools.map(toOpenAiTool);
    const maxIterations = request.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;

    // Mesmo mecanismo de recuperação de texto intermediário de
    // AnthropicProvider.converse (ver comentário grande lá) — o modelo
    // pode combinar, na mesma resposta, um `content` de texto de verdade
    // com `tool_calls`; sem isso, esse texto era só empilhado em
    // `messages` (pro modelo ver depois) e nunca devolvido ao caller.
    let lastIntermediateText = "";

    // Mesmo loop agentic de AnthropicProvider.converse, só que no dialeto
    // da OpenAI: tool_calls no lugar de content blocks tool_use,
    // finish_reason "tool_calls" no lugar de stop_reason "tool_use", e
    // mensagens role "tool" (com tool_call_id) no lugar de tool_result
    // dentro de um content array. request.executeTool é a mesma função de
    // negócio injetada por quem chama (generateLeadReply,
    // src/lib/anthropic.ts) — não muda entre provedores.
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const { message, finishReason } = await this.chatCompletion({
        model: this.modelForTier(request.tier),
        max_tokens: 1024,
        messages,
        tools,
      });

      if (finishReason !== "tool_calls" || !message.tool_calls?.length) {
        const text = message.content ?? "";
        // Mesmo bug real corrigido em AnthropicProvider.converse (ver
        // comentário grande lá) — o modelo pode parar sem pedir mais
        // ferramenta E sem nenhum texto de verdade (ou só espaço em
        // branco), o que virava Message.content = "" e o Instagram
        // rejeitava o envio com "Empty text". Nunca manda isso ao lead —
        // trata como o mesmo caso de "não deu pra concluir a resposta"
        // que maxToolIterations esgotado já usa.
        if (!text.trim()) {
          // Ver comentário grande em AnthropicProvider.converse: usa o
          // último texto intermediário de verdade, quando existe, em vez
          // de cair direto pro fallback genérico/escalonamento.
          if (lastIntermediateText.trim()) {
            return { text: lastIntermediateText };
          }
          return { text: request.fallbackText ?? DEFAULT_FALLBACK_TEXT, truncated: true };
        }
        return { text };
      }

      if (message.content?.trim()) {
        lastIntermediateText = message.content;
      }

      messages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

      for (const toolCall of message.tool_calls) {
        const input: unknown = JSON.parse(toolCall.function.arguments || "{}");
        const result = await request.executeTool(toolCall.function.name, input);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
      }
    }

    // Esgotou maxIterations sem uma resposta final limpa — mesmo assim,
    // se alguma iteração intermediária produziu texto de verdade, devolve
    // ele em vez do fallback genérico (ver comentário grande acima).
    if (lastIntermediateText.trim()) {
      return { text: lastIntermediateText };
    }
    return { text: request.fallbackText ?? DEFAULT_FALLBACK_TEXT, truncated: true };
  }
}
