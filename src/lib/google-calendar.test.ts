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
    // markGoogleCalendarNeedsReconnect só usa isto pra confirmar que a
    // linha ainda existe (ver describe dedicado abaixo pro caso null) —
    // não lê mais nenhum outro campo (aviso por WhatsApp removido, regra
    // de produto: o WhatsApp da clínica serve só pra confirmação de
    // agendamento).
    googleCalendarAccountFindUniqueMock.mockResolvedValue({ clinicId: "clinic-1" });
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

  it("invalid_grant marca a clínica pra reconectar (alimenta a bolinha de status em Conexões)", async () => {
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
  });

  it("invalid_grant repetido continua atualizando o motivo/timestamp a cada vez (sem aviso nenhum pra suprimir)", async () => {
    const fn = vi.fn().mockRejectedValue(
      gaxiosLikeError({ status: 400, response: { data: { error: "invalid_grant" } }, message: "invalid_grant" })
    );

    await expect(withGoogleCalendarCall("clinic-1", "teste", fn)).rejects.toBeTruthy();
    await expect(withGoogleCalendarCall("clinic-1", "teste", fn)).rejects.toBeTruthy();

    expect(googleCalendarAccountUpdateMock).toHaveBeenCalledTimes(2);
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

  it("não faz nada se a clínica já desconectou (linha não existe mais) — nunca lança", async () => {
    googleCalendarAccountFindUniqueMock.mockResolvedValue(null);

    await expect(markGoogleCalendarNeedsReconnect("clinic-1", "algum motivo")).resolves.toBeUndefined();

    expect(googleCalendarAccountUpdateMock).not.toHaveBeenCalled();
  });

  it("marca needsReconnectAt/needsReconnectReason quando a linha existe", async () => {
    googleCalendarAccountFindUniqueMock.mockResolvedValue({ clinicId: "clinic-1" });

    await markGoogleCalendarNeedsReconnect("clinic-1", "algum motivo");

    expect(googleCalendarAccountUpdateMock).toHaveBeenCalledWith({
      where: { clinicId: "clinic-1" },
      data: { needsReconnectAt: expect.any(Date), needsReconnectReason: "algum motivo" },
    });
  });
});
