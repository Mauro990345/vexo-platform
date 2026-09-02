import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";
import { AttendanceToggle } from "@/components/AttendanceToggle";

export const dynamic = "force-dynamic";

const PIPELINE_ORDER = ["NEW", "IN_CONVERSATION", "SCHEDULED", "FOLLOW_UP", "NEEDS_HUMAN", "LOST"] as const;

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
    PIPELINE_ORDER.map((status) => [status, clinic.conversations.filter((c) => c.status === status)])
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-1 text-sm text-vexo-muted">{clinic.name}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {PIPELINE_ORDER.map((status) => (
          <div key={status} className="rounded-xl border border-vexo-border bg-vexo-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <StatusBadge status={status} />
              <span className="text-xs text-vexo-muted">{byStatus[status]?.length ?? 0}</span>
            </div>
            <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-0.5">
              {byStatus[status]?.map((conv) => {
                const appt = conv.appointments[0];
                return (
                  <div key={conv.id} className="overflow-hidden rounded-lg border border-vexo-border bg-vexo-bg p-2 text-xs">
                    <Link href={`/crm/conversas/${conv.id}`} className="block transition hover:text-vexo-accent">
                      <p className="font-medium">{conv.lead.name ?? conv.lead.igUsername ?? "Lead"}</p>
                      <p className="mt-0.5 text-vexo-muted">
                        {conv.lastMessageAt
                          ? new Date(conv.lastMessageAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </p>
                    </Link>

                    {appt && (
                      <div className="mt-2 border-t border-vexo-border pt-2">
                        <p className="mb-1.5 font-medium">
                          {appt.scheduledAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <AttendanceToggle appointmentId={appt.id} status={appt.status} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
