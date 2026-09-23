import Anthropic from "@anthropic-ai/sdk";
import type {
  CompleteRequest,
  CompleteResult,
  ConverseRequest,
  ConverseResult,
  LLMProvider,
  ModelTier,
  ToolDefinition,
} from "./types";

// Primeira implementação concreta (havia só esta antes da camada
// LLMProvider existir — mesmos modelos default, mesmo cache de prompt,
// mesmo loop de até 4 iterações de ferramenta de sempre) — mas NÃO é mais
// a única nem necessariamente a ativa: este deployment específico usa
// OpenRouterProvider (LLM_PROVIDER=openrouter) como provedor real, ver
// getLLMProvider em provider.ts. Isolar o SDK da Anthropic aqui dentro
// (nenhum outro arquivo do projeto importa @anthropic-ai/sdk) é o que
// torna uma segunda implementação (OpenAI via SDK próprio, ou qualquer
// provedor via OpenRouter, que fala a mesma API da OpenAI) um arquivo
// novo do mesmo tamanho, não uma mudança nos call sites de negócio
// (src/lib/anthropic.ts).

const CONVERSATION_MODEL = process.env.ANTHROPIC_CONVERSATION_MODEL ?? "claude-sonnet-5";
const BACKSTAGE_MODEL = process.env.ANTHROPIC_BACKSTAGE_MODEL ?? "claude-haiku-4-5-20251001";

const DEFAULT_MAX_TOOL_ITERATIONS = 4;
const DEFAULT_FALLBACK_TEXT = "Só um momento, já te retorno com os detalhes.";

function toAnthropicTool(tool: ToolDefinition): Anthropic.Beta.BetaTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

export class AnthropicProvider implements LLMProvider {
  private _client: Anthropic | null = null;

  private client(): Anthropic {
    if (!this._client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY não configurada.");
      }
      this._client = new Anthropic({ apiKey });
    }
    return this._client;
  }

  // Público (não mais private) — ver comentário em LLMProvider.modelForTier,
  // src/lib/llm/types.ts, pro motivo (permitir log de qual modelo real
  // está servindo uma chamada, sem duplicar esta resolução em quem chama).
  modelForTier(tier: ModelTier): string {
    return tier === "conversation" ? CONVERSATION_MODEL : BACKSTAGE_MODEL;
  }

  async complete(request: CompleteRequest): Promise<CompleteResult> {
    const client = this.client();

    // Client `messages` estável (não `beta.messages`) — sem cache_control
    // aqui, não precisa dos tipos do client beta. Mesmo client que
    // classifyConversation/summarizeOlderTurns já usavam antes desta
    // camada existir.
    const response = await client.messages.create({
      model: this.modelForTier(request.tier),
      max_tokens: request.maxTokens,
      system: request.systemPrompt,
      messages: [{ role: "user", content: request.userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return { text: textBlock && "text" in textBlock ? textBlock.text : "" };
  }

  async converse(request: ConverseRequest): Promise<ConverseResult> {
    const client = this.client();
    const messages: Anthropic.Beta.BetaMessageParam[] = request.history.map((t) => ({
      role: t.role,
      content: t.content,
    }));
    const tools = request.tools.map(toAnthropicTool);
    const maxIterations = request.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;

    // Texto de uma resposta INTERMEDIÁRIA (stop_reason "tool_use", mas que
    // também veio com um bloco de texto junto) — guardado como rede de
    // segurança pro caso do loop esgotar maxIterations sem nunca produzir
    // uma resposta final "limpa" (só texto, sem tool_use). Bug real: o
    // modelo às vezes combina, NUMA MESMA resposta, o texto que quer
    // mandar ao lead (ex.: instruções de chegada, junto da chamada de
    // confirm_attendance) com uma chamada de ferramenta — antes desta
    // correção, esse texto era só empilhado em `messages` pro modelo ver
    // depois e NUNCA devolvido ao caller: o lead nunca recebia aquela
    // mensagem, e o modelo, sem saber que já tinha "dito" aquilo, muitas
    // vezes gastava as iterações seguintes tentando se recuperar (dizer de
    // novo, chamar outra ferramenta) até estourar maxIterations à toa.
    let lastIntermediateText = "";

    // Loop agentic: o modelo pode encadear chamadas de ferramenta antes do
    // texto final de resposta ao lead — mesmo comportamento de antes desta
    // camada existir, só que agora chamando request.executeTool (fornecido
    // por quem chama, ver generateLeadReply em src/lib/anthropic.ts) em vez
    // de um if/else fixo de nomes de ferramenta aqui dentro. Esse
    // dispatch é lógica de negócio do VEXO, não mecânica de provedor.
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await client.beta.messages.create({
        model: this.modelForTier(request.tier),
        max_tokens: 1024,
        system: [
          // cache_control aqui = tools (renderizados antes) + este bloco
          // ficam cacheados juntos — mesma posição/racional de antes desta
          // camada existir (ver comentário grande em generateLeadReply).
          { type: "text", text: request.cacheableSystemPrompt, cache_control: { type: "ephemeral" } },
          // SEM cache_control — muda a cada chamada, fica de fora do
          // prefixo cacheado.
          { type: "text", text: request.volatileContext },
        ],
        tools,
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        const textBlock = response.content.find((b) => b.type === "text");
        const text = textBlock && "text" in textBlock ? textBlock.text : "";
        // Bug real em produção: duas falhas de envio no Instagram com
        // "Empty text" (code 100, subcode 2534052), ambas perto de um
        // agendamento confirmado — turno com várias chamadas de ferramenta
        // em sequência (schedule_appointment + save_lead_phone/save_lead_name).
        // O modelo às vezes para de pedir ferramenta (stop_reason != "tool_use")
        // sem nenhum bloco de texto de verdade (ou com um em branco) —
        // sem esta checagem, esse "" virava Message.content, e o dispatch
        // (dispatch.ts) mandava pro Instagram como texto final da resposta,
        // que a API rejeita. Trata como o mesmo caso de "não deu pra
        // concluir a resposta" que já existe pra maxToolIterations
        // esgotado (ver `truncated` em conversation-pipeline.ts) — nunca
        // manda um texto vazio pro lead.
        if (!text.trim()) {
          // Antes de cair pro fallback genérico/escalonamento, usa o
          // último texto intermediário de verdade que o modelo produziu
          // (ver comentário grande acima) — sempre melhor que "" ou o
          // texto de espera genérico, quando existe.
          if (lastIntermediateText.trim()) {
            return { text: lastIntermediateText };
          }
          return { text: request.fallbackText ?? DEFAULT_FALLBACK_TEXT, truncated: true };
        }
        return { text };
      }

      const intermediateTextBlock = response.content.find((b) => b.type === "text");
      if (intermediateTextBlock && "text" in intermediateTextBlock && intermediateTextBlock.text.trim()) {
        lastIntermediateText = intermediateTextBlock.text;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const result = await request.executeTool(block.name, block.input);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }

      messages.push({ role: "user", content: toolResults });
    }

    // Esgotou maxIterations sem nunca produzir uma resposta final limpa —
    // mesmo assim, se alguma iteração intermediária produziu texto de
    // verdade (ver comentário grande acima), devolve ELE em vez do
    // fallback genérico: é conteúdo real que o modelo quis mandar ao
    // lead, nunca pior que a mensagem de espera/escalonamento.
    if (lastIntermediateText.trim()) {
      return { text: lastIntermediateText };
    }
    return { text: request.fallbackText ?? DEFAULT_FALLBACK_TEXT, truncated: true };
  }
}
