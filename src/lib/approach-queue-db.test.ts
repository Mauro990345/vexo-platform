import { beforeEach, describe, expect, it, vi } from "vitest";

const approachQueueItemFindManyMock = vi.fn();
const approachQueueItemFindFirstMock = vi.fn();
const approachQueueItemCreateManyMock = vi.fn();
const approachQueueItemUpdateManyMock = vi.fn();
const approachQueueItemUpdateMock = vi.fn();
const approachQueueItemCountMock = vi.fn();
const leadFindManyMock = vi.fn();
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
      createMany: (...args: unknown[]) => approachQueueItemCreateManyMock(...args),
      updateMany: (...args: unknown[]) => approachQueueItemUpdateManyMock(...args),
      update: (...args: unknown[]) => approachQueueItemUpdateMock(...args),
      count: (...args: unknown[]) => approachQueueItemCountMock(...args),
    },
    lead: { findMany: (...args: unknown[]) => leadFindManyMock(...args) },
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

import { uploadApproachLeads, sendNextApproachItem, undoLastApproachSend, skipApproachItem, setApproachWindow } from "./approach-queue-db";

const NOW = new Date("2026-01-15T14:00:00Z"); // 11h em São Paulo — dentro do horário

beforeEach(() => {
  approachQueueItemFindManyMock.mockReset().mockResolvedValue([]);
  approachQueueItemFindFirstMock.mockReset();
  approachQueueItemCreateManyMock.mockReset().mockResolvedValue({ count: 0 });
  approachQueueItemUpdateManyMock.mockReset();
  approachQueueItemUpdateMock.mockReset();
  approachQueueItemCountMock.mockReset().mockResolvedValue(0);
  leadFindManyMock.mockReset().mockResolvedValue([]);
  approachQueueConfigUpsertMock.mockReset();
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

describe("sendNextApproachItem", () => {
  function baseConfig(overrides: Record<string, unknown> = {}) {
    return { clinicId: "clinic-1", dailyLimit: 60, paused: false, activeInQueue: true, lockedUntil: null, lastMessageSlot: null, ...overrides };
  }

  it("fora do horário permitido — não envia", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig());
    const result = await sendNextApproachItem("clinic-1", new Date("2026-01-15T03:00:00Z"));
    expect(result).toEqual({ ok: false, reason: "outside_hours" });
  });

  it("pausada — não envia", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig({ paused: true }));
    const result = await sendNextApproachItem("clinic-1", NOW);
    expect(result).toEqual({ ok: false, reason: "paused" });
  });

  it("limite do dia atingido — não envia", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig({ dailyLimit: 5 }));
    approachQueueItemCountMock.mockResolvedValue(5);
    const result = await sendNextApproachItem("clinic-1", NOW);
    expect(result).toEqual({ ok: false, reason: "limit_reached" });
  });

  it("em espera (lockedUntil no futuro) — não envia", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig({ lockedUntil: new Date(NOW.getTime() + 60_000) }));
    const result = await sendNextApproachItem("clinic-1", NOW);
    expect(result).toEqual({ ok: false, reason: "waiting" });
  });

  it("fila vazia — não envia", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig());
    approachQueueItemFindFirstMock.mockResolvedValue(null);
    const result = await sendNextApproachItem("clinic-1", NOW);
    expect(result).toEqual({ ok: false, reason: "empty_queue" });
  });

  it("sem nenhuma mensagem configurada — não envia", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig());
    approachQueueItemFindFirstMock.mockResolvedValue({ id: "item-1", username: "fulano.ig", name: "Fulano" });
    approachMessagesConfigFindUniqueMock.mockResolvedValue({ message1: null, message2: null, message3: null, message4: null, message5: null });
    const result = await sendNextApproachItem("clinic-1", NOW);
    expect(result).toEqual({ ok: false, reason: "no_messages" });
  });

  it("envio normal: marca SENT, cria ApproachLog, sorteia espera e mensagem com {nome} preenchido", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig());
    approachQueueItemFindFirstMock.mockResolvedValue({ id: "item-1", username: "fulano.ig", name: "Fulano Silva" });
    approachQueueItemUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await sendNextApproachItem("clinic-1", NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.igUsername).toBe("fulano.ig");
      expect(["Oi Fulano!", "Fala Fulano"]).toContain(result.message);
    }
    expect(approachLogCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ clinicId: "clinic-1", count: 1 }) });
    expect(approachQueueConfigUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lockedUntil: expect.any(Date), lastMessageSlot: expect.any(Number) }) })
    );
  });

  it("toque duplo: claim perde na 2ª chamada (count 0) — não conta duas vezes", async () => {
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig());
    approachQueueItemFindFirstMock.mockResolvedValue({ id: "item-1", username: "fulano.ig", name: null });
    approachQueueItemUpdateManyMock.mockResolvedValue({ count: 0 }); // outra chamada já ganhou o claim

    const result = await sendNextApproachItem("clinic-1", NOW);

    expect(result).toEqual({ ok: false, reason: "empty_queue" });
    expect(approachLogCreateMock).not.toHaveBeenCalled();
  });
});

describe("undoLastApproachSend", () => {
  it("sem envio recente — ok:false", async () => {
    approachQueueItemFindFirstMock.mockResolvedValue(null);
    expect(await undoLastApproachSend("clinic-1")).toEqual({ ok: false });
    expect(approachQueueItemUpdateMock).not.toHaveBeenCalled();
  });

  it("devolve o item pra QUEUED, apaga o ApproachLog e libera a conta", async () => {
    approachQueueItemFindFirstMock.mockResolvedValue({ id: "item-1", approachLogId: "log-1" });

    const result = await undoLastApproachSend("clinic-1");

    expect(result).toEqual({ ok: true });
    expect(approachQueueItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { status: "QUEUED", sentAt: null, approachLogId: null },
    });
    expect(approachLogDeleteMock).toHaveBeenCalledWith({ where: { id: "log-1" } });
    expect(approachQueueConfigUpdateMock).toHaveBeenCalledWith({ where: { clinicId: "clinic-1" }, data: { lockedUntil: null } });
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

describe("sendNextApproachItem — janela customizada", () => {
  function baseConfig(overrides: Record<string, unknown> = {}) {
    return { clinicId: "clinic-1", dailyLimit: 60, paused: false, activeInQueue: true, lockedUntil: null, lastMessageSlot: null, ...overrides };
  }

  it("janela salva mais restrita (13h-18h): 11h em São Paulo fica fora do horário", async () => {
    approachWindowSettingsFindUniqueMock.mockResolvedValue({ id: "singleton", startMinute: 13 * 60, endMinute: 18 * 60 });
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig());

    const result = await sendNextApproachItem("clinic-1", NOW); // NOW = 11h em São Paulo
    expect(result).toEqual({ ok: false, reason: "outside_hours" });
  });

  it("janela salva mais ampla (0h-23h59): 11h em São Paulo está dentro mesmo fora do padrão 7h-20h", async () => {
    approachWindowSettingsFindUniqueMock.mockResolvedValue({ id: "singleton", startMinute: 0, endMinute: 23 * 60 + 59 });
    approachQueueConfigUpsertMock.mockResolvedValue(baseConfig());
    approachQueueItemFindFirstMock.mockResolvedValue({ id: "item-1", username: "fulano.ig", name: null });
    approachQueueItemUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await sendNextApproachItem("clinic-1", NOW);
    expect(result.ok).toBe(true);
  });
});
