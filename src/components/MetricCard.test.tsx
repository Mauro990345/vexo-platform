import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricCard } from "./MetricCard";

describe("MetricCard", () => {
  it("renderiza rótulo, valor e (opcional) texto auxiliar", () => {
    const markup = renderToStaticMarkup(<MetricCard label="Agendados" value="12" />);
    expect(markup).toContain("Agendados");
    expect(markup).toContain("12");
    expect(markup).toContain("rounded-control");
    expect(markup).toContain("bg-vexo-surface2");
  });

  it("hint só aparece quando passado", () => {
    const without = renderToStaticMarkup(<MetricCard label="A" value="1" />);
    const withHint = renderToStaticMarkup(<MetricCard label="A" value="1" hint="esta semana" />);
    expect(without).not.toContain("esta semana");
    expect(withHint).toContain("esta semana");
  });

  it("bare remove a borda/fundo próprios (uso dentro de uma faixa já dividida)", () => {
    const markup = renderToStaticMarkup(<MetricCard label="A" value="1" bare />);
    expect(markup).not.toContain("rounded-control");
    expect(markup).not.toContain("bg-vexo-surface2");
  });

  it("highlight aplica o tom customizável de destaque (painel.highlight) no valor", () => {
    const markup = renderToStaticMarkup(<MetricCard label="A" value="1" highlight />);
    expect(markup).toContain("text-vexo-panelHighlight");
  });
});
