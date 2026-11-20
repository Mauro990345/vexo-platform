// Pedido: a resposta da IA só aparece na conversa depois de enviada de
// verdade (SENT) — nunca enquanto está PENDING/SENDING (esperando o
// atraso adaptativo) — e a ORDEM da tela segue o instante em que cada
// mensagem ficou visível (visibleAt, ver message-visibility.ts), não
// createdAt puro. Mensagens do lead continuam aparecendo na hora. FAILED
// continua aparecendo, com "· falhou".
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("../../clinicas/actions", () => ({
  setConversationStatus: vi.fn(async () => {}),
  sendHumanReply: vi.fn(async () => {}),
}));

vi.mock("@/lib/session", () => ({
  requireInternalOrReviewerSession: vi.fn(async () => ({ user: { role: "INTERNAL_ADMIN" } })),
}));

const findUniqueMock = vi.fn(async (_args: unknown) => ({
  id: "conv-1",
  clinicId: "clinic-1",
  status: "IN_CONVERSATION",
  needsHumanReason: null,
  lead: { name: "Lead Teste", igUsername: "lead.teste", phone: null },
  clinic: { name: "Clínica Demo VEXO" },
  appointments: [],
  // Já filtrado pelo `where` da query (status SENT/FAILED) — o mock devolve
  // só o que o `where` de verdade deixaria passar, pra testar a ORDENAÇÃO
  // (compareByVisibleAt) e a formatação de cada mensagem, não o filtro em
  // si (esse é o papel da query, verificado no teste de args abaixo).
  messages: [
    // Mensagem de saída SENT com createdAt ANTES de uma mensagem do lead,
    // mas sentAt (visibleAt) DEPOIS — precisa aparecer DEPOIS na tela.
    {
      id: "msg-ai-atrasada",
      direction: "OUTBOUND",
      sender: "AI",
      content: "Resposta da IA (saiu bem depois de criada)",
      mediaUrl: null,
      status: "SENT",
      sentAt: new Date("2026-03-01T10:10:00Z"),
      createdAt: new Date("2026-03-01T10:00:30Z"),
      updatedAt: new Date("2026-03-01T10:10:00Z"),
    },
    {
      id: "msg-lead-1",
      direction: "INBOUND",
      sender: "LEAD",
      content: "Primeira mensagem do lead",
      mediaUrl: null,
      status: "SENT",
      sentAt: new Date("2026-03-01T10:00:00Z"),
      createdAt: new Date("2026-03-01T10:00:00Z"),
      updatedAt: new Date("2026-03-01T10:00:00Z"),
    },
    {
      id: "msg-lead-2",
      direction: "INBOUND",
      sender: "LEAD",
      content: "Segunda mensagem do lead (chegou antes da resposta sair)",
      mediaUrl: null,
      status: "SENT",
      sentAt: new Date("2026-03-01T10:02:00Z"),
      createdAt: new Date("2026-03-01T10:02:00Z"),
      updatedAt: new Date("2026-03-01T10:02:00Z"),
    },
    // Mensagem de saída que FALHOU (sentAt nunca preenchido) — continua
    // aparecendo, com "· falhou".
    {
      id: "msg-falhou",
      direction: "OUTBOUND",
      sender: "AI",
      content: "Mensagem que falhou",
      mediaUrl: null,
      status: "FAILED",
      sentAt: null,
      createdAt: new Date("2026-03-01T10:03:00Z"),
      updatedAt: new Date("2026-03-01T10:03:30Z"),
    },
  ],
}));
vi.mock("@/lib/prisma", () => ({ prisma: { conversation: { findUnique: (args: unknown) => findUniqueMock(args) } } }));

async function renderConversationHtml(): Promise<string> {
  const { default: ConversationDetailPage } = await import("./page");
  const element = await ConversationDetailPage({ params: { id: "conv-1" } });
  return renderToStaticMarkup(createElement("div", null, element));
}

describe("Conversa — a query ao banco já esconde PENDING/SENDING e mensagens de WhatsApp", () => {
  it("messages.where pede só status SENT/FAILED", async () => {
    await renderConversationHtml();
    const args = findUniqueMock.mock.calls.at(-1)![0] as { include: { messages: { where: { status: { in: string[] } } } } };
    expect(args.include.messages.where.status).toEqual({ in: ["SENT", "FAILED"] });
  });

  // Bug real reportado: a confirmação de agendamento por WhatsApp
  // aparecia na conversa como se fosse uma bolha do Instagram.
  it("messages.where pede só channel INSTAGRAM — mensagem de WhatsApp nunca sai do banco pra esta tela", async () => {
    await renderConversationHtml();
    const args = findUniqueMock.mock.calls.at(-1)![0] as { include: { messages: { where: { channel: { in: string[] } } } } };
    expect(args.include.messages.where.channel).toEqual({ in: ["INSTAGRAM"] });
  });
});

describe("Conversa — ordem por visibleAt (não createdAt) e marca 'agendada' removida de verdade", () => {
  it("resposta da IA criada antes, mas enviada depois, aparece DEPOIS da mensagem do lead que chegou no meio", async () => {
    const html = await renderConversationHtml();
    const posLead1 = html.indexOf("Primeira mensagem do lead");
    const posLead2 = html.indexOf("Segunda mensagem do lead");
    const posAi = html.indexOf("Resposta da IA (saiu bem depois de criada)");

    expect(posLead1).toBeGreaterThan(-1);
    expect(posLead2).toBeGreaterThan(-1);
    expect(posAi).toBeGreaterThan(-1);
    // Ordem na tela: lead 1 (10:00) -> lead 2 (10:02) -> IA (visibleAt=sentAt=10:10,
    // mesmo tendo createdAt=10:00:30, ANTES do lead 2).
    expect(posLead1).toBeLessThan(posLead2);
    expect(posLead2).toBeLessThan(posAi);
  });

  it("mensagem FAILED continua aparecendo, com '· falhou'", async () => {
    const html = await renderConversationHtml();
    expect(html).toContain("Mensagem que falhou");
    expect(html).toContain("falhou");
  });

  it('a marca "agendada" não existe em nenhum lugar da tela renderizada', async () => {
    const html = await renderConversationHtml();
    expect(html).not.toContain("agendada");
  });
});
