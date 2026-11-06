// Prévia do estilo do "Bônus Full Face" na tela Automações — pedido
// explícito ("pra vermos na prática"): fundo/texto dos blocos principais
// usam a MESMA --bonus-green do guia (src/app/globals.css), aplicada aqui
// via um override escopado de --vexo-accent/--vexo-accent-fg (ver
// comentário no page.tsx) — nenhuma outra tela (Painel, Follow-up,
// Agenda) é afetada, porque o override só existe dentro da própria árvore
// desta página.
//
// Os blocos principais usam `ring-1 ring-inset` (box-shadow, não ocupa
// espaço de layout) em vez de `border` de propósito: um `border` real
// reduz a largura útil do conteúdo em ~4px (2px de cada lado, box-sizing:
// border-box) e, no celular, isso bastou pra empurrar um parágrafo pra
// uma linha extra — aumentando a altura do bloco (regressão real,
// encontrada e corrigida nesta rodada; "sem aumentar alturas" era pedido
// explícito). Este teste trava os dois pontos.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  requireInternalSession: vi.fn(async () => ({ user: { role: "ADMIN" } })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      findUnique: vi.fn(async () => ({
        id: "clinic-1",
        address: null,
        clientWhatsappNumber: null,
        active: true,
        fullFaceBonusEnabled: true,
        reminderConfig: null,
        reactivationConfig: null,
        hotLeadConfig: null,
      })),
    },
  },
}));

describe("Automações — prévia do verde do Bônus (escopada, sem aumentar layout)", () => {
  it("o elemento raiz sobrescreve --vexo-accent/--vexo-accent-fg pra --bonus-green + texto escuro de alto contraste", async () => {
    const { default: ClinicAutomationPage } = await import("./page");
    const element = await ClinicAutomationPage({ params: { id: "clinic-1" } });
    const style = element.props.style as Record<string, string>;
    expect(style["--vexo-accent"]).toBe("var(--bonus-green)");
    // Mesmo tom escuro que o guia usa sobre o fill verde (--on-green,
    // #08201d) — branco (o --vexo-accent-fg global) teria contraste ruim
    // sobre esse verde mais claro.
    expect(style["--vexo-accent-fg"]).toBe("8 32 29");
  });

  it("os blocos principais usam ring-inset (não border) — não reduz a largura do conteúdo", async () => {
    const { default: ClinicAutomationPage } = await import("./page");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const element = await ClinicAutomationPage({ params: { id: "clinic-1" } });
    const markup = renderToStaticMarkup(element);

    // As 6 superfícies "principais" (form de configuração, os dois
    // lembretes, prazos de retorno, quente, abordagens) devem usar o
    // wash + ring, nunca um `border` plano (que comeria largura).
    const wrapperClassMatches = markup.match(/class="[^"]*ring-vexo-accent\/30[^"]*"/g) ?? [];
    expect(wrapperClassMatches.length).toBeGreaterThanOrEqual(6);
    for (const cls of wrapperClassMatches) {
      expect(cls).toContain("ring-1");
      expect(cls).toContain("ring-inset");
      expect(cls).not.toMatch(/\bborder\b(?!-)/); // sem `border` solto (classe de largura de borda)
    }
  });
});
