import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Pedido explícito: o preview do admin ("Ver painel de [clínica]") estava
// sem a aba "Abordagem" que o /dashboard de verdade do cliente já mostra —
// inconsistente. Passa abordagemHref pra rota interna da Fila por clínica
// (/crm/clinicas/[id]/abordagem/fila, já existe, já gated por
// requireInternalSession — ver abordagem/fila/page.tsx), não a rota do
// cliente (/dashboard/fila, que exigiria sessão CLIENT).
const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinic: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

vi.mock("@/app/crm/clinicas/actions", () => ({
  setAppointmentAttendanceAction: vi.fn(),
  setAppointmentReturnPeriodAction: vi.fn(),
  toggleReactivationCardSentAction: vi.fn(),
  sendReactivationWhatsAppMessageAction: vi.fn(),
  toggleNoShowCardSentAction: vi.fn(),
  sendNoShowCardWhatsAppMessageAction: vi.fn(),
  toggleHotLeadCardSentAction: vi.fn(),
  toggleNeverScheduledCardSentAction: vi.fn(),
}));

vi.mock("@/components/ClientPanelView", () => ({
  ClientPanelView: ({ abordagemHref, bonusHref }: { abordagemHref?: string; bonusHref?: string }) => (
    <div data-testid="panel">
      {abordagemHref}
      {bonusHref}
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
  findUniqueMock.mockResolvedValue({ id: "clinic-1" });
});

describe("ClientPanelPreviewPage ('Ver painel de [clínica]') — aba 'Abordagem'", () => {
  it("passa abordagemHref pra rota interna da Fila por clínica, consistente com o /dashboard real", async () => {
    const { default: ClientPanelPreviewPage } = await import("./page");
    const element = await ClientPanelPreviewPage({ params: { id: "clinic-1" }, searchParams: {} });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("/crm/clinicas/clinic-1/abordagem/fila");
    expect(markup).toContain("/crm/painel-cliente/clinic-1/bonus");
  });
});
