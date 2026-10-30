import { prisma } from "@/lib/prisma";
import { triggerFollowUp, cancelPendingFollowUp } from "@/lib/follow-up";
import { appointmentDisplayStatus, startOfDay, addDays } from "@/lib/metrics";

// Pedido explícito: um agendamento "Compareceu" (displayStatus COMPLETED —
// ver appointmentDisplayStatus, metrics.ts) só fica visível na lista de
// Agendamentos do Painel por ATTENDED_VISIBLE_DAYS dias CIVIS
// (America/Sao_Paulo, mesmo fuso de todo o resto do app — ver startOfDay)
// depois do atendimento; passado isso, sai da lista — os dados e o
// histórico continuam no banco e entrando nas métricas normalmente
// (getClinicMetrics/getAttendanceMetrics, metrics.ts, nunca dependeram
// desta lista nem mudam aqui). Futuros, "Não compareceu" e os demais
// status seguem a regra de sempre (sempre visíveis, sem prazo) — só
// COMPLETED tem validade. Não depende do filtro "Período" da tela: essa
// lista já era independente dele antes desta mudança (só os cards de
// métrica usam `from`/`to`, ver ClientPanelView.tsx) e continua sendo.
// Constante NOMEADA (não um número solto) — pedido explícito: "vamos
// ajustar depois do teste".
export const ATTENDED_VISIBLE_DAYS = 3;

// "3 dias depois" é um prazo INCLUSIVO em dias civis: visível no dia do
// atendimento e nos ATTENDED_VISIBLE_DAYS dias seguintes (dia 3 ainda
// visível), sai a partir do dia seguinte a esse (dia 4 já não aparece) —
// mesma semântica de janela em dias corridos já usada em
// computeCalendarDayWindow/computeReturnContactWindow (reactivation.ts).
export function isAppointmentVisibleInList(appt: { status: string; scheduledAt: Date }, now: Date): boolean {
  if (appointmentDisplayStatus(appt, now) !== "COMPLETED") return true;
  const visibleUntil = startOfDay(addDays(appt.scheduledAt, ATTENDED_VISIBLE_DAYS));
  return startOfDay(now).getTime() <= visibleUntil.getTime();
}

// Botão "Retorno" do card de agendamento atendido (ver RetornoButton.tsx)
// — grava só o NÚMERO de dias, nunca texto livre nem qualquer dado
// clínico (pedido explícito, LGPD — ver Appointment.returnPeriodDays,
// schema.prisma). Validação de QUAL número é aceito (RETURN_PERIOD_OPTIONS)
// fica na server action que chama isto (mesmo padrão de "dailyLimit < 1
// throws" já usado pelas outras configs de Automações) — esta função só
// decide SE a mudança pode acontecer agora.
//
// "Pode trocar enquanto o envio não ocorreu" (pedido explícito) — depois
// que QUALQUER card de Reativação deste agendamento já foi marcado
// enviado (ReactivationCardSlot.sentAt, qualquer prazo), o prazo fica
// travado: trocar depois disso bagunçaria a mensagem já disparada (ela foi
// montada pro prazo de ENTÃO, não existe "reenviar" a mesma mensagem com
// outro prazo). Sem usuários reais ainda — mas a trava já vale desde já,
// pra não depender de lembrar disso quando a Reativação entrar em uso de
// verdade.
//
// "unset" (pedido explícito) — volta pro estado INICIAL (returnPeriodDays
// null: nenhuma escolha manual, usa os prazos PADRÃO da clínica). Usado
// quando a secretária clica de novo num prazo já selecionado (alternância:
// clicar "30d" quando 30d já está marcado desmarca, não troca pra outro).
// AJUSTE (pedido explícito — removida a opção "Sem retorno" do botão
// Retorno/RetornoButton.tsx): a seleção "none" (returnPeriodNone=true,
// "sem retorno" EXPLÍCITO — diferente de "unset", nenhuma escolha) deixou
// de existir — desmarcar todos os prazos agora só tem UM resultado
// possível, "unset", que já significava "usa os prazos padrão da
// clínica" (exatamente o novo comportamento pedido: "se todos os prazos
// forem desmarcados... vale o prazo padrão da clínica"). O campo
// Appointment.returnPeriodNone continua no schema (sem migration) por
// causa de linhas antigas já marcadas antes desta mudança — essas linhas
// passam a se comportar como "nada marcado" também (ver
// resolveAppointmentReturnPeriods, reactivation.ts), nunca mais escritas
// por aqui.
//
// Cancelamento dos cards de Reativação futuros do prazo abandonado: não
// precisa de nenhuma escrita extra aqui — ReactivationCardSlot (ver
// getReactivationCards, reactivation.ts) já é montado de forma LAZY, a
// partir do returnPeriodDays ATUAL do Appointment a cada chamada; assim
// que esse campo muda (branch abaixo), a próxima vez que a lista de
// Reativação for montada, o prazo antigo simplesmente não gera mais
// candidato nenhum (buildReactivationCardCandidates lê o valor atual, não
// o de quando o slot foi criado) — o card do prazo abandonado para de
// aparecer sozinho, sem precisar apagar/marcar a linha antiga de
// ReactivationCardSlot (mesma filosofia já documentada em
// no-show-cards.ts: ler estado vivo em vez de escrever um flag de
// "cancelado"). Um slot que JÁ foi enviado (sentAt preenchido) nunca é
// tocado por isso — ele só existe pra esse prazo específico, que já está
// travado (ver reactivationCardSlots.length > 0 abaixo) antes de chegar
// aqui, então o histórico do envio já feito permanece intacto.
export type SetAppointmentReturnPeriodResult =
  | { ok: true; appointmentId: string; returnPeriodDays: number | null; returnPeriodNone: boolean }
  | { ok: false; reason: "not_found" | "already_sent" };

export async function setAppointmentReturnPeriod(
  appointmentId: string,
  selection: number | "unset"
): Promise<SetAppointmentReturnPeriodResult> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, reactivationCardSlots: { where: { sentAt: { not: null } }, select: { id: true }, take: 1 } },
  });
  if (!appt) return { ok: false, reason: "not_found" };
  if (appt.reactivationCardSlots.length > 0) return { ok: false, reason: "already_sent" };

  const data = selection === "unset" ? { returnPeriodDays: null, returnPeriodNone: false } : { returnPeriodDays: selection, returnPeriodNone: false };

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data,
    select: { id: true, returnPeriodDays: true, returnPeriodNone: true },
  });
  return { ok: true, appointmentId: updated.id, returnPeriodDays: updated.returnPeriodDays, returnPeriodNone: updated.returnPeriodNone };
}

// Chave reversível de comparecimento — não é um botão de ação única. A
// secretária pode alternar entre Compareceu / Não compareceu / (voltar a
// indefinido) a qualquer momento, inclusive depois de já ter marcado algo
// (ex: paciente ligou avisando que vai atrasar). Clicar na opção já ativa
// desmarca (volta pra SCHEDULED); clicar na outra troca direto, sem passar
// por um estado intermediário.
//
// Sair de NO_SHOW (pra qualquer lado) cancela os passos da sequência
// NO_SHOW que ainda não saíram — ver cancelPendingFollowUp.
export async function setAppointmentAttendance(
  appointmentId: string,
  requestedStatus: "COMPLETED" | "NO_SHOW"
) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) return null;

  const targetStatus = appt.status === requestedStatus ? "SCHEDULED" : requestedStatus;

  // Agendamento sem Lead vinculado (importado do Google Calendar sem
  // conversa no Instagram, paciente conhecido agendado manualmente) — não
  // existe Pipeline nem follow-up pra mexer, só alterna o status do
  // Appointment mesmo (inclusive o desfazer: clicar de novo já volta pra
  // SCHEDULED pelo cálculo de targetStatus acima).
  if (!appt.conversationId) {
    return prisma.appointment.update({ where: { id: appointmentId }, data: { status: targetStatus } });
  }

  if (targetStatus === "NO_SHOW" && appt.status !== "NO_SHOW") {
    // Entrando em não-comparecimento: guarda em que coluna do Pipeline a
    // conversa estava (não assume nenhuma fixa) antes de mover pra
    // Follow-up, pra dar pra desfazer depois voltando exatamente pra lá.
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: appt.conversationId } });
    await triggerFollowUp(appt.conversationId, "NO_SHOW", conversation.status);
  } else if (appt.status === "NO_SHOW" && targetStatus !== "NO_SHOW") {
    // Desfazendo: cancela a sequência de não-comparecimento em andamento e
    // devolve a conversa pra coluna de onde ela tinha saído (previousStatus),
    // não uma coluna fixa. Só mexe se ainda estiver em FOLLOW_UP — se o
    // lead já respondeu e reabriu a conversa por conta própria, isso já foi
    // tratado em conversation-pipeline.ts e não deve ser sobrescrito aqui.
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: appt.conversationId } });
    if (conversation.status === "FOLLOW_UP") {
      await cancelPendingFollowUp(appt.conversationId, new Date(), conversation.previousStatus ?? "SCHEDULED");
      await prisma.conversation.update({ where: { id: appt.conversationId }, data: { previousStatus: null } });
    }
  }

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: targetStatus },
  });
}
