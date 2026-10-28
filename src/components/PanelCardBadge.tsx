import { UserCheck, CalendarX, Flame } from "lucide-react";
import type { PanelCardKind } from "@/lib/panel-cards";

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
// SEM variante de celular (ajuste "só celular" pedido depois, cards
// maiores): 3px já não tem um próximo valor inteiro dentro de ~10-12%
// (3 × 1,1 ≈ 3,3, arredonda pra 3 de volta) — subir pra 4px seria +33%,
// passando muito do "discreto, não exagere" pedido. Fica igual nos dois
// tamanhos de tela de propósito.
export function PanelCardTypeBar({ kind }: { kind: PanelCardKind }) {
  return <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${KIND_STYLE[kind].bar}`} />;
}

// Chip de largura fixa (~92px) + ícone + uma palavra (pedido explícito).
//
// SÓ CELULAR (abaixo de sm/640px, mesmo ajuste de ~10% do resto do card):
// 92px -> 100px de largura (ainda cabe o ícone + a palavra numa linha só,
// nenhum dos 3 rótulos — "Reativação"/"Faltou"/"Quente" — chega a
// quebrar), padding 6px/2px -> 8px/3px, fonte 10px -> 11px, ícone 12px ->
// 13px. `sm:` sempre com os valores de antes, intocados.
export function PanelCardTypeChip({ kind }: { kind: PanelCardKind }) {
  const { chipBg, chipText, icon: Icon, label } = KIND_STYLE[kind];
  return (
    <span
      className={`inline-flex w-[100px] sm:w-[92px] shrink-0 items-center justify-center gap-1 rounded-md ${chipBg} px-2 py-[3px] sm:px-1.5 sm:py-0.5 text-[11px] sm:text-caption font-medium ${chipText}`}
    >
      <Icon className="h-[13px] w-[13px] sm:h-3 sm:w-3 shrink-0" strokeWidth={2.5} />
      {label}
    </span>
  );
}

// Linha de motivo (1 linha, cinza, reticências se passar) — texto já
// pronto (ex.: "120 dias após o procedimento", "Faltou há 3 dias ·
// mensagem 1 de 2", "Perguntou preço/endereço · há 6 dias", ver
// panel-cards.ts/no-show-cards.ts/hot-lead-cards.ts).
//
// SÓ CELULAR: 10px -> 11px (mesmo nível de PanelCardTypeChip acima).
export function PanelCardReasonLine({ reason }: { reason: string }) {
  return <p className="truncate text-[11px] sm:text-caption text-vexo-muted">{reason}</p>;
}
