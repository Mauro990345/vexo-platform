import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LeadAvatar } from "./LeadAvatar";

// Ajuste pós-reorganização do Painel (ver docs/design-audit.md): o badge
// do Instagram no tamanho "appointment" (usado em "Para fazer hoje" e
// "Agendamentos") cresceu de ~12px pra 18px e ganhou um anel mais grosso
// (border-2) pra se destacar sobre a foto. Ajuste seguinte: 18px ficou
// grande demais, reduzido pra 15px (anel mantido).
describe("LeadAvatar", () => {
  it('tamanho "appointment": badge de 15px com anel border-2', () => {
    const markup = renderToStaticMarkup(<LeadAvatar size="appointment" name="Ana" />);
    expect(markup).toContain("h-[15px]");
    expect(markup).toContain("w-[15px]");
    expect(markup).toContain("border-2");
  });

  it('tamanho "sm" (banner "precisa de humano"): badge continua pequeno, anel fino de sempre (1px)', () => {
    const markup = renderToStaticMarkup(<LeadAvatar size="sm" name="Ana" />);
    expect(markup).not.toContain("h-[15px]");
    expect(markup).not.toContain("border-2");
  });

  it('tamanho "lg" (Pipeline): inalterado', () => {
    const markup = renderToStaticMarkup(<LeadAvatar size="lg" name="Ana" />);
    expect(markup).toContain("h-3.5");
    expect(markup).not.toContain("border-2");
  });
});
