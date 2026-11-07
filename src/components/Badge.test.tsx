import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge, type BadgeVariant } from "./Badge";

describe("Badge", () => {
  it("variante muted (padrão) com bolinha", () => {
    const markup = renderToStaticMarkup(<Badge>Perdido</Badge>);
    expect(markup).toContain("bg-vexo-muted/15");
    expect(markup).toContain("rounded-full");
    expect(markup).toContain('class="h-1.5 w-1.5'); // a bolinha
  });

  it("dot=false some com a bolinha", () => {
    const markup = renderToStaticMarkup(<Badge dot={false}>Perdido</Badge>);
    expect(markup).not.toContain('class="h-1.5 w-1.5');
  });

  it("as 5 variantes semânticas existem e usam os tokens vexo-* certos", () => {
    const variants: Array<[BadgeVariant, string]> = [
      ["accent", "vexo-accent"],
      ["success", "vexo-success"],
      ["error", "vexo-error"],
      ["warning", "vexo-warning"],
      ["muted", "vexo-muted"],
    ];
    for (const [variant, token] of variants) {
      const markup = renderToStaticMarkup(<Badge variant={variant}>x</Badge>);
      expect(markup).toContain(token);
    }
  });
});
