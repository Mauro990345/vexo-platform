import { UserCheck, CalendarX, Flame } from "lucide-react";
import type { PanelCardKind } from "@/lib/panel-cards";
import {
  MOBILE_BAR_WIDTH,
  MOBILE_CHIP_SIZE,
  MOBILE_CHIP_TEXT,
  MOBILE_CHIP_ICON_SIZE,
  MOBILE_SECONDARY_TEXT,
  MOBILE_INLINE_GAP,
} from "@/components/MobileCardScale";

// Identificação visual por TIPO de card da faixa de Reativação do Painel
// (item 1 do pedido) — só o lado ESQUERDO da linha (barra + chip + motivo);
// os botões de ação do lado direito (WhatsApp/Instagram) continuam
// exatamente como eram, sem nenhuma mudança (ver ReactivationRail.tsx).
//
// Cores por Tailwind direto (blue/purple/orange), mesmo padrão já usado
// em ClientPanelView.tsx pro ícone do Google Calendar (iconBg="bg-blue-500")
// — não são tokens vexo-* porque são cores NOVAS, específicas destes 3
// tipos, sem overlap com nenhum token semântico já existente
// (vexo-success/error/accent já significam outra coisa). Tom 500 sólido
// pra barra, 500/10 + 400 pro chip (fundo suave, texto na mesma família de
// cor, legível tanto no fundo claro quanto no escuro — vexo-surface é
// escuro por padrão neste app).
const KIND_STYLE: Record<PanelCardKind, { bar: string; chipBg: string; chipText: string; icon: typeof UserCheck; label: string }> = {
  REACTIVATION: { bar: "bg-blue-500", chipBg: "bg-blue-500/10", chipText: "text-blue-400", icon: UserCheck, label: "Reativação" },
  NO_SHOW: { bar: "bg-purple-500", chipBg: "bg-purple-500/10", chipText: "text-purple-400", icon: CalendarX, label: "Faltou" },
  HOT_LEAD: { bar: "bg-orange-500", chipBg: "bg-orange-500/10", chipText: "text-orange-400", icon: Flame, label: "Quente" },
};

// Barra vertical de 3px — pedido explícito "sem arredondar": fica DENTRO
// do card (que continua rounded-lg por fora, igual sempre foi), clipada
// pelo overflow-hidden do container pra não vazar do formato arredondado,
// mas o próprio elemento da barra nunca tem nenhum rounded-* aplicado.
//
// SÓ CELULAR (abaixo de sm/640px, fator 1,45 sobre os valores de desktop
// — ver MobileCardScale.ts): 3px -> 4px (3×1,45≈4,35, arredonda pra 4,
// que também é o mínimo pedido).
export function PanelCardTypeBar({ kind }: { kind: PanelCardKind }) {
  return <span aria-hidden="true" className={`absolute inset-y-0 left-0 ${MOBILE_BAR_WIDTH} ${KIND_STYLE[kind].bar}`} />;
}

// Chip de largura fixa (~92px) + ícone + uma palavra (pedido explícito).
//
// SÓ CELULAR (ver MobileCardScale.ts): 92px -> 96px de largura (ainda
// cabe o ícone + a palavra numa linha só, nenhum dos 3 rótulos —
// "Reativação"/"Faltou"/"Quente" — chega a quebrar), padding 6px/2px ->
// 8px/3px, fonte 10px -> 13px, ícone 12px -> 14px. Fonte/ícone PRÓPRIOS
// (MOBILE_CHIP_TEXT/MOBILE_CHIP_ICON_SIZE, não mais compartilhados com o
// motivo/MOBILE_ICON_SIZE dos botões — pedido explícito da 2ª rodada de
// ajuste: reduzir o chip, sem reduzir o motivo). `sm:` sempre com os
// valores de antes, intocados.
export function PanelCardTypeChip({ kind }: { kind: PanelCardKind }) {
  const { chipBg, chipText, icon: Icon, label } = KIND_STYLE[kind];
  return (
    <span
      className={`inline-flex ${MOBILE_CHIP_SIZE} shrink-0 items-center justify-center ${MOBILE_INLINE_GAP} rounded-md ${chipBg} ${MOBILE_CHIP_TEXT} font-medium ${chipText}`}
    >
      <Icon className={`${MOBILE_CHIP_ICON_SIZE} shrink-0`} strokeWidth={2.5} />
      {label}
    </span>
  );
}

// Linha de motivo (cinza, reticências se passar) — texto já pronto (ex.:
// "120 dias após o procedimento", "Faltou há 3 dias · mensagem 1 de 2",
// "Perguntou preço/endereço · há 6 dias", ver panel-cards.ts/
// no-show-cards.ts/hot-lead-cards.ts).
//
// SÓ CELULAR: 10px -> 15px (ver MobileCardScale.ts). Volta a ser SEMPRE
// 1 linha com reticências (truncate), nos dois tamanhos de tela — pedido
// explícito desta rodada: no celular, o motivo passa a dividir a linha do
// TOPO do card com o chip (ver ReactivationRail.tsx), então não tem mais
// espaço pra 2 linhas; é o NOME (ver MOBILE_NAME_CLAMP) quem ganhou a
// quebra em até 2 linhas desta vez, numa linha própria abaixo.
//
// min-w-0: sem isso, o <p> (filho de um flex row ao lado do chip, que é
// shrink-0) não encolhe abaixo do próprio conteúdo (min-width:auto padrão
// de item flex) — em telas estreitas isso faz o texto vazar pra fora do
// card em vez de truncar, e como o card tem overflow-hidden, o motivo
// simplesmente some ao invés de aparecer com reticências. Com min-w-0, o
// encolhimento (flex-shrink:1, padrão) passa a valer de verdade.
export function PanelCardReasonLine({ reason }: { reason: string }) {
  return <p className={`min-w-0 flex-1 truncate ${MOBILE_SECONDARY_TEXT} text-vexo-muted`}>{reason}</p>;
}
