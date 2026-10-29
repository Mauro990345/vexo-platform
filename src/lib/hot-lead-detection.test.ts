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

// Correção (item 5 do pedido): cumprimentos não viram falso-positivo, e
// "manhã"/"tarde"/"noite"/"agenda"/"amanhã"/"essa semana" só contam com
// preposição/hora ou dia junto.
describe("detectHotLeadSignal — correção de palavras (cumprimentos e horário condicional)", () => {
  it('"Oi, boa noite" sozinha: NÃO gera Quente (bug real — "boa noite" contém "a noite" como substring)', () => {
    expect(detectHotLeadSignal(["Oi, boa noite"])).toBeNull();
  });

  it('"boa tarde" sozinha: NÃO gera Quente (mesmo bug, "a tarde" dentro de "boa tarde")', () => {
    expect(detectHotLeadSignal(["boa tarde"])).toBeNull();
  });

  it('"quanto custa?" gera Quente (preco_endereco)', () => {
    expect(detectHotLeadSignal(["quanto custa?"])).toBe("preco_endereco");
  });

  it('"tem horario amanha a tarde?" gera Quente (horario)', () => {
    expect(detectHotLeadSignal(["tem horario amanha à tarde?"])).toBe("horario");
  });

  it('outros cumprimentos sozinhos ("Oi", "Olá", "Bom dia") também não geram Quente', () => {
    expect(detectHotLeadSignal(["Oi"])).toBeNull();
    expect(detectHotLeadSignal(["Olá"])).toBeNull();
    expect(detectHotLeadSignal(["Bom dia"])).toBeNull();
  });

  it('cumprimento seguido de sinal de verdade ainda é reconhecido — só o cumprimento em si é ignorado', () => {
    expect(detectHotLeadSignal(["Boa noite, qual o preço da avaliação?"])).toBe("preco_endereco");
    expect(detectHotLeadSignal(["Oi, vocês têm horário amanhã?"])).toBe("horario");
  });

  it('"manhã"/"tarde"/"noite" SEM preposição, sozinhas, nunca contam (nem com o bug antigo nem agora)', () => {
    expect(detectHotLeadSignal(["manhã"])).toBeNull();
    expect(detectHotLeadSignal(["tarde"])).toBeNull();
    expect(detectHotLeadSignal(["noite"])).toBeNull();
  });

  it('"agenda"/"amanhã"/"essa semana" SOZINHAS (sem dia ou hora junto) não contam', () => {
    expect(detectHotLeadSignal(["queria saber sobre a agenda de vocês"])).toBeNull();
    expect(detectHotLeadSignal(["amanhã"])).toBeNull();
    expect(detectHotLeadSignal(["essa semana"])).toBeNull();
  });

  it('"amanhã" JUNTO de uma hora: conta como horário', () => {
    expect(detectHotLeadSignal(["amanhã às 14h"])).toBe("horario");
  });

  it('"essa semana" JUNTO de um dia da semana: conta como horário', () => {
    expect(detectHotLeadSignal(["pode ser essa semana, tipo segunda"])).toBe("horario");
  });

  it('"agenda" JUNTO de uma hora: conta como horário', () => {
    expect(detectHotLeadSignal(["dá pra ver na agenda às 10h"])).toBe("horario");
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
