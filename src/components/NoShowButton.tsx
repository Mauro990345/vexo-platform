"use client";

import { useTransition } from "react";
import { setAppointmentAttendanceClientAction } from "@/app/dashboard/actions";

// Único botão que o cliente vê no Painel — reversível: clicar de novo
// desfaz (mesma semântica do AttendanceToggle usado internamente, só que
// aqui é um botão só em vez de dois lado a lado, já que "Compareceu" não é
// uma ação que a clínica precisa disparar por aqui).
export function NoShowButton({ appointmentId, status }: { appointmentId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const isNoShow = status === "NO_SHOW";

  function handleClick() {
    startTransition(async () => {
      await setAppointmentAttendanceClientAction(appointmentId, "NO_SHOW");
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`rounded-md border px-2 py-1 text-caption font-medium transition disabled:opacity-50 ${
        isNoShow
          ? "border-vexo-error bg-vexo-error/15 text-vexo-error"
          : "border-vexo-border text-vexo-muted hover:border-vexo-error/50 hover:text-vexo-error"
      }`}
    >
      {isNoShow ? "Faltou ✓" : "Não compareceu"}
    </button>
  );
}
