// Id fixo da Clínica Demo VEXO — usado por scripts de demonstração
// (prisma/) E, desde o pedido explícito de cards "fixos" na Reativação
// (ver src/lib/reactivation.ts, getReactivationCards), por código de
// runtime também. Vivia só em prisma/clean-no-photo-demo-data-logic.ts
// (que agora reexporta daqui — nenhum script existente precisou mudar o
// import) — movido pra src/lib porque reactivation.ts (runtime, nunca
// importa de prisma/) também precisa dele.
export const DEMO_CLINIC_ID = "cmthv55880000qrhxwstrvglp";

export function assertDemoClinic(clinicId: string): void {
  if (clinicId !== DEMO_CLINIC_ID) {
    throw new Error(
      `Este script só opera na Clínica Demo VEXO (id "${DEMO_CLINIC_ID}") — recebido "${clinicId}". Abortado por segurança, nada foi lido nem apagado.`
    );
  }
}
