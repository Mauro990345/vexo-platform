import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mesmo pedido do preview do Painel ("Ver painel de [clínica]") — a aba
// "Abordagem" também precisa aparecer aqui, no preview do Bônus Full Face,
// pra consistência total com o que o cliente vê.
const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinic: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

vi.mock("@/components/FullFaceBonusPage", () => ({
  FullFaceBonusPage: ({ abordagemHref, panelHref }: { abordagemHref?: string; panelHref?: string }) => (
    <div data-testid="bonus-preview">
      {abordagemHref}
      {panelHref}
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
  findUniqueMock.mockResolvedValue({ id: "clinic-1" });
});

describe("ClientBonusPreviewPage — aba 'Abordagem'", () => {
  it("passa abordagemHref pra rota interna da Fila por clínica", async () => {
    const { default: ClientBonusPreviewPage } = await import("./page");
    const element = await ClientBonusPreviewPage({ params: { id: "clinic-1" } });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("/crm/clinicas/clinic-1/abordagem/fila");
    expect(markup).toContain("/crm/painel-cliente/clinic-1");
  });
});
