import { describe, it, expect, vi, beforeEach } from "vitest";

// Mesmo padrão de prova de bloqueio já usado em
// src/app/crm/clinicas/report-actions.test.ts e
// src/app/crm/clinicas/actions.test.ts: requireInternalSession rejeitando
// (mesmo efeito do redirect() real pra quem está logado como CLIENT, ver
// session.ts) precisa impedir que a rota chegue a ler QUALQUER dado da
// clínica — prova que o bloqueio desta rota (preview admin do Relatório,
// alcançável só pelo botão "Ver relatório" do painel de Contas) é no
// SERVIDOR, não só "o botão não aparece pro cliente" (pedido explícito,
// item 1).
const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const clinicFindUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinic: { findUnique: (...args: unknown[]) => clinicFindUniqueMock(...args) } },
}));

const getReportNumbersWithComparisonMock = vi.fn();
vi.mock("@/lib/report-metrics", () => ({
  getReportNumbersWithComparison: (...args: unknown[]) => getReportNumbersWithComparisonMock(...args),
}));

const { default: ClinicReportPreviewPage } = await import("./page");

describe("relatorio-preview (rota de configuração/preview admin) — bloqueio no servidor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sessão não-interna (ex.: cliente logado): requireInternalSession rejeita e a página nunca lê a clínica nem calcula números", async () => {
    requireInternalSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT /crm"));

    await expect(ClinicReportPreviewPage({ params: { id: "clinic-1" } })).rejects.toThrow();

    expect(clinicFindUniqueMock).not.toHaveBeenCalled();
    expect(getReportNumbersWithComparisonMock).not.toHaveBeenCalled();
  });
});
