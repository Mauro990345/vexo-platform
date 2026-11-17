import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const leadUpdateMock = vi.fn();
const instagramAccountUpdateManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { update: (...args: unknown[]) => leadUpdateMock(...args) },
    instagramAccount: { updateMany: (...args: unknown[]) => instagramAccountUpdateManyMock(...args) },
  },
}));

import {
  isRealIgScopedId,
  getInstagramUserProfile,
  ensureLeadFirstNameFromInstagram,
  sendInstagramMessage,
  sendInstagramGenericTemplateCard,
  getInstagramConversationHistory,
  getInstagramAccountProfilePicture,
  exchangeInstagramCode,
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

// Foto de perfil da PRÓPRIA conta conectada (círculo da clínica, ver
// ClinicAvatar.tsx) — renovação periódica via clinic-profile-picture-backfill.ts.
describe("getInstagramAccountProfilePicture", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devolve a URL quando a Graph API responde com profile_picture_url", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { profile_picture_url: "https://scontent.cdninstagram.com/foto.jpg" }));

    const url = await getInstagramAccountProfilePicture("token");

    expect(url).toBe("https://scontent.cdninstagram.com/foto.jpg");
    expect(fetchMock.mock.calls[0]![0]).toContain("fields=profile_picture_url");
  });

  it("conta sem foto cadastrada -> null (não erro)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    expect(await getInstagramAccountProfilePicture("token")).toBeNull();
  });

  it("erro HTTP permanente (token inválido) -> lança, nunca devolve null silenciosamente", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "token inválido", code: 190 } }));

    await expect(getInstagramAccountProfilePicture("token")).rejects.toThrow("Falha ao buscar foto de perfil da conta");
  });
});

describe("exchangeInstagramCode — profile_picture_url", () => {
  beforeEach(() => {
    process.env.META_INSTAGRAM_APP_ID = "app-id";
    process.env.META_APP_SECRET = "app-secret";
    process.env.META_OAUTH_REDIRECT_URI = "https://vexo.example/callback";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.META_INSTAGRAM_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.META_OAUTH_REDIRECT_URI;
  });

  it("lê profile_picture_url na MESMA chamada de /me que já lê id/username — zero requisição extra", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "short-lived" })) // 1. code -> token curto
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "long-lived", expires_in: 5184000 })) // 2. long-lived
      .mockResolvedValueOnce(
        jsonResponse(200, { id: "17841400000000000", username: "clinica.demo", profile_picture_url: "https://scontent.cdninstagram.com/clinica.jpg" })
      ); // 3. /me

    const result = await exchangeInstagramCode("fake-code");

    expect(result.profilePictureUrl).toBe("https://scontent.cdninstagram.com/clinica.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]![0]).toContain("profile_picture_url");
  });

  it("conta sem foto cadastrada -> profilePictureUrl null (nunca undefined)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "short-lived" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "long-lived", expires_in: 5184000 }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "17841400000000000", username: "clinica.demo" }));

    const result = await exchangeInstagramCode("fake-code");

    expect(result.profilePictureUrl).toBeNull();
  });
});

// Bug real corrigido (Reativação/lembretes): {{primeiro_nome}} precisava
// de uma fonte de nome fora do pipeline de webhook — esta função busca e
// cacheia o nome do lead (mesma regra de "tenta uma vez só" do pipeline de
// conversa, Lead.nameLookupAttempted) pra quem precisa fora dele.
describe("ensureLeadFirstNameFromInstagram", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "test-key-para-os-testes-de-retry";
    leadUpdateMock.mockReset();
    leadUpdateMock.mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("nome já em cache (Lead.name preenchido): devolve direto, sem chamar a API", async () => {
    const result = await ensureLeadFirstNameFromInstagram(
      { id: "lead-1", name: "Maria", nameLookupAttempted: false, igScopedId: "17841400000000000" },
      "enc-token"
    );
    expect(result).toBe("Maria");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("já tentado antes (nameLookupAttempted=true) e sem nome: não tenta de novo, devolve null — nunca em loop", async () => {
    const result = await ensureLeadFirstNameFromInstagram(
      { id: "lead-1", name: null, nameLookupAttempted: true, igScopedId: "17841400000000000" },
      "enc-token"
    );
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lead de seed/demo (igScopedId não numérico): não chama a API", async () => {
    const result = await ensureLeadFirstNameFromInstagram(
      { id: "lead-1", name: null, nameLookupAttempted: false, igScopedId: "demo-new-0" },
      "enc-token"
    );
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("primeira tentativa, API devolve nome: busca, cacheia (Lead.name + nameLookupAttempted=true) e devolve", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { name: "João Pedro" }));

    const result = await ensureLeadFirstNameFromInstagram(
      { id: "lead-1", name: null, nameLookupAttempted: false, igScopedId: "17841400000000000" },
      encryptToken("fake-token")
    );

    expect(result).toBe("João Pedro");
    expect(leadUpdateMock).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { name: "João Pedro", nameLookupAttempted: true },
    });
  });

  it("API responde sem campo name: cacheia nameLookupAttempted=true (definitivo), devolve null", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const result = await ensureLeadFirstNameFromInstagram(
      { id: "lead-1", name: null, nameLookupAttempted: false, igScopedId: "17841400000000000" },
      encryptToken("fake-token")
    );

    expect(result).toBeNull();
    expect(leadUpdateMock).toHaveBeenCalledWith({ where: { id: "lead-1" }, data: { nameLookupAttempted: true } });
  });

  it("erro na chamada (permanente): devolve null, NÃO marca nameLookupAttempted (erro pode ser transitório, tenta de novo depois)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "token inválido", code: 190 } }));

    const result = await ensureLeadFirstNameFromInstagram(
      { id: "lead-1", name: null, nameLookupAttempted: false, igScopedId: "17841400000000000" },
      encryptToken("fake-token")
    );

    expect(result).toBeNull();
    expect(leadUpdateMock).not.toHaveBeenCalled();
  });
});

// Bug real corrigido: attachment.type ia SEMPRE "video", mesmo quando
// mediaUrl era uma foto de resultado (ResultPhoto.imageUrl, JPG/PNG/WEBP/
// GIF) — a Graph API rejeita uma imagem anunciada como vídeo, e a Message
// correspondente ficava FAILED pra sempre (ver attachmentTypeForMediaUrl,
// instagram.ts).
describe("sendInstagramMessage — tipo do anexo por extensão de mediaUrl", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "test-key-para-os-testes-de-retry";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["jpg", "jpeg", "png", "webp", "gif"])(
    "mediaUrl terminando em .%s vira attachment.type \"image\"",
    async (extension) => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValue(jsonResponse(200, { message_id: "mid.img" }));

      await sendInstagramMessage({
        accessTokenEnc: encryptToken("fake-token"),
        igUserId: "999",
        recipientIgScopedId: "17841400000000000",
        mediaUrl: `https://app.vexo/uploads/result-photos/foto.${extension}`,
      });

      const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(requestInit.body as string);
      expect(body.message.attachment.type).toBe("image");
      expect(body.message.attachment.payload.url).toBe(`https://app.vexo/uploads/result-photos/foto.${extension}`);
    }
  );

  it.each(["mp4", "mov", "webm"])("mediaUrl terminando em .%s continua com attachment.type \"video\"", async (extension) => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { message_id: "mid.vid" }));

    await sendInstagramMessage({
      accessTokenEnc: encryptToken("fake-token"),
      igUserId: "999",
      recipientIgScopedId: "17841400000000000",
      mediaUrl: `https://app.vexo/uploads/confirmation-videos/video.${extension}`,
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body.message.attachment.type).toBe("video");
  });

  it("mediaUrl sem extensão reconhecível (ex.: URL externa colada à mão) cai no default \"video\" — comportamento de antes, preservado", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { message_id: "mid.default" }));

    await sendInstagramMessage({
      accessTokenEnc: encryptToken("fake-token"),
      igUserId: "999",
      recipientIgScopedId: "17841400000000000",
      mediaUrl: "https://cdn.example.com/video-sem-extensao",
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body.message.attachment.type).toBe("video");
  });

  it("extensão em query string (?foo=bar.mp4) não engana a detecção — olha só o path", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { message_id: "mid.query" }));

    await sendInstagramMessage({
      accessTokenEnc: encryptToken("fake-token"),
      igUserId: "999",
      recipientIgScopedId: "17841400000000000",
      mediaUrl: "https://app.vexo/uploads/result-photos/foto.jpg?v=video.mp4",
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body.message.attachment.type).toBe("image");
  });
});

// Guarda final (pedido explícito, item 1) — remove qualquer "{{...}}" que
// porventura tenha sobrado, mesmo que todo ponto de montagem de texto já
// devesse ter passado por renderMessageTemplate antes de chamar isto.
describe("sendInstagramMessage — guarda final contra variável sem preencher", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "test-key-para-os-testes-de-retry";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('remove "{{...}}" que ainda esteja no texto antes de mandar de verdade', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { message_id: "mid.guard" }));

    await sendInstagramMessage({
      accessTokenEnc: encryptToken("fake-token"),
      igUserId: "999",
      recipientIgScopedId: "17841400000000000",
      text: "Oi, {{primeiro_nome}}! Tudo bem?",
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body.message.text).toBe("Oi! Tudo bem?");
    expect(body.message.text).not.toMatch(/\{\{/);
  });

  it("texto sem nenhuma variável: passa intacto", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { message_id: "mid.guard2" }));

    await sendInstagramMessage({
      accessTokenEnc: encryptToken("fake-token"),
      igUserId: "999",
      recipientIgScopedId: "17841400000000000",
      text: "Oi! Tudo bem?",
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body.message.text).toBe("Oi! Tudo bem?");
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

// Backfill de histórico (pedido do cliente: a IA precisa ver no histórico
// tudo que foi mandado ao lead pelo Instagram antes dele responder pela
// primeira vez — abordagem manual, card colado, lembrete). Chamada NUNCA
// testada de verdade contra a Meta (sem acesso de rede nesta sandbox) —
// estes testes cobrem só o contrato: nunca lança, sempre degrada pra []
// quando a Meta não devolve o que é esperado.
describe("getInstagramConversationHistory", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lead de seed/demo (igScopedId não numérico): não chama a API, devolve []", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    const result = await getInstagramConversationHistory("token", "999", "demo-new-0");

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sucesso: devolve as mensagens de texto, marcando fromBusiness quando from.id === igUserId", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [
          {
            messages: {
              data: [
                { id: "mid.1", message: "Oi! Vi que você se interessou pelo procedimento X", from: { id: "999" }, created_time: "2026-11-01T10:00:00+0000" },
                { id: "mid.2", message: "Faltou D15", from: { id: "999" }, created_time: "2026-11-02T09:00:00+0000" },
                { id: "mid.3", message: "Oi, ainda não respondi porque...", from: { id: "17841400000000000" }, created_time: "2026-11-03T12:00:00+0000" },
              ],
            },
          },
        ],
      })
    );

    const result = await getInstagramConversationHistory("token", "999", "17841400000000000");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { igMessageId: "mid.1", text: "Oi! Vi que você se interessou pelo procedimento X", fromBusiness: true, createdAt: new Date("2026-11-01T10:00:00+0000") },
      { igMessageId: "mid.2", text: "Faltou D15", fromBusiness: true, createdAt: new Date("2026-11-02T09:00:00+0000") },
      { igMessageId: "mid.3", text: "Oi, ainda não respondi porque...", fromBusiness: false, createdAt: new Date("2026-11-03T12:00:00+0000") },
    ]);
  });

  it("filtra itens sem texto (mídia pura) ou sem os campos esperados, sem quebrar os demais", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [
          {
            messages: {
              data: [
                { id: "mid.1", message: "Lembrete: sua consulta é amanhã às 15h", from: { id: "999" }, created_time: "2026-11-05T08:00:00+0000" },
                { id: "mid.2", from: { id: "999" }, created_time: "2026-11-05T08:01:00+0000" }, // só mídia, sem `message`
              ],
            },
          },
        ],
      })
    );

    const result = await getInstagramConversationHistory("token", "999", "17841400000000000");

    expect(result).toHaveLength(1);
    expect(result[0]?.igMessageId).toBe("mid.1");
  });

  it("HTTP de erro: devolve [] sem lançar", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

    const result = await getInstagramConversationHistory("token", "999", "17841400000000000");

    expect(result).toEqual([]);
  });

  it('resposta sem o campo "messages" (Meta não expõe esse campo pro produto, ou conversa sem histórico): devolve [] sem lançar', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [{ id: "conv.1" }] }));

    const result = await getInstagramConversationHistory("token", "999", "17841400000000000");

    expect(result).toEqual([]);
  });

  it("erro de rede (fetch rejeita): devolve [] sem lançar", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await getInstagramConversationHistory("token", "999", "17841400000000000");

    expect(result).toEqual([]);
  });
});

// Bug real em produção (Clínica Demo, 11/11/2026): o token venceu sozinho
// (code 190, "Session has expired") e isso nunca ficou visível — só
// escondido em failReason de uma Message FAILED. sendInstagramMessage
// passa a marcar InstagramAccount.needsReconnectAt nesse caso específico
// (ver isExpiredTokenMetaError/markInstagramNeedsReconnectByIgUserId,
// instagram.ts), ANTES de propagar o erro — a IA segue falhando em
// enviar (comportamento preservado), mas agora com o aviso gravado.
describe("sendInstagramMessage — detecção de sessão expirada (code 190)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('erro code 190 "Session has expired": marca precisa-reconectar por igUserId e ainda propaga o erro original', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "Error validating access token: Session has expired.", type: "OAuthException", code: 190 } }),
        { status: 400 }
      )
    );
    instagramAccountUpdateManyMock.mockResolvedValue({ count: 1 });

    await expect(
      sendInstagramMessage({
        accessTokenEnc: encryptToken("fake-token"),
        igUserId: "17841400000000001",
        recipientIgScopedId: "17841400000000000",
        text: "oi",
      })
    ).rejects.toThrow(/Falha ao enviar mensagem no Instagram/);

    expect(instagramAccountUpdateManyMock).toHaveBeenCalledWith({
      where: { igUserId: "17841400000000001" },
      data: expect.objectContaining({ needsReconnectAt: expect.any(Date), needsReconnectReason: expect.stringContaining("sessão expirada") }),
    });
  });

  it("erro comum (não code 190, não rate limit): NÃO marca precisa-reconectar", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "The action is invalid since it's not the thread owner", code: 10 } }), { status: 400 })
    );

    await expect(
      sendInstagramMessage({
        accessTokenEnc: encryptToken("fake-token"),
        igUserId: "17841400000000001",
        recipientIgScopedId: "17841400000000000",
        text: "oi",
      })
    ).rejects.toThrow();

    expect(instagramAccountUpdateManyMock).not.toHaveBeenCalled();
  });

  it("rate limit (429): NÃO marca precisa-reconectar nem chama o diagnóstico — é só retry, nunca sessão expirada", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    // mockImplementation (não mockResolvedValue) — cada tentativa do
    // withRetry precisa de um Response NOVO, já que o corpo só pode ser
    // lido uma vez por instância.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }));

    await expect(
      sendInstagramMessage({
        accessTokenEnc: encryptToken("fake-token"),
        igUserId: "17841400000000001",
        recipientIgScopedId: "17841400000000000",
        text: "oi",
      })
    ).rejects.toThrow();

    expect(instagramAccountUpdateManyMock).not.toHaveBeenCalled();
  }, 10000);

  it("sendInstagramGenericTemplateCard com code 190: marca precisa-reconectar do mesmo jeito", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Error validating access token: Session has expired.", code: 190 } }), { status: 400 })
    );
    instagramAccountUpdateManyMock.mockResolvedValue({ count: 1 });

    await expect(
      sendInstagramGenericTemplateCard({
        accessTokenEnc: encryptToken("fake-token"),
        igUserId: "17841400000000001",
        recipientIgScopedId: "17841400000000000",
        title: "Clínica Bela Vida",
        subtitle: "assunto",
      })
    ).rejects.toThrow();

    expect(instagramAccountUpdateManyMock).toHaveBeenCalledWith({
      where: { igUserId: "17841400000000001" },
      data: expect.objectContaining({ needsReconnectAt: expect.any(Date) }),
    });
  });
});
