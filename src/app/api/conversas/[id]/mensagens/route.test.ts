// Busca leve usada pelo polling da tela de conversa (ConversationMessages,
// a cada 3-4s) — prova que PENDING/SENDING nunca são devolvidas, que FAILED
// continua aparecendo, e sobretudo o caso real do cursor: uma resposta
// criada ANTES do cursor atual (porque passou minutos PENDING) tem que
// aparecer quando sai de verdade, mesmo com createdAt anterior ao cursor.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getServerSessionMock = vi.fn(async (): Promise<unknown> => ({ user: { role: "INTERNAL_ADMIN" } }));
vi.mock("next-auth", () => ({ getServerSession: () => getServerSessionMock() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const findManyMock = vi.fn(async (_args: unknown): Promise<unknown[]> => []);
const conversationFindUniqueMock = vi.fn(async (_args: unknown): Promise<unknown> => null);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { findMany: (args: unknown) => findManyMock(args) },
    conversation: { findUnique: (args: unknown) => conversationFindUniqueMock(args) },
  },
}));

const { GET } = await import("./route");

function req(conversationId: string, afterVisibleAt: string, afterId: string): NextRequest {
  const url = new URL(`https://app.vexoia.com.br/api/conversas/${conversationId}/mensagens`);
  url.searchParams.set("afterVisibleAt", afterVisibleAt);
  url.searchParams.set("afterId", afterId);
  return new NextRequest(url);
}

function baseMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "msg-1",
    direction: "OUTBOUND" as const,
    sender: "AI" as const,
    content: "Oi!",
    mediaUrl: null,
    status: "SENT" as const,
    sentAt: new Date("2026-01-01T10:10:00.000Z"),
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    updatedAt: new Date("2026-01-01T10:10:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
});

describe("GET /api/conversas/[id]/mensagens", () => {
  it("sem sessão: 401", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const res = await GET(req("conv-1", new Date(0).toISOString(), "zzzzzzzz"), { params: { id: "conv-1" } });
    expect(res.status).toBe(401);
  });

  it("sem afterVisibleAt/afterId: 400", async () => {
    const url = new URL("https://app.vexoia.com.br/api/conversas/conv-1/mensagens");
    const res = await GET(new NextRequest(url), { params: { id: "conv-1" } });
    expect(res.status).toBe(400);
  });

  it("devolve uma mensagem SENT normalmente, com visibleAt = sentAt", async () => {
    findManyMock.mockResolvedValue([baseMessage()]);
    const res = await GET(req("conv-1", new Date(0).toISOString(), "zzzzzzzz"), { params: { id: "conv-1" } });
    const body = await res.json();
    expect(body.messages).toEqual([
      {
        id: "msg-1",
        direction: "OUTBOUND",
        sender: "AI",
        content: "Oi!",
        mediaUrl: null,
        status: "SENT",
        visibleAt: "2026-01-01T10:10:00.000Z",
      },
    ]);
  });

  it("query ao banco já restringe por status IN (SENT, FAILED) — nunca pede PENDING/SENDING", async () => {
    findManyMock.mockResolvedValue([]);
    await GET(req("conv-1", new Date(0).toISOString(), "zzzzzzzz"), { params: { id: "conv-1" } });
    const args = findManyMock.mock.calls[0]![0] as { where: { status: { in: string[] } } };
    expect(args.where.status).toEqual({ in: ["SENT", "FAILED"] });
  });

  // Bug real reportado: a confirmação de agendamento por WhatsApp
  // (formatAppointmentConfirmationMessage, Message.channel="WHATSAPP")
  // aparecia colada na conversa do Instagram, como se fosse uma bolha
  // dela — inclusive mostrando "· falhou" quando o envio por WhatsApp
  // falhava. Filtrado ANTES da query rodar: uma mensagem de WhatsApp
  // nunca chega a ser candidata, então nunca pode mover o cursor
  // (afterVisibleAt) nem aparecer no polling.
  it("query ao banco já restringe por channel IN (INSTAGRAM) — nunca pede WHATSAPP", async () => {
    findManyMock.mockResolvedValue([]);
    await GET(req("conv-1", new Date(0).toISOString(), "zzzzzzzz"), { params: { id: "conv-1" } });
    const args = findManyMock.mock.calls[0]![0] as { where: { channel: { in: string[] } } };
    expect(args.where.channel).toEqual({ in: ["INSTAGRAM"] });
  });

  // Como a mensagem de WhatsApp nunca é candidata (teste acima), o cliente
  // nunca avança o cursor por causa dela — uma mensagem do Instagram que
  // chegar DEPOIS continua aparecendo normalmente no próximo polling,
  // usando o MESMO cursor de antes (nunca "preso" esperando por uma
  // mensagem de WhatsApp que nunca vai ser devolvida).
  it("mensagem do Instagram chegando depois de uma confirmação por WhatsApp (que nunca é candidata) ainda aparece normalmente", async () => {
    findManyMock.mockResolvedValue([
      baseMessage({ id: "msg-ig-depois", direction: "INBOUND", sender: "LEAD", createdAt: new Date("2026-01-01T10:05:00.000Z") }),
    ]);
    const res = await GET(req("conv-1", new Date("2026-01-01T10:00:00.000Z").toISOString(), "cursor-id"), {
      params: { id: "conv-1" },
    });
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).toBe("msg-ig-depois");
  });

  it("FAILED continua aparecendo, com visibleAt = updatedAt (sentAt nulo)", async () => {
    findManyMock.mockResolvedValue([
      baseMessage({ status: "FAILED", sentAt: null, updatedAt: new Date("2026-01-01T10:11:00.000Z") }),
    ]);
    const res = await GET(req("conv-1", new Date(0).toISOString(), "zzzzzzzz"), { params: { id: "conv-1" } });
    const body = await res.json();
    expect(body.messages[0]).toMatchObject({ status: "FAILED", visibleAt: "2026-01-01T10:11:00.000Z" });
  });

  it("entrada do lead aparece com visibleAt = createdAt", async () => {
    findManyMock.mockResolvedValue([
      baseMessage({
        id: "msg-lead",
        direction: "INBOUND",
        sender: "LEAD",
        sentAt: new Date("2026-01-01T09:59:30.000Z"),
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      }),
    ]);
    const res = await GET(req("conv-1", new Date(0).toISOString(), "zzzzzzzz"), { params: { id: "conv-1" } });
    const body = await res.json();
    expect(body.messages[0]).toMatchObject({ visibleAt: "2026-01-01T10:00:00.000Z" });
  });

  // O caso real do bug: mensagem de saída criada em T0 (createdAt), o
  // cursor já avançou pra T0+2s (lead mandou outra mensagem nesse meio-
  // tempo), e ela só saiu de verdade (sentAt) em T0+10s — tem que aparecer
  // mesmo com createdAt < cursor.
  it("mensagem com createdAt ANTES do cursor, mas sentAt DEPOIS: aparece no polling", async () => {
    const t0 = new Date("2026-01-01T10:00:00.000Z");
    const cursorAt = new Date(t0.getTime() + 2_000).toISOString();
    const sentAt = new Date(t0.getTime() + 10_000);

    findManyMock.mockResolvedValue([baseMessage({ id: "msg-atrasada", createdAt: t0, sentAt })]);
    const res = await GET(req("conv-1", cursorAt, "cursor-id"), { params: { id: "conv-1" } });
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).toBe("msg-atrasada");
  });

  it("REVIEWER de OUTRA clínica: 404, nunca consulta mensagens", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "REVIEWER", clinicId: "demo-1" } });
    conversationFindUniqueMock.mockResolvedValue({ clinicId: "outra-clinica" });
    const res = await GET(req("conv-1", new Date(0).toISOString(), "zzzzzzzz"), { params: { id: "conv-1" } });
    expect(res.status).toBe(404);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("REVIEWER da PRÓPRIA clínica: 200, recebe as mensagens normalmente", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "REVIEWER", clinicId: "demo-1" } });
    conversationFindUniqueMock.mockResolvedValue({ clinicId: "demo-1" });
    findManyMock.mockResolvedValue([baseMessage()]);
    const res = await GET(req("conv-1", new Date(0).toISOString(), "zzzzzzzz"), { params: { id: "conv-1" } });
    expect(res.status).toBe(200);
  });
});
