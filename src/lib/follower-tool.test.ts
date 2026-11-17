import { afterEach, describe, expect, it } from "vitest";
import {
  isFollowerToolEnabled,
  validateFollowerToolLimit,
  renderFollowerToolScript,
  FOLLOWER_TOOL_MIN_LIMIT,
  FOLLOWER_TOOL_MAX_LIMIT,
  FOLLOWER_TOOL_DEFAULT_LIMIT,
} from "./follower-tool";

const ORIGINAL_ENV = process.env.FOLLOWER_TOOL_ENABLED;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.FOLLOWER_TOOL_ENABLED;
  else process.env.FOLLOWER_TOOL_ENABLED = ORIGINAL_ENV;
});

describe("isFollowerToolEnabled", () => {
  it("ausente -> desligada (fail closed)", () => {
    delete process.env.FOLLOWER_TOOL_ENABLED;
    expect(isFollowerToolEnabled()).toBe(false);
  });
  it("qualquer valor diferente de 'true' (ex.: '1', 'TRUE', 'yes') -> desligada", () => {
    process.env.FOLLOWER_TOOL_ENABLED = "1";
    expect(isFollowerToolEnabled()).toBe(false);
    process.env.FOLLOWER_TOOL_ENABLED = "TRUE";
    expect(isFollowerToolEnabled()).toBe(false);
  });
  it("exatamente 'true' -> ligada", () => {
    process.env.FOLLOWER_TOOL_ENABLED = "true";
    expect(isFollowerToolEnabled()).toBe(true);
  });
});

describe("validateFollowerToolLimit", () => {
  it("padrão (300) é válido", () => {
    expect(() => validateFollowerToolLimit(FOLLOWER_TOOL_DEFAULT_LIMIT)).not.toThrow();
  });
  it("extremos do intervalo (50 e 500) são válidos", () => {
    expect(() => validateFollowerToolLimit(FOLLOWER_TOOL_MIN_LIMIT)).not.toThrow();
    expect(() => validateFollowerToolLimit(FOLLOWER_TOOL_MAX_LIMIT)).not.toThrow();
  });
  it("abaixo de 50 é inválido", () => {
    expect(() => validateFollowerToolLimit(49)).toThrow();
  });
  it("acima de 500 é inválido", () => {
    expect(() => validateFollowerToolLimit(501)).toThrow();
  });
  it("não inteiro (ex.: NaN de um campo vazio) é inválido", () => {
    expect(() => validateFollowerToolLimit(NaN)).toThrow();
    expect(() => validateFollowerToolLimit(300.5)).toThrow();
  });
});

describe("renderFollowerToolScript", () => {
  it("preenche LIMITE e RECOMECAR com os valores escolhidos", () => {
    const script = renderFollowerToolScript({ limit: 300, restart: false });
    expect(script).toContain("const LIMITE = 300;");
    expect(script).toContain("const RECOMECAR = false;");
    expect(script).not.toContain("{{LIMITE}}");
    expect(script).not.toContain("{{RECOMECAR}}");
  });

  it("'Começar do zero' marcado -> RECOMECAR = true", () => {
    const script = renderFollowerToolScript({ limit: 50, restart: true });
    expect(script).toContain("const LIMITE = 50;");
    expect(script).toContain("const RECOMECAR = true;");
  });

  it("mantém o restante do script intacto (cabeçalho IG, cookie ds_user_id, download do CSV)", () => {
    const script = renderFollowerToolScript({ limit: 300, restart: false });
    expect(script).toContain('"x-ig-app-id": "936619743392459"');
    expect(script).toContain("ds_user_id=");
    expect(script).toContain("seguidores_");
    expect(script).toContain("PARE e espere várias horas");
  });

  it("LIMITE fora de 50-500 é recusado, nunca devolve o texto do script", () => {
    expect(() => renderFollowerToolScript({ limit: 10_000, restart: false })).toThrow();
    expect(() => renderFollowerToolScript({ limit: 1, restart: false })).toThrow();
  });
});
