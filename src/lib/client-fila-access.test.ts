import { describe, it, expect } from "vitest";
import { isFilaScopeAllowedPath } from "./client-fila-access";

describe("isFilaScopeAllowedPath", () => {
  it("libera /dashboard/fila", () => {
    expect(isFilaScopeAllowedPath("/dashboard/fila")).toBe(true);
  });

  it("libera sub-rotas de /dashboard/fila (se um dia existirem)", () => {
    expect(isFilaScopeAllowedPath("/dashboard/fila/alguma-coisa")).toBe(true);
  });

  it("nega o painel em si e qualquer outra sub-rota de /dashboard", () => {
    expect(isFilaScopeAllowedPath("/dashboard")).toBe(false);
    expect(isFilaScopeAllowedPath("/dashboard/bonus")).toBe(false);
  });

  it("nunca libera por um prefixo parecido mas diferente (ex: /dashboard/filagem)", () => {
    expect(isFilaScopeAllowedPath("/dashboard/filagem")).toBe(false);
  });
});
