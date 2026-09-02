import { requireClientSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppointmentStatusBadge } from "@/components/AppointmentStatusBadge";

export const dynamic = "force-dynamic";

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
              <th className="px-4 py-2 font-medium">Lead</th>
              <th className="px-4 py-2 font-medium">Data/hora</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-vexo-border">
            {appointments.map((a) => (
              <tr key={a.id} className="transition hover:bg-vexo-surface2">
                <td className="px-4 py-3 font-medium">{a.lead.name ?? a.lead.igUsername ?? "Lead"}</td>
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
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-vexo-muted">
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
