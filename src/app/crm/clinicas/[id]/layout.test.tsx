import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Pedido explícito: o item "Status" voltou pra sidebar de CADA clínica
// (buildClinicNavGroups), com um badge de contagem de FAILED filtrado só
// pra ela — mesma contagem que /crm/clinicas/[id]/status já usa (status
// "FAILED" + conversation.clinicId), calculada aqui no layout e passada
// pra buildClinicNavGroups.
vi.mock("next/navigation", () => ({ usePathname: () => "/crm/clinicas/clinic-1", notFound: vi.fn() }));
vi.mock("@/components/SignOutButton", () => ({ SignOutButton: () => null }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { role: "INTERNAL_ADMIN", name: "Admin" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const clinicFindUniqueMock = vi.fn();
const messageCountMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinic: { findUnique: clinicFindUniqueMock }, message: { count: messageCountMock } },
}));

async function render() {
  const { default: ClinicLayout } = await import("./layout");
  const element = await ClinicLayout({ children: <div />, params: { id: "clinic-1" } });
  return renderToStaticMarkup(element);
}

describe("ClinicLayout — badge de FAILED no item 'Status' da sidebar, filtrado por clínica", () => {
  it("conta FAILED não-descartadas só desta clínica (mesmo where da página de Status)", async () => {
    clinicFindUniqueMock.mockResolvedValue({ id: "clinic-1", name: "Clínica Demo" });
    messageCountMock.mockResolvedValue(0);
    await render();
    expect(messageCountMock).toHaveBeenCalledWith({
      where: { status: "FAILED", dismissedAt: null, conversation: { clinicId: "clinic-1" } },
    });
  });

  it("1+ FAILED desta clínica: mostra o badge vermelho (vexo-error) ao lado de Status", async () => {
    clinicFindUniqueMock.mockResolvedValue({ id: "clinic-1", name: "Clínica Demo" });
    messageCountMock.mockResolvedValue(4);
    const markup = await render();
    expect(markup).toContain(">4<");
    expect(markup).toContain("bg-vexo-error");
  });

  it("0 FAILED desta clínica: sem badge", async () => {
    clinicFindUniqueMock.mockResolvedValue({ id: "clinic-1", name: "Clínica Demo" });
    messageCountMock.mockResolvedValue(0);
    const markup = await render();
    expect(markup).not.toContain("bg-vexo-error");
  });
});
