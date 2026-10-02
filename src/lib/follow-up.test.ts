import { describe, it, expect } from "vitest";
import { leadFirstName, applyTemplateVariables } from "@/lib/follow-up";

// Bug real corrigido: ao cair pro igUsername (Lead.name ausente), o nome
// saía com o @ inteiro sempre que ele tinha ponto (ex.: "mauro.iphone") —
// o split por espaço de antes não tinha efeito nenhum nesse caso, já que
// usernames do Instagram não têm espaço. Essa função alimenta
// {{primeiro_nome}} tanto nos templates de follow-up/lembrete quanto no
// prompt de conversação da IA (ver applyTemplateVariables em
// conversation-pipeline.ts).
describe("leadFirstName", () => {
  it("@ com ponto usa só a parte antes do primeiro ponto", () => {
    expect(leadFirstName({ name: null, igUsername: "mauro.iphone" })).toBe("mauro");
  });

  it("@ sem ponto usa ele inteiro", () => {
    expect(leadFirstName({ name: null, igUsername: "luiscarlos" })).toBe("luiscarlos");
  });

  it("@ com mais de um ponto usa só a parte antes do PRIMEIRO ponto", () => {
    expect(leadFirstName({ name: null, igUsername: "ana.paula.clinica" })).toBe("ana");
  });

  it("Lead.name tem prioridade sobre o @ — continua pegando o primeiro nome por espaço, sem aplicar a regra do ponto", () => {
    expect(leadFirstName({ name: "Maria Silva", igUsername: "maria.silva.oficial" })).toBe("Maria");
  });

  it("sem nome nem @, devolve string vazia", () => {
    expect(leadFirstName({ name: null, igUsername: null })).toBe("");
  });

  it("nome em branco (só espaços) cai pro @ normalmente", () => {
    expect(leadFirstName({ name: "   ", igUsername: "joao.pedro" })).toBe("joao");
  });
});

describe("applyTemplateVariables", () => {
  it("substitui {{primeiro_nome}} pelo nome derivado do @ quando não há Lead.name", () => {
    const result = applyTemplateVariables("Oi, {{primeiro_nome}}! Tudo bem?", { name: null, igUsername: "mauro.iphone" });
    expect(result).toBe("Oi, mauro! Tudo bem?");
  });
});
