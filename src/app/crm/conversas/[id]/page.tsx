import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";
import { AttendanceToggle } from "@/components/AttendanceToggle";
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
  // Sidebar já tem um "← Contas" pra voltar pro CRM global (ver
  // contextHeader em conversas/[id]/layout.tsx) — esse aqui é diferente:
  // volta pra tela ESPECÍFICA da clínica de onde essa conversa foi aberta
  // (Agenda quando tem agendamento, Pipeline quando não tem).
  const backHref = appointment ? `/crm/clinicas/${conversation.clinicId}/agenda` : `/crm/clinicas/${conversation.clinicId}`;
  const backLabel = appointment ? "Agenda" : "Pipeline";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-xs text-vexo-muted hover:text-vexo-fg"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          {backLabel}
        </Link>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">
            {conversation.lead.name ?? conversation.lead.igUsername ?? "Lead"}
          </h1>
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

        <div className="space-y-3 rounded-2xl border border-vexo-border bg-vexo-surface p-4">
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
        <div className="rounded-2xl border border-vexo-border bg-vexo-surface p-4 text-sm">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-vexo-muted">Lead</h2>
          <p>{conversation.lead.name ?? "Sem nome"}</p>
          <p className="text-vexo-muted">@{conversation.lead.igUsername ?? "—"}</p>
        </div>

        {appointment && (
          <div className="rounded-2xl border border-vexo-border bg-vexo-surface p-4 text-sm">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-vexo-muted">Agendamento</h2>
            <p>
              {appointment.scheduledAt.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <div className="mt-3">
              <AttendanceToggle appointmentId={appointment.id} status={appointment.status} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <form action={setConversationStatus.bind(null, conversation.id, "LOST")}>
            <button className="w-full rounded-lg border border-vexo-accent px-3 py-1.5 text-xs text-vexo-accent hover:bg-vexo-accent/10">
              Marcar como perdido
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
