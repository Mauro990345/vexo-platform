// Fonte ÚNICA dos valores "só celular" (abaixo de sm/640px) dos cards da
// lista de Reativação (ReactivationRail.tsx/PanelCardBadge.tsx) e da lista
// de Agendamentos do Painel (ClientPanelView.tsx/AppointmentStatusBadge.tsx/
// NoShowButton.tsx) — pedido explícito: leitura mais fácil pra público 45+,
// e "centralizar pra próximo ajuste ser mudar um número". PRÓXIMO AJUSTE:
// mudar os números abaixo (cada um já é o valor FINAL, não uma fórmula —
// Tailwind precisa da classe literal no código pra gerar o CSS, por isso
// não dá pra guardar só o fator e calcular em runtime).
//
// Cálculo de cada valor: pixel ATUAL de celular (já em produção, incluindo
// o ajuste anterior) × 1,28 (+28%, meta pedida), arredondado ao pixel mais
// próximo — EXCETO quando um mínimo explícito do pedido for maior, caso em
// que o mínimo vale (comentado em cada constante). Mínimos do pedido:
//   - nenhum texto abaixo de 13px
//   - @ do lead a partir de 16px
//   - linha de motivo e horário a partir de 14px
//   - palavra do chip a partir de 13px
//   - botões de ação (WhatsApp/Instagram/retorno/"Não compareceu"): pelo
//     menos 44px de altura E de largura de toque
// `sm:` em toda constante é SEMPRE o valor de ANTES desta mudança — tablet/
// notebook/desktop ficam pixel-idênticos.
//
// Contraste (pedido explícito): motivo (vexo-muted), chip (blue/purple/
// orange-400) e status (vexo-muted ou vexo-fg sobre os tons tingidos de
// statusTint) já medem entre ~5.1:1 e ~15.8:1 contra o fundo de cada card —
// acima do piso de 4.5:1 pedido, então nenhuma cor precisou mudar.

// Espaçamento (padding/gap) ----------------------------------------------

// Linha de Reativação: padding 10/12px -> 13/15px (×1,28).
export const MOBILE_REACTIVATION_ROW_PADDING = "p-[13px] pl-[15px] sm:p-2 sm:pl-2.5";
// Linha de Agendamentos: padding 10px -> 13px (×1,28, simétrico, sem pl extra).
export const MOBILE_APPOINTMENT_ROW_PADDING = "p-[13px] sm:p-2";
// Gap entre avatar/conteúdo/botão dentro da linha: 8px -> 10px.
export const MOBILE_ROW_GAP = "gap-[10px] sm:gap-2";
// Gap entre as linhas da lista (toque: espaço entre os botões de linhas
// vizinhas): 6px -> 8px.
export const MOBILE_LIST_GAP = "space-y-[8px] sm:space-y-1.5";
// Gap vertical entre a linha nome/@ e a linha chip/motivo: 2px -> 3px.
export const MOBILE_STACK_GAP = "space-y-[3px] sm:space-y-0.5";
// Gap nome/@ (baseline) e ícone/texto dos botões: 4px -> 5px.
export const MOBILE_INLINE_GAP = "gap-[5px] sm:gap-1";
// Gap entre o chip de tipo e a linha de motivo: 6px -> 8px.
export const MOBILE_CHIP_ROW_GAP = "gap-[8px] sm:gap-1.5";
// Gap na linha data · status · telefone dos Agendamentos: 4px -> 5px.
export const MOBILE_DATE_ROW_GAP = "gap-[5px] sm:gap-1";
// Margem acima da linha data/status/telefone: 2px -> 3px.
export const MOBILE_DATE_ROW_MARGIN_TOP = "mt-[3px] sm:mt-0.5";

// Fontes -------------------------------------------------------------------

// Nome (Reativação, antes text-xs/12px -> celular 13px): 13 -> 17px.
export const MOBILE_NAME_TEXT_REACTIVATION = "text-[17px] sm:text-xs";
// Nome (Agendamentos, antes text-sm/14px -> celular 15px): 15 -> 19px.
export const MOBILE_NAME_TEXT_APPOINTMENT = "text-[19px] sm:text-sm";
// @ do lead — mínimo do pedido (16px) vale: escalado seria 11×1,28≈14px.
export const MOBILE_HANDLE_TEXT = "text-[16px] sm:text-caption";
// Motivo/horário/chip/status/rótulos — mínimo de motivo/horário (14px)
// coincide com o escalado (11×1,28≈14px) e também cobre o mínimo do chip
// (13px) e o piso geral (13px), por isso os quatro usam o mesmo valor.
export const MOBILE_SECONDARY_TEXT = "text-[14px] sm:text-caption";
// Texto dos botões de ação (WhatsApp/Instagram/"Enviando…"/"✓"): 12 -> 15px.
export const MOBILE_BUTTON_TEXT = "text-[15px] sm:text-card";
// @ do lead: SÓ CELULAR vira encolhível (herda o "truncate" ao lado —
// reticências de verdade quando um @ muito longo não couber) — em telas
// ≥640px volta a ser fixo (shrink-0, igual sempre foi). Achado na
// verificação visual deste ajuste: com o @ maior (16px, mínimo do pedido),
// um @ extremamente longo com shrink-0 não encolhe nunca, e o "truncate"
// não tem onde cortar (a caixa nunca fica menor que o texto) — o texto
// então estoura a linha sem reticências. Encolhível resolve sem mudar o
// caso comum (@ curto continua aparecendo inteiro, só cede espaço quando
// realmente não cabe).
export const MOBILE_HANDLE_SHRINK = "min-w-0 shrink sm:shrink-0";

// Ícones --------------------------------------------------------------------

// Ícones mono (WhatsApp/Instagram) e ícone do chip: 13 -> 17px.
export const MOBILE_ICON_SIZE = "h-[17px] w-[17px] sm:h-3 sm:w-3";

// Chip de tipo ----------------------------------------------------------

// Largura 100 -> 128px, padding 8/3 -> 10/4px (ainda cabe ícone + 1 palavra
// numa linha só nos 3 rótulos: "Reativação"/"Faltou"/"Quente").
export const MOBILE_CHIP_SIZE = "w-[128px] sm:w-[92px] px-[10px] py-[4px] sm:px-1.5 sm:py-0.5";

// Barra lateral colorida -------------------------------------------------

// 3 -> 4px (ajuste anterior tinha deixado sem variante de celular porque
// 3×1,1 arredondava de volta pra 3; com o fator de 1,28 deste pedido,
// 3×1,28≈3,84 já sobe pra 4px).
export const MOBILE_BAR_WIDTH = "w-[4px] sm:w-[3px]";

// Avatar (LeadAvatar, SÓ o tamanho "md" — usado exclusivamente pelos dois
// cards desta tela; Pipeline usa "lg" e o banner "precisa de humano" usa
// "sm", nenhum dos dois é afetado) ----------------------------------------

// 32 -> 41px.
export const MOBILE_AVATAR_SIZE = "h-[41px] w-[41px] sm:h-8 sm:w-8";
// Ícone de fallback (sem foto): 16 -> 20px.
export const MOBILE_AVATAR_ICON_SIZE = "h-[20px] w-[20px] sm:h-4 sm:w-4";
// Badge de origem (Instagram) sobreposto no avatar: 12 -> 15px.
export const MOBILE_AVATAR_BADGE_SIZE = "h-[15px] w-[15px] sm:h-3 sm:w-3";

// Botões de ação (WhatsApp/Instagram/retorno/"Não compareceu") -----------
// Mínimo de toque do pedido (44px) é maior que o escalado puro (25×1,28=
// 32px) — por isso altura/largura usam o mínimo fixo, não o fator.

// Altura (WhatsApp/Instagram, retangular — a largura já passa de 44px só
// com o texto do canal): 25 -> 44px.
export const MOBILE_ACTION_BUTTON_HEIGHT = "h-[44px] sm:h-[23px]";
// Altura E largura (botão "✓" de desfazer, quadrado): 25 -> 44px.
export const MOBILE_ACTION_BUTTON_SQUARE = "h-[44px] w-[44px] sm:h-[23px] sm:w-[23px]";
// Padding horizontal dos botões de WhatsApp/Instagram (não tem mínimo de
// toque próprio — a altura já garante os 44px; aqui é só o fator): 7 -> 9px.
export const MOBILE_ACTION_BUTTON_PADDING_X = "px-[9px] sm:px-1.5";
// "Não compareceu" não tem altura fixa (texto varia) — usa min-h/min-w pra
// garantir os 44px de toque mesmo com o texto mais curto ("Faltou ✓").
export const MOBILE_TOGGLE_BUTTON_MIN = "min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0";
