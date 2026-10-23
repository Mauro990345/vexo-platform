// Lógica PURA (sem PrismaClient, sem nenhum efeito colateral) do script
// prisma/clean-no-photo-demo-data.ts — separada num arquivo próprio só pra
// poder ser testada isoladamente, mesmo padrão dos cleanups anteriores
// (ver all-failed-messages-cleanup-logic.ts).

// Clínica ÚNICA em que este script pode operar — recusa qualquer outro id,
// na hora, antes de ler ou apagar qualquer linha (pedido explícito: restrito
// à Clínica Demo VEXO).
export const DEMO_CLINIC_ID = "cmthv55880000qrhxwstrvglp";

export function assertDemoClinic(clinicId: string): void {
  if (clinicId !== DEMO_CLINIC_ID) {
    throw new Error(
      `Este script só opera na Clínica Demo VEXO (id "${DEMO_CLINIC_ID}") — recebido "${clinicId}". Abortado por segurança, nada foi lido nem apagado.`
    );
  }
}

export type LeadPhotoRow = { profilePictureUrl: string | null };

// "Sem foto" cobre null E string vazia/só espaço — na prática o campo só é
// null ou uma URL real (nunca uma string vazia escrita por nenhum caminho
// do código), mas cobrir os dois casos não custa nada e evita um lead com
// profilePictureUrl="" escapar da varredura por acidente.
export function isLeadWithoutPhoto(lead: LeadPhotoRow): boolean {
  return !lead.profilePictureUrl || lead.profilePictureUrl.trim() === "";
}

export function selectLeadsWithoutPhoto<T extends LeadPhotoRow>(leads: T[]): T[] {
  return leads.filter(isLeadWithoutPhoto);
}

export type AppointmentLeadRow = { leadId: string | null };

export function isAppointmentWithoutLead(appt: AppointmentLeadRow): boolean {
  return appt.leadId === null;
}

export function selectAppointmentsWithoutLead<T extends AppointmentLeadRow>(appointments: T[]): T[] {
  return appointments.filter(isAppointmentWithoutLead);
}

// Grupo B (agendamentos sem lead) só é apagado com as DUAS flags juntas —
// nunca por padrão, nunca só com --apply, nunca só com --include-no-lead
// sozinha (pedido explícito: "sem essa flag o Grupo B NUNCA é tocado").
export function shouldDeleteGroupB(apply: boolean, includeNoLead: boolean): boolean {
  return apply && includeNoLead;
}

const RECENT_CONVERSATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type LeadCascadeConversationInput = {
  lastMessageAt: Date | null;
  messageCount: number;
  followUpCount: number;
};

export type LeadCascadeInput = {
  id: string;
  igUsername: string | null;
  igScopedId: string;
  conversations: LeadCascadeConversationInput[];
  appointments: { scheduledAt: Date }[];
};

export type LeadCascadePreview = {
  leadId: string;
  igUsername: string | null;
  igScopedId: string;
  conversationCount: number;
  messageCount: number;
  followUpCount: number;
  appointmentCount: number;
  // "Pra eu conferir" (pedido explícito) — avisos, não vetos: um lead
  // marcado aqui ainda É apagado normalmente num --apply, só fica
  // destacado no relatório pra revisão manual antes de rodar.
  hasRecentConversation: boolean;
  hasFutureAppointment: boolean;
};

export function buildLeadCascadePreview(lead: LeadCascadeInput, now: Date): LeadCascadePreview {
  const messageCount = lead.conversations.reduce((sum, c) => sum + c.messageCount, 0);
  const followUpCount = lead.conversations.reduce((sum, c) => sum + c.followUpCount, 0);
  const hasRecentConversation = lead.conversations.some(
    (c) => c.lastMessageAt != null && now.getTime() - c.lastMessageAt.getTime() <= RECENT_CONVERSATION_WINDOW_MS
  );
  const hasFutureAppointment = lead.appointments.some((a) => a.scheduledAt.getTime() > now.getTime());

  return {
    leadId: lead.id,
    igUsername: lead.igUsername,
    igScopedId: lead.igScopedId,
    conversationCount: lead.conversations.length,
    messageCount,
    followUpCount,
    appointmentCount: lead.appointments.length,
    hasRecentConversation,
    hasFutureAppointment,
  };
}

// "AAAA-MM-DD a AAAA-MM-DD" a partir da menor/maior data da lista — "—"
// pra lista vazia (mesmo formato usado no relatório anterior, reactivation-preview.ts).
export function dateRangeLabel(dates: Date[]): string {
  if (dates.length === 0) return "—";
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(sorted[0]!)} a ${fmt(sorted[sorted.length - 1]!)}`;
}
