// Fonte "só celular" (abaixo de sm/640px) de valores usados por alguns
// componentes do Painel do cliente e do Pipeline/Agendamentos — cada
// constante aqui ainda tem pelo menos um consumidor real; o que sobrava
// sem uso (todo o antigo cabeçalho/navegação de semana/métricas/cards de
// Reativação do Painel, de antes da reorganização — ver docs/design-audit.md)
// foi removido junto com os componentes que só eles serviam
// (PanelActivityColumn.tsx/ApproachMetricsToggle.tsx/PanelMetricCard.tsx/
// PanelCardBadge.tsx). Documentada como fonte PRÓPRIA e separada dos
// tokens novos (rounded-control/control-x/control-y etc., ver DESIGN.md) —
// ao mexer aqui, não duplicar um valor que já existe como token nomeado
// lá. Cada valor já é a classe FINAL (Tailwind precisa da classe literal
// no código pra gerar o CSS, não dá pra guardar só um fator e calcular em
// runtime); `sm:` é sempre o valor de desktop/tablet/notebook, intocado.

// Badge de status (Instagram/Calendário/WhatsApp, ver ChannelStatusPill.tsx).
export const MOBILE_STATUS_BADGE_SIZE = "h-[31px] w-[31px] sm:h-6 sm:w-6";
export const MOBILE_STATUS_DOT_SIZE = "h-[10px] w-[10px] sm:h-2 sm:w-2";

// Legenda e rótulos do gráfico "Abordagens por dia" (ver ApproachChart.tsx).
export const MOBILE_CHART_ROW_TEXT = "text-[13px] sm:text-caption";
export const MOBILE_CHART_DAY_LABEL_WIDTH = "w-[36px] sm:w-7";
export const MOBILE_CHART_COUNT_WIDTH = "w-[21px] sm:w-4";

// Gap entre ícone e texto dos botões de ação (WhatsApp/Instagram da
// Reativação, "Retorno" do Agendamento — ver ReactivationActionButtonStyle.ts/
// RetornoButton.tsx).
export const MOBILE_INLINE_GAP = "gap-[5px] sm:gap-1";

// Texto dos botões "Retorno"/"Não compareceu" do card de Agendamento (ver
// RetornoButton.tsx/NoShowButton.tsx) — MOBILE_SECONDARY_TEXT é o mesmo
// valor, usado só por NoShowButton.tsx.
export const MOBILE_SECONDARY_TEXT = "text-[13px] sm:text-caption";
export const MOBILE_APPOINTMENT_SECONDARY_TEXT = "text-[12px] sm:text-caption";
// Texto da tag de status compacta (AppointmentStatusBadge, modo compact) na
// coluna Agendamentos do Painel.
export const MOBILE_APPOINTMENT_INFO_TEXT = "text-[13px] sm:text-caption";
// Texto dos botões de ação (WhatsApp/Instagram/"Enviando…"/"✓" — ver
// ReactivationActionButtonStyle.ts).
export const MOBILE_BUTTON_TEXT = "text-[12px] sm:text-card";

// Ícones mono (WhatsApp/Instagram) dentro dos botões de ação da faixa
// "Para fazer hoje" (ver ReactivationRail.tsx/InstagramDmButton.tsx).
export const MOBILE_ICON_SIZE = "h-[12px] w-[12px] sm:h-3 sm:w-3";

// Avatar (LeadAvatar.tsx) — "md" é usado pelo banner "precisa de humano"
// através do tamanho "sm" (não afetado); "appointment" é o tamanho usado
// pela faixa "Para fazer hoje" e pela coluna Agendamentos do Painel.
export const MOBILE_AVATAR_SIZE = "h-[28px] w-[28px] sm:h-8 sm:w-8";
export const MOBILE_AVATAR_ICON_SIZE = "h-[14px] w-[14px] sm:h-4 sm:w-4";
export const MOBILE_AVATAR_BADGE_SIZE = "h-[10px] w-[10px] sm:h-3 sm:w-3";
export const MOBILE_APPOINTMENT_AVATAR_SIZE = "h-[34px] w-[34px] sm:h-8 sm:w-8";
export const MOBILE_APPOINTMENT_AVATAR_ICON_SIZE = "h-[17px] w-[17px] sm:h-4 sm:w-4";

// Botões de ação (ver ReactivationActionButtonStyle.ts/NoShowButton.tsx/
// RetornoButton.tsx) — piso de toque (altura/largura mínima) e padding.
export const MOBILE_ACTION_BUTTON_HEIGHT = "h-[32px] sm:h-[23px]";
export const MOBILE_ACTION_BUTTON_SQUARE = "h-[32px] w-[32px] sm:h-[23px] sm:w-[23px]";
export const MOBILE_ACTION_BUTTON_PADDING_X = "px-[8px] sm:px-1.5";
export const MOBILE_TOGGLE_BUTTON_MIN = "min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0";
export const MOBILE_APPOINTMENT_BUTTON_ICON_SIZE = "h-[12px] w-[12px] sm:h-3 sm:w-3";
