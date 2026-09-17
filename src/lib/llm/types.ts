// Contrato neutro de provedor de LLM — nenhum tipo daqui referencia
// @anthropic-ai/sdk (nem qualquer outro SDK de provedor). O objetivo é
// que trocar de provedor (Anthropic, OpenAI, qualquer um via OpenRouter)
// seja escolher uma implementação de LLMProvider por configuração
// (ver getLLMProvider em provider.ts), sem tocar em nenhum call site.
//
// Por que só DOIS métodos, não um por função de negócio (classifyConversation/
// generateLeadReply/summarizeOlderTurns): o VEXO só usa a API de um LLM de
// duas formas estruturalmente diferentes hoje —
//   1. "completion simples": um prompt de sistema fixo + uma mensagem do
//      usuário -> texto de volta, sem ferramentas (classifyConversation e
//      summarizeOlderTurns são exatamente essa forma, só com prompts e
//      parsing diferentes — isso é lógica de negócio, fica em
//      src/lib/anthropic.ts, não aqui).
//   2. "conversa agêntica com ferramentas": histórico multi-turno + tools +
//      um prompt cacheável — o modelo pode encadear chamadas de ferramenta
//      antes do texto final (generateLeadReply é essa forma).
// Forçar as duas em um método genérico só complicaria os dois casos de uso
// sem ganho nenhum; um método por padrão de chamada é o corte certo.

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

// "conversation" = modelo caro/capaz (hoje Sonnet), usado só em
// generateLeadReply — natural­idade com o lead importa mais que custo.
// "backstage" = modelo barato (hoje Haiku), usado em tarefas de bastidor
// (classificação, resumo, gatilho de follow-up). Naturalidade com o lead
// importa mais que custo pro tier "conversation" — por isso os dois tiers
// existem. Cada provedor resolve o tier pro seu próprio ID de modelo (ver
// AnthropicProvider) — quem chama nunca precisa saber IDs de modelo de
// provedor nenhum.
export type ModelTier = "conversation" | "backstage";

export type CompleteRequest = {
  tier: ModelTier;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
};

export type CompleteResult = {
  text: string;
};

// JSON Schema simples (o mesmo formato que tanto a API da Anthropic quanto
// a da OpenAI já usam pra descrever parâmetros de ferramenta/função) —
// neutro o bastante pra não precisar de tradução nenhuma na maioria dos
// provedores.
export type ToolInputSchema = {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
};

export type ConverseRequest = {
  tier: ModelTier;
  // Estável entre chamadas da mesma clínica — candidato a prompt caching
  // nos provedores que suportarem (ver cache_control em AnthropicProvider).
  // Um provedor sem caching pode simplesmente tratar como parte do prompt
  // de sistema; nada aqui exige que ele faça algo especial com isso.
  cacheableSystemPrompt: string;
  // Muda a cada chamada (ex: data/hora atual) — nunca deve entrar no
  // prefixo cacheado (ver comentário grande em generateLeadReply,
  // src/lib/anthropic.ts, sobre por que isso quebraria o cache).
  volatileContext: string;
  history: ChatTurn[];
  tools: ToolDefinition[];
  // O loop de "modelo pede ferramenta -> executa -> devolve resultado ->
  // pergunta ao modelo de novo" é responsabilidade da IMPLEMENTAÇÃO do
  // provedor, não de quem chama — cada provedor tem sua própria forma de
  // representar tool_use/tool_result internamente (blocks da Anthropic,
  // mensagens de "tool" da OpenAI, etc.), então expor esse loop aqui
  // vazaria detalhes de um provedor específico pro contrato neutro.
  executeTool: (name: string, input: unknown) => Promise<unknown>;
  // Default decidido por cada provedor (a implementação Anthropic usa 4,
  // igual ao comportamento atual) — exposto pra quem chama poder ajustar
  // sem precisar saber o valor default de cada provedor.
  maxToolIterations?: number;
  // Texto devolvido se o loop esgotar as iterações sem o modelo terminar
  // (parar de pedir ferramentas) — cópia de produto, não mecânica de
  // provedor, por isso fica a cargo de quem chama, não tem um default
  // aqui além de uma frase genérica de fallback em cada provedor.
  fallbackText?: string;
};

export type ConverseResult = {
  text: string;
};

export interface LLMProvider {
  complete(request: CompleteRequest): Promise<CompleteResult>;
  converse(request: ConverseRequest): Promise<ConverseResult>;
}
