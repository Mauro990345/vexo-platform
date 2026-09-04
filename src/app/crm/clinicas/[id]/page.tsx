import Link from "next/link";
import { notFound } from "next/navigation";
import { AtSign } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AttendanceToggle } from "@/components/AttendanceToggle";

export const dynamic = "force-dynamic";

// Mesma paleta semântica já usada em StatusBadge/AppointmentStatusBadge —
// só reaproveitada aqui pro ponto colorido do cabeçalho de cada coluna
// (Novo contato e Em conversa dividem a cor "info" de propósito, é a mesma
// distinção que já existe no resto do sistema, não uma cor nova).
const PIPELINE_COLUMNS = [
  { status: "NEW", label: "Novo contato", dot: "bg-vexo-accent" },
  { status: "IN_CONVERSATION", label: "Em conversa", dot: "bg-vexo-accent" },
  { status: "SCHEDULED", label: "Agendado", dot: "bg-vexo-success" },
  { status: "FOLLOW_UP", label: "Follow-up", dot: "bg-vexo-warning" },
  { status: "NEEDS_HUMAN", label: "Precisa de humano", dot: "bg-vexo-error" },
  { status: "LOST", label: "Perdido", dot: "bg-vexo-muted" },
] as const;

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function ClinicPipelinePage({ params }: { params: { id: string } }) {
  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: {
      conversations: {
        include: {
          lead: true,
          appointments: { orderBy: { scheduledAt: "desc" }, take: 1 },
        },
        orderBy: { lastMessageAt: "desc" },
      },
    },
  });

  if (!clinic) notFound();

  const byStatus = Object.fromEntries(
    PIPELINE_COLUMNS.map((col) => [col.status, clinic.conversations.filter((c) => c.status === col.status)])
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-1 text-sm text-vexo-muted">{clinic.name}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {PIPELINE_COLUMNS.map((col) => {
          const items = byStatus[col.status] ?? [];
          return (
            <div key={col.status} className="rounded-xl border border-vexo-border bg-vexo-surface p-3">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} />
                  <h2 className="truncate text-xs font-semibold">{col.label}</h2>
                </div>
                <span className="shrink-0 rounded-full bg-vexo-surface2 px-1.5 py-0.5 text-caption font-medium text-vexo-muted">
                  {items.length}
                </span>
              </div>

              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-0.5">
                {items.map((conv) => {
                  const appt = conv.appointments[0];
                  const compact = col.status === "SCHEDULED" && Boolean(appt);

                  return (
                    <div
                      key={conv.id}
                      className={`overflow-hidden rounded-lg border border-vexo-border bg-vexo-bg ${compact ? "p-2" : "p-2.5"}`}
                    >
                      <Link href={`/crm/conversas/${conv.id}`} className="block transition hover:text-vexo-accent">
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="truncate text-xs font-semibold">
                            {conv.lead.name ?? conv.lead.igUsername ?? "Lead"}
                          </p>
                          <AtSign className="h-3 w-3 shrink-0 text-vexo-muted" strokeWidth={2} />
                        </div>
                        <p className={`text-caption text-vexo-muted ${compact ? "mt-0.5" : "mt-1"}`}>
                          {conv.lastMessageAt ? formatDateTime(conv.lastMessageAt) : "—"}
                        </p>
                      </Link>

                      {appt && (
                        <div className={compact ? "mt-1.5" : "mt-2 border-t border-vexo-border pt-2"}>
                          <p className={`text-caption font-medium text-vexo-fg ${compact ? "mb-1" : "mb-1.5"}`}>
                            {formatDateTime(appt.scheduledAt)}
                          </p>
                          <AttendanceToggle appointmentId={appt.id} status={appt.status} />
                        </div>
                      )}
                    </div>
                  );
                })}

                {items.length === 0 && (
                  <p className="py-2 text-center text-caption text-vexo-muted">Nenhum lead aqui.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
