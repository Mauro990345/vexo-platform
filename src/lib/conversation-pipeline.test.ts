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
// formatBrazilianPhoneForDisplay é usada de verdade por
// buildCalendarEventDescription (testada abaixo) — importActual mantém a
// implementação real (pura, sem I/O) em vez de `{}`, que faria
// buildCalendarEventDescription quebrar ao chamar uma função inexistente.
vi.mock("@/lib/whatsapp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp")>("@/lib/whatsapp");
  return { formatBrazilianPhoneForDisplay: actual.formatBrazilianPhoneForDisplay };
});
vi.mock("@/lib/follow-up", () => ({}));
vi.mock("@/lib/chat-history", () => ({ toChatHistory: vi.fn() }));
vi.mock("@/lib/result-photo-message", () => ({}));
vi.mock("@/lib/loop-guard", () => ({}));

import {
  buildAvailabilityCheck,
  isSlotFreeIgnoringOwnAppointment,
  buildCalendarEventDescription,
} from "@/lib/conversation-pipeline";

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

  // Bug real corrigido (caso Mauro Camargo, 06/10 ~19:38): ao reconfirmar
  // um horário específico ("9h fica bom"), o modelo chamou
  // check_availability com dateFromLocal == dateToLocal — um intervalo de
  // largura ZERO, que o Google rejeita com "The specified time range is
  // empty", virando uma falha de sistema (NEEDS_HUMAN) pra um agendamento
  // perfeitamente normal. Os testes abaixo cobrem a correção (estender pra
  // 1h em vez de devolver erro) e a distinção do caso genuinamente
  // inválido (invertido).
  describe("validação de dateFromLocal/dateToLocal", () => {
    it("horário cheio (9h, janela de 1h) — passa normalmente", async () => {
      checkAvailabilityMock.mockResolvedValue([]);
      const check = buildAvailabilityCheck("clinic-1", "conv-1", vi.fn());

      await check({ dateFromLocal: "2026-10-07T09:00", dateToLocal: "2026-10-07T10:00" });

      expect(checkAvailabilityMock).toHaveBeenCalledWith(
        "clinic-1",
        "2026-10-07T12:00:00.000Z",
        "2026-10-07T13:00:00.000Z"
      );
    });

    it("meia hora (janela menor que 1h, mas não-vazia) — passa sem estender", async () => {
      checkAvailabilityMock.mockResolvedValue([]);
      const check = buildAvailabilityCheck("clinic-1", "conv-1", vi.fn());

      await check({ dateFromLocal: "2026-10-07T09:00", dateToLocal: "2026-10-07T09:30" });

      expect(checkAvailabilityMock).toHaveBeenCalledWith(
        "clinic-1",
        "2026-10-07T12:00:00.000Z",
        "2026-10-07T12:30:00.000Z"
      );
    });

    it("fim de dia (17h-18h, borda do horário de funcionamento) — passa normalmente", async () => {
      checkAvailabilityMock.mockResolvedValue([]);
      const check = buildAvailabilityCheck("clinic-1", "conv-1", vi.fn());

      await check({ dateFromLocal: "2026-10-07T17:00", dateToLocal: "2026-10-07T18:00" });

      expect(checkAvailabilityMock).toHaveBeenCalledWith(
        "clinic-1",
        "2026-10-07T20:00:00.000Z",
        "2026-10-07T21:00:00.000Z"
      );
    });

    it("CASO REAL DO BUG — dateFromLocal === dateToLocal (9h == 9h): estende pra 1h e NÃO falha, nunca chama onGoogleFailure", async () => {
      checkAvailabilityMock.mockResolvedValue([]);
      const onGoogleFailure = vi.fn();
      const check = buildAvailabilityCheck("clinic-1", "conv-1", onGoogleFailure);

      const result = await check({ dateFromLocal: "2026-10-07T09:00", dateToLocal: "2026-10-07T09:00" });

      // Antes desta correção, isto chamava o Google com
      // timeMin === timeMax === "2026-10-07T12:00:00.000Z" (intervalo
      // vazio) — agora dateTo é estendido pra dateFrom + 1h.
      expect(checkAvailabilityMock).toHaveBeenCalledWith(
        "clinic-1",
        "2026-10-07T12:00:00.000Z",
        "2026-10-07T13:00:00.000Z"
      );
      expect(onGoogleFailure).not.toHaveBeenCalled();
      expect("error" in result).toBe(false);
    });

    it("invertido (10h -> 9h, sem leitura razoável): devolve erro, NUNCA chama checkAvailability nem onGoogleFailure", async () => {
      const onGoogleFailure = vi.fn();
      const check = buildAvailabilityCheck("clinic-1", "conv-1", onGoogleFailure);

      const result = await check({ dateFromLocal: "2026-10-07T10:00", dateToLocal: "2026-10-07T09:00" });

      expect(checkAvailabilityMock).not.toHaveBeenCalled();
      expect(onGoogleFailure).not.toHaveBeenCalled();
      expect("error" in result).toBe(true);
    });

    it("virada de dia (23h -> 1h do dia seguinte): passa normalmente, ordem preservada na conversão pra UTC", async () => {
      checkAvailabilityMock.mockResolvedValue([]);
      const check = buildAvailabilityCheck("clinic-1", "conv-1", vi.fn());

      await check({ dateFromLocal: "2026-10-07T23:00", dateToLocal: "2026-10-08T01:00" });

      // 23:00 BRT (07/10) = 02:00 UTC (08/10); 01:00 BRT (08/10) = 04:00 UTC (08/10).
      expect(checkAvailabilityMock).toHaveBeenCalledWith(
        "clinic-1",
        "2026-10-08T02:00:00.000Z",
        "2026-10-08T04:00:00.000Z"
      );
    });
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

// Bug real reportado: "WhatsApp: 998223038" (sem DDD) aparecia na descrição
// do evento do Google Calendar — buildCalendarEventDescription só colava
// leadPhone cru, sem formatar nem validar. leadPhone chega aqui já
// validado (ver validateBrazilianPhone, saveLeadPhone em
// conversation-pipeline.ts) — esta função só cuida da exibição legível.
describe("buildCalendarEventDescription", () => {
  it("formata o WhatsApp legível (DDD + celular) na descrição do evento", () => {
    const description = buildCalendarEventDescription({ leadName: "Mauro Camargo", leadPhone: "5521998223038" });

    expect(description).toContain("WhatsApp: (21) 99822-3038");
    expect(description).toContain("Lead: Mauro Camargo");
  });

  it("sem telefone, mostra \"ainda não informado\" em vez de uma linha vazia", () => {
    const description = buildCalendarEventDescription({ leadName: "Mauro Camargo", leadPhone: null });

    expect(description).toContain("WhatsApp: ainda não informado.");
  });
});
