import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./Button";

describe("Button", () => {
  it("variante outline (padrão) reproduz a classe já usada hoje em botões de 'Salvar...'", () => {
    const markup = renderToStaticMarkup(<Button>Salvar</Button>);
    expect(markup).toContain("border-vexo-accent");
    expect(markup).toContain("text-vexo-accent");
    expect(markup).toContain("rounded-control");
    expect(markup).toContain('type="button"');
  });

  it("variante primary usa fundo accent + texto accentFg", () => {
    const markup = renderToStaticMarkup(<Button variant="primary">Registrar</Button>);
    expect(markup).toContain("bg-vexo-accent");
    expect(markup).toContain("text-vexo-accentFg");
  });

  it("variante ghost (discreto) usa borda neutra e texto muted", () => {
    const markup = renderToStaticMarkup(<Button variant="ghost">Salvar legenda</Button>);
    expect(markup).toContain("text-vexo-muted");
    expect(markup).toContain("border-vexo-border");
  });

  it("type é sobrescrevível (ex: submit)", () => {
    const markup = renderToStaticMarkup(<Button type="submit">Enviar</Button>);
    expect(markup).toContain('type="submit"');
  });
});
