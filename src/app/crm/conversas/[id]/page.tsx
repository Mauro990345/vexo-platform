import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";
import { setConversationStatus, sendHumanReply } from "../../clinicas/actions";

export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({ params }: { params: { id: string } }) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      lead: true,
      clinic: true,
      messages: { orderBy: { createdAt: "asc" } },
      appointments: { orderBy: { scheduledAt: "desc" }, take: 1 },
    },
  });

  if (!conversation) notFound();

  const appointment = conversation.appointments[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Link href={`/crm/clinicas/${conversation.clinicId}`} className="text-xs text-vexo-muted hover:text-vexo-fg">
              ← {conversation.clinic.name}
            </Link>
            <h1 className="mt-1 text-lg font-semibold">
              {conversation.lead.name ?? conversation.lead.igUsername ?? "Lead"}
            </h1>
          </div>
          <StatusBadge status={conversation.status} />
        </div>

        {conversation.status === "NEEDS_HUMAN" && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            <p className="font-medium">Precisa de atenção humana</p>
            <p className="mt-1 text-red-300/80">{conversation.needsHumanReason}</p>
            <form action={setConversationStatus.bind(null, conversation.id, "IN_CONVERSATION")} className="mt-2">
              <button className="rounded-lg border border-red-500/30 px-3 py-1 text-xs hover:bg-red-500/10">
                Devolver para a IA
              </button>
            </form>
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-vexo-border bg-vexo-surface p-4">
          {conversation.messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === "INBOUND" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.direction === "INBOUND"
                    ? "bg-vexo-bg text-vexo-fg"
                    : m.sender === "HUMAN"
                      ? "bg-amber-500/20 text-vexo-fg"
                      : "bg-vexo-accent text-white"
                }`}
              >
                {m.mediaUrl ? (
                  <p className="italic opacity-80">{m.content}</p>
                ) : (
                  <p>{m.content}</p>
                )}
                <p className="mt-1 text-[10px] opacity-60">
                  {m.sender === "AI" ? "IA" : m.sender === "HUMAN" ? "Humano" : m.sender === "SYSTEM" ? "Sistema" : "Lead"} ·{" "}
                  {(m.sentAt ?? m.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {m.status === "PENDING" ? " · agendada" : m.status === "FAILED" ? " · falhou" : ""}
                </p>
              </div>
            </div>
          ))}
          {conversation.messages.length === 0 && (
            <p className="text-sm text-vexo-muted">Nenhuma mensagem ainda.</p>
          )}
        </div>

        <form action={sendHumanReply.bind(null, conversation.id)} className="mt-3 flex gap-2">
          <input
            name="content"
            placeholder="Responder manualmente (uso da secretária/Mauro)..."
            className="flex-1 rounded-lg border border-vexo-border bg-vexo-surface px-3 py-2 text-sm outline-none focus:border-vexo-accent"
          />
          <button className="rounded-lg bg-vexo-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Enviar
          </button>
        </form>
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-vexo-border bg-vexo-surface p-4 text-sm">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-vexo-muted">Lead</h2>
          <p>{conversation.lead.name ?? "Sem nome"}</p>
          <p className="text-vexo-muted">@{conversation.lead.igUsername ?? "—"}</p>
        </div>

        {appointment && (
          <div className="rounded-xl border border-vexo-border bg-vexo-surface p-4 text-sm">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-vexo-muted">Agendamento</h2>
            <p>
              {appointment.scheduledAt.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="mt-1 text-vexo-muted">{appointment.status}</p>
          </div>
        )}

        <div className="space-y-2">
          <form action={setConversationStatus.bind(null, conversation.id, "LOST")}>
            <button className="w-full rounded-lg border border-vexo-border px-3 py-1.5 text-xs text-vexo-muted hover:border-vexo-accent hover:text-vexo-fg">
              Marcar como perdido
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
