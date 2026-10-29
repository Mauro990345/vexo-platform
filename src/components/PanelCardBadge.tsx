import { UserCheck, CalendarX, Flame } from "lucide-react";
import type { PanelCardKind } from "@/lib/panel-cards";
import { MOBILE_BAR_WIDTH, MOBILE_CHIP_SIZE, MOBILE_SECONDARY_TEXT, MOBILE_ICON_SIZE, MOBILE_INLINE_GAP } from "@/components/MobileCardScale";

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
// SÓ CELULAR (abaixo de sm/640px, pedido "leitura pra público 45+", fator
// 1,28 — ver MobileCardScale.ts): 3px -> 4px. O ajuste anterior (~10%)
// tinha deixado sem variante de celular porque 3×1,1 arredondava de volta
// pra 3; com o fator maior deste pedido (1,28), 3×1,28≈3,84 já sobe pra
// 4px.
export function PanelCardTypeBar({ kind }: { kind: PanelCardKind }) {
  return <span aria-hidden="true" className={`absolute inset-y-0 left-0 ${MOBILE_BAR_WIDTH} ${KIND_STYLE[kind].bar}`} />;
}

// Chip de largura fixa (~92px) + ícone + uma palavra (pedido explícito).
//
// SÓ CELULAR (ver MobileCardScale.ts): 92px -> 128px de largura (ainda
// cabe o ícone + a palavra numa linha só, nenhum dos 3 rótulos —
// "Reativação"/"Faltou"/"Quente" — chega a quebrar), padding 6px/2px ->
// 10px/4px, fonte 10px -> 14px (mínimo de "palavra do chip" do pedido),
// ícone 12px -> 17px. `sm:` sempre com os valores de antes, intocados.
export function PanelCardTypeChip({ kind }: { kind: PanelCardKind }) {
  const { chipBg, chipText, icon: Icon, label } = KIND_STYLE[kind];
  return (
    <span
      className={`inline-flex ${MOBILE_CHIP_SIZE} shrink-0 items-center justify-center ${MOBILE_INLINE_GAP} rounded-md ${chipBg} ${MOBILE_SECONDARY_TEXT} font-medium ${chipText}`}
    >
      <Icon className={`${MOBILE_ICON_SIZE} shrink-0`} strokeWidth={2.5} />
      {label}
    </span>
  );
}

// Linha de motivo (cinza, reticências se passar) — texto já pronto (ex.:
// "120 dias após o procedimento", "Faltou há 3 dias · mensagem 1 de 2",
// "Perguntou preço/endereço · há 6 dias", ver panel-cards.ts/
// no-show-cards.ts/hot-lead-cards.ts).
//
// SÓ CELULAR: 10px -> 14px (mínimo de "motivo" do pedido, ver
// MobileCardScale.ts — mesmo nível de PanelCardTypeChip acima). Fonte
// maior = motivo pode não caber mais numa linha só — pedido explícito:
// quebra em até 2 linhas com reticências em vez de reduzir fonte
// (line-clamp-2). Em telas ≥640px volta a ser 1 linha só com reticências,
// igual sempre foi (line-clamp-none desfaz o "display: -webkit-box" do
// line-clamp-2 antes do truncate de sempre entrar, senão as duas regras
// de overflow se somariam de um jeito diferente do truncate original).
export function PanelCardReasonLine({ reason }: { reason: string }) {
  return <p className={`line-clamp-2 sm:line-clamp-none sm:truncate ${MOBILE_SECONDARY_TEXT} text-vexo-muted`}>{reason}</p>;
}
