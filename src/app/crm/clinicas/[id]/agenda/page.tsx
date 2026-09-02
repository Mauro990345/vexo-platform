import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { AppointmentStatusBadge } from "@/components/AppointmentStatusBadge";

export const dynamic = "force-dynamic";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07h .. 20h
const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
// Segunda como início da semana (getDay(): 0=dom..6=sáb).
function startOfWeek(d: Date): Date {
  const diff = (d.getDay() + 6) % 7;
  return startOfDay(addDays(d, -diff));
}
function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ClinicAgendaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { week?: string };
}) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!clinic) notFound();

  const parsedRef = searchParams.week ? new Date(searchParams.week) : new Date();
  const weekStart = startOfWeek(Number.isNaN(parsedRef.getTime()) ? new Date() : parsedRef);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const appointments = await prisma.appointment.findMany({
    where: { clinicId: clinic.id, scheduledAt: { gte: weekStart, lt: weekEnd } },
    include: { lead: true },
    orderBy: { scheduledAt: "asc" },
  });

  const base = `/crm/clinicas/${clinic.id}/agenda`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
          <p className="mt-1 text-sm text-vexo-muted">
            {weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} –{" "}
            {addDays(weekStart, 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`${base}?week=${toDateParam(addDays(weekStart, -7))}`}
            className="rounded-lg border border-vexo-border px-3 py-1.5 text-sm hover:border-vexo-accent"
          >
            ← Semana
          </Link>
          <Link href={base} className="rounded-lg border border-vexo-border px-3 py-1.5 text-sm hover:border-vexo-accent">
            Hoje
          </Link>
          <Link
            href={`${base}?week=${toDateParam(addDays(weekStart, 7))}`}
            className="rounded-lg border border-vexo-border px-3 py-1.5 text-sm hover:border-vexo-accent"
          >
            Semana →
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-vexo-border bg-vexo-surface">
        <div className="grid min-w-[880px] grid-cols-[52px_repeat(7,1fr)]">
          <div className="border-b border-r border-vexo-border" />
          {days.map((d, i) => (
            <div key={i} className="border-b border-r border-vexo-border px-2 py-2 text-center last:border-r-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-vexo-muted">{WEEKDAY_LABELS[i]}</p>
              <p className="text-sm font-semibold">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>
            </div>
          ))}

          {HOURS.map((hour) => (
            <Fragment key={hour}>
              <div className="border-b border-r border-vexo-border px-1 py-2 text-right text-[11px] text-vexo-muted">
                {String(hour).padStart(2, "0")}h
              </div>
              {days.map((d, i) => {
                const cellAppointments = appointments.filter(
                  (a) =>
                    a.scheduledAt.getDate() === d.getDate() &&
                    a.scheduledAt.getMonth() === d.getMonth() &&
                    a.scheduledAt.getFullYear() === d.getFullYear() &&
                    a.scheduledAt.getHours() === hour
                );
                return (
                  <div key={i} className="min-h-[52px] space-y-1 border-b border-r border-vexo-border p-1 last:border-r-0">
                    {cellAppointments.map((a) => (
                      <Link
                        key={a.id}
                        href={`/crm/conversas/${a.conversationId}`}
                        className="block space-y-0.5 rounded-md border border-vexo-border bg-vexo-surface2 p-1.5 text-[11px] transition hover:border-vexo-accent"
                      >
                        <p className="truncate font-medium">{a.lead.name ?? a.lead.igUsername ?? "Lead"}</p>
                        <p className="text-vexo-muted">
                          {a.scheduledAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <AppointmentStatusBadge status={a.status} />
                      </Link>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {appointments.length === 0 && (
        <p className="text-sm text-vexo-muted">Nenhum agendamento nesta semana.</p>
      )}
    </div>
  );
}
