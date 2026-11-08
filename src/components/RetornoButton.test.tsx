import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RetornoButton } from "./RetornoButton";

// Ajuste pós-reorganização do Painel (ver docs/design-audit.md): com um
// prazo já configurado, o rótulo visível vira só "N dias" (sem a palavra
// "Retorno", que deixava o botão largo) — "Retorno" continua no
// tooltip/aria-label ("Retorno em N dias").
describe("RetornoButton", () => {
  it('sem prazo configurado: rótulo "Retorno", sem tooltip especial', () => {
    const markup = renderToStaticMarkup(<RetornoButton appointmentId="appt-1" availablePeriods={[30, 60, 90]} returnPeriodDays={null} locked={false} />);
    expect(markup).toContain(">Retorno<");
    expect(markup).not.toContain("dias<");
    expect(markup).not.toContain("title=");
  });

  it('prazo configurado (120 dias): rótulo só "120 dias" (sem a palavra "Retorno"), tooltip e aria-label "Retorno em 120 dias"', () => {
    const markup = renderToStaticMarkup(<RetornoButton appointmentId="appt-1" availablePeriods={[30, 60, 90, 120]} returnPeriodDays={120} locked={false} />);
    expect(markup).toContain(">120 dias<");
    expect(markup).not.toContain(">Retorno ·");
    expect(markup).not.toContain(">Retorno<");
    expect(markup).toContain('title="Retorno em 120 dias"');
    expect(markup).toContain('aria-label="Retorno em 120 dias"');
  });

  it("outro prazo (90 dias): mesma regra", () => {
    const markup = renderToStaticMarkup(<RetornoButton appointmentId="appt-1" availablePeriods={[30, 60, 90]} returnPeriodDays={90} locked={false} />);
    expect(markup).toContain(">90 dias<");
    expect(markup).toContain('title="Retorno em 90 dias"');
  });

  it("travado (já enviado): desabilitado, com o aviso de sempre no tooltip (prioridade sobre o tooltip do prazo)", () => {
    const markup = renderToStaticMarkup(<RetornoButton appointmentId="appt-1" availablePeriods={[30, 60, 90]} returnPeriodDays={120} locked={true} />);
    expect(markup).toContain("disabled");
    expect(markup).toContain('title="Já enviado — prazo não pode mais ser alterado"');
    expect(markup).toContain(">120 dias<");
  });

  it("mantém o estilo esmaecido/destacado do estado configurado (classes de marcado, inalteradas)", () => {
    const markup = renderToStaticMarkup(<RetornoButton appointmentId="appt-1" availablePeriods={[30, 60, 90]} returnPeriodDays={60} locked={false} />);
    expect(markup).toContain("bg-vexo-accent/15");
  });
});
