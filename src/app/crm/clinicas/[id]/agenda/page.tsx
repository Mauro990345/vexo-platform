import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { STATUS_LABELS } from "@/components/AppointmentStatusBadge";

export const dynamic = "force-dynamic";

// Mesma lógica de tom por status já usada no Pipeline (columnTint): fundo
// tingido/dessaturado + etiqueta "marca-texto" mais clara que o fundo, sem
// borda colorida (a borda agora é uniforme/fina em todo card, ver
// className mais abaixo). Agrupado em 3 tons (não 5, um por status bruto)
// de propósito — Agendado/Confirmado/Compareceu são todos desfechos
// "positivos" e ficariam quase idênticos entre si como 3 verdes
// separados; a palavra exata do status já vem no texto da etiqueta, então
// o agrupamento não perde precisão, só evita colorido demais.
function agendaStatusTint(status: string): { bg: string; tagBg: string; tagText: string } {
  switch (status) {
    case "SCHEDULED":
    case "CONFIRMED":
    case "COMPLETED":
      return { bg: "bg-vexo-agendaStatusPositiveBg", tagBg: "bg-vexo-agendaStatusPositivePill/45", tagText: "text-vexo-fg" };
    case "NO_SHOW":
      return { bg: "bg-vexo-agendaStatusNegativeBg", tagBg: "bg-vexo-agendaStatusNegativePill/45", tagText: "text-vexo-fg" };
    default: // CANCELLED e qualquer status futuro sem grupo definido
      return { bg: "bg-vexo-agendaCardBg", tagBg: "bg-vexo-border/80", tagText: "text-vexo-muted" };
  }
}

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
              <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">{WEEKDAY_LABELS[i]}</p>
              <p className="truncate text-xs font-semibold">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>
            </div>
          ))}

          {HOURS.map((hour) => (
            <Fragment key={hour}>
              <div className="border-b border-r border-vexo-border px-1 py-1 text-right text-caption text-vexo-muted">
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
                    {cellAppointments.map((a) => {
                      // Sem conversationId = importado do Google Calendar sem
                      // Lead vinculado (paciente conhecido, agendado
                      // manualmente) — não tem conversa pra abrir, então o
                      // card não é clicável, só informativo. Nesse caso o
                      // nome vem do manualTitle (título do evento no Google),
                      // não de um texto genérico fixo.
                      const label = a.lead ? a.lead.name ?? a.lead.igUsername ?? "Lead" : a.manualTitle ?? "Agendamento";
                      const tint = agendaStatusTint(a.status);
                      const inner = (
                        <>
                          <p className="truncate font-normal leading-tight">{label}</p>
                          <div className="flex min-w-0 items-center gap-1.5 leading-none">
                            <span className="shrink-0 text-vexo-fg/70">
                              {a.scheduledAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span
                              className={`inline-block max-w-full shrink truncate rounded-card px-1.5 py-0.5 text-caption font-medium ${tint.tagBg} ${tint.tagText}`}
                            >
                              {STATUS_LABELS[a.status] ?? a.status}
                            </span>
                          </div>
                        </>
                      );
                      // Fundo tingido/dessaturado por grupo de status (ver
                      // agendaStatusTint) + borda fina/uniforme — mesmo
                      // padrão do Pipeline, sem mais borda esquerda colorida
                      // por status.
                      const className = `flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-card border border-vexo-border/20 ${tint.bg} p-1 text-caption text-vexo-agendaCardFont transition`;

                      return a.conversationId ? (
                        <Link key={a.id} href={`/crm/conversas/${a.conversationId}`} className={`${className} hover:border-vexo-accent`}>
                          {inner}
                        </Link>
                      ) : (
                        <div key={a.id} className={className}>
                          {inner}
                        </div>
                      );
                    })}
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
