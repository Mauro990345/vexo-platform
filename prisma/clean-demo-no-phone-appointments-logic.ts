// Lógica PURA (sem PrismaClient, sem nenhum efeito colateral) do script
// prisma/clean-demo-no-phone-appointments.ts — separada num arquivo
// próprio só pra poder ser testada isoladamente, mesmo padrão dos cleanups
// anteriores (ver clean-no-photo-demo-data-logic.ts/
// all-failed-messages-cleanup-logic.ts).
export { DEMO_CLINIC_ID, assertDemoClinic } from "../src/lib/demo-clinic";

export type AppointmentPhoneRow = {
  id: string;
  leadId: string | null;
  leadPhone: string | null;
};

// "Agendamento de teste sem telefone" (pedido explícito, limpeza da
// Clínica Demo): tem Lead vinculado (um agendamento importado do Google
// sem Lead é outro caso, já coberto por clean-no-photo-demo-data.ts —
// Grupo B — não duplicado aqui) E esse Lead não tem telefone cadastrado
// (null ou string vazia/só espaço, mesmo critério de isLeadWithoutPhoto em
// clean-no-photo-demo-data-logic.ts).
export function isNoPhoneTestAppointment(appt: AppointmentPhoneRow): boolean {
  return appt.leadId !== null && (!appt.leadPhone || appt.leadPhone.trim() === "");
}

// Candidatos = tem Lead sem telefone E não está na lista de exclusão
// (pedido explícito: nenhum agendamento ligado aos cards FIXOS da
// Reativação — ReactivationShowcaseBackup, alguns deles têm telefone
// removido DE PROPÓSITO pra forçar o canal Instagram na demonstração —
// nem o agendamento criado por seed-reactivation-return-demo.ts, que o
// dono desfaz à parte com o --restore daquele script).
export function selectNoPhoneAppointmentsToClean<T extends AppointmentPhoneRow>(appointments: T[], excludedAppointmentIds: Set<string>): T[] {
  return appointments.filter((a) => isNoPhoneTestAppointment(a) && !excludedAppointmentIds.has(a.id));
}
