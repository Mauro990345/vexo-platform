import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";

// Reorganização do Painel (ver docs/design-audit.md): o modo compact
// (lista de Agendamentos) trocou o selo sólido por ponto colorido + texto
// — este teste prova que não sobrou nenhum fundo preenchido (bg-vexo-panelStatus*Bg
// só no ponto, nunca como classe de fundo do <span> externo) e que o
// ponto mantém a cor personalizável de sempre.
describe("AppointmentStatusBadge compact", () => {
  it("Compareceu: ponto na cor personalizável de 'completed', sem fundo preenchido no texto", () => {
    const markup = renderToStaticMarkup(<AppointmentStatusBadge status="COMPLETED" compact />);
    expect(markup).toContain("Compareceu");
    expect(markup).toContain("bg-vexo-panelStatusCompletedBg");
    expect(markup).not.toContain("panelStatusCompletedBg/80");
  });

  it("Faltou: ponto na cor personalizável de 'negative'", () => {
    const markup = renderToStaticMarkup(<AppointmentStatusBadge status="NO_SHOW" compact />);
    expect(markup).toContain("Faltou");
    expect(markup).toContain("bg-vexo-panelStatusNegativeBg");
  });

  it("Agendado: ponto neutro (vexo-muted)", () => {
    const markup = renderToStaticMarkup(<AppointmentStatusBadge status="SCHEDULED" compact />);
    expect(markup).toContain("Agendado");
    expect(markup).toContain("bg-vexo-muted");
  });

  it("não-compact (tela de conversa do CRM): continua com o selo em pílula, inalterado", () => {
    const markup = renderToStaticMarkup(<AppointmentStatusBadge status="COMPLETED" />);
    expect(markup).toContain("rounded-full");
    expect(markup).toContain("border-vexo-accent/30");
  });
});
