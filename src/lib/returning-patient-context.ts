// Detecta se o lead que acabou de escrever é um PACIENTE QUE JÁ FOI
// ATENDIDO antes (existe um agendamento da IA, não cancelado, não "Não
// compareceu", com horário já passado) e monta o bloco de contextNote que
// avisa isso — pra IA não tratar como primeiro contato nem usar a abertura
// de lead frio (ver interestGateContext, conversation-pipeline.ts) com
// quem já foi atendido. Puro/testável sem Prisma, mesmo padrão de
// result-photo-message.ts/conversation-context.ts: a orquestração (buscar
// os agendamentos do lead, decidir `reengaged`) fica em
// conversation-pipeline.ts, só a decisão em si mora aqui.
//
// Bug real investigado (ver sessão de investigação): a IA respondia a um
// paciente já atendido retomando contato (geralmente depois de uma
// mensagem de acompanhamento mandada manualmente pelo app do Instagram,
// que o VEXO nem chega a salvar — is_echo é descartado, ver
// api/webhooks/instagram/route.ts) como se fosse um lead frio, com uma
// pergunta de abertura de prospecção ("o que te chamou atenção no
// perfil?"). Dois achados concretos: (1) "Compareceu" nunca é um status
// GRAVADO no banco (ver appointmentDisplayStatus, metrics.ts — é só um
// rótulo calculado quando SCHEDULED/CONFIRMED com scheduledAt no
// passado), então "atendido" aqui usa o MESMO critério; e (2) já existe
// um bloco de contexto (interestGateContext) que, de propósito, pede uma
// pergunta de abertura leve quando o lead ainda não demonstrou interesse
// "nesta conversa" — sem diferenciar lead frio de paciente que retorna.
// Este bloco não remove essa cautela (continua certo não empurrar
// agendamento sem interesse), só corrige o EXEMPLO de pergunta pra um que
// faça sentido com quem já foi atendido.
//
// Busca por LEAD, não por conversationId: funciona mesmo quando a
// conversa antiga foi marcada "Perdido" (LOST) — status que
// handleInboundInstagramMessage não reaproveita (ver a busca por
// Conversation.status em conversation-pipeline.ts), então o lead escreve
// de novo numa Conversation NOVA, sem nenhum vínculo com o agendamento
// antigo a não ser o próprio Lead.id.

export type PastAppointmentCandidate = {
  scheduledAt: Date;
  status: string; // AppointmentStatus (string pra não acoplar ao Prisma Client aqui)
};

// Mesmo critério de "atendido" já usado em appointmentDisplayStatus
// (metrics.ts) e selectReactivationCandidates (reactivation.ts): só
// SCHEDULED/CONFIRMED (COMPLETED nunca é gravado de verdade, ver
// setAppointmentAttendance em appointments.ts) com scheduledAt no
// passado. CANCELLED e NO_SHOW nunca contam — um agendamento cancelado
// não é um atendimento de verdade, e "Não compareceu" é o contrário de
// "já foi atendido". Entre vários, usa o MAIS RECENTE.
export function findMostRecentAttendedAppointment<T extends PastAppointmentCandidate>(
  appointments: T[],
  now: Date
): T | null {
  let mostRecent: T | null = null;
  for (const appt of appointments) {
    if (appt.status !== "SCHEDULED" && appt.status !== "CONFIRMED") continue;
    if (appt.scheduledAt.getTime() >= now.getTime()) continue;
    if (!mostRecent || appt.scheduledAt.getTime() > mostRecent.scheduledAt.getTime()) {
      mostRecent = appt;
    }
  }
  return mostRecent;
}

export type ReturningPatientContextInput = {
  // Já o resultado de findMostRecentAttendedAppointment (acima) — null
  // quando o lead nunca teve nenhum agendamento concluído.
  mostRecentAttendedAppointment: { scheduledAt: Date } | null;
  // Reaproveitado de conversation-pipeline.ts (reopeningFromFollowUp ||
  // wentSilent) — sem isso, o bloco apareceria até numa conversa corrida,
  // onde o lead já atendido está só continuando o papo normalmente, sem
  // ter "voltado" de fato; o sinal só faz sentido quando a mensagem chega
  // depois de um intervalo real.
  reengaged: boolean;
};

// Null quando não se aplica (sem atendimento concluído, ou aplicável mas
// a conversa não "voltou" de um intervalo). Nunca afirma que uma mensagem
// de acompanhamento específica foi enviada — ReactivationCardSlot (ver
// reactivation.ts) prova que um card foi EXIBIDO no Painel, nunca que a
// secretária de fato clicou "Enviar" no Instagram/WhatsApp; por isso o
// texto fica no campo da possibilidade ("pode ser resposta a"), nunca
// como fato.
export function buildReturningPatientContext(input: ReturningPatientContextInput): string | null {
  if (!input.mostRecentAttendedAppointment || !input.reengaged) return null;

  const dateLabel = input.mostRecentAttendedAppointment.scheduledAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  return (
    `[Paciente que retorna — este lead JÁ FOI ATENDIDO antes, em ${dateLabel}. O consultório costuma fazer ` +
    `acompanhamento de pacientes já atendidos; esta mensagem dele PODE ser uma resposta a um contato de ` +
    `acompanhamento, mas não há confirmação de que uma mensagem específica foi enviada — nunca afirme isso como ` +
    `fato. NÃO trate como primeiro contato: acolha com carinho, pergunte como ele está e como foi desde o ` +
    `atendimento. Só fale em agendamento ou avaliação se ele demonstrar interesse explícito nisso; se ele pedir ` +
    `um novo horário, siga o fluxo normal de agendamento. Esta instrução tem PRIORIDADE sobre qualquer exemplo de ` +
    `pergunta de abertura de lead frio vindo de outro bloco de contexto (ex.: "o que te chamou atenção no ` +
    `perfil?") — não use esse tipo de pergunta com este lead; a regra de não empurrar agendamento sem interesse ` +
    `continua valendo igual, só o jeito de acolher muda.]`
  );
}
