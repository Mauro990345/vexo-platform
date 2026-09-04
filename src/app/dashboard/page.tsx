import { AtSign } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getClinicMetrics, startOfDay, addDays } from "@/lib/metrics";
import { StatCard } from "@/components/StatCard";
import { AppointmentStatusBadge } from "@/components/AppointmentStatusBadge";
import { NoShowButton } from "@/components/NoShowButton";

export const dynamic = "force-dynamic";

// Marcar "Não compareceu" só faz sentido pra agendamento ainda em aberto —
// já compareceu ou já foi cancelado não tem o que alternar aqui.
const ACTIONABLE_STATUSES = ["SCHEDULED", "CONFIRMED", "NO_SHOW"];

// Painel do cliente — página única, sem sidebar/menu: a clínica só vê
// números informativos + a lista de agendamentos com o botão de
// não-comparecimento. Nada de Pipeline/Kanban (fica só no CRM interno) e
// nada de gerenciar conexões (WhatsApp/Instagram/Google Calendar são
// responsabilidade da M8 Growth, não da clínica) — por isso não tem mais
// sidebar nenhuma: não sobrou mais de uma página pra navegar entre.
//
// As duas colunas (números / agendamentos) e a lista de agendamentos
// disparam juntas num único Promise.all — antes eram 2 requests
// sequenciais (uma página pros números, outra pra lista) mais uma consulta
// de clinic só pra checar o status do WhatsApp (usada num aviso que não
// existe mais, já que a tela de conexão do cliente saiu daqui).
export default async function ClientDashboardPage() {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  const now = new Date();
  const todayStart = startOfDay(now);
  const last7Start = addDays(todayStart, -6);

  const [today, last7Days, appointments] = await Promise.all([
    getClinicMetrics(clinicId, todayStart, addDays(todayStart, 1)),
    getClinicMetrics(clinicId, last7Start, addDays(todayStart, 1)),
    prisma.appointment.findMany({
      where: { clinicId },
      include: { lead: true },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="min-h-screen bg-vexo-bg px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-vexo-muted">Acompanhamento em tempo real das abordagens no Instagram.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Coluna esquerda: números */}
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-caption font-medium uppercase tracking-wide text-vexo-muted">Hoje</h2>
              <div className="grid grid-cols-3 gap-2.5">
                <StatCard label="Abordados" value={String(today.approached)} />
                <StatCard label="Em conversa" value={String(today.responded)} />
                <StatCard label="Agendaram" value={String(today.scheduled)} />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-caption font-medium uppercase tracking-wide text-vexo-muted">Últimos 7 dias</h2>
              <div className="grid grid-cols-3 gap-2.5">
                <StatCard label="Abordados" value={String(last7Days.approached)} />
                <StatCard label="Em conversa" value={String(last7Days.responded)} />
                <StatCard label="Agendaram" value={String(last7Days.scheduled)} />
              </div>
            </div>
          </div>

          {/* Coluna direita: agendamentos */}
          <div className="space-y-3">
            <h2 className="text-caption font-medium uppercase tracking-wide text-vexo-muted">Agendamentos</h2>
            <div className="space-y-2">
              {appointments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-vexo-border bg-vexo-surface p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {a.lead && (
                        <AtSign
                          className="h-3 w-3 shrink-0 text-vexo-muted"
                          strokeWidth={2}
                          aria-label="Agendado pela IA (Instagram)"
                        />
                      )}
                      <p className="truncate text-sm font-medium">
                        {a.lead ? a.lead.name ?? a.lead.igUsername ?? "Lead" : a.manualTitle ?? "Agendamento"}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-caption text-vexo-muted">
                      <span>
                        {a.scheduledAt.toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <AppointmentStatusBadge status={a.status} compact />
                    </div>
                  </div>
                  {ACTIONABLE_STATUSES.includes(a.status) && (
                    <NoShowButton appointmentId={a.id} status={a.status} />
                  )}
                </div>
              ))}

              {appointments.length === 0 && (
                <p className="rounded-lg border border-vexo-border bg-vexo-surface p-4 text-center text-sm text-vexo-muted">
                  Nenhum agendamento ainda.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
