import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OverflowMenu } from "./OverflowMenu";

describe("OverflowMenu", () => {
  it("renderiza o gatilho '⋯' e mantém o conteúdo fora do DOM até abrir (fechado por padrão)", () => {
    const markup = renderToStaticMarkup(
      <OverflowMenu>
        <button type="button">Não compareceu</button>
      </OverflowMenu>
    );
    expect(markup).toContain('aria-label="Mais ações"');
    expect(markup).not.toContain("Não compareceu");
  });

  it("aceita um label customizado pro botão gatilho", () => {
    const markup = renderToStaticMarkup(
      <OverflowMenu label="Outras ações">
        <span>x</span>
      </OverflowMenu>
    );
    expect(markup).toContain('aria-label="Outras ações"');
  });
});
