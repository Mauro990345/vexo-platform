import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
const appointmentFindManyMock = vi.fn();
const appointmentUpdateManyMock = vi.fn();
const appointmentCreateMock = vi.fn();
const appointmentUpdateMock = vi.fn();
const clinicFindUniqueMock = vi.fn();
const conversationFindUniqueMock = vi.fn();
const messageCreateMock = vi.fn();
const messageFindFirstMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findFirst: (...args: unknown[]) => appointmentFindFirstMock(...args),
      findMany: (...args: unknown[]) => appointmentFindManyMock(...args),
      updateMany: (...args: unknown[]) => appointmentUpdateManyMock(...args),
      create: (...args: unknown[]) => appointmentCreateMock(...args),
      update: (...args: unknown[]) => appointmentUpdateMock(...args),
    },
    clinic: { findUnique: (...args: unknown[]) => clinicFindUniqueMock(...args) },
    conversation: { findUnique: (...args: unknown[]) => conversationFindUniqueMock(...args) },
    message: {
      create: (...args: unknown[]) => messageCreateMock(...args),
      findFirst: (...args: unknown[]) => messageFindFirstMock(...args),
    },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

const classifyAttendanceReplyMock = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  classifyAttendanceReply: (...args: unknown[]) => classifyAttendanceReplyMock(...args),
}));
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
const getFollowUpWindowSettingsMock = vi.fn();
vi.mock("@/lib/follow-up", () => ({
  getFollowUpWindowSettings: (...args: unknown[]) => getFollowUpWindowSettingsMock(...args),
}));
vi.mock("@/lib/chat-history", () => ({ toChatHistory: vi.fn() }));
vi.mock("@/lib/result-photo-message", () => ({}));
vi.mock("@/lib/loop-guard", () => ({}));

import {
  buildAvailabilityCheck,
  isSlotFreeIgnoringOwnAppointment,
  buildCalendarEventDescription,
  fireAttendanceConfirmationSequence,
  maybeHandlePendingAttendanceReply,
  processAttendanceConfirmationTimeouts,
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
  it("formata o WhatsApp legível (DDD + celular) na descrição do evento — Lead.phone salvo SEM o 55", () => {
    // Formato salvo hoje em Lead.phone (ver saveLeadPhone): só DDD + número,
    // sem o código do país — o 55 só entra na hora de ENVIAR (sendWhatsappMessage).
    const description = buildCalendarEventDescription({ leadName: "Mauro Camargo", leadPhone: "21998223038" });

    expect(description).toContain("WhatsApp: (21) 99822-3038");
    expect(description).toContain("Lead: Mauro Camargo");
  });

  it("formata igual pra um telefone legado salvo ANTES desta correção, ainda com o 55 na frente", () => {
    // Retrocompatibilidade: leads capturados enquanto Lead.phone ainda
    // salvava com 55 (antes desta correção) continuam exibindo certo —
    // formatBrazilianPhoneForDisplay reconhece os dois formatos.
    const description = buildCalendarEventDescription({ leadName: "Mauro Camargo", leadPhone: "5521998223038" });

    expect(description).toContain("WhatsApp: (21) 99822-3038");
  });

  it("sem telefone, mostra \"ainda não informado\" em vez de uma linha vazia", () => {
    const description = buildCalendarEventDescription({ leadName: "Mauro Camargo", leadPhone: null });

    expect(description).toContain("WhatsApp: ainda não informado.");
  });
});

// Mudança de comportamento pedida: vídeo do doutor + cafezinho saem
// separados (vídeo primeiro), uma única vez por agendamento, disparados só
// por código (nunca mais a IA escrevendo o texto do cafezinho sozinha).
// Ajuste posterior: esta função NÃO cria mais a Message do cafezinho —
// ela só cria intro+vídeo, e leva o texto do cafezinho já resolvido em
// Message.pendingAttendanceTip (na própria Message do vídeo).
// dispatchDueMessages (dispatch.test.ts) é quem de fato cria a Message do
// cafezinho, só depois de confirmar que o vídeo foi enviado — ver o
// comentário grande em fireAttendanceConfirmationSequence pro motivo
// (a Meta aceita o vídeo rápido mas entrega de forma assíncrona; um
// cafezinho agendado num relógio cego podia chegar antes do vídeo).
//
// Ajuste mais recente: afterScheduledFor não é mais um parâmetro — a função
// busca a referência direto no banco (última Message OUTBOUND ainda PENDING
// da conversa), nunca menor que "agora" (Math.max). Corrige o bug de
// confirmação+apresentação do vídeo saindo coladas (ver comentário grande
// na função).
describe("fireAttendanceConfirmationSequence", () => {
  const CLINIC_OK = { confirmationVideoUrl: "https://cdn/video.mp4", confirmationVideoCaption: null, attendanceTipMessage: null };
  const CONVERSATION_OK = { lead: { phone: "21998223038" } };

  beforeEach(() => {
    vi.clearAllMocks();
    appointmentUpdateManyMock.mockResolvedValue({ count: 1 });
    // Default: nenhuma Message OUTBOUND PENDING na conversa — ancora em
    // "agora" (comportamento quando não há nada pendente, ver testes
    // dedicados mais abaixo).
    messageFindFirstMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resposta da IA pendente com scheduledFor FUTURO: apresentação sai pelo menos 15s depois dela (+15s/+20s sobre o scheduledFor pendente, não sobre 'agora')", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T11:59:30.000Z")); // "agora" ANTES do scheduledFor pendente
    clinicFindUniqueMock.mockResolvedValue(CLINIC_OK);
    conversationFindUniqueMock.mockResolvedValue(CONVERSATION_OK);
    // Última Message OUTBOUND PENDING da conversa (ex.: a própria resposta
    // de confirmação do agendamento deste turno, ainda não despachada).
    messageFindFirstMock.mockResolvedValue({ scheduledFor: new Date("2026-10-07T12:00:00.000Z") });

    const sent = await fireAttendanceConfirmationSequence({
      appointmentId: "appt-1",
      clinicId: "clinic-1",
      conversationId: "conv-1",
    });

    expect(sent).toBe(true);
    expect(messageFindFirstMock).toHaveBeenCalledWith({
      where: { conversationId: "conv-1", direction: "OUTBOUND", status: "PENDING" },
      orderBy: [{ scheduledFor: "desc" }, { id: "desc" }],
      select: { scheduledFor: true },
    });
    expect(messageCreateMock).toHaveBeenCalledTimes(2); // só intro + vídeo — cafezinho não é criado aqui

    const [introCall, videoCall] = messageCreateMock.mock.calls.map((c) => c[0].data);
    expect(introCall).toMatchObject({
      content: "Vou te mandar um vídeo rápido mostrando como é o nosso atendimento 🙂",
      scheduledFor: new Date("2026-10-07T12:00:15.000Z"), // +15s sobre o scheduledFor pendente
    });
    expect(videoCall).toMatchObject({
      mediaUrl: "https://cdn/video.mp4",
      scheduledFor: new Date("2026-10-07T12:00:20.000Z"), // +20s
      pendingAttendanceTip: "Se puder, chegue uns 15 minutinhos antes, teremos um cafezinho te esperando.",
    });
    expect(introCall.scheduledFor.getTime()).toBeLessThan(videoCall.scheduledFor.getTime());
    expect(introCall.scheduledFor.getTime() - new Date("2026-10-07T12:00:00.000Z").getTime()).toBeGreaterThanOrEqual(
      15_000
    );

    expect(appointmentUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "appt-1", confirmationVideoSentAt: null },
      data: { confirmationVideoSentAt: expect.any(Date) },
    });
  });

  it("sem resposta pendente: ancora em 'agora' (comportamento atual, sem nenhuma Message OUTBOUND PENDING na conversa)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T12:00:00.000Z"));
    clinicFindUniqueMock.mockResolvedValue(CLINIC_OK);
    conversationFindUniqueMock.mockResolvedValue(CONVERSATION_OK);
    messageFindFirstMock.mockResolvedValue(null); // nada pendente

    await fireAttendanceConfirmationSequence({
      appointmentId: "appt-1",
      clinicId: "clinic-1",
      conversationId: "conv-1",
    });

    const [introCall, videoCall] = messageCreateMock.mock.calls.map((c) => c[0].data);
    expect(introCall.scheduledFor).toEqual(new Date("2026-10-07T12:00:15.000Z")); // +15s sobre "agora"
    expect(videoCall.scheduledFor).toEqual(new Date("2026-10-07T12:00:20.000Z")); // +20s sobre "agora"
  });

  it("resposta pendente com scheduledFor já no PASSADO (processamento mais lento que o delay adaptativo): ancora em 'agora', nunca num instante já passado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T12:00:00.000Z"));
    clinicFindUniqueMock.mockResolvedValue(CLINIC_OK);
    conversationFindUniqueMock.mockResolvedValue(CONVERSATION_OK);
    // scheduledFor da mensagem pendente já passou (ex.: delay adaptativo de
    // 5s, mas o processamento desta função só rodou 20s depois) — bug real
    // que esta correção evita: ancorar nesse valor já velho faria
    // introAt sair também no passado, caindo perto/dentro do mesmo ciclo de
    // despacho da resposta pendente.
    messageFindFirstMock.mockResolvedValue({ scheduledFor: new Date("2026-10-07T11:59:40.000Z") });

    await fireAttendanceConfirmationSequence({
      appointmentId: "appt-1",
      clinicId: "clinic-1",
      conversationId: "conv-1",
    });

    const [introCall, videoCall] = messageCreateMock.mock.calls.map((c) => c[0].data);
    expect(introCall.scheduledFor).toEqual(new Date("2026-10-07T12:00:15.000Z")); // +15s sobre "agora", não sobre o valor passado
    expect(videoCall.scheduledFor).toEqual(new Date("2026-10-07T12:00:20.000Z"));
  });

  it("usa os textos configurados pela clínica, quando preenchidos", async () => {
    clinicFindUniqueMock.mockResolvedValue({
      ...CLINIC_OK,
      confirmationVideoCaption: "Olha o vídeo da clínica!",
      attendanceTipMessage: "Cafézinho especial esperando por você.",
    });
    conversationFindUniqueMock.mockResolvedValue(CONVERSATION_OK);

    await fireAttendanceConfirmationSequence({
      appointmentId: "appt-1",
      clinicId: "clinic-1",
      conversationId: "conv-1",
    });

    const [introCall, videoCall] = messageCreateMock.mock.calls.map((c) => c[0].data);
    expect(introCall.content).toBe("Olha o vídeo da clínica!");
    expect(videoCall.pendingAttendanceTip).toBe("Cafézinho especial esperando por você.");
  });

  it("clínica sem vídeo configurado: não reivindica nem manda nada (tenta de novo depois)", async () => {
    clinicFindUniqueMock.mockResolvedValue({ ...CLINIC_OK, confirmationVideoUrl: null });
    conversationFindUniqueMock.mockResolvedValue(CONVERSATION_OK);

    const sent = await fireAttendanceConfirmationSequence({
      appointmentId: "appt-1",
      clinicId: "clinic-1",
      conversationId: "conv-1",
    });

    expect(sent).toBe(false);
    expect(appointmentUpdateManyMock).not.toHaveBeenCalled();
    expect(messageCreateMock).not.toHaveBeenCalled();
  });

  it("lead ainda sem WhatsApp: não reivindica nem manda nada (tenta de novo depois)", async () => {
    clinicFindUniqueMock.mockResolvedValue(CLINIC_OK);
    conversationFindUniqueMock.mockResolvedValue({ lead: { phone: null } });

    const sent = await fireAttendanceConfirmationSequence({
      appointmentId: "appt-1",
      clinicId: "clinic-1",
      conversationId: "conv-1",
    });

    expect(sent).toBe(false);
    expect(appointmentUpdateManyMock).not.toHaveBeenCalled();
    expect(messageCreateMock).not.toHaveBeenCalled();
  });

  // Caso explícito pedido: o job de timeout (1h) e a resposta do lead
  // chegando ao mesmo tempo nunca disparam a sequência duas vezes — a
  // reivindicação atômica (updateMany condicional por confirmationVideoSentAt)
  // garante que só uma das duas chamadas concorrentes vence.
  it("segunda chamada concorrente (job + resposta do lead ao mesmo tempo): só a primeira dispara", async () => {
    clinicFindUniqueMock.mockResolvedValue(CLINIC_OK);
    conversationFindUniqueMock.mockResolvedValue(CONVERSATION_OK);
    appointmentUpdateManyMock
      .mockResolvedValueOnce({ count: 1 }) // 1ª chamada reivindica
      .mockResolvedValueOnce({ count: 0 }); // 2ª chamada concorrente: já reivindicado

    const params = { appointmentId: "appt-1", clinicId: "clinic-1", conversationId: "conv-1" };
    const [firstResult, secondResult] = await Promise.all([
      fireAttendanceConfirmationSequence(params),
      fireAttendanceConfirmationSequence(params),
    ]);

    expect([firstResult, secondResult].filter(Boolean)).toHaveLength(1);
    expect(messageCreateMock).toHaveBeenCalledTimes(2); // só uma vez (intro + vídeo), nunca 4
  });
});

// Classificador REMARCA/NAO_REMARCA/DUVIDA (substitui a antiga tool
// confirm_attendance) decidindo o que fazer com a resposta do lead à
// pergunta de presença.
describe("maybeHandlePendingAttendanceReply", () => {
  const CLINIC_OK = { confirmationVideoUrl: "https://cdn/video.mp4", confirmationVideoCaption: null, attendanceTipMessage: null };
  const CONVERSATION_OK = { lead: { phone: "21998223038" } };

  beforeEach(() => {
    vi.clearAllMocks();
    appointmentUpdateManyMock.mockResolvedValue({ count: 1 });
    clinicFindUniqueMock.mockResolvedValue(CLINIC_OK);
    conversationFindUniqueMock.mockResolvedValue(CONVERSATION_OK);
    messageFindFirstMock.mockResolvedValue(null);
  });

  it("lead responde com confirmação (NAO_REMARCA): dispara a sequência — vídeo sai, cafezinho depois", async () => {
    appointmentFindFirstMock.mockResolvedValue({ id: "appt-1" });
    classifyAttendanceReplyMock.mockResolvedValue("NAO_REMARCA");

    await maybeHandlePendingAttendanceReply({
      clinicId: "clinic-1",
      conversationId: "conv-1",
      recentHistory: [
        { role: "assistant", content: "Posso contar com a sua presença?" },
        { role: "user", content: "sim, pode contar comigo!" },
      ],
    });

    // intro + vídeo — cafezinho não é criado aqui (vai em
    // Message.pendingAttendanceTip, na Message do vídeo — dispatchDueMessages
    // é quem cria a Message do cafezinho de verdade, só depois do vídeo SENT).
    expect(messageCreateMock).toHaveBeenCalledTimes(2);
    expect(appointmentUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "appt-1", confirmationVideoSentAt: null },
      data: { confirmationVideoSentAt: expect.any(Date) },
    });
  });

  it('lead pede remarcação (REMARCA): nada sai e o timer (attendancePromptSentAt) é zerado', async () => {
    appointmentFindFirstMock.mockResolvedValue({ id: "appt-1" });
    classifyAttendanceReplyMock.mockResolvedValue("REMARCA");

    await maybeHandlePendingAttendanceReply({
      clinicId: "clinic-1",
      conversationId: "conv-1",
      recentHistory: [{ role: "user", content: "essa hora não posso, remarca pra amanhã 10h" }],
    });

    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(appointmentUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "appt-1", confirmationVideoSentAt: null },
      data: { attendancePromptSentAt: null },
    });
  });

  it("classificador devolve DUVIDA (inclusive por erro de chamada): não envia nada e não cancela — o timer de 1h decide depois", async () => {
    appointmentFindFirstMock.mockResolvedValue({ id: "appt-1" });
    classifyAttendanceReplyMock.mockResolvedValue("DUVIDA");

    await maybeHandlePendingAttendanceReply({
      clinicId: "clinic-1",
      conversationId: "conv-1",
      recentHistory: [{ role: "user", content: "oi, vcs tem estacionamento?" }],
    });

    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(appointmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it("sem pergunta de presença pendente (ex.: sequência já enviada antes — segunda resposta ou \"obrigado\" depois): nem chama o classificador, nunca reenvia", async () => {
    appointmentFindFirstMock.mockResolvedValue(null); // a query real já filtra confirmationVideoSentAt: null

    await maybeHandlePendingAttendanceReply({
      clinicId: "clinic-1",
      conversationId: "conv-1",
      recentHistory: [{ role: "user", content: "obrigado!" }],
    });

    expect(classifyAttendanceReplyMock).not.toHaveBeenCalled();
    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(appointmentUpdateManyMock).not.toHaveBeenCalled();
  });
});

// Job do worker (a cada 3 minutos) — dispara a sequência sozinho quando o
// lead não responde à pergunta de presença em 1h, respeitando a janela de
// envio do follow-up (adia se vencer fora da janela, nunca descarta).
describe("processAttendanceConfirmationTimeouts", () => {
  const CLINIC_OK = { confirmationVideoUrl: "https://cdn/video.mp4", confirmationVideoCaption: null, attendanceTipMessage: null };
  const CONVERSATION_OK = { lead: { phone: "21998223038" } };
  // Segunda-feira 12:00 UTC = 09:00 em Brasília — dentro da janela padrão (08h-18h, seg-sex).
  const NOW_WITHIN_WINDOW = new Date("2026-10-05T12:00:00.000Z");
  // Mesma segunda, mas 04:00 UTC = 01:00 em Brasília — fora da janela.
  const NOW_OUTSIDE_WINDOW = new Date("2026-10-05T04:00:00.000Z");
  const DEFAULT_WINDOW_SETTINGS = { windowDays: [1, 2, 3, 4, 5], windowStartMinute: 8 * 60, windowEndMinute: 18 * 60 };

  beforeEach(() => {
    vi.clearAllMocks();
    appointmentUpdateManyMock.mockResolvedValue({ count: 1 });
    clinicFindUniqueMock.mockResolvedValue(CLINIC_OK);
    conversationFindUniqueMock.mockResolvedValue(CONVERSATION_OK);
    getFollowUpWindowSettingsMock.mockResolvedValue(DEFAULT_WINDOW_SETTINGS);
    messageFindFirstMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sem nenhum agendamento pendente: não dispara nada e nem checa a janela", async () => {
    appointmentFindManyMock.mockResolvedValue([]);

    const result = await processAttendanceConfirmationTimeouts();

    expect(result).toEqual({ fired: 0 });
    expect(getFollowUpWindowSettingsMock).not.toHaveBeenCalled();
    expect(messageCreateMock).not.toHaveBeenCalled();
  });

  it("1h vencida DENTRO da janela de envio: dispara a sequência", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_WITHIN_WINDOW);
    appointmentFindManyMock.mockResolvedValue([{ id: "appt-1", clinicId: "clinic-1", conversationId: "conv-1" }]);

    const result = await processAttendanceConfirmationTimeouts();

    expect(result).toEqual({ fired: 1 });
    expect(messageCreateMock).toHaveBeenCalledTimes(2); // intro + vídeo (cafezinho vem depois, via dispatch.ts)
  });

  it("1h vencida FORA da janela de envio: adia (não dispara nada neste ciclo, mas não descarta)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_OUTSIDE_WINDOW);
    appointmentFindManyMock.mockResolvedValue([{ id: "appt-1", clinicId: "clinic-1", conversationId: "conv-1" }]);

    const result = await processAttendanceConfirmationTimeouts();

    expect(result).toEqual({ fired: 0 });
    expect(messageCreateMock).not.toHaveBeenCalled();
    // O agendamento NÃO foi marcado como enviado — continua elegível no
    // próximo ciclo (3 min depois), até a janela abrir. "Adia, nunca descarta."
    expect(appointmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it("falha num agendamento do lote não impede os outros de serem tentados", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_WITHIN_WINDOW);
    appointmentFindManyMock.mockResolvedValue([
      { id: "appt-bad", clinicId: "clinic-bad", conversationId: "conv-bad" },
      { id: "appt-good", clinicId: "clinic-good", conversationId: "conv-good" },
    ]);
    clinicFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) =>
      where.id === "clinic-bad" ? Promise.reject(new Error("falha de banco simulada")) : Promise.resolve(CLINIC_OK)
    );

    const result = await processAttendanceConfirmationTimeouts();

    expect(result).toEqual({ fired: 1 }); // só o "good" disparou
    expect(messageCreateMock).toHaveBeenCalledTimes(2); // intro + vídeo do "good"
  });
});
