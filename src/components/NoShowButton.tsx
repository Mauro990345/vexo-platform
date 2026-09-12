"use client";

import { useTransition } from "react";
import { setAppointmentAttendanceClientAction } from "@/app/dashboard/actions";

// Único botão que o cliente vê no Painel — reversível: clicar de novo
// desfaz. Um botão só (não dois lado a lado), já que "Compareceu" não é
// uma ação que a clínica precisa disparar por aqui.
//
// "action" é injetável porque este componente também é usado pela visão
// "Ver painel de [clínica]" do CRM interno (ClientPanelView, renderizado
// em /crm/painel-cliente/[id]) — lá quem clica é um admin/staff, sem
// sessão CLIENT, então o padrão (setAppointmentAttendanceClientAction, que
// exige requireClientSession) sempre falharia; essa tela passa a ação
// interna equivalente (setAppointmentAttendanceAction) no lugar.
export function NoShowButton({
  appointmentId,
  status,
  action = setAppointmentAttendanceClientAction,
}: {
  appointmentId: string;
  status: string;
  action?: (appointmentId: string, status: "COMPLETED" | "NO_SHOW") => Promise<unknown>;
}) {
  const [isPending, startTransition] = useTransition();
  const isNoShow = status === "NO_SHOW";

  function handleClick() {
    startTransition(async () => {
      await action(appointmentId, "NO_SHOW");
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`rounded-sm border px-2 py-1 text-caption font-medium transition disabled:opacity-50 ${
        isNoShow
          ? "border-transparent bg-vexo-panelStatusNegativeBg/80 text-vexo-fg"
          : "border-vexo-border text-vexo-muted hover:border-vexo-error/50 hover:text-vexo-error"
      }`}
    >
      {isNoShow ? "Faltou ✓" : "Não compareceu"}
    </button>
  );
}
