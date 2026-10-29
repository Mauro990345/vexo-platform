import { prisma } from "@/lib/prisma";
import { triggerFollowUp, cancelPendingFollowUp } from "@/lib/follow-up";

// Botão "Retorno" do card de agendamento atendido (ver RetornoButton.tsx)
// — grava só o NÚMERO de dias (ou "nenhum"), nunca texto livre nem
// qualquer dado clínico (pedido explícito, LGPD — ver
// Appointment.returnPeriodDays/returnPeriodNone, schema.prisma).
// Validação de QUAL número é aceito (RETURN_PERIOD_OPTIONS) fica na server
// action que chama isto (mesmo padrão de "dailyLimit < 1 throws" já usado
// pelas outras configs de Automações) — esta função só decide SE a
// mudança pode acontecer agora.
//
// "Pode trocar enquanto o envio não ocorreu" (pedido explícito) — depois
// que QUALQUER card de Reativação deste agendamento já foi marcado
// enviado (ReactivationCardSlot.sentAt, qualquer prazo), o prazo fica
// travado: trocar depois disso bagunçaria a mensagem já disparada (ela foi
// montada pro prazo de ENTÃO, não existe "reenviar" a mesma mensagem com
// outro prazo). Sem usuários reais ainda — mas a trava já vale desde já,
// pra não depender de lembrar disso quando a Reativação entrar em uso de
// verdade.
export type SetAppointmentReturnPeriodResult =
  | { ok: true; appointmentId: string; returnPeriodDays: number | null; returnPeriodNone: boolean }
  | { ok: false; reason: "not_found" | "already_sent" };

export async function setAppointmentReturnPeriod(
  appointmentId: string,
  selection: number | "none"
): Promise<SetAppointmentReturnPeriodResult> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, reactivationCardSlots: { where: { sentAt: { not: null } }, select: { id: true }, take: 1 } },
  });
  if (!appt) return { ok: false, reason: "not_found" };
  if (appt.reactivationCardSlots.length > 0) return { ok: false, reason: "already_sent" };

  const data = selection === "none" ? { returnPeriodDays: null, returnPeriodNone: true } : { returnPeriodDays: selection, returnPeriodNone: false };

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
