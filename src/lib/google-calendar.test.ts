import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const googleCalendarAccountFindUniqueMock = vi.fn();
const googleCalendarAccountUpdateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    googleCalendarAccount: {
      findUnique: (...args: unknown[]) => googleCalendarAccountFindUniqueMock(...args),
      update: (...args: unknown[]) => googleCalendarAccountUpdateMock(...args),
    },
  },
}));

const sendWhatsappMessageMock = vi.fn();
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsappMessage: (...args: unknown[]) => sendWhatsappMessageMock(...args),
  formatGoogleCalendarReconnectAlert: (params: { clinicName: string; reason: string }) =>
    `alerta-reconexao:${params.clinicName}:${params.reason}`,
}));

vi.mock("@/lib/crypto", () => ({ decryptToken: (v: string) => v, encryptToken: (v: string) => v }));

// google-calendar.ts importa googleapis no topo do arquivo (usado por
// clientForClinic/checkAvailability/etc, nenhum dos quais estes testes
// exercitam) — mockado só pra manter o teste hermético e rápido, sem
// carregar o SDK de verdade.
vi.mock("googleapis", () => ({
  google: { auth: { OAuth2: vi.fn() }, calendar: vi.fn(), oauth2: vi.fn() },
}));

import { withGoogleCalendarCall, markGoogleCalendarNeedsReconnect } from "@/lib/google-calendar";

// GaxiosError (a classe de erro real que a lib googleapis lança, ver
// node_modules/gaxios/build/src/common.js) sempre estende Error, com
// `.status`/`.response` como propriedades da instância — replicado aqui
// como um Error de verdade (não um objeto plano) porque isRetryableGoogleApiError
// e o extrator de mensagem em withGoogleCalendarCall (google-calendar.ts)
// usam `err instanceof Error`, que só é true pra instâncias reais.
function gaxiosLikeError(props: { status?: number; response?: unknown; message?: string }): Error {
  const err = new Error(props.message ?? "Gaxios error") as Error & { status?: number; response?: unknown };
  if (props.status !== undefined) err.status = props.status;
  if (props.response !== undefined) err.response = props.response;
  return err;
}

describe("withGoogleCalendarCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    googleCalendarAccountFindUniqueMock.mockResolvedValue({
      needsReconnectAt: null,
      clinic: { name: "Clínica Teste", notifyWhatsappNumber: "5511987654321", whatsappInstanceName: "clinica-teste" },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tenta de novo num 429 (erro passageiro do Google) e devolve o resultado quando a 2ª tentativa funciona", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(gaxiosLikeError({ status: 429, message: "rate limited" }))
      .mockResolvedValueOnce("ok");

    const promise = withGoogleCalendarCall("clinic-1", "teste", fn);
    await vi.advanceTimersByTimeAsync(500);

    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(googleCalendarAccountUpdateMock).not.toHaveBeenCalled();
  });

  it("tenta de novo num 5xx e num erro de rede (sem status HTTP nenhum, só Error genérico)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(gaxiosLikeError({ status: 503, message: "service unavailable" }))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce("ok");

    const promise = withGoogleCalendarCall("clinic-1", "teste", fn);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("erro permanente (400 genérico, não invalid_grant) falha direto, sem retry e sem marcar reconexão", async () => {
    const fn = vi.fn().mockRejectedValue(gaxiosLikeError({ status: 400, message: "Bad Request" }));

    await expect(withGoogleCalendarCall("clinic-1", "teste", fn)).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(googleCalendarAccountUpdateMock).not.toHaveBeenCalled();
  });

  it("invalid_grant marca a clínica pra reconectar e avisa a secretária (1ª vez que acontece)", async () => {
    const fn = vi.fn().mockRejectedValue(
      gaxiosLikeError({
        status: 400,
        response: { data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } },
        message: "invalid_grant",
      })
    );

    await expect(withGoogleCalendarCall("clinic-1", "teste", fn)).rejects.toBeTruthy();

    expect(googleCalendarAccountUpdateMock).toHaveBeenCalledWith({
      where: { clinicId: "clinic-1" },
      data: { needsReconnectAt: expect.any(Date), needsReconnectReason: expect.stringContaining("invalid_grant") },
    });
    expect(sendWhatsappMessageMock).toHaveBeenCalledWith(
      "clinica-teste",
      "5511987654321",
      expect.stringContaining("Clínica Teste")
    );
  });

  it("invalid_grant NÃO manda um segundo aviso por WhatsApp se a clínica já estava marcada (evita espamar a cada nova tentativa)", async () => {
    googleCalendarAccountFindUniqueMock.mockResolvedValue({
      needsReconnectAt: new Date("2026-01-01T00:00:00.000Z"),
      clinic: { name: "Clínica Teste", notifyWhatsappNumber: "5511987654321", whatsappInstanceName: "clinica-teste" },
    });
    const fn = vi.fn().mockRejectedValue(
      gaxiosLikeError({ status: 400, response: { data: { error: "invalid_grant" } }, message: "invalid_grant" })
    );

    await expect(withGoogleCalendarCall("clinic-1", "teste", fn)).rejects.toBeTruthy();

    expect(googleCalendarAccountUpdateMock).toHaveBeenCalled(); // atualiza o motivo/timestamp de novo
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled(); // mas não avisa de novo
  });

  it("não retenta um erro que já foi rejeitado por invalid_grant — é permanente por definição", async () => {
    const fn = vi.fn().mockRejectedValue(
      gaxiosLikeError({ status: 400, response: { data: { error: "invalid_grant" } }, message: "invalid_grant" })
    );

    await expect(withGoogleCalendarCall("clinic-1", "teste", fn)).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("markGoogleCalendarNeedsReconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("não faz nada se a clínica já desconectou (linha não existe mais)", async () => {
    googleCalendarAccountFindUniqueMock.mockResolvedValue(null);

    await markGoogleCalendarNeedsReconnect("clinic-1", "algum motivo");

    expect(googleCalendarAccountUpdateMock).not.toHaveBeenCalled();
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });

  it("não quebra (não lança) se a clínica não tiver WhatsApp configurado — só não avisa", async () => {
    googleCalendarAccountFindUniqueMock.mockResolvedValue({
      needsReconnectAt: null,
      clinic: { name: "Clínica Teste", notifyWhatsappNumber: null, whatsappInstanceName: null },
    });

    await expect(markGoogleCalendarNeedsReconnect("clinic-1", "algum motivo")).resolves.toBeUndefined();
    expect(sendWhatsappMessageMock).not.toHaveBeenCalled();
  });
});
