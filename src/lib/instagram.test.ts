import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isRealIgScopedId,
  getInstagramUserProfile,
  sendInstagramMessage,
  sendInstagramGenericTemplateCard,
} from "@/lib/instagram";
import { encryptToken } from "@/lib/crypto";

// Bug real: prisma/seed-demo.ts cria 40 leads de demonstração com igScopedId
// tipo "demo-new-0" (nunca um IGSID de verdade da Meta, que é sempre uma
// string só de dígitos) — chamar a Conversations API com esse valor sempre
// falhava com "(#100) Param user_id must be a numeric string", e como esse
// erro era tratado como transitório (nunca marcava a tentativa como
// definitiva), esses 40 leads de demo ocupavam pra sempre o lote inteiro do
// backfill de foto de perfil, bloqueando leads reais de serem tentados.
describe("isRealIgScopedId", () => {
  it("aceita um IGSID real (string só de dígitos)", () => {
    expect(isRealIgScopedId("17841400000000000")).toBe(true);
  });

  it("rejeita os igScopedId de leads de seed/demo (prisma/seed-demo.ts)", () => {
    expect(isRealIgScopedId("demo-new-0")).toBe(false);
    expect(isRealIgScopedId("demo-conversa-3")).toBe(false);
    expect(isRealIgScopedId("demo-agendado-7")).toBe(false);
    expect(isRealIgScopedId("demo-followup-1")).toBe(false);
    expect(isRealIgScopedId("demo-perdido-2")).toBe(false);
  });

  it("rejeita string vazia e qualquer valor não puramente numérico", () => {
    expect(isRealIgScopedId("")).toBe(false);
    expect(isRealIgScopedId("123abc")).toBe(false);
    expect(isRealIgScopedId("12.3")).toBe(false);
    expect(isRealIgScopedId("-123")).toBe(false);
  });
});

// Ver diagnóstico de capacidade (avaliação de escala pra 100 clínicas):
// zero tratamento de rate limit era o risco #1 de PERDA de mensagem real.
// Estes testes cobrem a parte que não é genérica de withRetry (já testado
// em retry.test.ts) — a classificação ESPECÍFICA da Graph API: rate limit
// da Meta costuma vir como HTTP 400 (não 429) com um código no corpo, não
// só no status.
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("retry em erro transitório da Graph API", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "test-key-para-os-testes-de-retry";
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("getInstagramUserProfile tenta de novo num 429 de verdade e devolve o resultado quando a 2ª tentativa funciona", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { error: { message: "rate limited" } }))
      .mockResolvedValueOnce(jsonResponse(200, { name: "Fulano" }));

    const promise = getInstagramUserProfile("token", "17841400000000000");
    await vi.advanceTimersByTimeAsync(500);

    expect(await promise).toEqual({ name: "Fulano" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("getInstagramUserProfile NÃO tenta de novo num erro permanente (400 sem código de rate limit) — falha já na 1ª tentativa", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "token inválido", code: 190 } }));

    await expect(getInstagramUserProfile("token", "17841400000000000")).rejects.toThrow("Falha ao buscar perfil");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sendInstagramMessage reconhece rate limit da Meta mesmo em HTTP 400 (código 4 no corpo), tenta de novo e não gasta a chamada extra de diagnóstico", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: { message: "Application request limit reached", code: 4 } }))
      .mockResolvedValueOnce(jsonResponse(200, { message_id: "mid.123" }));

    const promise = sendInstagramMessage({
      accessTokenEnc: encryptToken("fake-token"),
      igUserId: "999",
      recipientIgScopedId: "17841400000000000",
      text: "oi",
    });
    await vi.advanceTimersByTimeAsync(500);

    expect(await promise).toEqual({ messageId: "mid.123" });
    // Só as 2 chamadas de envio (1ª falhou, 2ª funcionou) — nenhuma chamada
    // extra ao debug_token, que só roda pra erro NÃO retryable.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// Cartão de contato da clínica (Generic Template) — ver
// clinicContactContext/buildClinicContactContext (conversation-pipeline.ts)
// e dispatchOneMessage (dispatch.ts), que trata qualquer erro daqui como
// sinal pra cair no link de fallback /c/<id>, nunca mandar os dois.
describe("sendInstagramGenericTemplateCard", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "test-key-para-os-testes-de-retry";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("monta o payload de Generic Template com o nome da clínica (título), subtítulo fixo e botão web_url — nunca o número em texto visível", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { message_id: "mid.card.1" }));

    const result = await sendInstagramGenericTemplateCard({
      accessTokenEnc: encryptToken("fake-token"),
      igUserId: "999",
      recipientIgScopedId: "17841400000000000",
      title: "Clínica Bela Vida",
      subtitle: "Fale com a equipe pelo WhatsApp",
      button: { title: "Abrir WhatsApp", url: "https://wa.me/5511987654321" },
    });

    expect(result).toEqual({ messageId: "mid.card.1" });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);

    expect(body.message.attachment.type).toBe("template");
    expect(body.message.attachment.payload.template_type).toBe("generic");
    const [element] = body.message.attachment.payload.elements;
    expect(element.title).toBe("Clínica Bela Vida");
    expect(element.subtitle).toBe("Fale com a equipe pelo WhatsApp");
    expect(element.buttons).toEqual([
      { type: "web_url", url: "https://wa.me/5511987654321", title: "Abrir WhatsApp" },
    ]);
    // sem ?text= na URL do botão — pedido explícito.
    expect(element.buttons[0].url).not.toContain("?text=");
    // Nenhum campo visível do cartão (título/subtítulo/texto do botão)
    // contém dígitos de telefone — o número só existe dentro da URL do
    // botão, nunca como texto que o Instagram mostraria por extenso.
    expect(element.title).not.toMatch(/\d{8,}/);
    expect(element.subtitle).not.toMatch(/\d{8,}/);
    expect(element.buttons[0].title).not.toMatch(/\d{8,}/);
  });

  it("propaga o erro cru da Graph API quando o cartão é rejeitado (ex.: feature não habilitada), sem tentar de novo", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { message: "Template feature is not enabled for this app", code: 100 } })
    );

    await expect(
      sendInstagramGenericTemplateCard({
        accessTokenEnc: encryptToken("fake-token"),
        igUserId: "999",
        recipientIgScopedId: "17841400000000000",
        title: "Clínica Bela Vida",
        subtitle: "Fale com a equipe pelo WhatsApp",
        button: { title: "Abrir WhatsApp", url: "https://wa.me/5511987654321" },
      })
    ).rejects.toThrow(/Template feature is not enabled/);

    // Uma única tentativa — nunca retry nem diagnóstico extra pra este
    // caminho (ver comentário grande na função).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Cartão de confirmação de agendamento (ver maybeSendInstagramConfirmationCard,
  // conversation-pipeline.ts) usa a mesma função SEM botão — `button` é
  // opcional exatamente pra isso.
  it("sem `button`: monta o elemento do card sem nenhum campo `buttons`", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { message_id: "mid.card.2" }));

    const result = await sendInstagramGenericTemplateCard({
      accessTokenEnc: encryptToken("fake-token"),
      igUserId: "999",
      recipientIgScopedId: "17841400000000000",
      title: "Clínica Bela Vida",
      subtitle: "amanhã (05/09) às 15h · Av. Paulista, 1000",
    });

    expect(result).toEqual({ messageId: "mid.card.2" });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    const [element] = body.message.attachment.payload.elements;

    expect(element.title).toBe("Clínica Bela Vida");
    expect(element.subtitle).toBe("amanhã (05/09) às 15h · Av. Paulista, 1000");
    expect(element.buttons).toBeUndefined();
  });
});
