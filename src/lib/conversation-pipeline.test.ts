import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks minimalistas pra TODA a árvore de dependências de conversation-pipeline.ts
// (módulo grande, com muitas integrações externas) — só as duas peças que
// buildAvailabilityCheck realmente usa (checkAvailability e
// prisma.appointment.findFirst) recebem uma implementação de verdade; o
// resto vira `{}` só pra evitar que o arquivo real (com dependências
// pesadas, ex. googleapis via google-calendar.ts) seja carregado.
const checkAvailabilityMock = vi.fn();
vi.mock("@/lib/google-calendar", () => ({
  checkAvailability: (...args: unknown[]) => checkAvailabilityMock(...args),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  updateCalendarEventDescription: vi.fn(),
  getRawBusyPeriods: vi.fn(),
}));

const appointmentFindFirstMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: { findFirst: (...args: unknown[]) => appointmentFindFirstMock(...args) },
  },
}));

vi.mock("@/lib/anthropic", () => ({}));
vi.mock("@/lib/conversation-context", () => ({}));
vi.mock("@/lib/instagram", () => ({}));
vi.mock("@/lib/lead-profile-picture-backfill", () => ({}));
vi.mock("@/lib/crypto", () => ({}));
vi.mock("@/lib/scheduler", () => ({}));
vi.mock("@/lib/default-prompt", () => ({}));
vi.mock("@/lib/whatsapp", () => ({}));
vi.mock("@/lib/follow-up", () => ({}));
vi.mock("@/lib/chat-history", () => ({ toChatHistory: vi.fn() }));
vi.mock("@/lib/result-photo-message", () => ({}));
vi.mock("@/lib/loop-guard", () => ({}));

import { buildAvailabilityCheck, isSlotFreeIgnoringOwnAppointment } from "@/lib/conversation-pipeline";

// Bug real corrigido (ver comentário grande em buildAvailabilityCheck):
// qualquer erro de check_availability — incluindo uma falha REAL da API do
// Google (token revogado, 5xx, rede) — virava só `{error: err.message}`
// devolvido pra IA, que podia interpretar isso como "esse horário não está
// disponível" e dizer uma causa inventada ao lead. Estes testes provam que
// uma falha real do Google agora é sinalizada separadamente (via
// onGoogleFailure), com uma mensagem de erro que explicitamente probe a IA
// de tratar isso como indisponibilidade ou confirmação.
describe("buildAvailabilityCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appointmentFindFirstMock.mockResolvedValue(null);
  });

  it("devolve os slots normalmente quando o Google responde com sucesso", async () => {
    checkAvailabilityMock.mockResolvedValue(["2026-09-19T12:00:00.000Z"]); // 9h Brasília

    const onGoogleFailure = vi.fn();
    const check = buildAvailabilityCheck("clinic-1", "conv-1", onGoogleFailure);
    const result = await check({ dateFromLocal: "2026-09-19T09:00", dateToLocal: "2026-09-19T10:00" });

    expect(onGoogleFailure).not.toHaveBeenCalled();
    expect(result).toEqual({ slots: ["2026-09-19T09:00"] });
  });

  it("falha real do Google (ex: invalid_grant) chama onGoogleFailure e NUNCA diz 'indisponível' — trata como falha de sistema", async () => {
    checkAvailabilityMock.mockRejectedValue(new Error("invalid_grant: Token has been expired or revoked."));

    const onGoogleFailure = vi.fn();
    const check = buildAvailabilityCheck("clinic-1", "conv-1", onGoogleFailure);
    const result = await check({ dateFromLocal: "2026-09-19T09:00", dateToLocal: "2026-09-19T10:00" });

    expect(onGoogleFailure).toHaveBeenCalledTimes(1);
    expect(onGoogleFailure.mock.calls[0]![0]).toContain("invalid_grant");

    expect("error" in result).toBe(true);
    const message = (result as { error: string }).error;
    // A mensagem PRECISA instruir a IA a não fazer nenhuma das duas
    // afirmações (nem "confirmado", nem "indisponível") — é exatamente
    // essa instrução que corrige o bug: antes, o erro genérico levava a IA
    // a inventar "esse horário não está disponível" como causa.
    expect(message).toContain("NÃO diga ao lead");
    expect(message).toContain("confirmado");
    expect(message).toContain("indisponível");
    expect(message).toContain("falha real do sistema");
  });

  it("erro de parsing de data (entrada inválida da IA) NÃO conta como falha do Google — não chama onGoogleFailure", async () => {
    const onGoogleFailure = vi.fn();
    const check = buildAvailabilityCheck("clinic-1", "conv-1", onGoogleFailure);
    const result = await check({ dateFromLocal: "data-invalida", dateToLocal: "2026-09-19T10:00" });

    expect(onGoogleFailure).not.toHaveBeenCalled();
    expect(checkAvailabilityMock).not.toHaveBeenCalled();
    expect("error" in result).toBe(true);
  });

  it("inclui ownAppointmentLocal quando já existe um agendamento ativo desta conversa na mesma janela", async () => {
    checkAvailabilityMock.mockResolvedValue([]);
    appointmentFindFirstMock.mockResolvedValue({
      scheduledAt: new Date("2026-09-19T12:00:00.000Z"), // 9h Brasília
    });

    const check = buildAvailabilityCheck("clinic-1", "conv-1", vi.fn());
    const result = await check({ dateFromLocal: "2026-09-19T09:00", dateToLocal: "2026-09-19T10:00" });

    expect(result).toEqual({ slots: [], ownAppointmentLocal: "2026-09-19T09:00" });
  });
});

// Bug real corrigido: remarcar pra um horário que se sobrepõe ao horário
// ATUAL do próprio agendamento desta conversa (ex.: 14:00 -> 14:30) era
// recusado como "não está livre" — o evento antigo ainda está no Google
// (só é movido DEPOIS de passar por esta checagem) e o freebusy não
// distingue "ocupado por mim mesmo" de "ocupado por outra pessoa". Estes
// testes cobrem a função pura extraída de dentro de scheduleAppointment
// (conversation-pipeline.ts) que decide isso.
describe("isSlotFreeIgnoringOwnAppointment", () => {
  it("caso do bug: remarcar de 14:00 pra 14:30 (se sobrepõe ao horário atual do próprio lead) passa a ser considerado livre", () => {
    // Evento atual: 14:00-15:00 (Brasília) = 17:00-18:00 UTC. Novo horário
    // pedido: 14:30-15:30 (Brasília) = 17:30-18:30 UTC. O Google ainda
    // reporta o período antigo (17:00-18:00 UTC) como ocupado — exatamente
    // o próprio evento, ainda não movido.
    const ownWindow = { start: new Date("2026-09-19T17:00:00.000Z"), end: new Date("2026-09-19T18:00:00.000Z") };
    const result = isSlotFreeIgnoringOwnAppointment({
      start: new Date("2026-09-19T17:30:00.000Z"),
      end: new Date("2026-09-19T18:30:00.000Z"),
      rawBusy: [{ start: ownWindow.start.toISOString(), end: ownWindow.end.toISOString() }],
      ownAppointmentWindow: ownWindow,
    });

    expect(result).toBe(true);
  });

  it("horário realmente ocupado por OUTRA pessoa continua sendo recusado, mesmo com um agendamento próprio ativo", () => {
    // Mesmo evento próprio de antes (17:00-18:00 UTC), mas agora existe
    // TAMBÉM um evento de outra pessoa (17:45-18:15 UTC) que colide com o
    // novo horário pedido (17:30-18:30 UTC) — esse período não bate com a
    // janela do próprio agendamento, então continua bloqueando.
    const ownWindow = { start: new Date("2026-09-19T17:00:00.000Z"), end: new Date("2026-09-19T18:00:00.000Z") };
    const result = isSlotFreeIgnoringOwnAppointment({
      start: new Date("2026-09-19T17:30:00.000Z"),
      end: new Date("2026-09-19T18:30:00.000Z"),
      rawBusy: [
        { start: ownWindow.start.toISOString(), end: ownWindow.end.toISOString() },
        { start: "2026-09-19T17:45:00.000Z", end: "2026-09-19T18:15:00.000Z" },
      ],
      ownAppointmentWindow: ownWindow,
    });

    expect(result).toBe(false);
  });

  it("sem ownAppointmentWindow (primeira marcação, sem agendamento ativo), um período ocupado continua bloqueando normalmente", () => {
    const result = isSlotFreeIgnoringOwnAppointment({
      start: new Date("2026-09-19T17:30:00.000Z"),
      end: new Date("2026-09-19T18:30:00.000Z"),
      rawBusy: [{ start: "2026-09-19T17:45:00.000Z", end: "2026-09-19T18:15:00.000Z" }],
    });

    expect(result).toBe(false);
  });

  it("sem nenhum período ocupado na janela, está livre", () => {
    const result = isSlotFreeIgnoringOwnAppointment({
      start: new Date("2026-09-19T17:30:00.000Z"),
      end: new Date("2026-09-19T18:30:00.000Z"),
      rawBusy: [],
      ownAppointmentWindow: { start: new Date("2026-09-19T17:00:00.000Z"), end: new Date("2026-09-19T18:00:00.000Z") },
    });

    expect(result).toBe(true);
  });
});
