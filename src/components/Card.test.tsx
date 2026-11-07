import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Card } from "./Card";

describe("Card", () => {
  it("renderiza uma div com os tokens de bloco (rounded-block/p-block) e surface padrão", () => {
    const markup = renderToStaticMarkup(<Card>conteúdo</Card>);
    expect(markup).toContain("<div");
    expect(markup).toContain("rounded-block");
    expect(markup).toContain("p-block");
    expect(markup).toContain("bg-vexo-surface");
    expect(markup).not.toContain("bg-vexo-surface2");
  });

  it("surface2 troca o fundo", () => {
    const markup = renderToStaticMarkup(<Card surface="surface2">conteúdo</Card>);
    expect(markup).toContain("bg-vexo-surface2");
  });

  it("as='form' renderiza um <form> de verdade, repassando action", () => {
    const action = async () => {};
    const markup = renderToStaticMarkup(
      <Card as="form" action={action}>
        campos
      </Card>
    );
    expect(markup).toContain("<form");
    expect(markup).toContain("rounded-block");
  });
});
