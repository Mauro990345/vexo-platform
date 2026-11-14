"use server";

import { revalidatePath } from "next/cache";
import { requireInternalSession } from "@/lib/session";
import { cancelPendingFollowUp } from "@/lib/follow-up";
import { prisma } from "@/lib/prisma";
import { canResendFailedMessage } from "@/lib/dispatch";

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

// Pedido explícito: depois de reconectar o Instagram (token vencido —
// ver instagram-token-refresh.ts), dar um jeito de reenviar mensagens que
// falharam especificamente por sessão expirada, sem precisar esperar o
// lead escrever de novo. Reaproveita a fila normal (volta pra PENDING,
// scheduledFor=now) — dispatchDueMessages (dispatch.ts) pega e tenta de
// novo no próximo ciclo (até 15s), com todo o resto do pipeline normal
// (claim atômico, retry, FAILED de novo se falhar outra vez) intacto.
// A UI (status/page.tsx) só mostra o botão quando canResendFailedMessage
// já deu true no SERVIDOR, no momento do render — a checagem aqui dentro
// é defensiva (o estado pode ter mudado entre o render e o clique), nunca
// a única linha de defesa.
export async function resendFailedMessageAction(messageId: string, clinicId: string) {
  await requireInternalSession();

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { clinicId: true, lastLeadMessageAt: true } } },
  });

  if (!message || message.conversation.clinicId !== clinicId || message.status !== "FAILED") {
    revalidatePath(`/crm/clinicas/${clinicId}/status`);
    return;
  }

  if (!canResendFailedMessage(message.conversation.lastLeadMessageAt, new Date())) {
    // Janela de 24h da Meta já passou — reenviar não resolve nada (só
    // voltaria a falhar com outro erro da Graph API). Sem reason pra
    // mostrar aqui (é um <form>, não um retorno de valor pra tela) —
    // por isso o botão já não aparece na página quando isto é verdade;
    // chegar aqui mesmo assim só confirma que não há nada a fazer.
    console.warn(`[vexo] Reenvio de message=${messageId} pedido fora da janela de 24h da Meta — ignorado.`);
    revalidatePath(`/crm/clinicas/${clinicId}/status`);
    return;
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { status: "PENDING", scheduledFor: new Date(), failReason: null },
  });
  revalidatePath(`/crm/clinicas/${clinicId}/status`);
}
