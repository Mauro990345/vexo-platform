import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientPanelTabs } from "./ClientPanelTabs";

// Pedido explícito: aba "Abordagem" (Fila de abordagem), no MESMO
// lugar/estilo de "Painel"/"Bônus Full Face" — não um botão solto em outro
// canto da tela (era isso antes, ver dashboard/page.tsx). Só aparece
// quando `abordagemHref` é passado; "Bônus Full Face" continua dependendo
// só de `bonusHref` (inalterado) — os dois são independentes entre si.
describe("ClientPanelTabs — aba 'Abordagem'", () => {
  it("sem abordagemHref: só Painel/Bônus, sem a aba Abordagem", () => {
    const markup = renderToStaticMarkup(
      <ClientPanelTabs active="painel" panelHref="/dashboard" bonusHref="/dashboard/bonus" />
    );
    expect(markup).toContain("Bônus Full Face");
    expect(markup).not.toContain("Abordagem");
  });

  it("com abordagemHref: aparece a aba 'Abordagem' linkando pra rota certa, ao lado das outras", () => {
    const markup = renderToStaticMarkup(
      <ClientPanelTabs active="painel" panelHref="/dashboard" bonusHref="/dashboard/bonus" abordagemHref="/dashboard/fila" />
    );
    expect(markup).toContain("Painel");
    expect(markup).toContain("Bônus Full Face");
    expect(markup).toContain("Abordagem");
    expect(markup).toMatch(/<a[^>]*href="\/dashboard\/fila"[^>]*>Abordagem<\/a>/);
  });

  it("abordagemHref presente mesmo SEM bonusHref (conta sem Bônus liberado): a linha de abas aparece só com Painel/Abordagem", () => {
    const markup = renderToStaticMarkup(<ClientPanelTabs active="painel" panelHref="/dashboard" abordagemHref="/dashboard/fila" />);
    expect(markup).toContain("Painel");
    expect(markup).toContain("Abordagem");
    expect(markup).not.toContain("Bônus Full Face");
  });

  it('active="abordagem": a aba Abordagem fica marcada como atual (aria-current)', () => {
    const markup = renderToStaticMarkup(
      <ClientPanelTabs active="abordagem" panelHref="/dashboard" bonusHref="/dashboard/bonus" abordagemHref="/dashboard/fila" />
    );
    const abordagemIdx = markup.indexOf(">Abordagem<");
    const linkStart = markup.lastIndexOf("<a", abordagemIdx);
    expect(markup.slice(linkStart, abordagemIdx)).toContain('aria-current="page"');
  });
});
