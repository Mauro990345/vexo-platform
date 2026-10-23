// Estilo compartilhado dos botões de ação da lista de Reativação
// (WhatsApp e Instagram, ver ReactivationRail.tsx/InstagramDmButton.tsx) —
// mesmo tamanho/formato pros dois, só o gradiente de fundo muda. Altura
// compacta de propósito (px-2 py-1, igual ao resto da linha) — a linha da
// lista não pode crescer. "Elevação" ao passar o mouse e "afundamento" ao
// clicar são só translate (sem mudar a sombra, que fica sempre shadow-card
// — leve, sem brilho/glow, pedido explícito).
export const REACTIVATION_ACTION_BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-caption font-semibold text-vexo-fg shadow-card transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vexo-accent focus-visible:ring-offset-1 focus-visible:ring-offset-vexo-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0";

// Mesmos 2 tons do gradiente verde já desenhado dentro de
// WhatsAppGlyphIcon (BrandIcons.tsx) — não um verde novo, só reaplicado
// como fundo do botão em vez de fundo do SVG do ícone.
export const WHATSAPP_ACTION_GRADIENT = "linear-gradient(180deg, #5BD066 0%, #27B43E 100%)";

// Subconjunto dos 4 tons do gradiente do InstagramGlyphIcon (sem o
// amarelo mais claro/vibrante da ponta) — "saturação contida" pedida,
// sem introduzir nenhum tom que não exista já no glifo oficial.
export const INSTAGRAM_ACTION_GRADIENT = "linear-gradient(135deg, #F47133 0%, #BC3081 55%, #4F5BD5 100%)";
