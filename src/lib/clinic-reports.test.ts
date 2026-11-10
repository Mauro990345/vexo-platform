import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";

const sendWhatsappMessageMock = vi.fn();
vi.mock("@/lib/whatsapp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp")>();
  return { ...actual, sendWhatsappMessage: sendWhatsappMessageMock };
});

const clinicFindUniqueMock = vi.fn();
const configFindUniqueMock = vi.fn();
const configFindManyMock = vi.fn();
const deliveryFindUniqueMock = vi.fn();
const deliveryFindManyMock = vi.fn();
const deliveryUpsertMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: { findUnique: clinicFindUniqueMock },
    clinicReportConfig: { findUnique: configFindUniqueMock, findMany: configFindManyMock },
    clinicReportDelivery: { findUnique: deliveryFindUniqueMock, findMany: deliveryFindManyMock, upsert: deliveryUpsertMock },
  },
}));

const { sendClinicReportDelivery, processClinicReports, formatClinicReportWhatsAppMessage, isClinicReportSendAllowed, CLINIC_REPORT_SEND_RESTRICTED_TO_DEMO } =
  await import("./clinic-reports");
const { computeMonthlyPeriod } = await import("./report-period");

const PERIOD = computeMonthlyPeriod(new Date("2026-11-30T20:00:00.000Z"));
const NOW = new Date("2026-11-30T20:00:00.000Z");
const REAL_CLINIC_ID = "clinic-real-1";

function baseClinic(overrides: Partial<{ name: string; whatsappInstanceName: string | null; clientWhatsappNumber: string | null }> = {}) {
  return { name: "Clínica Teste", whatsappInstanceName: "clinic-teste-instance", clientWhatsappNumber: "11988887777", ...overrides };
}

function baseConfig(overrides: Partial<{ whatsappNumber: string | null }> = {}) {
  return { whatsappNumber: "11999998888", frequency: "MONTHLY", ...overrides };
}

describe("isClinicReportSendAllowed / CLINIC_REPORT_SEND_RESTRICTED_TO_DEMO", () => {
  it("fase de teste: só a Demo pode receber envios de verdade", () => {
    expect(CLINIC_REPORT_SEND_RESTRICTED_TO_DEMO).toBe(true);
    expect(isClinicReportSendAllowed(DEMO_CLINIC_ID)).toBe(true);
    expect(isClinicReportSendAllowed(REAL_CLINIC_ID)).toBe(false);
  });
});

describe("formatClinicReportWhatsAppMessage", () => {
  it("segue o texto pedido, nunca cita M8 Growth", () => {
    const text = formatClinicReportWhatsAppMessage({
      clinicName: "Clínica Demo VEXO",
      frequency: "MONTHLY",
      period: PERIOD,
      link: "https://app.vexo.ai/relatorio/abc123",
    });
    expect(text).toBe("Olá! Segue o relatório de novembro de 2026 da Clínica Demo VEXO, gerado pelo VEXO IA: https://app.vexo.ai/relatorio/abc123");
    expect(text).not.toContain("M8 Growth");
  });
});

describe("sendClinicReportDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clinicFindUniqueMock.mockResolvedValue(baseClinic());
    configFindUniqueMock.mockResolvedValue(baseConfig());
    deliveryFindUniqueMock.mockResolvedValue(null);
    sendWhatsappMessageMock.mockResolvedValue(undefined);
  });

  it("clínica fora da Demo, durante a fase de teste: recusa ANTES de tentar enviar (nem consulta clínica/config)", async () => {
    const result = await sendClinicReportDelivery({ clinicId: REAL_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "AUTO", now: NOW });
    expect(result).toEqual({ ok: false, reason: "restricted_to_demo" });
    expect(clinicFindUniqueMock).not.toHaveBeenCalled();
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("número do relatório igual ao número da própria clínica: bloqueia o autoenvio, nunca chama sendWhatsappMessage", async () => {
    configFindUniqueMock.mockResolvedValue(baseConfig({ whatsappNumber: "11988887777" })); // mesmo nº de clientWhatsappNumber
    const result = await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "AUTO", now: NOW });
    expect(result).toEqual({ ok: false, reason: "self_send_blocked" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("número do relatório igual, mas com formatação diferente (com 55 e pontuação): o guard normaliza antes de comparar", async () => {
    configFindUniqueMock.mockResolvedValue(baseConfig({ whatsappNumber: "+55 (11) 98888-7777" }));
    const result = await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "AUTO", now: NOW });
    expect(result).toEqual({ ok: false, reason: "self_send_blocked" });
  });

  it("sem número configurado: recusa sem tentar enviar", async () => {
    configFindUniqueMock.mockResolvedValue(baseConfig({ whatsappNumber: null }));
    const result = await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "AUTO", now: NOW });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("clínica sem WhatsApp conectado: registra a falha e nunca chama sendWhatsappMessage", async () => {
    clinicFindUniqueMock.mockResolvedValue(baseClinic({ whatsappInstanceName: null }));
    const result = await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "AUTO", now: NOW });
    expect(result).toEqual({ ok: false, reason: "whatsapp_not_connected" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
    expect(deliveryUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: "FAILED", lastError: "Clínica sem WhatsApp conectado." }) })
    );
  });

  it("envio bem-sucedido: chama sendWhatsappMessage com a instância da CLÍNICA (não um remetente separado) e grava sentAt/status SENT", async () => {
    const result = await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "AUTO", now: NOW });

    expect(result).toEqual({ ok: true, alreadySent: false });
    expect(sendWhatsappMessageMock).toHaveBeenCalledWith("clinic-teste-instance", "11999998888", expect.stringContaining("Olá! Segue o relatório"));
    expect(deliveryUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: "SENT", sentAt: NOW, lastError: null }) })
    );
  });

  it("falha no envio: incrementa attempt e grava status FAILED com o erro, sem marcar sentAt", async () => {
    sendWhatsappMessageMock.mockRejectedValue(new Error("Evolution API fora do ar"));
    const result = await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "AUTO", now: NOW });

    expect(result).toEqual({ ok: false, reason: "send_failed" });
    expect(deliveryUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: "FAILED", attempt: 1, lastError: "Evolution API fora do ar" }) })
    );
  });

  it("idempotência (AUTO): período já com sentAt marcado nunca tenta enviar de novo", async () => {
    deliveryFindUniqueMock.mockResolvedValue({ id: "d1", token: "tok1", attempt: 1, sentAt: NOW });
    const result = await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "AUTO", now: NOW });

    expect(result).toEqual({ ok: true, alreadySent: true });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
    expect(deliveryUpsertMock).not.toHaveBeenCalled();
  });

  it("MANUAL ('Enviar agora') reenvia mesmo com sentAt já marcado — é a própria ferramenta de teste pedida", async () => {
    deliveryFindUniqueMock.mockResolvedValue({ id: "d1", token: "tok1", attempt: 1, sentAt: NOW });
    const result = await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "MANUAL", now: NOW });

    expect(result).toEqual({ ok: true, alreadySent: false });
    expect(sendWhatsappMessageMock).toHaveBeenCalledTimes(1);
  });

  it("AUTO, já esgotou as 3 tentativas sem sucesso: não tenta de novo", async () => {
    deliveryFindUniqueMock.mockResolvedValue({ id: "d1", token: "tok1", attempt: 3, sentAt: null });
    const result = await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "AUTO", now: NOW });

    expect(result).toEqual({ ok: false, reason: "send_failed" });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("MANUAL ignora o limite de 3 tentativas (ferramenta de teste, admin decide repetir)", async () => {
    deliveryFindUniqueMock.mockResolvedValue({ id: "d1", token: "tok1", attempt: 3, sentAt: null });
    const result = await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "MANUAL", now: NOW });

    expect(result).toEqual({ ok: true, alreadySent: false });
    expect(sendWhatsappMessageMock).toHaveBeenCalledTimes(1);
  });

  it("reaproveita o token já existente em vez de gerar um novo a cada tentativa", async () => {
    deliveryFindUniqueMock.mockResolvedValue({ id: "d1", token: "token-fixo-123", attempt: 1, sentAt: null });
    await sendClinicReportDelivery({ clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", period: PERIOD, trigger: "AUTO", now: NOW });

    expect(sendWhatsappMessageMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("token-fixo-123"));
  });
});

describe("processClinicReports — idempotência e retry do worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clinicFindUniqueMock.mockResolvedValue(baseClinic());
    configFindUniqueMock.mockResolvedValue(baseConfig());
    deliveryFindManyMock.mockResolvedValue([]);
    configFindManyMock.mockResolvedValue([]);
    sendWhatsappMessageMock.mockResolvedValue(undefined);
  });

  it("clínica fora da Demo (fase de teste) nunca gera um envio automático, mesmo com autoSendEnabled e dia de envio batendo", async () => {
    configFindManyMock.mockResolvedValue([
      { clinicId: REAL_CLINIC_ID, frequency: "MONTHLY", monthlyDayMode: "LAST_DAY", monthlyFixedDay: null, sendHour: 17, sendMinute: 0 },
    ]);
    deliveryFindUniqueMock.mockResolvedValue(null);

    const result = await processClinicReports(new Date("2026-11-30T20:00:00.000Z")); // 17h BRT, último dia do mês

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("não é dia/horário de envio: não cria nenhuma entrega nova pra Demo", async () => {
    configFindManyMock.mockResolvedValue([
      { clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", monthlyDayMode: "LAST_DAY", monthlyFixedDay: null, sendHour: 17, sendMinute: 0 },
    ]);
    const result = await processClinicReports(new Date("2026-11-15T20:00:00.000Z")); // dia 15, não é o último dia do mês
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("dia/horário de envio chegaram pra Demo: envia e conta 1 'sent'", async () => {
    configFindManyMock.mockResolvedValue([
      { clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", monthlyDayMode: "LAST_DAY", monthlyFixedDay: null, sendHour: 17, sendMinute: 0 },
    ]);
    deliveryFindUniqueMock.mockResolvedValue(null);

    const result = await processClinicReports(new Date("2026-11-30T20:00:00.000Z"));

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(sendWhatsappMessageMock).toHaveBeenCalledTimes(1);
  });

  it("já existe uma entrega pro período de hoje: nunca cria uma segunda, nunca envia de novo (idempotência mesmo com o worker rodando de novo no mesmo dia)", async () => {
    configFindManyMock.mockResolvedValue([
      { clinicId: DEMO_CLINIC_ID, frequency: "MONTHLY", monthlyDayMode: "LAST_DAY", monthlyFixedDay: null, sendHour: 17, sendMinute: 0 },
    ]);
    deliveryFindUniqueMock.mockResolvedValue({ id: "d1" }); // já existe

    const result = await processClinicReports(new Date("2026-11-30T20:00:00.000Z"));

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("retry: entrega com falha anterior (attempt=1, sentAt null) é tentada de novo no dia seguinte, usando o MESMO período congelado", async () => {
    const frozenPeriod = computeMonthlyPeriod(new Date("2026-11-15T12:00:00.000Z"));
    deliveryFindManyMock.mockResolvedValue([
      { clinicId: DEMO_CLINIC_ID, periodType: "MONTHLY", periodStart: frozenPeriod.start, periodEnd: frozenPeriod.end },
    ]);
    deliveryFindUniqueMock.mockResolvedValue({ id: "d1", token: "tok1", attempt: 1, sentAt: null });

    // "Hoje" já é dezembro — se o worker recalculasse o período a partir
    // de "hoje" (bug), mandaria pro mês errado; o teste confirma que usa
    // o período CONGELADO da própria linha (novembro), não o de hoje.
    const result = await processClinicReports(new Date("2026-12-02T12:00:00.000Z"));

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(sendWhatsappMessageMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("novembro de 2026"));
  });

  it("retry: entrega já com 3 tentativas falhadas não entra mais na busca de retry (query já filtra attempt < 3)", async () => {
    // A própria query (`attempt: { lt: REPORT_MAX_SEND_ATTEMPTS }`) já
    // garante isso — este teste confirma que, SE a query devolvesse uma
    // (hipótese de bug na query), sendClinicReportDelivery ainda recusaria.
    deliveryFindManyMock.mockResolvedValue([{ clinicId: DEMO_CLINIC_ID, periodType: "MONTHLY", periodStart: PERIOD.start, periodEnd: PERIOD.end }]);
    deliveryFindUniqueMock.mockResolvedValue({ id: "d1", token: "tok1", attempt: 3, sentAt: null });

    const result = await processClinicReports(NOW);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });
});
