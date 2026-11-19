import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireInternalOrReviewerSession } from "@/lib/session";
import { StatusBadge } from "@/components/StatusBadge";
import { AppointmentStatusBadge } from "@/components/AppointmentStatusBadge";
import { normalizeBrazilianWhatsappNumber } from "@/lib/whatsapp";
import { setConversationStatus, sendHumanReply } from "../../clinicas/actions";
import { ConversationMessages } from "@/components/ConversationMessages";

export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({ params }: { params: { id: string } }) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      lead: true,
      clinic: true,
      // Desempate por id — mensagens do mesmo lote do lead (ou do mesmo
      // $transaction de resposta da IA) têm createdAt empatado (ver
      // resolveBatchTimestamps, message-batch-timestamps.ts); sem isso o
      // painel podia exibir duas mensagens do mesmo lote fora da ordem real.
      messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      appointments: { orderBy: { scheduledAt: "desc" }, take: 1 },
    },
  });

  if (!conversation) notFound();

  // Só depois de saber a clínica da conversa dá pra checar se o Revisor
  // pode vê-la (só da clínica dele) — mensagens/lead já foram carregados
  // acima, mas nada disso chega na resposta se notFound() disparar aqui:
  // o Next.js descarta a árvore inteira (layout incluído) e serve o 404
  // padrão, sem vazar nada da conversa de outra clínica.
  const session = await requireInternalOrReviewerSession(conversation.clinicId);
  const isReviewer = session.user.role === "REVIEWER";

  const appointment = conversation.appointments[0];
  // Sidebar já tem um "← Contas" pra voltar pro CRM global (ver
  // contextHeader em conversas/[id]/layout.tsx) — esse aqui é diferente:
  // volta pro Pipeline da clínica de onde essa conversa foi aberta. (Antes
  // ia pra Agenda quando a conversa tinha agendamento — a tela Agenda foi
  // removida do sistema, então agora é sempre Pipeline.)
  const backHref = `/crm/clinicas/${conversation.clinicId}`;
  const backLabel = "Pipeline";

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
      <div className="min-w-0">
        <Link
          href={backHref}
          className="mb-1.5 inline-flex items-center gap-1 text-card text-vexo-muted hover:text-vexo-fg"
        >
          <ChevronLeft className="h-3 w-3 shrink-0" strokeWidth={2} />
          {backLabel}
        </Link>

        <div className="mb-2 flex items-center justify-between gap-2">
          <h1 className="min-w-0 truncate text-sm font-semibold">
            {conversation.lead.name ?? conversation.lead.igUsername ?? "Lead"}
          </h1>
          <StatusBadge status={conversation.status} />
        </div>

        {!isReviewer && conversation.status === "NEEDS_HUMAN" && (
          <div className="mb-2 rounded-block border border-vexo-error/30 bg-vexo-error/10 p-2.5 text-xs text-vexo-error">
            <p className="font-medium">Precisa de atenção humana</p>
            <p className="mt-1 text-vexo-error/80">{conversation.needsHumanReason}</p>
            <form action={setConversationStatus.bind(null, conversation.id, "IN_CONVERSATION")} className="mt-2">
              <button className="rounded-control border border-vexo-error/30 px-2 py-1 text-card hover:bg-vexo-error/10">
                Devolver para a IA
              </button>
            </form>
          </div>
        )}

        <div className="space-y-1.5 rounded-block border border-vexo-border bg-vexo-surface p-2.5">
          <ConversationMessages
            conversationId={conversation.id}
            initialMessages={conversation.messages.map((m) => ({
              id: m.id,
              direction: m.direction,
              sender: m.sender,
              content: m.content,
              mediaUrl: m.mediaUrl,
              status: m.status,
              sentAt: m.sentAt?.toISOString() ?? null,
              createdAt: m.createdAt.toISOString(),
            }))}
          />
        </div>

        {!isReviewer && (
          <form action={sendHumanReply.bind(null, conversation.id)} className="mt-2 flex gap-1.5">
            <input
              name="content"
              placeholder="Responder manualmente (uso da secretária/Mauro)..."
              className="min-w-0 flex-1 rounded-control border border-vexo-border bg-vexo-surface px-2.5 py-1.5 text-card outline-none focus:border-vexo-accent"
            />
            <button className="shrink-0 rounded-control bg-vexo-accent px-3 py-1.5 text-card font-medium text-vexo-accentFg hover:opacity-90">
              Enviar
            </button>
          </form>
        )}
      </div>

      <aside className="space-y-2">
        <div className="rounded-block border border-vexo-border bg-vexo-surface p-2.5 text-xs">
          <h2 className="mb-1.5 text-card font-medium uppercase tracking-wide text-vexo-muted">Lead</h2>
          <p className="break-words">{conversation.lead.name ?? "Sem nome"}</p>
          <p className="break-words text-vexo-muted">@{conversation.lead.igUsername ?? "—"}</p>
          <p className="break-words text-vexo-muted">
            {conversation.lead.phone ?? "WhatsApp não informado"}
          </p>
        </div>

        {appointment && (
          // Somente leitura de propósito: mudar comparecimento (Compareceu/
          // Faltou) ou cancelar é responsabilidade exclusiva da secretária
          // da clínica, feita diretamente com o lead (pelo Painel dela, ou
          // por telefone/presencial) — o Mauro não tem controle equivalente
          // aqui, pra essa responsabilidade nunca recair sobre ele.
          <div className="rounded-block border border-vexo-border bg-vexo-surface p-2.5 text-xs">
            <h2 className="mb-1.5 text-card font-medium uppercase tracking-wide text-vexo-muted">Agendamento</h2>
            <p>
              {appointment.scheduledAt.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                // Sem isso, usa o fuso do servidor (UTC), não o de Brasília.
                timeZone: "America/Sao_Paulo",
              })}
            </p>
            {/* WhatsApp do lead direto no card — sem isso a secretária
                precisava procurar em outro lugar (card "Lead" acima) pra
                conseguir contatar em caso de atraso/imprevisto. Link
                wa.me abre a conversa direto, sem precisar salvar o
                contato antes. */}
            <p className="mt-1 break-words text-vexo-muted">
              {conversation.lead.phone ? (
                <a
                  href={`https://wa.me/${normalizeBrazilianWhatsappNumber(conversation.lead.phone)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-vexo-accent hover:underline"
                >
                  {conversation.lead.phone}
                </a>
              ) : (
                "WhatsApp não informado"
              )}
            </p>
            <div className="mt-2">
              <AppointmentStatusBadge status={appointment.status} />
            </div>
          </div>
        )}

        {!isReviewer && (
          <div>
            <form action={setConversationStatus.bind(null, conversation.id, "LOST")}>
              <button className="w-full rounded-control border border-vexo-accent px-2.5 py-1 text-card text-vexo-accent hover:bg-vexo-accent/10">
                Marcar como perdido
              </button>
            </form>
          </div>
        )}
      </aside>
    </div>
  );
}
