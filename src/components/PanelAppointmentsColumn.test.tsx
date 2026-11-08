import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelAppointmentsColumn, type PanelAppointmentItem } from "./PanelAppointmentsColumn";

// Ajuste pós-reorganização do Painel (ver docs/design-audit.md): "Próximos"
// sempre visível (mesmo vazio, com uma linha discreta em vez da antiga
// caixa grande "Nenhum agendamento ainda"); "Aguardando resposta" só
// aparece quando há algum; Histórico recolhido por padrão; cada item é um
// cartão próprio (rounded-control border), não mais uma linha dentro de um
// bloco único.
function appointment(overrides: Partial<PanelAppointmentItem> = {}): PanelAppointmentItem {
  return {
    id: "appt-1",
    scheduledAt: new Date("2026-11-11T12:00:00.000Z"),
    status: "SCHEDULED",
    displayStatus: "SCHEDULED",
    leadId: "lead-1",
    primary: "Paciente Teste",
    handle: "paciente.ig",
    profilePictureUrl: null,
    phone: "11999990000",
    returnPeriodDays: null,
    locked: false,
    ...overrides,
  };
}

describe("PanelAppointmentsColumn", () => {
  it('sem próximos: mostra uma linha discreta "Sem agendamentos próximos", nunca a caixa grande de antes', () => {
    const markup = renderToStaticMarkup(
      <PanelAppointmentsColumn upcoming={[]} awaitingResponse={[]} history={[]} needsHumanLeads={[]} availableReturnPeriods={[30, 60]} />
    );
    expect(markup).toContain("Próximos");
    expect(markup).toContain("Sem agendamentos próximos");
    expect(markup).not.toContain("Nenhum agendamento ainda");
  });

  it('"Aguardando resposta" só aparece quando há algum item', () => {
    const withoutIt = renderToStaticMarkup(
      <PanelAppointmentsColumn upcoming={[appointment()]} awaitingResponse={[]} history={[]} needsHumanLeads={[]} availableReturnPeriods={[30]} />
    );
    expect(withoutIt).not.toContain("Aguardando resposta");

    const withIt = renderToStaticMarkup(
      <PanelAppointmentsColumn
        upcoming={[]}
        awaitingResponse={[appointment({ id: "appt-2", primary: "Aguardando Lead" })]}
        history={[]}
        needsHumanLeads={[]}
        availableReturnPeriods={[30]}
      />
    );
    expect(withIt).toContain("Aguardando resposta");
    expect(withIt).toContain("Aguardando Lead");
  });

  it("Histórico fica recolhido por padrão, com o contador certo, e não mostra o nome até abrir", () => {
    const markup = renderToStaticMarkup(
      <PanelAppointmentsColumn
        upcoming={[]}
        awaitingResponse={[]}
        history={[appointment({ id: "appt-h", primary: "Histórico Lead", status: "NO_SHOW", displayStatus: "NO_SHOW" })]}
        needsHumanLeads={[]}
        availableReturnPeriods={[30]}
      />
    );
    expect(markup).toContain("Histórico (1)");
    expect(markup).not.toContain("Histórico Lead");
  });

  it("cada item é um cartão próprio (rounded-control + borda), não uma linha de bloco único", () => {
    const markup = renderToStaticMarkup(
      <PanelAppointmentsColumn upcoming={[appointment()]} awaitingResponse={[]} history={[]} needsHumanLeads={[]} availableReturnPeriods={[30]} />
    );
    expect(markup).toContain("rounded-control");
    expect(markup).toContain("border-vexo-border");
    expect(markup).not.toContain("divide-y");
  });

  it("quando Retorno e Não compareceu se aplicam ao mesmo agendamento, Não compareceu fica no menu ⋯ (não visível direto)", () => {
    const markup = renderToStaticMarkup(
      <PanelAppointmentsColumn
        upcoming={[]}
        awaitingResponse={[appointment({ status: "SCHEDULED", displayStatus: "COMPLETED" })]}
        history={[]}
        needsHumanLeads={[]}
        availableReturnPeriods={[30]}
      />
    );
    expect(markup).toContain("Retorno");
    expect(markup).toContain('aria-label="Mais ações deste agendamento"');
    expect(markup).not.toContain("Não compareceu");
  });

  it("só Não compareceu se aplica (agendamento futuro, não atendido): aparece direto, sem menu", () => {
    const markup = renderToStaticMarkup(
      <PanelAppointmentsColumn
        upcoming={[appointment({ status: "SCHEDULED", displayStatus: "SCHEDULED" })]}
        awaitingResponse={[]}
        history={[]}
        needsHumanLeads={[]}
        availableReturnPeriods={[30]}
      />
    );
    expect(markup).toContain("Não compareceu");
    expect(markup).not.toContain('aria-label="Mais ações deste agendamento"');
  });
});
