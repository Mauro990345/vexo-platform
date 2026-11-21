import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Dois links INDEPENDENTES no mesmo modal (pedido explícito) — painel
// completo (sempre existiu) + a Fila de abordagem sozinha (novo). O modal
// começa fechado (useState(false)) — SSR estático não executa clique, só
// confirma que o botão que abre está lá; o conteúdo interno (as duas
// seções) é coberto pelos próprios testes de ClientPanelLinkSection/
// ClientFilaLinkSection.
vi.mock("@/app/crm/clinicas/actions", () => ({
  getOrCreateClientPanelLink: vi.fn(),
  revokeClientPanelLink: vi.fn(),
  getOrCreateClientFilaLink: vi.fn(),
  revokeClientFilaLink: vi.fn(),
}));

const { ClientAccessModal } = await import("./ClientAccessModal");

describe("ClientAccessModal", () => {
  it("renderiza o botão 'Criar painel' que abre o modal com os dois links", () => {
    const markup = renderToStaticMarkup(
      <ClientAccessModal clinicId="clinic-1" initialLink={null} initialFilaLink={null} />
    );
    expect(markup).toContain("Criar painel");
  });
});
