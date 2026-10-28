// Extensão do mecanismo de contextNote já usado por
// returning-patient-context.ts (ver buildReturningPatientContext, que
// continua INTOCADO — já cobre "já foi atendido") pros outros dois tipos
// de card da Reativação do Painel (item 4 do pedido: "quando o lead
// responde a uma mensagem enviada por card, a IA deve tratar como
// resposta a follow-up/Reativação... estenda aos tipos Faltou e Quente").
//
// Mesmo padrão de sempre: puro, testável sem Prisma; gated por `reengaged`
// (reopeningFromFollowUp || wentSilent, calculado em
// conversation-pipeline.ts — MESMO sinal, nenhuma lógica nova de "o lead
// voltou depois de um intervalo"); nunca afirma que uma mensagem
// específica foi enviada (só uma possibilidade, igual
// buildReturningPatientContext) — um card ter aparecido no Painel não
// prova que a secretária clicou, e mesmo clicado não prova entrega.
//
// Os três contextos (já atendido / faltou / nunca agendou) são MUTUAMENTE
// EXCLUSIVOS por construção — cada lead cai em exatamente um deles
// (decidido em conversation-pipeline.ts pelo status do agendamento mais
// recente, reaproveitando a MESMA consulta já feita ali pra
// returningPatientContext, sem query nova).

export type AppointmentStatusForContext = { scheduledAt: Date; status: string };

// Mais recente NO_SHOW — mesmo critério de "mais recente" usado em
// findMostRecentAttendedAppointment (returning-patient-context.ts) e em
// selectReactivationCandidates (reactivation.ts), só filtrando por status
// diferente.
export function findMostRecentNoShowAppointment<T extends AppointmentStatusForContext>(appointments: T[]): T | null {
  let mostRecent: T | null = null;
  for (const appt of appointments) {
    if (appt.status !== "NO_SHOW") continue;
    if (!mostRecent || appt.scheduledAt.getTime() > mostRecent.scheduledAt.getTime()) {
      mostRecent = appt;
    }
  }
  return mostRecent;
}

export type NoShowReplyContextInput = {
  mostRecentNoShowAppointment: { scheduledAt: Date } | null;
  reengaged: boolean;
};

export function buildNoShowReplyContext(input: NoShowReplyContextInput): string | null {
  if (!input.mostRecentNoShowAppointment || !input.reengaged) return null;

  const dateLabel = input.mostRecentNoShowAppointment.scheduledAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  return (
    `[Lead que faltou — este lead tinha uma avaliação marcada para ${dateLabel} e não compareceu. O consultório ` +
    `costuma reengajar quem falta; esta mensagem dele PODE ser uma resposta a esse contato, mas não há confirmação ` +
    `de que uma mensagem específica foi enviada — nunca afirme isso como fato. NÃO trate como primeiro contato: ` +
    `acolha normalmente, sem cobrar a falta, e se ele quiser, ajude a remarcar um novo horário. Esta instrução tem ` +
    `PRIORIDADE sobre qualquer exemplo de pergunta de abertura de lead frio vindo de outro bloco de contexto (ex.: ` +
    `"o que te chamou atenção no perfil?") — não use esse tipo de pergunta com este lead.]`
  );
}

export type ColdLeadReengagementContextInput = {
  // true se o lead JÁ TEVE qualquer agendamento, de qualquer status
  // (inclusive cancelado) — "nunca agendou" é condição estrita.
  everHadAnyAppointment: boolean;
  reengaged: boolean;
};

export function buildColdLeadReengagementContext(input: ColdLeadReengagementContextInput): string | null {
  if (input.everHadAnyAppointment || !input.reengaged) return null;

  return (
    `[Lead que retoma contato depois de ficar parado, sem nunca ter agendado — esta mensagem dele PODE ser uma ` +
    `resposta a um contato de reengajamento do consultório, mas não há confirmação de que uma mensagem específica ` +
    `foi enviada — nunca afirme isso como fato. NÃO trate como primeiro contato nem repita a abertura de ` +
    `prospecção do zero (ex.: "o que te chamou atenção no perfil?") — continue de onde a conversa tinha ficado, com ` +
    `acolhimento, e retome o interesse dele com naturalidade. Esta instrução tem PRIORIDADE sobre qualquer exemplo ` +
    `de pergunta de abertura de lead frio vindo de outro bloco de contexto.]`
  );
}
