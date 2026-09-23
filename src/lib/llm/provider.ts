import type { LLMProvider } from "./types";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenRouterProvider } from "./openrouter-provider";

// Ponto único de escolha de provedor — trocar de provedor é mudar
// LLM_PROVIDER no ambiente (Railway) e adicionar o `case` correspondente
// aqui quando essa implementação existir; nenhum outro arquivo do projeto
// precisa mudar (ver src/lib/anthropic.ts, que só conhece a interface
// LLMProvider, nunca uma implementação concreta específica).
//
// "anthropic" é o default quando LLM_PROVIDER não está setada — histórico
// (era a única opção antes desta camada existir) e AINDA o default certo
// pra quem não mexeu nisso. NÃO é mais verdade, porém, que "openrouter só
// entra em uso em ambiente de teste, nunca produção" (comentário antigo
// aqui, removido por estar desatualizado) — este deployment específico
// migrou de verdade pra OpenRouter/Luna. Isso importa porque web e worker
// são serviços SEPARADOS no Railway, cada um com suas próprias variáveis
// de ambiente: esquecer de setar LLM_PROVIDER=openrouter em só UM deles
// não dá erro nenhum aqui — cai quieto no default "anthropic" — e só
// estoura bem mais tarde, dentro de uma chamada de negócio qualquer
// (classifyConversation, generateLeadReply), como um erro de billing da
// própria Anthropic ("Your credit balance is too low..."), sem nenhuma
// pista de que a causa real é uma variável de ambiente faltando NESTE
// serviço específico. Bug real reportado exatamente assim.
let _provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (!_provider) {
    const name = process.env.LLM_PROVIDER ?? "anthropic";
    switch (name) {
      case "anthropic":
        // Só dispara quando LLM_PROVIDER está genuinamente AUSENTE (caiu
        // no default por omissão, não por alguém ter setado
        // LLM_PROVIDER=anthropic de propósito — esse caso passa direto,
        // sem aviso nenhum) E existe uma OPENROUTER_API_KEY neste mesmo
        // ambiente — sinal forte de que ESTE serviço deveria estar usando
        // OpenRouter e só esqueceram de setar LLM_PROVIDER aqui. Falha
        // imediatamente, com uma mensagem que aponta a causa exata, em
        // vez de deixar a primeira chamada de verdade estourar um erro de
        // billing da Anthropic bem mais confuso e sem contexto nenhum
        // sobre QUAL serviço/variável está faltando.
        if (!process.env.LLM_PROVIDER && process.env.OPENROUTER_API_KEY) {
          throw new Error(
            'LLM_PROVIDER não está configurada neste serviço, então caiu no default "anthropic" — mas ' +
              "OPENROUTER_API_KEY está presente neste ambiente, sinal forte de que este serviço deveria estar " +
              "usando OpenRouter, não a Anthropic. Web e worker são serviços separados no Railway, cada um com " +
              "suas próprias variáveis — confirme que LLM_PROVIDER=openrouter está setada NESTE serviço " +
              "específico (não só em outro). Se realmente quiser usar a Anthropic aqui, defina " +
              "LLM_PROVIDER=anthropic explicitamente pra deixar isso claro e não cair neste aviso."
          );
        }
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
