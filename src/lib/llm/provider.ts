import type { LLMProvider } from "./types";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenRouterProvider } from "./openrouter-provider";

// Ponto único de escolha de provedor — trocar de provedor é mudar
// LLM_PROVIDER no ambiente (Railway) e adicionar o `case` correspondente
// aqui quando essa implementação existir; nenhum outro arquivo do projeto
// precisa mudar (ver src/lib/anthropic.ts, que só conhece a interface
// LLMProvider, nunca uma implementação concreta específica).
//
// "anthropic" é o default (nenhuma variável setada = produção continua
// exatamente como sempre foi) — "openrouter" só entra em uso onde
// LLM_PROVIDER=openrouter for explicitamente setada (ambiente de teste,
// nunca produção, ver OpenRouterProvider pro racional completo).
let _provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (!_provider) {
    const name = process.env.LLM_PROVIDER ?? "anthropic";
    switch (name) {
      case "anthropic":
        _provider = new AnthropicProvider();
        break;
      case "openrouter":
        _provider = new OpenRouterProvider();
        break;
      default:
        throw new Error(
          `Provedor de LLM desconhecido: "${name}" (LLM_PROVIDER). Provedores disponíveis: anthropic, openrouter.`
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
