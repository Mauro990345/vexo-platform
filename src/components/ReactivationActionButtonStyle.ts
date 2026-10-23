// Estilo compartilhado dos botões de ação da lista de Reativação
// (WhatsApp e Instagram, ver ReactivationRail.tsx/InstagramDmButton.tsx) —
// CONTORNO minimalista (pedido explícito — era preenchido, trocado por um
// visual mais sóbrio/elegante), mesmas cores de antes. Compactos: ~26px de
// altura, fonte 11px (text-card, dentro da faixa 11-12px pedida), ícone
// 14px (h-3.5, ver uso em ReactivationRail.tsx/InstagramDmButton.tsx),
// sem sombra/brilho. Mesmo tamanho/formato nos dois canais — só a cor da
// borda e do hover muda.
export const REACTIVATION_ACTION_BUTTON_BASE_CLASS =
  "inline-flex h-[26px] shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-card font-semibold leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vexo-accent focus-visible:ring-offset-1 focus-visible:ring-offset-vexo-surface disabled:cursor-not-allowed disabled:opacity-40";

// WhatsApp: contorno + texto no MESMO verde já usado em todo o resto do
// produto pra "sucesso/positivo" (vexo-success — token existente, não uma
// cor nova; é também o tom geral do gradiente do glifo oficial, ver
// BrandIcons.tsx). Hover: o mesmo verde a 10% de opacidade no fundo —
// pedido exato, bg-vexo-success/10.
export const WHATSAPP_ACTION_BUTTON_CLASS = `${REACTIVATION_ACTION_BUTTON_BASE_CLASS} border border-vexo-success text-vexo-success hover:bg-vexo-success/10`;

// Instagram: CSS não tem "borda em degradê" direto — sem token/cor nova
// pra resolver isso, a forma mais simples e robusta é o truque do wrapper
// com 1px de padding preenchido pelo degradê (ver INSTAGRAM_ACTION_GRADIENT
// abaixo) + um "miolo" com a cor de fundo do card por dentro (bg-vexo-surface,
// a mesma da linha da lista) — sobra só 1px visível do degradê, como uma
// borda. Implementado em InstagramDmButton.tsx. Texto/ícone no tom claro
// já usado em toda a tela pra texto sobre fundo escuro (text-vexo-fg) —
// nenhum dos 4 tons do degradê (amarelo/laranja/magenta/azul) é "claro" o
// bastante pra servir de cor de texto legível, então reaproveitar vexo-fg
// (em vez de inventar um "branco rosado" que não existe na paleta) é o
// que respeita o pedido de só usar cor que já existe.
export const INSTAGRAM_ACTION_GRADIENT = "linear-gradient(135deg, #F47133 0%, #BC3081 55%, #4F5BD5 100%)";
export const INSTAGRAM_ACTION_BUTTON_CLASS = `${REACTIVATION_ACTION_BUTTON_BASE_CLASS} relative z-10 w-full border-none bg-transparent text-vexo-fg`;
