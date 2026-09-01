import { setAppointmentAttendanceAction } from "@/app/crm/clinicas/actions";

// Chave reversível de comparecimento (ver src/lib/appointments.ts). Sempre
// mostra os dois botões, independente do estado atual — clicar na opção já
// ativa desmarca; clicar na outra troca direto. Nunca "trava" numa decisão.
export function AttendanceToggle({
  appointmentId,
  status,
}: {
  appointmentId: string;
  status: string;
}) {
  const isCompleted = status === "COMPLETED";
  const isNoShow = status === "NO_SHOW";

  return (
    <div className="flex gap-1.5">
      <form action={setAppointmentAttendanceAction.bind(null, appointmentId, "COMPLETED")} className="flex-1">
        <button
          className={`w-full rounded-md border px-2 py-1.5 text-xs font-medium transition ${
            isCompleted
              ? "border-emerald-500/50 bg-emerald-500/25 text-emerald-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
          }`}
        >
          ✓ Compareceu
        </button>
      </form>
      <form action={setAppointmentAttendanceAction.bind(null, appointmentId, "NO_SHOW")} className="flex-1">
        <button
          className={`w-full rounded-md border px-2 py-1.5 text-xs font-medium transition ${
            isNoShow
              ? "border-red-500/50 bg-red-500/25 text-red-200"
              : "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
          }`}
        >
          ✗ Não compareceu
        </button>
      </form>
    </div>
  );
}
