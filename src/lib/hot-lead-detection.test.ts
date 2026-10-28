import { describe, it, expect } from "vitest";
import { detectHotLeadSignal, leadAskedToStop, HOT_LEAD_SCHEDULE_KEYWORDS, HOT_LEAD_PRICE_ADDRESS_KEYWORDS } from "./hot-lead-detection";

describe("detectHotLeadSignal", () => {
  it('pergunta sobre horário/dia: categoria "horario"', () => {
    expect(detectHotLeadSignal(["Vocês têm horário na quinta?"])).toBe("horario");
  });

  it('pergunta sobre preço: categoria "preco_endereco"', () => {
    expect(detectHotLeadSignal(["Qual o preço da avaliação?"])).toBe("preco_endereco");
  });

  it('pergunta sobre endereço: categoria "preco_endereco"', () => {
    expect(detectHotLeadSignal(["Onde fica a clínica?"])).toBe("preco_endereco");
  });

  it("sem acento (erro de digitação comum) ainda reconhece", () => {
    expect(detectHotLeadSignal(["Qual o preco?"])).toBe("preco_endereco");
    expect(detectHotLeadSignal(["Tem horario amanha?"])).toBe("horario");
  });

  it("mensagem sem nenhum sinal: null", () => {
    expect(detectHotLeadSignal(["Oi, tudo bem?"])).toBeNull();
  });

  it("considera todas as mensagens da lista, não só a primeira/última", () => {
    expect(detectHotLeadSignal(["Oi!", "Legal", "Qual o valor?"])).toBe("preco_endereco");
  });

  it('quando a mesma mensagem tem os dois sinais, "horario" tem prioridade (pedido de ordenação)', () => {
    expect(detectHotLeadSignal(["Que horário fica o preço da avaliação?"])).toBe("horario");
  });

  it("lista vazia: null", () => {
    expect(detectHotLeadSignal([])).toBeNull();
  });
});

describe("leadAskedToStop", () => {
  it('"pare de mandar mensagem": true', () => {
    expect(leadAskedToStop(["Pare de mandar mensagem pra mim"])).toBe(true);
  });

  it('"não quero mais": true', () => {
    expect(leadAskedToStop(["Não quero mais receber isso"])).toBe(true);
  });

  it("mensagem normal: false", () => {
    expect(leadAskedToStop(["Oi, tudo bem?"])).toBe(false);
  });

  it("lista vazia: false", () => {
    expect(leadAskedToStop([])).toBe(false);
  });
});

// Garante que as listas exportadas (relatadas ao usuário) não ficam vazias
// por engano — qualquer uma vazia quebraria a detecção daquela categoria
// inteira silenciosamente.
describe("listas de palavras-chave exportadas", () => {
  it("nenhuma lista está vazia", () => {
    expect(HOT_LEAD_SCHEDULE_KEYWORDS.length).toBeGreaterThan(0);
    expect(HOT_LEAD_PRICE_ADDRESS_KEYWORDS.length).toBeGreaterThan(0);
  });
});
