import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Segundo link de acesso do cliente (pedido explícito) — mesmo padrão
// visual/estrutura do ClientPanelLinkSection, só que pra Fila sozinha.
vi.mock("@/app/crm/clinicas/actions", () => ({
  getOrCreateClientFilaLink: vi.fn(),
  revokeClientFilaLink: vi.fn(),
}));

const { ClientFilaLinkSection } = await import("./ClientFilaLinkSection");

describe("ClientFilaLinkSection", () => {
  it("sem link ainda: mostra o botão 'Gerar link de acesso', nada de URL", () => {
    const markup = renderToStaticMarkup(<ClientFilaLinkSection clinicId="clinic-1" initialLink={null} />);
    expect(markup).toContain("Gerar link de acesso");
    expect(markup).not.toContain("Copiar link");
  });

  it("com link já gerado: mostra a URL /acesso-fila/<token> e os botões Copiar/Cancelar", () => {
    const markup = renderToStaticMarkup(
      <ClientFilaLinkSection clinicId="clinic-1" initialLink={{ token: "abc123", url: "https://vexo.example.com/acesso-fila/abc123" }} />
    );
    expect(markup).toContain("https://vexo.example.com/acesso-fila/abc123");
    expect(markup).toContain("Copiar link");
    expect(markup).toContain("Cancelar acesso");
  });

  it("deixa claro que é SÓ a Fila (sem o painel)", () => {
    const markup = renderToStaticMarkup(<ClientFilaLinkSection clinicId="clinic-1" initialLink={null} />);
    expect(markup).toContain("Fila de abordagem");
  });
});
