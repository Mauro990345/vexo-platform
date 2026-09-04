import { setAppointmentAttendanceAction } from "@/app/crm/clinicas/actions";

// Chave reversível de comparecimento (ver src/lib/appointments.ts). Sempre
// mostra os dois botões, independente do estado atual — clicar na opção já
// ativa desmarca; clicar na outra troca direto. Nunca "trava" numa decisão.
//
// Visual discreto de propósito: contorno neutro em repouso, só ganha cor
// (borda + fundo leve) depois de marcado — évita o "bloco verde/vermelho
// grande" que não cabia em colunas estreitas (ex: Pipeline). "Faltou" em
// vez de "Não compareceu" pelo mesmo motivo de espaço — é o termo mais
// curto já usado pro mesmo status na Agenda.
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
    <div className="flex gap-1">
      {/* min-w-0 é essencial aqui: sem isso, o item flex não encolhe abaixo da
          largura intrínseca do texto e o botão vaza pra fora do card em
          colunas estreitas (pipeline) em vez de quebrar linha. */}
      <form action={setAppointmentAttendanceAction.bind(null, appointmentId, "COMPLETED")} className="min-w-0 flex-1">
        <button
          className={`w-full truncate rounded border px-1 py-0.5 text-caption font-medium leading-none transition ${
            isCompleted
              ? "border-vexo-success bg-vexo-success/15 text-vexo-success"
              : "border-vexo-border text-vexo-muted hover:border-vexo-success/50 hover:text-vexo-success"
          }`}
        >
          Compareceu
        </button>
      </form>
      <form action={setAppointmentAttendanceAction.bind(null, appointmentId, "NO_SHOW")} className="min-w-0 flex-1">
        <button
          className={`w-full truncate rounded border px-1 py-0.5 text-caption font-medium leading-none transition ${
            isNoShow
              ? "border-vexo-error bg-vexo-error/15 text-vexo-error"
              : "border-vexo-border text-vexo-muted hover:border-vexo-error/50 hover:text-vexo-error"
          }`}
        >
          Faltou
        </button>
      </form>
    </div>
  );
}
