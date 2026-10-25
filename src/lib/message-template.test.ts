import { describe, it, expect } from "vitest";
import { renderMessageTemplate, normalizeFirstNameForTemplate, stripAnyLeftoverTemplateTokens } from "./message-template";

// Bug real corrigido: a Reativação nunca substituía {{primeiro_nome}}/
// {{data_horario}} — o texto configurado pela clínica saía LITERAL no
// WhatsApp do lead. Esta é a função única de renderização pedida, usada
// em todos os pontos de envio (lembretes, reativação, follow-up) — pura,
// sem Prisma/fetch, pra ficar 100% testável aqui.
describe("renderMessageTemplate", () => {
  it("nome ok: substitui {{primeiro_nome}} normalmente", () => {
    expect(renderMessageTemplate("Oi, {{primeiro_nome}}!", { primeiro_nome: "Maria", data_horario: null })).toBe("Oi, Maria!");
  });

  it("nome desconhecido (null): remove a variável com limpeza, nunca deixa vazio no lugar", () => {
    expect(renderMessageTemplate("Oi, {{primeiro_nome}}! Faz um tempinho que a gente não se fala. Como você está se sentindo com o resultado?", {
      primeiro_nome: null,
      data_horario: null,
    })).toBe("Oi! Faz um tempinho que a gente não se fala. Como você está se sentindo com o resultado?");
  });

  it("data desconhecida (null): remove a variável com limpeza", () => {
    expect(
      renderMessageTemplate("Falta pouco para cuidarmos de você. Estou te aguardando {{data_horario}}. Chegue uns 15 minutinhos antes.", {
        primeiro_nome: null,
        data_horario: null,
      })
    ).toBe("Falta pouco para cuidarmos de você. Estou te aguardando. Chegue uns 15 minutinhos antes.");
  });

  it("os dois desconhecidos: remove as duas variáveis, texto final lido naturalmente", () => {
    const text =
      "Oi, {{primeiro_nome}}. Passando para lembrar da nossa avaliação {{data_horario}}. Vamos olhar o seu caso com calma. Vai ser um prazer te receber.";
    expect(renderMessageTemplate(text, { primeiro_nome: null, data_horario: null })).toBe(
      "Oi. Passando para lembrar da nossa avaliação. Vamos olhar o seu caso com calma. Vai ser um prazer te receber."
    );
  });

  it("variável desconhecida sobrando (nem é primeiro_nome nem data_horario): removida com a mesma limpeza", () => {
    expect(renderMessageTemplate("Te esperamos na unidade {{endereco}}.", {})).toBe("Te esperamos na unidade.");
  });

  it('", {{x}}" no meio da frase vira "" (exemplo do pedido)', () => {
    expect(renderMessageTemplate("Oi, {{primeiro_nome}}! Faz um tempinho.", { primeiro_nome: null })).toBe("Oi! Faz um tempinho.");
  });

  it('"{{x}}, " no início vira "" com a letra seguinte maiúscula', () => {
    expect(renderMessageTemplate("{{primeiro_nome}}, tudo bem?", { primeiro_nome: null })).toBe("Tudo bem?");
  });

  it('" {{x}}" vira "" (exemplo do pedido)', () => {
    expect(renderMessageTemplate("avaliação {{data_horario}}.", { data_horario: null })).toBe("avaliação.");
  });

  it("nunca sobra {{...}} literal nenhum, mesmo sem nenhum valor conhecido", () => {
    const result = renderMessageTemplate("Oi {{primeiro_nome}}, {{data_horario}} e {{outra_coisa}}?", {});
    expect(result).not.toMatch(/\{\{/);
  });

  it("valor em branco (só espaços) é tratado como desconhecido, não substituído literalmente", () => {
    expect(renderMessageTemplate("Oi, {{primeiro_nome}}!", { primeiro_nome: "   " })).toBe("Oi!");
  });

  it("texto sem nenhuma variável: devolvido como está (sem alterar pontuação de propósito)", () => {
    expect(renderMessageTemplate("Oi! Tudo bem?", {})).toBe("Oi! Tudo bem?");
  });

  // Os 3 textos reais citados no pedido.
  describe("textos reais", () => {
    const textA = "Oi, {{primeiro_nome}}. Passando para lembrar da nossa avaliação {{data_horario}}. Vamos olhar o seu caso com calma. Vai ser um prazer te receber.";
    const textB = "Falta pouco para cuidarmos de você. Estou te aguardando {{data_horario}}. Chegue uns 15 minutinhos antes.";
    const textC = "Oi, {{primeiro_nome}}! Faz um tempinho que a gente não se fala. Como você está se sentindo com o resultado?";

    it("texto a) com os dois valores conhecidos", () => {
      expect(renderMessageTemplate(textA, { primeiro_nome: "Maria", data_horario: "sexta-feira (08/11) às 14h" })).toBe(
        "Oi, Maria. Passando para lembrar da nossa avaliação sexta-feira (08/11) às 14h. Vamos olhar o seu caso com calma. Vai ser um prazer te receber."
      );
    });

    it("texto a) com os dois valores desconhecidos", () => {
      expect(renderMessageTemplate(textA, { primeiro_nome: null, data_horario: null })).toBe(
        "Oi. Passando para lembrar da nossa avaliação. Vamos olhar o seu caso com calma. Vai ser um prazer te receber."
      );
    });

    it("texto b) com data conhecida", () => {
      expect(renderMessageTemplate(textB, { data_horario: "às 14h30" })).toBe(
        "Falta pouco para cuidarmos de você. Estou te aguardando às 14h30. Chegue uns 15 minutinhos antes."
      );
    });

    it("texto b) com data desconhecida", () => {
      expect(renderMessageTemplate(textB, { data_horario: null })).toBe(
        "Falta pouco para cuidarmos de você. Estou te aguardando. Chegue uns 15 minutinhos antes."
      );
    });

    it("texto c) com nome conhecido", () => {
      expect(renderMessageTemplate(textC, { primeiro_nome: "João" })).toBe(
        "Oi, João! Faz um tempinho que a gente não se fala. Como você está se sentindo com o resultado?"
      );
    });

    it("texto c) com nome desconhecido", () => {
      expect(renderMessageTemplate(textC, { primeiro_nome: null })).toBe(
        "Oi! Faz um tempinho que a gente não se fala. Como você está se sentindo com o resultado?"
      );
    });
  });
});

describe("stripAnyLeftoverTemplateTokens — guarda final antes de qualquer envio", () => {
  it("remove qualquer {{...}} que ainda esteja no texto, com a mesma limpeza", () => {
    expect(stripAnyLeftoverTemplateTokens("Oi, {{primeiro_nome}}! Até {{data_horario}}.")).toBe("Oi! Até.");
  });

  it("texto sem nenhum token: devolvido sem alteração", () => {
    expect(stripAnyLeftoverTemplateTokens("Oi! Tudo bem?")).toBe("Oi! Tudo bem?");
  });
});

// Item 3 do pedido — "nome do perfil do Instagram do lead": só a primeira
// palavra, só letras (acento mantido), primeira maiúscula.
describe("normalizeFirstNameForTemplate", () => {
  it("nome ok: primeira palavra, capitalizada", () => {
    expect(normalizeFirstNameForTemplate("maria silva")).toBe("Maria");
  });

  it("nome já capitalizado: mantém", () => {
    expect(normalizeFirstNameForTemplate("João Pedro")).toBe("João");
  });

  it('"MARIA ♡ Silva" vira "Maria" (remove tudo que não é letra, mantém acento, capitaliza)', () => {
    expect(normalizeFirstNameForTemplate("MARIA ♡ Silva")).toBe("Maria");
  });

  it("nome só com emoji: desconhecido (null)", () => {
    expect(normalizeFirstNameForTemplate("♡♡♡")).toBeNull();
  });

  it("nome vazio: desconhecido (null)", () => {
    expect(normalizeFirstNameForTemplate("")).toBeNull();
    expect(normalizeFirstNameForTemplate("   ")).toBeNull();
  });

  it("null/undefined: desconhecido (null)", () => {
    expect(normalizeFirstNameForTemplate(null)).toBeNull();
    expect(normalizeFirstNameForTemplate(undefined)).toBeNull();
  });

  it("menos de 2 letras depois de limpar: desconhecido (null)", () => {
    expect(normalizeFirstNameForTemplate("A")).toBeNull();
    expect(normalizeFirstNameForTemplate("A1")).toBeNull();
  });

  it("só número: desconhecido (null)", () => {
    expect(normalizeFirstNameForTemplate("12345")).toBeNull();
  });

  it("mantém acento (não é ASCII-only)", () => {
    expect(normalizeFirstNameForTemplate("ÁGATA")).toBe("Ágata");
  });
});
