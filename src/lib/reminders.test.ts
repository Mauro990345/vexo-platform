import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks minimalistas — mesmo padrão de dispatch.test.ts: só as peças que
// processReminders usaria, caso estivesse ligado, recebem implementação.
const appointmentFindManyMock = vi.fn();
const reminderLogCreateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: { findMany: (...args: unknown[]) => appointmentFindManyMock(...args) },
    reminderLog: { create: (...args: unknown[]) => reminderLogCreateMock(...args) },
  },
}));

vi.mock("@/lib/whatsapp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp")>("@/lib/whatsapp");
  return {
    formatReminderMessage: actual.formatReminderMessage,
    applyReminderTemplate: actual.applyReminderTemplate,
  };
});

const sendInstagramMessageMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  sendInstagramMessage: (...args: unknown[]) => sendInstagramMessageMock(...args),
}));

import { processReminders } from "@/lib/reminders";

// Pedido explícito do dono do produto: os lembretes de agendamento nunca
// deviam ter saído (campos "horas antes"/"texto" removidos da tela de
// Automações) — REMINDERS_ENABLED (reminders.ts) desliga o ciclo por
// completo, sem apagar nenhuma coluna/tabela nem precisar de migration.
// Este teste prova que isso vale mesmo com um agendamento perfeitamente
// elegível (dentro da janela, Instagram conectado, nada enviado antes).
describe("processReminders — ciclo desligado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nunca envia nada, nunca consulta agendamentos, mesmo com um elegível no banco", async () => {
    const now = new Date("2026-10-09T12:00:00.000Z");
    appointmentFindManyMock.mockResolvedValue([
      {
        id: "appt-1",
        scheduledAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        lead: { name: "Maria Lima", phone: "21998223038", igScopedId: "ig-scoped-1" },
        clinic: {
          reminderConfig: null,
          instagramAccount: { accessTokenEnc: "enc-token", igUserId: "ig-user-1" },
        },
        reminderLogs: [],
      },
    ]);

    const result = await processReminders();

    expect(result).toEqual({ sent: 0 });
    expect(appointmentFindManyMock).not.toHaveBeenCalled(); // sai ANTES de tocar no banco
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(reminderLogCreateMock).not.toHaveBeenCalled();
  });
});
