"use server";

import { revalidatePath } from "next/cache";
import { requireClientSession } from "@/lib/session";
import { disconnectWhatsapp } from "@/lib/whatsapp-connection";
import { prisma } from "@/lib/prisma";
import { setAppointmentAttendance } from "@/lib/appointments";

// A clínica só gerencia a própria conexão de WhatsApp — clinicId sempre vem
// da sessão, nunca de input do formulário, pra não dar brecha de desconectar
// o WhatsApp de outra clínica.
export async function disconnectWhatsappClientAction() {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  await disconnectWhatsapp(clinicId);

  revalidatePath("/dashboard/whatsapp");
  revalidatePath("/dashboard");
}

// Única ação que o cliente pode fazer no Painel — mesma function por trás
// do botão da Agenda interna (src/lib/appointments.ts), só que exposta pra
// sessão CLIENT em vez de INTERNAL_ADMIN/STAFF. Reversível: clicar de novo
// desfaz (ver setAppointmentAttendance). clinicId sempre vem da sessão;
// confirma que o agendamento é mesmo dessa clínica antes de mexer, pra não
// dar brecha de alterar agendamento de outra.
export async function setAppointmentAttendanceClientAction(
  appointmentId: string,
  status: "COMPLETED" | "NO_SHOW"
) {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { clinicId: true },
  });
  if (!appt || appt.clinicId !== clinicId) {
    throw new Error("Agendamento não encontrado.");
  }

  await setAppointmentAttendance(appointmentId, status);

  revalidatePath("/dashboard/agendamentos");
  revalidatePath("/dashboard");
}
