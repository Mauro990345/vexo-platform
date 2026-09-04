import Link from "next/link";
import { notFound } from "next/navigation";
import { AtSign, MoreHorizontal } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ResponseRateRing } from "@/components/ResponseRateRing";
import { startOfDay, addDays } from "@/lib/metrics";

export const dynamic = "force-dynamic";

// Faixas da cor do anel de comparecimento — decisão de exibição, não de
// dado (o número em si vem sempre certo do banco). Ajustável se a clínica
// achar essas faixas erradas pra realidade dela.
function attendanceRingColor(rate: number | null): "success" | "warning" | "error" {
  if (rate === null || rate >= 0.75) return "success";
  if (rate >= 0.5) return "warning";
  return "error";
}

const PIPELINE_COLUMNS = [
  { status: "NEW", label: "Novo contato" },
  { status: "IN_CONVERSATION", label: "Em conversa" },
  { status: "SCHEDULED", label: "Agendado" },
  { status: "FOLLOW_UP", label: "Follow-up" },
  { status: "NEEDS_HUMAN", label: "Precisa de humano" },
  { status: "LOST", label: "Perdido" },
] as const;

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function ClinicPipelinePage({ params }: { params: { id: string } }) {
  const clinicId = params.id;
  const todayStart = startOfDay(new Date());
  const periodStart = addDays(todayStart, -6);
  const periodEnd = addDays(todayStart, 1);

  const [clinic, newContacts, responded, scheduled, completed, noShow] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      include: {
        conversations: {
          include: {
            lead: true,
            appointments: { orderBy: { scheduledAt: "desc" }, take: 1 },
          },
          orderBy: { lastMessageAt: "desc" },
        },
      },
    }),
    prisma.conversation.count({
      where: { clinicId, createdAt: { gte: periodStart, lt: periodEnd } },
    }),
    prisma.conversation.count({
      where: { clinicId, createdAt: { gte: periodStart, lt: periodEnd }, status: { not: "NEW" } },
    }),
    prisma.appointment.count({
      where: { clinicId, createdAt: { gte: periodStart, lt: periodEnd } },
    }),
    prisma.appointment.count({
      where: { clinicId, scheduledAt: { gte: periodStart, lt: periodEnd }, status: "COMPLETED" },
    }),
    prisma.appointment.count({
      where: { clinicId, scheduledAt: { gte: periodStart, lt: periodEnd }, status: "NO_SHOW" },
    }),
  ]);

  if (!clinic) notFound();

  const responseRate = newContacts > 0 ? responded / newContacts : null;
  const attendanceRate = completed + noShow > 0 ? completed / (completed + noShow) : null;

  const byStatus = Object.fromEntries(
    PIPELINE_COLUMNS.map((col) => [col.status, clinic.conversations.filter((c) => c.status === col.status)])
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-1 text-sm text-vexo-muted">{clinic.name}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-vexo-border bg-vexo-surface2 p-2.5">
          <p className="truncate text-card font-medium text-vexo-muted">Novos contatos</p>
          <p className="mt-1 text-xl font-semibold leading-none tracking-tight">{newContacts}</p>
          <p className="mt-1 text-card text-vexo-muted">Últimos 7 dias</p>
        </div>
        <div className="rounded-lg border border-vexo-border bg-vexo-surface2 p-2.5">
          <p className="truncate text-card font-medium text-vexo-muted">Taxa de resposta</p>
          <div className="mt-1">
            <ResponseRateRing value={responseRate} />
          </div>
          <p className="mt-1 text-card text-vexo-muted">Novo contato → Em conversa</p>
        </div>
        <div className="rounded-lg border border-vexo-border bg-vexo-surface2 p-2.5">
          <p className="truncate text-card font-medium text-vexo-muted">Agendados</p>
          <p className="mt-1 text-xl font-semibold leading-none tracking-tight">{scheduled}</p>
          <p className="mt-1 text-card text-vexo-muted">Últimos 7 dias</p>
        </div>
        <div className="rounded-lg border border-vexo-border bg-vexo-surface2 p-2.5">
          <p className="truncate text-card font-medium text-vexo-muted">Taxa de comparecimento</p>
          <div className="mt-1">
            <ResponseRateRing value={attendanceRate} color={attendanceRingColor(attendanceRate)} />
          </div>
          <p className="mt-1 text-card text-vexo-muted">Compareceu x Não compareceu</p>
        </div>
      </div>

      {/* Board com rolagem horizontal própria (arrasta os cards pros
          lados se as 6 colunas não couberem) — cada coluna só cresce em
          altura conforme o conteúdo, sem scroll vertical próprio; quem
          rola verticalmente é a página toda. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-start gap-3">
          {PIPELINE_COLUMNS.map((col) => {
            const items = byStatus[col.status] ?? [];
            return (
              <div key={col.status} className="w-64 shrink-0 rounded-xl border border-vexo-border bg-vexo-surface p-3">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h2 className="truncate text-xs font-semibold">{col.label}</h2>
                  <span className="shrink-0 rounded-full bg-vexo-surface2 px-1.5 py-0.5 text-caption font-medium text-vexo-muted">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {items.map((conv) => {
                    const appt = conv.appointments[0];
                    const name = conv.lead.name ?? conv.lead.igUsername ?? "Lead";

                    // A coluna Agendado fica com uma versão compacta própria
                    // (só o nome, sem "..." nem linha de canal) pra não
                    // ficar alta demais somando com o bloco de
                    // agendamento/botões abaixo — as outras 5 colunas usam a
                    // estrutura padrão (nome + "..." em cima).
                    if (col.status === "SCHEDULED") {
                      return (
                        <div key={conv.id} className="rounded-xl border border-vexo-border bg-vexo-surface2 p-2">
                          <Link href={`/crm/conversas/${conv.id}`} className="block transition hover:text-vexo-accent">
                            <p className="truncate text-xs font-semibold">{name}</p>
                          </Link>

                          {appt && (
                            <p className="mt-1.5 text-caption font-medium text-vexo-fg">
                              {formatDateTime(appt.scheduledAt)}
                            </p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={conv.id} className="rounded-xl border border-vexo-border bg-vexo-surface2 p-3.5">
                        <Link href={`/crm/conversas/${conv.id}`} className="block transition hover:text-vexo-accent">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{name}</p>
                            <MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-vexo-muted" strokeWidth={2} />
                          </div>

                          <div className="mt-1.5 flex items-center gap-1.5 text-caption text-vexo-muted">
                            <AtSign className="h-3 w-3 shrink-0" strokeWidth={2} />
                            <span>{conv.lastMessageAt ? formatDateTime(conv.lastMessageAt) : "—"}</span>
                          </div>
                        </Link>
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
    </div>
  );
}
