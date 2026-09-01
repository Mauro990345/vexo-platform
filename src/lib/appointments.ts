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

  if (appt.status === "NO_SHOW" && targetStatus !== "NO_SHOW") {
    await cancelPendingFollowUp(appt.conversationId);
    // Só devolve a conversa pra SCHEDULED se ela ainda estiver em FOLLOW_UP —
    // se o lead já respondeu e reabriu a conversa por conta própria, isso já
    // foi tratado em conversation-pipeline.ts e não deve ser sobrescrito aqui.
    await prisma.conversation.updateMany({
      where: { id: appt.conversationId, status: "FOLLOW_UP" },
      data: { status: "SCHEDULED" },
    });
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: targetStatus },
  });

  if (targetStatus === "NO_SHOW" && appt.status !== "NO_SHOW") {
    await triggerFollowUp(appt.conversationId, "NO_SHOW");
  }

  return updated;
}
