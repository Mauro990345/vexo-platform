import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Pedido explícito: aba "Abordagem" (não mais um botão solto no header) —
// ver ClientPanelTabs.tsx — dentro do painel do cliente (/dashboard),
// linkando pra /dashboard/fila (a Fila do cliente, ver dashboard/fila/
// page.tsx). `abordagemHref` só é passado aqui porque quem chega até
// /dashboard necessariamente tem o painel completo (requireClientSession
// já bloqueia scope="fila" antes, ver session.test.ts/middleware.test.ts).
const requireClientSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireClientSession: (...args: unknown[]) => requireClientSessionMock(...args),
}));

vi.mock("@/components/ClientPanelView", () => ({
  ClientPanelView: ({ abordagemHref }: { abordagemHref?: string }) => <div data-testid="panel">{abordagemHref}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireClientSessionMock.mockResolvedValue({ user: { role: "CLIENT", clinicId: "clinic-1" } });
});

describe("ClientDashboardPage — aba 'Abordagem'", () => {
  it("passa abordagemHref='/dashboard/fila' pro ClientPanelView (vira a aba, não mais um botão solto)", async () => {
    const { default: ClientDashboardPage } = await import("./page");
    const element = await ClientDashboardPage({ searchParams: {} });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("/dashboard/fila");
  });
});
