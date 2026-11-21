import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Pedido explícito: link "Status" no menu global (grupo "Operação"), com
// badge só quando houver >= 1 mensagem FAILED — mesma contagem que
// dispatch-status/page.tsx já usa (where: { status: "FAILED" }).
vi.mock("next/navigation", () => ({ usePathname: () => "/crm" }));
vi.mock("@/components/SignOutButton", () => ({ SignOutButton: () => null }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { role: "INTERNAL_ADMIN", name: "Admin" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const messageCountMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { message: { count: messageCountMock } },
}));

async function render() {
  const { default: CrmGlobalLayout } = await import("./layout");
  const element = await CrmGlobalLayout({ children: <div /> });
  return renderToStaticMarkup(element);
}

describe("CrmGlobalLayout — link Status + badge de FAILED", () => {
  it("sempre mostra o link para /crm/dispatch-status no grupo Operação", async () => {
    messageCountMock.mockResolvedValue(0);
    const markup = await render();
    expect(markup).toContain('href="/crm/dispatch-status"');
    expect(markup).toContain(">Status<");
  });

  it("conta mensagens FAILED (mesmo filtro da página de Status) pro badge", async () => {
    messageCountMock.mockResolvedValue(5);
    await render();
    expect(messageCountMock).toHaveBeenCalledWith({ where: { status: "FAILED" } });
  });

  it("1+ FAILED: mostra o número em vermelho (vexo-error) ao lado de Status", async () => {
    messageCountMock.mockResolvedValue(2);
    const markup = await render();
    expect(markup).toContain(">2<");
    expect(markup).toContain("bg-vexo-error");
  });

  it("0 FAILED: não mostra nenhum badge", async () => {
    messageCountMock.mockResolvedValue(0);
    const markup = await render();
    expect(markup).not.toContain("bg-vexo-error");
  });
});
