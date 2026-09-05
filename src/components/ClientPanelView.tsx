import Link from "next/link";
import { AtSign } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getClinicMetrics, getDailyApproachCounts, startOfDay, addDays } from "@/lib/metrics";
import { StatCard } from "@/components/StatCard";
import { AppointmentStatusBadge } from "@/components/AppointmentStatusBadge";
import { NoShowButton } from "@/components/NoShowButton";
import { ChannelStatusPill } from "@/components/ChannelStatusPill";

// Marcar "Não compareceu" só faz sentido pra agendamento ainda em aberto —
// já compareceu ou já foi cancelado não tem o que alternar aqui.
const ACTIONABLE_STATUSES = ["SCHEDULED", "CONFIRMED", "NO_SHOW"];

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// Segunda como início da semana (getDay(): 0=dom..6=sáb) — mesmo critério
// da Agenda interna (src/app/crm/clinicas/[id]/agenda/page.tsx).
function startOfWeek(d: Date): Date {
  const diff = (d.getDay() + 6) % 7;
  return startOfDay(addDays(d, -diff));
}
function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Corpo do Painel do cliente — extraído de /dashboard pra ser reaproveitado
// também pela visão "Ver painel de [clínica]" que a M8 Growth usa de dentro
// do CRM interno (/crm/painel-cliente/[id]), sem duplicar layout: as duas
// telas renderizam este mesmo componente, só trocando de onde o clinicId
// vem (sessão do cliente vs. parâmetro de rota do admin) e pra onde os
// links de navegação de semana apontam (base). noShowAction é injetável
// porque a ação por trás do botão "Não compareceu" precisa rodar sob uma
// sessão diferente em cada contexto (CLIENT vs INTERNAL_ADMIN/STAFF) —
// ver NoShowButton.
export async function ClientPanelView({
  clinicId,
  week,
  base,
  noShowAction,
}: {
  clinicId: string;
  week?: string;
  base: string;
  noShowAction?: (appointmentId: string, status: "COMPLETED" | "NO_SHOW") => Promise<unknown>;
}) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const last7Start = addDays(todayStart, -6);

  const parsedRef = week ? new Date(week) : now;
  const weekStart = startOfWeek(Number.isNaN(parsedRef.getTime()) ? now : parsedRef);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [clinic, today, last7Days, appointments, dailyApproached] = await Promise.all([
    prisma.clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: {
        name: true,
        whatsappStatus: true,
        instagramAccount: { select: { id: true } },
        googleCalendarAccount: { select: { id: true } },
      },
    }),
    getClinicMetrics(clinicId, todayStart, addDays(todayStart, 1)),
    getClinicMetrics(clinicId, last7Start, addDays(todayStart, 1)),
    prisma.appointment.findMany({
      where: { clinicId },
      include: { lead: true },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    }),
    getDailyApproachCounts(clinicId, weekStart),
  ]);

  const maxApproached = Math.max(1, ...dailyApproached);

  return (
    <div className="min-h-screen bg-vexo-bg px-4 pt-4 pb-6 sm:px-8 sm:pt-6 sm:pb-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-lg font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-vexo-muted">Acompanhamento em tempo real das abordagens no Instagram.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Coluna esquerda: status de canais, semana e números */}
          <div className="space-y-6">
            <div className="space-y-3">
              {/* Linha do nome da clínica + pills — solta, sem card ao redor,
                  pra começar exatamente na mesma altura que o título
                  "Agendamentos" da coluna direita (mesmo critério: nenhum
                  padding/borda acima de nenhum dos dois). */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-vexo-success" />
                  <h2 className="font-medium">{clinic.name}</h2>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <ChannelStatusPill connected={Boolean(clinic.instagramAccount)} label="Instagram" />
                  <ChannelStatusPill connected={Boolean(clinic.googleCalendarAccount)} label="Calendar" />
                  <ChannelStatusPill connected={clinic.whatsappStatus === "open"} label="WhatsApp" />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-vexo-border bg-vexo-surface p-3.5">
                <div className="flex items-center justify-between gap-1.5">
                  <Link
                    href={`${base}?week=${toDateParam(addDays(weekStart, -7))}`}
                    className="rounded-lg border border-vexo-border px-2.5 py-1 text-xs hover:border-vexo-accent"
                  >
                    ← Semana
                  </Link>
                  <Link href={base} className="rounded-lg border border-vexo-border px-2.5 py-1 text-xs hover:border-vexo-accent">
                    Hoje
                  </Link>
                  <Link
                    href={`${base}?week=${toDateParam(addDays(weekStart, 7))}`}
                    className="rounded-lg border border-vexo-border px-2.5 py-1 text-xs hover:border-vexo-accent"
                  >
                    Semana →
                  </Link>
                </div>

                <div className="space-y-1.5 border-t border-vexo-border pt-3">
                  <p className="text-caption font-medium uppercase tracking-wide text-vexo-muted">
                    Abordagens por dia · {weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} –{" "}
                    {addDays(weekStart, 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </p>
                  <div className="space-y-1">
                    {weekDays.map((day, i) => {
                      const count = dailyApproached[i] ?? 0;
                      return (
                        <div key={day.getTime()} className="flex items-center gap-2">
                          <span className="w-7 shrink-0 text-caption leading-none text-vexo-muted">
                            {WEEKDAY_LABELS[i]}
                          </span>
                          <div className="flex h-2.5 flex-1 items-center rounded-full bg-vexo-accent/15">
                            <div
                              className="h-1 rounded-full bg-vexo-accent"
                              style={{ width: `${(count / maxApproached) * 100}%` }}
                            />
                          </div>
                          <span className="w-4 shrink-0 text-right text-caption font-medium leading-none">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

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
                    <NoShowButton appointmentId={a.id} status={a.status} action={noShowAction} />
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
