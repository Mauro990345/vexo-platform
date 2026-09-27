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

// Mesma ação acima, chamada da aba "Status" de dentro de uma clínica
// (clinicas/[id]/status/page.tsx) — função própria (em vez de um segundo
// parâmetro opcional na de cima) porque `.bind(null, conversationId)` com
// um parâmetro extra opcional sobrando quebra a checagem de tipo do prop
// `action` de um <form> (TS exige que a função bindada aceite só FormData,
// sem nenhum parâmetro extra restante, nem opcional).
export async function closeStuckFollowUpLogForClinicAction(conversationId: string, clinicId: string) {
  await requireInternalSession();
  await cancelPendingFollowUp(conversationId);
  revalidatePath(`/crm/clinicas/${clinicId}/status`);
}
