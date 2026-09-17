import type { LLMProvider } from "./types";
import { AnthropicProvider } from "./anthropic-provider";

// Ponto único de escolha de provedor — trocar de provedor é mudar
// LLM_PROVIDER no ambiente (Railway) e adicionar o `case` correspondente
// aqui quando essa implementação existir; nenhum outro arquivo do projeto
// precisa mudar (ver src/lib/anthropic.ts, que só conhece a interface
// LLMProvider, nunca uma implementação concreta específica).
let _provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (!_provider) {
    const name = process.env.LLM_PROVIDER ?? "anthropic";
    switch (name) {
      case "anthropic":
        _provider = new AnthropicProvider();
        break;
      // Próximo provedor (OpenAI direto, ou qualquer modelo via
      // OpenRouter — que fala a mesma API HTTP da OpenAI, então uma única
      // implementação "OpenAiCompatibleProvider" parametrizada por
      // baseURL cobre os dois) entra aqui como mais um `case`, apontando
      // pra uma classe nova em src/lib/llm/, do mesmo tamanho que
      // AnthropicProvider — ver estimativa de esforço no PR.
      default:
        throw new Error(
          `Provedor de LLM desconhecido: "${name}" (LLM_PROVIDER). Provedores disponíveis: anthropic.`
        );
    }
  }
  return _provider;
}

// Só pra testes — permite injetar um provedor fake (ver
// src/lib/anthropic.test.ts) sem depender de mock de módulo, e resetar o
// singleton entre casos de teste que mexem em process.env.LLM_PROVIDER.
export function setLLMProviderForTesting(provider: LLMProvider | null): void {
  _provider = provider;
}
