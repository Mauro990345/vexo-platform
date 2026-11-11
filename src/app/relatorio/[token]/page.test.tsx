import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const deliveryFindUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinicReportDelivery: { findUnique: (...args: unknown[]) => deliveryFindUniqueMock(...args) } },
}));

const getReportNumbersWithComparisonMock = vi.fn();
vi.mock("@/lib/report-metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/report-metrics")>();
  return { ...actual, getReportNumbersWithComparison: (...args: unknown[]) => getReportNumbersWithComparisonMock(...args) };
});

const { default: ClinicReportPublicPage } = await import("./page");

// Outubro/2026 — o período que "Enviar agora" grava quando clicado em
// 10/11 (último período fechado). O link tem que mostrar exatamente ele,
// nunca o mês em andamento.
const OCT = { start: new Date("2026-10-01T03:00:00.000Z"), end: new Date("2026-11-01T03:00:00.000Z") };
const SENT_AT = new Date("2026-11-10T15:00:00.000Z");

describe("/relatorio/[token] — mostra exatamente o período enviado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReportNumbersWithComparisonMock.mockImplementation(async (_clinicId, _freq, period) => ({
      period,
      funnel: { contacted: 21, inConversation: 21, scheduled: 10, attended: 9, noShow: 0 },
      attendanceRate: 1,
      attendanceBase: 9,
      contactedFromApproachLogs: false,
      followUp: { received: 6, responded: 2 },
      reactivation: { sent: 5, returned: 2 },
      isSimulated: false,
      previousComparison: { contactedPct: null, inConversationPct: null, scheduledPct: null, attendedPct: null },
      weeklyApproached: [],
      evolution: [],
    }));
  });

  it("busca os números do período GRAVADO na entrega (não o de hoje) e renderiza esse período", async () => {
    deliveryFindUniqueMock.mockResolvedValue({
      clinicId: "clinic-1",
      periodType: "MONTHLY",
      periodStart: OCT.start,
      periodEnd: OCT.end,
      sentAt: SENT_AT,
      clinic: { name: "Clínica Teste", active: true },
    });

    const markup = renderToStaticMarkup(await ClinicReportPublicPage({ params: { token: "tok-123" } }));

    const [clinicIdArg, freqArg, periodArg, nowArg] = getReportNumbersWithComparisonMock.mock.calls[0]!;
    expect(clinicIdArg).toBe("clinic-1");
    expect(freqArg).toBe("MONTHLY");
    expect(periodArg).toEqual(OCT);
    expect(nowArg).toEqual(SENT_AT);
    expect(markup).toContain("outubro de 2026 (01/10 a 31/10)");
    expect(markup).not.toContain("novembro");
  });

  it("privacidade: token inexistente/revogado → 'Link inválido', sem número nenhum", async () => {
    deliveryFindUniqueMock.mockResolvedValue(null);
    const markup = renderToStaticMarkup(await ClinicReportPublicPage({ params: { token: "nao-existe" } }));
    expect(markup).toContain("Link inválido");
    expect(getReportNumbersWithComparisonMock).not.toHaveBeenCalled();
  });

  it("privacidade: clínica inativa → 'Link inválido'", async () => {
    deliveryFindUniqueMock.mockResolvedValue({ clinicId: "c", periodType: "MONTHLY", periodStart: OCT.start, periodEnd: OCT.end, sentAt: SENT_AT, clinic: { name: "X", active: false } });
    const markup = renderToStaticMarkup(await ClinicReportPublicPage({ params: { token: "tok" } }));
    expect(markup).toContain("Link inválido");
  });
});
