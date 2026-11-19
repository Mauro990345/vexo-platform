// Prova que o Revisor (ver UserRole.REVIEWER) não consegue executar NENHUMA
// ação de escrita, nem forçando a chamada direto (sem passar pela tela) —
// o bloqueio real é no servidor, não só a interface escondendo o botão.
//
// Duas camadas:
// 1) Estática: toda função exportada de clinicas/actions.ts (o arquivo com
//    as ações usadas por Conexões/Painel/Pipeline/Conversa) precisa chamar
//    requireInternalSession (a única função que, desde esta rodada, barra
//    o Revisor com 404) — nunca requireInternalOrReviewerSession, que
//    deixaria ele passar. Perdura contra uma ação nova que esqueça a
//    checagem.
// 2) Dinâmica: chama algumas ações de verdade com uma sessão REVIEWER
//    mockada e confirma que todas rejeitam (NOTFOUND), nunca escrevendo
//    nada no banco mockado.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ACTIONS_FILE = path.resolve(__dirname, "actions.ts");

describe("clinicas/actions.ts — toda ação exportada chama requireInternalSession (estático)", () => {
  const source = readFileSync(ACTIONS_FILE, "utf8");

  // Cada bloco começa em "export async function NOME(" e vai até a chave
  // de fechamento na coluna 0 (mesma convenção de indentação do arquivo
  // inteiro) — suficiente pra isolar o corpo de cada função sem precisar
  // de um parser de verdade.
  const functionBlocks = [...source.matchAll(/^export async function (\w+)\([^)]*\)[^{]*\{/gm)].map((m, i, arr) => {
    const start = m.index!;
    const end = i + 1 < arr.length ? arr[i + 1]!.index! : source.length;
    return { name: m[1]!, body: source.slice(start, end) };
  });

  it("encontrou funções de verdade no arquivo (a varredura não está vazia)", () => {
    expect(functionBlocks.length).toBeGreaterThan(20);
  });

  it("nenhuma ação usa requireInternalOrReviewerSession (deixaria o Revisor escrever)", () => {
    const offenders = functionBlocks.filter((f) => f.body.includes("requireInternalOrReviewerSession"));
    expect(offenders.map((f) => f.name)).toEqual([]);
  });

  for (const { name, body } of functionBlocks) {
    it(`${name} chama requireInternalSession (ou requireClientSession, pras poucas ações do cliente)`, () => {
      const hasGuard = body.includes("requireInternalSession") || body.includes("requireClientSession");
      expect(hasGuard, `${name} não chama nenhuma função de sessão que bloqueie o Revisor`).toBe(true);
    });
  }
});

const {
  notFoundMock,
  redirectMock,
  getServerSessionMock,
  findUniqueMock,
  prismaMock,
} = vi.hoisted(() => {
  const notFoundMock = vi.fn(() => {
    throw new Error("NOTFOUND");
  });
  const redirectMock = vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  });
  const getServerSessionMock = vi.fn(async () => ({
    user: { id: "reviewer-1", name: "Revisor", role: "REVIEWER", clinicId: "demo-1" },
  }));
  const findUniqueMock = vi.fn(async (_arg: unknown) => ({ active: true }));
  const prismaMock = {
    user: { findUnique: (arg: unknown) => findUniqueMock(arg) },
    instagramAccount: { deleteMany: vi.fn(), update: vi.fn() },
    googleCalendarAccount: { deleteMany: vi.fn() },
    conversation: { update: vi.fn(), findUnique: vi.fn() },
    message: { create: vi.fn() },
  };
  return { notFoundMock, redirectMock, getServerSessionMock, findUniqueMock, prismaMock };
});

vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
  redirect: (to: string) => redirectMock(to),
}));
vi.mock("next-auth", () => ({ getServerSession: () => getServerSessionMock() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

describe("clinicas/actions.ts — Revisor é rejeitado de verdade, chamando as ações direto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue({
      user: { id: "reviewer-1", name: "Revisor", role: "REVIEWER", clinicId: "demo-1" },
    });
    findUniqueMock.mockResolvedValue({ active: true });
  });

  it("disconnectInstagramAction: rejeita (404), nunca apaga a conexão", async () => {
    const { disconnectInstagramAction } = await import("./actions");
    await expect(disconnectInstagramAction("demo-1")).rejects.toThrow("NOTFOUND");
    expect(prismaMock.instagramAccount.deleteMany).not.toHaveBeenCalled();
  });

  it("disconnectGoogleCalendarAction: rejeita (404), nunca apaga a conexão", async () => {
    const { disconnectGoogleCalendarAction } = await import("./actions");
    await expect(disconnectGoogleCalendarAction("demo-1")).rejects.toThrow("NOTFOUND");
    expect(prismaMock.googleCalendarAccount.deleteMany).not.toHaveBeenCalled();
  });

  it("setConversationStatus: rejeita (404), nunca muda o status", async () => {
    const { setConversationStatus } = await import("./actions");
    await expect(setConversationStatus("conv-1", "LOST")).rejects.toThrow("NOTFOUND");
    expect(prismaMock.conversation.update).not.toHaveBeenCalled();
  });

  it("sendHumanReply: rejeita (404), nunca cria mensagem", async () => {
    const { sendHumanReply } = await import("./actions");
    const formData = new FormData();
    formData.set("content", "oi");
    await expect(sendHumanReply("conv-1", formData)).rejects.toThrow("NOTFOUND");
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });
});
