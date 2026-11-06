import { describe, it, expect, vi } from "vitest";

// Item 1 (bug "aba Bônus não aparece no computador") — causa real
// confirmada: /crm/clinicas/[id]/painel/page.tsx nunca passava a prop
// `bonusHref` pro ClientPanelView, então shouldShowClientBonusTab (ver
// ClientPanelView.test.ts) sempre recebia undefined ali e a aba nunca
// renderizava NESSA ROTA — em NENHUMA largura de tela. Não era cache nem
// viewport: era uma prop faltando numa das três rotas que montam o
// Painel. Este teste chama cada page.tsx direto (JSX não executa o
// componente, só cria o elemento — então não precisamos renderizar
// ClientPanelView de verdade nem bater no banco) e confirma que as TRÊS
// rotas passam um bonusHref não-vazio pro ClientPanelView.
vi.mock("@/lib/session", () => ({
  requireClientSession: vi.fn(async () => ({ user: { clinicId: "clinic-1" } })),
  requireInternalSession: vi.fn(async () => ({ user: { role: "ADMIN" } })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      findUnique: vi.fn(async () => ({ id: "clinic-1" })),
      findUniqueOrThrow: vi.fn(async () => ({ clientPanelLink: null })),
    },
  },
}));

describe("rotas que montam o Painel do cliente — todas devem passar bonusHref", () => {
  it("/dashboard (painel da própria clínica)", async () => {
    const { default: ClientDashboardPage } = await import("./dashboard/page");
    const element = await ClientDashboardPage({ searchParams: {} });
    expect(element.props.bonusHref).toBe("/dashboard/bonus");
  });

  it("/crm/painel-cliente/[id] (admin vendo o painel em nova aba)", async () => {
    const { default: ClientPanelPreviewPage } = await import("./crm/painel-cliente/[id]/page");
    const element = await ClientPanelPreviewPage({ params: { id: "clinic-1" }, searchParams: {} });
    expect(element.props.bonusHref).toBe("/crm/painel-cliente/clinic-1/bonus");
  });

  it("/crm/clinicas/[id]/painel (admin vendo o painel dentro da sidebar da clínica) — era aqui que faltava", async () => {
    const { default: ClinicPainelPage } = await import("./crm/clinicas/[id]/painel/page");
    const element = await ClinicPainelPage({ params: { id: "clinic-1" }, searchParams: {} });
    expect(element.props.bonusHref).toBe("/crm/clinicas/clinic-1/bonus");
  });
});
