import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Pedido explícito: botão "Abrir Fila de abordagem" dentro do painel do
// cliente (/dashboard), linkando pra /dashboard/fila (a Fila do cliente,
// ver dashboard/fila/page.tsx) — só aparece aqui porque quem chega até
// /dashboard necessariamente tem o painel completo (requireClientSession
// já bloqueia scope="fila" antes, ver session.test.ts/middleware.test.ts).
const requireClientSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireClientSession: (...args: unknown[]) => requireClientSessionMock(...args),
}));

vi.mock("@/components/ClientPanelView", () => ({
  ClientPanelView: ({ headerAction }: { headerAction?: React.ReactNode }) => <div data-testid="panel">{headerAction}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireClientSessionMock.mockResolvedValue({ user: { role: "CLIENT", clinicId: "clinic-1" } });
});

describe("ClientDashboardPage — botão 'Abrir Fila de abordagem'", () => {
  it("renderiza o link pra /dashboard/fila dentro do headerAction do painel", async () => {
    const { default: ClientDashboardPage } = await import("./page");
    const element = await ClientDashboardPage({ searchParams: {} });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('href="/dashboard/fila"');
    expect(markup).toContain("Abrir Fila de abordagem");
  });
});
