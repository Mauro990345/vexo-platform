import { beforeEach, describe, expect, it, vi } from "vitest";

const approachQueueItemFindManyMock = vi.fn();
const approachQueueItemFindFirstMock = vi.fn();
const approachQueueItemFindUniqueMock = vi.fn();
const approachQueueItemCreateManyMock = vi.fn();
const approachQueueItemUpdateManyMock = vi.fn();
const approachQueueItemUpdateMock = vi.fn();
const approachQueueItemCountMock = vi.fn();
const leadFindManyMock = vi.fn();
const clinicFindUniqueMock = vi.fn();
const approachQueueConfigUpsertMock = vi.fn();
const approachQueueConfigUpdateMock = vi.fn();
const approachMessagesConfigFindUniqueMock = vi.fn();
const approachLogCreateMock = vi.fn();
const approachLogDeleteMock = vi.fn();
const approachWindowSettingsFindUniqueMock = vi.fn();
const approachWindowSettingsUpsertMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    approachQueueItem: {
      findMany: (...args: unknown[]) => approachQueueItemFindManyMock(...args),
      findFirst: (...args: unknown[]) => approachQueueItemFindFirstMock(...args),
      findUnique: (...args: unknown[]) => approachQueueItemFindUniqueMock(...args),
      createMany: (...args: unknown[]) => approachQueueItemCreateManyMock(...args),
      updateMany: (...args: unknown[]) => approachQueueItemUpdateManyMock(...args),
      update: (...args: unknown[]) => approachQueueItemUpdateMock(...args),
      count: (...args: unknown[]) => approachQueueItemCountMock(...args),
    },
    lead: { findMany: (...args: unknown[]) => leadFindManyMock(...args) },
    clinic: { findUnique: (...args: unknown[]) => clinicFindUniqueMock(...args) },
    approachQueueConfig: {
      upsert: (...args: unknown[]) => approachQueueConfigUpsertMock(...args),
      update: (...args: unknown[]) => approachQueueConfigUpdateMock(...args),
    },
    approachMessagesConfig: { findUnique: (...args: unknown[]) => approachMessagesConfigFindUniqueMock(...args) },
    approachLog: {
      create: (...args: unknown[]) => approachLogCreateMock(...args),
      delete: (...args: unknown[]) => approachLogDeleteMock(...args),
    },
    approachWindowSettings: {
      findUnique: (...args: unknown[]) => approachWindowSettingsFindUniqueMock(...args),
      upsert: (...args: unknown[]) => approachWindowSettingsUpsertMock(...args),
    },
  },
}));

import { uploadApproachLeads, confirmApproachSend, undoLastApproachSend, skipApproachItem, setApproachWindow, getApproachBoardAccount } from "./approach-queue-db";

const NOW = new Date("2026-01-15T14:00:00Z"); // 11h em São Paulo — dentro do horário

function baseConfig(overrides: Record<string, unknown> = {}) {
  return { clinicId: "clinic-1", dailyLimit: 60, paused: false, activeInQueue: true, lockedUntil: null, lastMessageSlot: null, ...overrides };
}

beforeEach(() => {
  approachQueueItemFindManyMock.mockReset().mockResolvedValue([]);
  approachQueueItemFindFirstMock.mockReset();
  approachQueueItemFindUniqueMock.mockReset();
  approachQueueItemCreateManyMock.mockReset().mockResolvedValue({ count: 0 });
  approachQueueItemUpdateManyMock.mockReset();
  approachQueueItemUpdateMock.mockReset().mockResolvedValue({});
  approachQueueItemCountMock.mockReset().mockResolvedValue(0);
  leadFindManyMock.mockReset().mockResolvedValue([]);
  clinicFindUniqueMock.mockReset().mockResolvedValue({ id: "clinic-1", name: "Clínica Demo", instagramAccount: { igUsername: "clinica.demo" } });
  approachQueueConfigUpsertMock.mockReset().mockResolvedValue(baseConfig());
  approachQueueConfigUpdateMock.mockReset().mockResolvedValue({});
  approachMessagesConfigFindUniqueMock.mockReset().mockResolvedValue({ message1: "Oi {nome}!", message2: "Fala {nome}", message3: null, message4: null, message5: null });
  approachLogCreateMock.mockReset().mockResolvedValue({ id: "log-1" });
  approachLogDeleteMock.mockReset().mockResolvedValue({});
  approachWindowSettingsFindUniqueMock.mockReset().mockResolvedValue(null); // sem linha salva -> padrão 7h-20h
  approachWindowSettingsUpsertMock.mockReset().mockResolvedValue({});
});

describe("uploadApproachLeads — duplicados", () => {
  it("descarta duplicado dentro do próprio arquivo, já em lista, já enviado e com conversa", async () => {
    approachQueueItemFindManyMock.mockResolvedValue([{ usernameNormalized: "ja.na.lista" }]);
    leadFindManyMock.mockResolvedValue([{ igUsername: "Ja.Tem.Conversa" }]);

    const result = await uploadApproachLeads("clinic-1", [
      { username: "novo.lead", name: "Novo" },
      { username: "@Novo.Lead", name: null }, // duplicado do próprio arquivo (normaliza igual)
      { username: "ja.na.lista", name: null },
      { username: "ja.tem.conversa", name: null },
    ]);

    expect(result.added).toBe(1);
    expect(result.discarded).toBe(3);
    expect(approachQueueItemCreateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ username: "novo.lead", usernameNormalized: "novo.lead" })],
      })
    );
  });

  it("lista vazia depois de filtrar — não chama createMany", async () => {
    const result = await uploadApproachLeads("clinic-1", [{ username: "", name: null }]);
    expect(result.added).toBe(0);
    expect(approachQueueItemCreateManyMock).not.toHaveBeenCalled();
  });
});

describe("getApproachBoardAccount — atribuição de mensagem (ver ensureApproachItemMessageAssigned)", () => {
  it("item sem assignedMessage: sorteia, PERSISTE (update do item + lastMessageSlot) e devolve message/dmLink prontos pro 1º card", async () => {
    approachQueueItemFindManyMock.mockResolvedValue([
      { id: "item-1", username: "fulano.ig", name: "Fulano Silva", assignedMessage: null, assignedMessageSlot: null },
    ]);

    const account = await getApproachBoardAccount("clinic-1", NOW);

    expect(account?.items[0]?.message).not.toBeNull();
    expect(["Oi Fulano!", "Fala Fulano"]).toContain(account?.items[0]?.message);
    expect(account?.items[0]?.dmLink).toContain("fulano.ig");
    expect(approachQueueItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { assignedMessage: expect.any(String), assignedMessageSlot: expect.any(Number) },
    });
    expect(approachQueueConfigUpdateMock).toHaveBeenCalledWith({ where: { clinicId: "clinic-1" }, data: { lastMessageSlot: expect.any(Number) } });
  });

  it("item JÁ com assignedMessage: nunca sorteia de novo — devolve exatamente o que já estava guardado, sem tocar no banco", async () => {
    approachQueueItemFindManyMock.mockResolvedValue([
      { id: "item-1", username: "fulano.ig", name: "Fulano Silva", assignedMessage: "Oi Fulano! (já sorteada antes)", assignedMessageSlot: 2 },
    ]);

    const account = await getApproachBoardAccount("clinic-1", NOW);

    expect(account?.items[0]?.message).toBe("Oi Fulano! (já sorteada antes)");
    expect(approachQueueItemUpdateMock).not.toHaveBeenCalled();
    expect(approachQueueConfigUpdateMock).not.toHaveBeenCalled();
  });

  it("estável entre duas chamadas seguidas (2 atualizações automáticas da tela) — mesma mensagem nas duas", async () => {
    approachQueueItemFindManyMock.mockResolvedValue([
      { id: "item-1", username: "fulano.ig", name: "Fulano Silva", assignedMessage: null, assignedMessageSlot: null },
    ]);

    const first = await getApproachBoardAccount("clinic-1", NOW);
    const assignedMessage = first?.items[0]?.message;
    const assignedSlot = (approachQueueItemUpdateMock.mock.calls[0]![0] as { data: { assignedMessageSlot: number } }).data.assignedMessageSlot;

    // 2ª chamada já vem com o item atualizado (como aconteceria de verdade
    // no banco) — simula o "recarregar a tela" ou o poll automático.
    approachQueueItemFindManyMock.mockResolvedValue([
      { id: "item-1", username: "fulano.ig", name: "Fulano Silva", assignedMessage, assignedMessageSlot: assignedSlot },
    ]);
    const second = await getApproachBoardAccount("clinic-1", NOW);

    expect(second?.items[0]?.message).toBe(assignedMessage);
    expect(approachQueueItemUpdateMock).toHaveBeenCalledTimes(1); // só a 1ª chamada gravou
  });

  it("só o 1º item (ativo) ganha mensagem — os 2 de prévia ficam com message/dmLink null", async () => {
    approachQueueItemFindManyMock.mockResolvedValue([
      { id: "item-1", username: "um.ig", name: null, assignedMessage: null, assignedMessageSlot: null },
      { id: "item-2", username: "dois.ig", name: null, assignedMessage: null, assignedMessageSlot: null },
      { id: "item-3", username: "tres.ig", name: null, assignedMessage: null, assignedMessageSlot: null },
    ]);

    const account = await getApproachBoardAccount("clinic-1", NOW);

    expect(account?.items[0]?.message).not.toBeNull();
    expect(account?.items[1]?.message).toBeNull();
    expect(account?.items[2]?.message).toBeNull();
    expect(approachQueueItemUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("sem nenhuma mensagem configurada — message/dmLink ficam null, sem erro", async () => {
    approachMessagesConfigFindUniqueMock.mockResolvedValue({ message1: null, message2: null, message3: null, message4: null, message5: null });
    approachQueueItemFindManyMock.mockResolvedValue([{ id: "item-1", username: "fulano.ig", name: null, assignedMessage: null, assignedMessageSlot: null }]);

    const account = await getApproachBoardAccount("clinic-1", NOW);

    expect(account?.items[0]?.message).toBeNull();
    expect(account?.items[0]?.dmLink).toBeNull();
  });
});

describe("confirmApproachSend", () => {
  it("fora do horário permitido — não registra", async () => {
    const result = await confirmApproachSend("clinic-1", "item-1", new Date("2026-01-15T03:00:00Z"));
    expect(result).toEqual({ ok: false, reason: "outside_hours" });
    expect(approachQueueItemUpdateManyMock).not.toHaveBeenCalled();
  });

  it("pausada — não registra", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig({ paused: true }));
    const result = await confirmApproachSend("clinic-1", "item-1", NOW);
    expect(result).toEqual({ ok: false, reason: "paused" });
  });

  it("limite do dia atingido — não registra", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig({ dailyLimit: 5 }));
    approachQueueItemCountMock.mockResolvedValue(5);
    const result = await confirmApproachSend("clinic-1", "item-1", NOW);
    expect(result).toEqual({ ok: false, reason: "limit_reached" });
  });

  it("em espera (lockedUntil no futuro) — não registra", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig({ lockedUntil: new Date(NOW.getTime() + 60_000) }));
    const result = await confirmApproachSend("clinic-1", "item-1", NOW);
    expect(result).toEqual({ ok: false, reason: "waiting" });
  });

  it("item não encontrado (ex.: id errado) — não registra", async () => {
    approachQueueItemFindUniqueMock.mockResolvedValue(null);
    const result = await confirmApproachSend("clinic-1", "item-inexistente", NOW);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("item de outra clínica — não registra (nunca confia só no itemId)", async () => {
    approachQueueItemFindUniqueMock.mockResolvedValue({ id: "item-1", clinicId: "outra-clinica" });
    const result = await confirmApproachSend("clinic-1", "item-1", NOW);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("registro normal: marca SENT, cria ApproachLog e sorteia nova espera — NUNCA sorteia mensagem (já vinha pronta)", async () => {
    approachQueueItemFindUniqueMock.mockResolvedValue({ id: "item-1", clinicId: "clinic-1", username: "fulano.ig", assignedMessage: "Oi Fulano!" });
    approachQueueItemUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await confirmApproachSend("clinic-1", "item-1", NOW);

    expect(result).toEqual({ ok: true });
    expect(approachQueueItemUpdateManyMock).toHaveBeenCalledWith({ where: { id: "item-1", status: "QUEUED" }, data: { status: "SENT", sentAt: NOW } });
    expect(approachLogCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ clinicId: "clinic-1", count: 1 }) });
    expect(approachQueueConfigUpdateMock).toHaveBeenCalledWith({ where: { clinicId: "clinic-1" }, data: { lockedUntil: expect.any(Date) } });
    // Nenhuma chamada aqui mexe em mensagem/slot — isso já aconteceu antes, no board.
    expect(approachQueueConfigUpdateMock).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastMessageSlot: expect.anything() }) }));
  });

  it("toque duplo: claim perde na 2ª chamada (count 0) — vira already_handled, nunca conta duas vezes", async () => {
    approachQueueItemFindUniqueMock.mockResolvedValue({ id: "item-1", clinicId: "clinic-1", username: "fulano.ig", assignedMessage: "Oi!" });
    approachQueueItemUpdateManyMock.mockResolvedValue({ count: 0 }); // outra chamada (ou um Pular) já ganhou

    const result = await confirmApproachSend("clinic-1", "item-1", NOW);

    expect(result).toEqual({ ok: false, reason: "already_handled" });
    expect(approachLogCreateMock).not.toHaveBeenCalled();
  });
});

describe("undoLastApproachSend", () => {
  it("sem envio recente — ok:false", async () => {
    approachQueueItemFindFirstMock.mockResolvedValue(null);
    expect(await undoLastApproachSend("clinic-1")).toEqual({ ok: false });
    expect(approachQueueItemUpdateMock).not.toHaveBeenCalled();
  });

  it("devolve o item pra QUEUED, apaga o ApproachLog e libera a conta — SEM mexer em assignedMessage", async () => {
    approachQueueItemFindFirstMock.mockResolvedValue({ id: "item-1", approachLogId: "log-1" });

    const result = await undoLastApproachSend("clinic-1");

    expect(result).toEqual({ ok: true });
    expect(approachQueueItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { status: "QUEUED", sentAt: null, approachLogId: null },
    });
    // O update não inclui assignedMessage/assignedMessageSlot — ver
    // comentário grande em undoLastApproachSend: a mensagem já sorteada
    // nunca é apagada, é isso que garante "Desfazer devolve a mesma mensagem".
    const data = approachQueueItemUpdateMock.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty("assignedMessage");
    expect(data).not.toHaveProperty("assignedMessageSlot");
    expect(approachLogDeleteMock).toHaveBeenCalledWith({ where: { id: "log-1" } });
    expect(approachQueueConfigUpdateMock).toHaveBeenCalledWith({ where: { clinicId: "clinic-1" }, data: { lockedUntil: null } });
  });

  it("Desfazer + reler o board: a mesma mensagem reaparece (o item continua com assignedMessage no banco)", async () => {
    approachQueueItemFindFirstMock.mockResolvedValue({ id: "item-1", approachLogId: "log-1" });
    await undoLastApproachSend("clinic-1");

    // Depois do Desfazer, o item volta a aparecer QUEUED com a MESMA
    // assignedMessage de antes (nunca seria apagada por undoLastApproachSend,
    // conferido acima) — getApproachBoardAccount não sorteia de novo.
    approachQueueItemFindManyMock.mockResolvedValue([
      { id: "item-1", username: "fulano.ig", name: "Fulano", assignedMessage: "Oi Fulano! (a mesma de antes)", assignedMessageSlot: 1 },
    ]);
    const account = await getApproachBoardAccount("clinic-1", NOW);

    expect(account?.items[0]?.message).toBe("Oi Fulano! (a mesma de antes)");
  });
});

describe("skipApproachItem", () => {
  it("só sai da fila se ainda estiver QUEUED", async () => {
    approachQueueItemUpdateManyMock.mockResolvedValue({ count: 1 });
    expect(await skipApproachItem("item-1")).toEqual({ ok: true });
    expect(approachQueueItemUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "item-1", status: "QUEUED" },
      data: { status: "SKIPPED" },
    });
  });

  it("já não está mais QUEUED (ex.: já foi enviado) — count 0", async () => {
    approachQueueItemUpdateManyMock.mockResolvedValue({ count: 0 });
    expect(await skipApproachItem("item-1")).toEqual({ ok: false });
  });
});

describe("setApproachWindow", () => {
  it("salva início/fim válidos", async () => {
    await setApproachWindow(420, 1200);
    expect(approachWindowSettingsUpsertMock).toHaveBeenCalledWith({
      where: { id: "singleton" },
      update: { startMinute: 420, endMinute: 1200 },
      create: { id: "singleton", startMinute: 420, endMinute: 1200 },
    });
  });

  it("início >= fim — rejeita sem gravar nada", async () => {
    await expect(setApproachWindow(1200, 420)).rejects.toThrow();
    expect(approachWindowSettingsUpsertMock).not.toHaveBeenCalled();
  });
});

describe("confirmApproachSend — janela customizada", () => {
  it("janela salva mais restrita (13h-18h): 11h em São Paulo fica fora do horário", async () => {
    approachWindowSettingsFindUniqueMock.mockResolvedValue({ id: "singleton", startMinute: 13 * 60, endMinute: 18 * 60 });

    const result = await confirmApproachSend("clinic-1", "item-1", NOW); // NOW = 11h em São Paulo
    expect(result).toEqual({ ok: false, reason: "outside_hours" });
  });

  it("janela salva mais ampla (0h-23h59): 11h em São Paulo está dentro mesmo fora do padrão 7h-20h", async () => {
    approachWindowSettingsFindUniqueMock.mockResolvedValue({ id: "singleton", startMinute: 0, endMinute: 23 * 60 + 59 });
    approachQueueItemFindUniqueMock.mockResolvedValue({ id: "item-1", clinicId: "clinic-1", username: "fulano.ig", assignedMessage: "Oi!" });
    approachQueueItemUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await confirmApproachSend("clinic-1", "item-1", NOW);
    expect(result).toEqual({ ok: true });
  });
});
