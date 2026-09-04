import { AtSign } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppointmentStatusBadge } from "@/components/AppointmentStatusBadge";
import { NoShowButton } from "@/components/NoShowButton";

export const dynamic = "force-dynamic";

// Marcar "Não compareceu" só faz sentido pra agendamento ainda em aberto —
// já compareceu ou já foi cancelado não tem o que alternar aqui.
const ACTIONABLE_STATUSES = ["SCHEDULED", "CONFIRMED", "NO_SHOW"];

export default async function ClientAppointmentsPage() {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  const appointments = await prisma.appointment.findMany({
    where: { clinicId },
    include: { lead: true },
    orderBy: { scheduledAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold tracking-tight">Agendamentos</h1>
      <div className="overflow-x-auto rounded-2xl border border-vexo-border bg-vexo-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vexo-border text-left text-xs text-vexo-muted">
              <th className="px-4 py-2 font-medium">Paciente</th>
              <th className="px-4 py-2 font-medium">Data/hora</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-vexo-border">
            {appointments.map((a) => (
              <tr key={a.id} className="transition hover:bg-vexo-surface2">
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-1.5">
                    {/* Indicação de origem: veio da IA/Instagram (tem Lead)
                        vs agendado manualmente pela clínica no Google
                        Calendar (sem Lead, sem ícone). */}
                    {a.lead && (
                      <AtSign
                        className="h-3 w-3 shrink-0 text-vexo-muted"
                        strokeWidth={2}
                        aria-label="Agendado pela IA (Instagram)"
                      />
                    )}
                    <span>{a.lead ? a.lead.name ?? a.lead.igUsername ?? "Lead" : a.manualTitle ?? "Paciente"}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-vexo-muted">
                  {a.scheduledAt.toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-3">
                  <AppointmentStatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {ACTIONABLE_STATUSES.includes(a.status) && (
                    <NoShowButton appointmentId={a.id} status={a.status} />
                  )}
                </td>
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-vexo-muted">
                  Nenhum agendamento ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
