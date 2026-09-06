import { prisma } from "@/lib/prisma";
import { triggerFollowUp, cancelPendingFollowUp } from "@/lib/follow-up";

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
    // triggeredAt = scheduledAt (não o momento do clique) — a sequência
    // conta a partir do horário agendado, ver comentário em triggerFollowUp.
    await triggerFollowUp(appt.conversationId, "NO_SHOW", conversation.status, appt.scheduledAt);
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
