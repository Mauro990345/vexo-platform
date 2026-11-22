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

  it('card já enviado (sentAt preenchido) fica num grupo recolhido "Enviados (N)" no fim, não conta no contador, e não aparece até abrir o grupo', () => {
    const cards = [card({ cardKey: "enviado", name: "Enviado Lead", sentAt: new Date() })];
    const markup = renderToStaticMarkup(<ReactivationRail cards={cards} {...noopActions} />);
    expect(markup).toContain("Para fazer hoje · 0");
    expect(markup).toContain("Enviados (1)");
    expect(markup).not.toContain("Enviado Lead");
  });

  it('"N enviadas · M voltaram" só aparece quando sent > 0', () => {
    const withoutMetric = renderToStaticMarkup(<ReactivationRail cards={[]} {...noopActions} />);
    expect(withoutMetric).not.toContain("voltaram");

    const withMetric = renderToStaticMarkup(<ReactivationRail cards={[]} {...noopActions} returnMetric={{ sent: 3, returned: 1 }} />);
    expect(withMetric).toContain("3 enviadas · 1 voltou");
  });

  it('rótulo de grupo "Atrasados" é neutro (cinza), nunca vermelho (vexo-error)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const markup = renderToStaticMarkup(<ReactivationRail cards={[card({ dueDate: yesterday })]} {...noopActions} />);
    expect(markup).toContain("Atrasados");
    expect(markup).not.toContain("vexo-error");
  });

  it("nome completo do paciente aparece numa linha própria (não cortado pela etiqueta/@ do Instagram)", () => {
    const markup = renderToStaticMarkup(
      <ReactivationRail cards={[card({ name: "Maria Fernanda de Albuquerque", igUsername: "maria.ig", reasonShort: "30 dias após" })]} {...noopActions} />
    );
    expect(markup).toContain("Maria Fernanda de Albuquerque");
    expect(markup).toContain("@maria.ig");
    expect(markup).toContain("30 dias após");
    expect(markup).toContain("Reativação"); // etiqueta de tipo, ainda presente, só discreta
  });

  it("nome e @ do Instagram ficam colados, na mesma linha 1 (ajuste explícito — antes o @ ficava afastado, à direita, junto da etiqueta/motivo)", () => {
    const markup = renderToStaticMarkup(<ReactivationRail cards={[card({ name: "Joana Lima", igUsername: "joana.ig" })]} {...noopActions} />);
    expect(markup).toMatch(/Joana Lima<\/p><span[^>]*>@joana\.ig/);
  });

  // Ajuste dedicado (cor por tipo, ver DESIGN.md): Reativação com a borda
  // fina tingida de azul nos 4 lados, igual a antes (mesmo token de sempre,
  // `cardTypeReativacao`) + uma barrinha própria, absoluta (não ocupa
  // espaço no flex do conteúdo), fina e curta, sobreposta na borda
  // esquerda (rodada 4 — correção: as 2 tentativas anteriores deixaram
  // DUAS barras juntas, uma por dentro do conteúdo e outra virando a borda
  // inteira grossa/da altura toda; agora é uma só) + etiqueta "Reativação"
  // em VERDE (token próprio, não o vexo-success semântico). Follow-up e os
  // 3 subtipos continuam no marrom/dourado.
  it('Reativação: borda fina azul (4 lados, sem engrossar) + 1 barrinha absoluta fina/curta na borda esquerda + etiqueta VERDE (card-type-reativacao-chip-text)', () => {
    const markup = renderToStaticMarkup(<ReactivationRail cards={[card({ kind: "REACTIVATION" })]} {...noopActions} />);
    expect(markup).toContain("border-vexo-cardTypeReativacao/35");
    // Nunca engrossar a borda em si (nem border-l-4, nem qualquer -l-).
    expect(markup).not.toMatch(/border-l-\d/);
    // Uma única barrinha, absoluta (fora do flex), fina (w-1) e curta (h-8,
    // bem menor que a altura do cartão) — não a altura inteira.
    const barMatches = markup.match(/<span aria-hidden="true" class="absolute left-0 top-1\/2 h-8 w-1 -translate-y-1\/2 rounded-full bg-vexo-accent"/g);
    expect(barMatches?.length).toBe(1);
    expect(markup).toContain("bg-vexo-cardTypeReativacaoChipText/16");
    expect(markup).toContain("text-vexo-cardTypeReativacaoChipText");
    // Etiqueta não é mais azul.
    expect(markup).not.toContain("bg-vexo-cardTypeReativacao/16");
    expect(markup).not.toContain("text-vexo-cardTypeReativacaoText");
  });

  it.each([
    ["Faltou", "NO_SHOW" as const, { kind: "NO_SHOW" as const, appointmentId: "appt-1", step: 1 }],
    ["Não agendou", "NEVER_SCHEDULED" as const, { kind: "NEVER_SCHEDULED" as const, conversationId: "conv-1", step: 1 }],
    ["Quente", "HOT_LEAD" as const, { kind: "HOT_LEAD" as const, conversationId: "conv-1", step: 1 }],
  ])('Follow-up / %s: borda e etiqueta tingidas de marrom/dourado (card-type-followup)', (_label, kind, actionKey) => {
    const markup = renderToStaticMarkup(<ReactivationRail cards={[card({ kind, actionKey, channel: "INSTAGRAM" })]} {...noopActions} />);
    expect(markup).toContain("border-vexo-cardTypeFollowup/35");
    expect(markup).toContain("bg-vexo-cardTypeFollowup/16");
    expect(markup).toContain("text-vexo-cardTypeFollowup");
  });

  it('card já enviado (grupo "Enviados") fica neutro mesmo sendo Reativação — não carrega a cor do tipo nem a barrinha', () => {
    const markup = renderToStaticMarkup(<ReactivationRail cards={[card({ kind: "REACTIVATION", sentAt: new Date() })]} {...noopActions} />);
    expect(markup).toContain("Enviados (1)");
    expect(markup).not.toContain("border-vexo-cardTypeReativacao");
    expect(markup).not.toContain("bg-vexo-cardTypeReativacaoChipText");
    expect(markup).not.toContain("absolute left-0 top-1/2 h-8 w-1");
  });

  it("a barrinha só aparece em cards de Reativação, nunca em Faltou/Quente/Não agendou", () => {
    const markup = renderToStaticMarkup(
      <ReactivationRail
        cards={[card({ kind: "NO_SHOW", actionKey: { kind: "NO_SHOW", appointmentId: "appt-1", step: 1 }, channel: "INSTAGRAM" })]}
        {...noopActions}
      />
    );
    expect(markup).not.toContain("absolute left-0 top-1/2 h-8 w-1");
  });
});
