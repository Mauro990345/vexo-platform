"use server";

import { revalidatePath } from "next/cache";
import { requireInternalSession } from "@/lib/session";
import { cancelPendingFollowUp } from "@/lib/follow-up";

// Escape hatch pro bug real de FollowUpLog órfão (ver setConversationStatus,
// crm/clinicas/actions.ts, e a seção "FollowUpLogs abertos" logo abaixo,
// dispatch-status/page.tsx): antes da correção, uma troca manual de status
// da conversa (Devolver para a IA / Marcar como perdido) enquanto um
// follow-up estava ativo deixava o log aberto pra sempre, sem nenhum jeito
// de fechar isso pela interface — só direto no banco. Essa ação fecha
// qualquer log aberto (cancelPendingFollowUp já cobre isso, sem mexer no
// status da conversa em si) pra desbloquear follow-ups futuros dessa
// conversa, sem precisar de acesso ao banco.
export async function closeStuckFollowUpLogAction(conversationId: string) {
  await requireInternalSession();
  await cancelPendingFollowUp(conversationId);
  revalidatePath("/crm/dispatch-status");
}
