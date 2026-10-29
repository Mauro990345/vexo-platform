"use client";

import { useTransition } from "react";
import { setAppointmentAttendanceClientAction } from "@/app/dashboard/actions";
import { MOBILE_SECONDARY_TEXT, MOBILE_TOGGLE_BUTTON_MIN } from "@/components/MobileCardScale";

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
      // SÓ CELULAR (abaixo de sm/640px — pedido explícito, fator 1,45
      // sobre os valores de desktop, ver MobileCardScale.ts): é um dos
      // botões de ação citados no pedido ("Não compareceu") — por isso
      // leva o piso de toque de 48px de altura E largura (min-h/min-w, já
      // que o texto varia de tamanho entre os dois estados: "Não
      // compareceu" / "Faltou ✓"), com inline-flex/items-center/
      // justify-center pra centralizar o texto dentro da caixa maior
      // (visualmente idêntico a antes em telas ≥640px, onde o min-h/min-w
      // volta a 0). Padding 6px/2px -> 9px/3px, fonte 10px -> 15px.
      className={`inline-flex items-center justify-center ${MOBILE_TOGGLE_BUTTON_MIN} shrink-0 rounded-sm border px-[9px] py-[3px] sm:px-1.5 sm:py-0.5 ${MOBILE_SECONDARY_TEXT} font-medium transition disabled:opacity-50 ${
        isNoShow
          ? "border-transparent bg-vexo-panelStatusNegativeBg/80 text-vexo-fg"
          : "border-vexo-border text-vexo-muted hover:border-vexo-error/50 hover:text-vexo-error"
      }`}
    >
      {isNoShow ? "Faltou ✓" : "Não compareceu"}
    </button>
  );
}
