"use server";

import { revalidatePath } from "next/cache";
import { requireClientSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { setAppointmentAttendance } from "@/lib/appointments";
import { toggleReactivationCardSent } from "@/lib/reactivation";

// Única ação que o cliente pode fazer no Painel — mesma function de base
// (setAppointmentAttendance, em src/lib/appointments.ts) usada pela versão
// interna equivalente (setAppointmentAttendanceAction, em
// crm/clinicas/actions.ts), só que exposta pra sessão CLIENT em vez de
// INTERNAL_ADMIN/STAFF. Reversível: clicar de novo desfaz (ver
// setAppointmentAttendance). clinicId sempre vem da sessão; confirma que o
// agendamento é mesmo dessa clínica antes de mexer, pra não dar brecha de
// alterar agendamento de outra.
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

  revalidatePath("/dashboard");
}

// Marca/desmarca um card da Reativação como enviado (ver ReactivationRail,
// clique no botão de ação) — mesmo padrão de setAppointmentAttendanceClientAction
// acima: clinicId sempre vem da sessão, confirma que o agendamento (dono
// do slot) é mesmo dessa clínica antes de alternar, pra a clínica nunca
// conseguir marcar o card de outra. toggleReactivationCardSent
// (reactivation.ts) decide o novo valor lendo o banco — nunca confia em
// nenhum booleano vindo do cliente.
export async function toggleReactivationCardSentClientAction(appointmentId: string, thresholdDays: number) {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { clinicId: true },
  });
  if (!appt || appt.clinicId !== clinicId) {
    throw new Error("Agendamento não encontrado.");
  }

  await toggleReactivationCardSent(appointmentId, thresholdDays);

  revalidatePath("/dashboard");
}
