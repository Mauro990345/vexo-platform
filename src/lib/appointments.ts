import { prisma } from "@/lib/prisma";

// Marca um agendamento como "compareceu". Diferente de markAppointmentNoShow
// (src/lib/follow-up.ts), não dispara nenhum efeito colateral — o
// atendimento aconteceu, não há follow-up a fazer.
export async function markAppointmentCompleted(appointmentId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || (appt.status !== "SCHEDULED" && appt.status !== "CONFIRMED")) return null;

  return prisma.appointment.update({ where: { id: appointmentId }, data: { status: "COMPLETED" } });
}
