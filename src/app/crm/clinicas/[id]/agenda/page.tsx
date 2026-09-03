import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { AppointmentStatusBadge, appointmentStatusBorderClass } from "@/components/AppointmentStatusBadge";

export const dynamic = "force-dynamic";

// 14 tem que bater com o "repeat(14,...)" de grid-rows mais abaixo — mudou
// o range de horas, muda os dois juntos.
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
    <div className="-mt-3 space-y-3 sm:-mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Agenda</h1>
          <p className="mt-0.5 text-xs text-vexo-muted">
            {weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} –{" "}
            {addDays(weekStart, 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Link
            href={`${base}?week=${toDateParam(addDays(weekStart, -7))}`}
            className="rounded-lg border border-vexo-accent px-2.5 py-1 text-xs text-vexo-accent hover:bg-vexo-accent/10"
          >
            ← Semana
          </Link>
          <Link href={base} className="rounded-lg border border-vexo-accent px-2.5 py-1 text-xs text-vexo-accent hover:bg-vexo-accent/10">
            Hoje
          </Link>
          <Link
            href={`${base}?week=${toDateParam(addDays(weekStart, 7))}`}
            className="rounded-lg border border-vexo-accent px-2.5 py-1 text-xs text-vexo-accent hover:bg-vexo-accent/10"
          >
            Semana →
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-vexo-border bg-vexo-surface">
        {/* minmax(0,1fr), não só 1fr — sem o minmax, uma track de grid ainda
            assume "auto" como mínimo, deixando o card de agendamento (ou o
            texto dentro dele) esticar aquela coluna além da fração igual
            que as outras colunas recebem. min-w-0 nas células é reforço,
            não substitui isso.

            grid-rows fixa cada linha de horário em 56px — sem isso, uma
            linha de grid é alta o bastante pro seu conteúdo mais alto (a
            célula com agendamento), e como todas as colunas daquela hora
            compartilham a MESMA linha, a hora inteira (todos os 7 dias)
            fica mais alta que uma hora sem agendamento nenhum. O "14" tem
            que bater com HOURS.length (não dá pra interpolar isso na
            classe — o Tailwind precisa do valor literal em build time). */}
        <div className="grid min-w-[760px] grid-cols-[44px_repeat(7,minmax(0,1fr))] grid-rows-[auto_repeat(14,56px)]">
          <div className="border-b border-r border-vexo-border" />
          {days.map((d, i) => (
            <div key={i} className="min-w-0 border-b border-r border-vexo-border px-1.5 py-1.5 text-center last:border-r-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-vexo-muted">{WEEKDAY_LABELS[i]}</p>
              <p className="truncate text-xs font-semibold">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>
            </div>
          ))}

          {HOURS.map((hour) => (
            <Fragment key={hour}>
              <div className="border-b border-r border-vexo-border px-1 py-1 text-right text-[10px] text-vexo-muted">
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
                  <div
                    key={i}
                    className="flex min-w-0 flex-col gap-0.5 overflow-hidden border-b border-r border-vexo-border p-1 last:border-r-0"
                  >
                    {cellAppointments.map((a) => (
                      <Link
                        key={a.id}
                        href={`/crm/conversas/${a.conversationId}`}
                        className={`flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md border border-l-[3px] border-vexo-petrolBorder bg-vexo-petrol p-1 text-[10px] text-vexo-fg transition hover:border-vexo-accent ${appointmentStatusBorderClass(a.status)}`}
                      >
                        <p className="truncate font-medium leading-tight">{a.lead.name ?? a.lead.igUsername ?? "Lead"}</p>
                        <div className="flex min-w-0 items-center gap-1.5 leading-none">
                          <span className="shrink-0 text-vexo-fg/70">
                            {a.scheduledAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <AppointmentStatusBadge status={a.status} compact />
                        </div>
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
