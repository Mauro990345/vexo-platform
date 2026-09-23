import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getLLMProvider, setLLMProviderForTesting } from "./provider";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenRouterProvider } from "./openrouter-provider";

// Bug real reportado: classifyConversation estourou um erro de billing da
// própria Anthropic ("Your credit balance is too low...") mesmo o
// deployment tendo migrado de verdade pra OpenRouter/Luna. Causa raiz:
// LLM_PROVIDER não estava setada no serviço WORKER especificamente (web e
// worker são processos separados no Railway, cada um com suas próprias
// variáveis de ambiente) — getLLMProvider() caía quieto no default
// "anthropic", sem erro nenhum ali, e só estourava bem mais tarde, dentro
// de uma chamada de negócio qualquer, como um erro de billing confuso sem
// nenhuma pista da causa real. Estes testes cobrem o aviso explícito
// adicionado pra esse caso específico.

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  setLLMProviderForTesting(null);
  process.env = { ...ORIGINAL_ENV };
  delete process.env.LLM_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  setLLMProviderForTesting(null);
  process.env = { ...ORIGINAL_ENV };
});

describe("getLLMProvider", () => {
  it("usa AnthropicProvider por padrão quando LLM_PROVIDER não está setada e não há OPENROUTER_API_KEY", () => {
    const provider = getLLMProvider();
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it("usa OpenRouterProvider quando LLM_PROVIDER=openrouter", () => {
    process.env.LLM_PROVIDER = "openrouter";
    const provider = getLLMProvider();
    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });

  it("bug real: lança um erro claro (não cai silenciosamente na Anthropic) quando LLM_PROVIDER não está setada mas OPENROUTER_API_KEY está presente — sinal forte de variável esquecida neste serviço", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
    // LLM_PROVIDER deliberadamente ausente — exatamente o cenário real.

    expect(() => getLLMProvider()).toThrow(/LLM_PROVIDER não está configurada/);
    expect(() => getLLMProvider()).toThrow(/OPENROUTER_API_KEY está presente/);
  });

  it("respeita LLM_PROVIDER=anthropic setada EXPLICITAMENTE mesmo com OPENROUTER_API_KEY presente — não dispara o aviso quando a escolha foi deliberada", () => {
    process.env.LLM_PROVIDER = "anthropic";
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";

    const provider = getLLMProvider();
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it("lança um erro claro pra um provedor desconhecido", () => {
    process.env.LLM_PROVIDER = "algum-provedor-que-nao-existe";
    expect(() => getLLMProvider()).toThrow(/Provedor de LLM desconhecido/);
  });
});
