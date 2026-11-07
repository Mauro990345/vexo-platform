import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactivationRail } from "./ReactivationRail";
import type { PanelCard } from "@/lib/panel-cards";

// Reorganização do Painel (ver docs/design-audit.md): "Para fazer hoje"
// passa a mostrar TODOS os pendentes (sem rolagem interna), agrupados em
// "Atrasados"/"Hoje", e "Tudo em dia hoje" quando não há nenhum pendente.
function card(overrides: Partial<PanelCard> = {}): PanelCard {
  return {
    kind: "REACTIVATION",
    cardKey: "k1",
    leadId: "lead-1",
    name: "Ana",
    igUsername: null,
    profilePictureUrl: null,
    message: "Oi!",
    channel: "WHATSAPP",
    whatsappLink: "https://wa.me/5511999999999",
    instagramDmLink: null,
    instagramProfileLink: null,
    reason: "x",
    reasonShort: "x",
    dueDate: new Date(),
    sentAt: null,
    actionKey: { kind: "REACTIVATION", appointmentId: "appt-1", thresholdDays: 30 },
    ...overrides,
  };
}

const noopActions = {
  action: vi.fn(),
  sendWhatsappAction: vi.fn(),
  noShowToggleAction: vi.fn(),
  noShowSendWhatsappAction: vi.fn(),
  hotLeadToggleAction: vi.fn(),
  neverScheduledToggleAction: vi.fn(),
};

describe("ReactivationRail", () => {
  it('sem nenhum card pendente: mostra "Tudo em dia hoje" e o título com contador 0', () => {
    const markup = renderToStaticMarkup(<ReactivationRail cards={[]} {...noopActions} />);
    expect(markup).toContain("Para fazer hoje");
    expect(markup).toContain("0");
    expect(markup).toContain("Tudo em dia hoje");
  });

  it("agrupa em Atrasados (dueDate de dias anteriores) e Hoje (dueDate de hoje), Atrasados antes de Hoje", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2);
    const cards = [
      card({ cardKey: "hoje-1", name: "Hoje Lead", dueDate: new Date() }),
      card({ cardKey: "atrasado-1", name: "Atrasado Lead", dueDate: yesterday }),
    ];
    const markup = renderToStaticMarkup(<ReactivationRail cards={cards} {...noopActions} />);
    expect(markup).toContain("Atrasados");
    expect(markup).toContain("Hoje");
    expect(markup.indexOf("Atrasado Lead")).toBeLessThan(markup.indexOf("Hoje Lead"));
    expect(markup).not.toContain("Tudo em dia hoje");
    expect(markup).toContain("Para fazer hoje · 2");
  });

  it("card já enviado (sentAt preenchido) aparece numa seção própria, dimmed, e não conta no contador", () => {
    const cards = [card({ cardKey: "enviado", name: "Enviado Lead", sentAt: new Date() })];
    const markup = renderToStaticMarkup(<ReactivationRail cards={cards} {...noopActions} />);
    expect(markup).toContain("Enviado Lead");
    expect(markup).toContain("Para fazer hoje · 0");
    expect(markup).toContain("opacity-50");
  });

  it('"N enviadas · M voltaram" só aparece quando sent > 0', () => {
    const withoutMetric = renderToStaticMarkup(<ReactivationRail cards={[]} {...noopActions} />);
    expect(withoutMetric).not.toContain("voltaram");

    const withMetric = renderToStaticMarkup(<ReactivationRail cards={[]} {...noopActions} returnMetric={{ sent: 3, returned: 1 }} />);
    expect(withMetric).toContain("3 enviadas · 1 voltou");
  });
});
