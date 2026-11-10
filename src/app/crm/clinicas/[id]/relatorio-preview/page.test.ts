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

const { computeLastClosedPeriod } = await import("@/lib/report-period");
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

describe("relatorio-preview — sempre o ÚLTIMO PERÍODO FECHADO (nunca o em andamento)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
    clinicFindUniqueMock.mockResolvedValue({ name: "Clínica Teste" });
    getReportNumbersWithComparisonMock.mockResolvedValue({
      period: { start: new Date(), end: new Date() },
      funnel: { contacted: 0, inConversation: 0, scheduled: 0, attended: 0, noShow: 0 },
      attendanceRate: null,
      followUpRecovered: 0,
      reactivation: { sent: 0, returned: 0 },
      isSimulated: false,
      previousComparison: { contactedPct: null, inConversationPct: null, scheduledPct: null, attendedPct: null },
    });
  });

  it("chama getReportNumbersWithComparison com o período MENSAL fechado (mês anterior), não o mês em andamento", async () => {
    await ClinicReportPreviewPage({ params: { id: "clinic-1" } });

    const monthlyCall = getReportNumbersWithComparisonMock.mock.calls.find((call) => call[1] === "MONTHLY")!;
    const expectedPeriod = computeLastClosedPeriod("MONTHLY", monthlyCall[3] as Date);
    expect((monthlyCall[2] as { start: Date }).start.getTime()).toBe(expectedPeriod.start.getTime());
    expect((monthlyCall[2] as { end: Date }).end.getTime()).toBe(expectedPeriod.end.getTime());
  });

  it("chama getReportNumbersWithComparison com a quinzena FECHADA, não a em andamento", async () => {
    await ClinicReportPreviewPage({ params: { id: "clinic-1" } });

    const biweeklyCall = getReportNumbersWithComparisonMock.mock.calls.find((call) => call[1] === "BIWEEKLY")!;
    const expectedPeriod = computeLastClosedPeriod("BIWEEKLY", biweeklyCall[3] as Date);
    expect((biweeklyCall[2] as { start: Date }).start.getTime()).toBe(expectedPeriod.start.getTime());
  });
});
