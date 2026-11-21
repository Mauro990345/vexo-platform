import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// O item "Status" (com badge de falhas) existiu aqui entre as PRs #258 e
// #261 e foi removido de novo, definitivo — só um lugar pra isso, dentro
// da sidebar de cada clínica (ver clinic-nav.test.ts). O menu global volta
// a ter só "Contas" e "Abordagem", como era antes da PR #258.
vi.mock("next/navigation", () => ({ usePathname: () => "/crm" }));
vi.mock("@/components/SignOutButton", () => ({ SignOutButton: () => null }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { role: "INTERNAL_ADMIN", name: "Admin" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

async function render() {
  const { default: CrmGlobalLayout } = await import("./layout");
  const element = await CrmGlobalLayout({ children: <div /> });
  return renderToStaticMarkup(element);
}

describe("CrmGlobalLayout — só 'Contas' e 'Abordagem', sem 'Status' nem badge nenhum", () => {
  it("não tem mais link nenhum pra /crm/dispatch-status", async () => {
    const markup = await render();
    expect(markup).not.toContain('href="/crm/dispatch-status"');
    expect(markup).not.toContain(">Status<");
  });

  it("não mostra nenhum badge vermelho (vexo-error) no menu global", async () => {
    const markup = await render();
    expect(markup).not.toContain("bg-vexo-error");
  });

  it("mantém só Contas e Abordagem no grupo Operação", async () => {
    const markup = await render();
    expect(markup).toContain('href="/crm"');
    expect(markup).toContain('href="/crm/abordagem"');
  });
});
