import { setAppointmentCancelledAction } from "@/app/crm/clinicas/actions";

// Botão único, reversível (ver setAppointmentCancelled em
// src/lib/appointments.ts) — clicar cancela; clicar de novo desfaz (volta
// pra SCHEDULED). Mesmo visual discreto do AttendanceToggle (contorno
// neutro em repouso, só ganha cor depois de marcado).
export function CancelToggle({ appointmentId, status }: { appointmentId: string; status: string }) {
  const isCancelled = status === "CANCELLED";

  return (
    <form action={setAppointmentCancelledAction.bind(null, appointmentId, !isCancelled)}>
      <button
        className={`w-full truncate rounded border px-1 py-0.5 text-caption font-medium leading-none transition ${
          isCancelled
            ? "border-vexo-muted bg-vexo-muted/15 text-vexo-muted"
            : "border-vexo-border text-vexo-muted hover:border-vexo-muted/70"
        }`}
      >
        {isCancelled ? "Cancelado ✓" : "Cancelar"}
      </button>
    </form>
  );
}
