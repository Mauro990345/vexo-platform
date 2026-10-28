// Estilo compartilhado dos botões de ação da lista de Reativação
// (WhatsApp e Instagram, ver ReactivationRail.tsx/InstagramDmButton.tsx) —
// CONTORNO minimalista, bem compacto: ~23px de altura, fonte 11px
// (text-card), ícone 12-13px (h-3, ver uso em ReactivationRail.tsx/
// InstagramDmButton.tsx), padding horizontal reduzido, sem sombra/brilho.
// Mesmo tamanho/formato nos dois canais — só a cor da borda e do hover
// muda. A linha da lista não cresce com isso (botão sempre menor que a
// altura da linha).
//
// SÓ CELULAR (abaixo de sm/640px, pedido explícito — aumento de ~10%,
// "não exagere"): 23px -> 25px de altura, padding horizontal 6px -> 7px,
// fonte 11px -> 12px (mesmo nível de text-card acima). Os valores com
// `sm:` são os de SEMPRE (idênticos a antes desta mudança) — em tablet/
// notebook/desktop nada muda. Mobile-first: a classe sem prefixo vale até
// sm, a com `sm:` assume a partir de 640px.
export const REACTIVATION_ACTION_BUTTON_BASE_CLASS =
  "inline-flex h-[25px] sm:h-[23px] shrink-0 items-center justify-center gap-1 rounded-lg px-[7px] sm:px-1.5 text-[12px] sm:text-card font-semibold leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vexo-accent focus-visible:ring-offset-1 focus-visible:ring-offset-vexo-surface disabled:cursor-not-allowed disabled:opacity-40";

// WhatsApp: borda num token PRÓPRIO e fixo (vexo-whatsappActionBorder,
// ver globals.css) — não mais o mesmo token do badge "Compareceu"
// (vexo-panelStatusCompletedBg). Motivo (ajuste de 2026-10): o badge
// "Compareceu" passou a usar um verde mais vivo, e esse badge também pode
// ser personalizado por clínica em Configurações — o botão NÃO pode
// acompanhar nenhuma dessas mudanças (pedido explícito, aparência
// idêntica), por isso um valor travado, igual ao que o badge usava antes
// desse ajuste (#1f7a4d). Texto/ícone continuam em vexo-success (token já
// existente, inalterado por este ajuste). Hover continua no tom da BORDA
// a 10% de opacidade (pedido explícito — não muda).
export const WHATSAPP_ACTION_BUTTON_CLASS = `${REACTIVATION_ACTION_BUTTON_BASE_CLASS} border border-vexo-whatsappActionBorder text-vexo-success hover:bg-vexo-whatsappActionBorder/10`;

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

// Substitui o botão de ação (WhatsApp OU Instagram, mesmo lugar na linha)
// quando o card já foi marcado como enviado (ver ReactivationRail) — só um
// "✓", sem contorno/fundo, bem mais discreto que os botões acima de
// propósito (a linha inteira já está apagada a 50% de opacidade; este
// elemento não precisa chamar atenção, só precisa existir pra desfazer).
// Mesma altura/base dos outros dois (REACTIVATION_ACTION_BUTTON_BASE_CLASS)
// pra linha não mudar de altura ao trocar de estado — largura fixa igual à
// altura (ícone quadrado) em vez do padding horizontal dos outros dois, que
// têm texto do canal ao lado. vexo-success (mesmo token de "concluído" já
// usado no "✓" do badge "Compareceu", ver AppointmentStatusBadge.tsx) —
// hover em vexo-muted, só pra indicar que é clicável, sem outra cor nova.
// Mesmo ajuste só-celular de REACTIVATION_ACTION_BUTTON_BASE_CLASS acima
// (23px -> 25px, mesmo quadrado w=h, fonte 11px -> 12px) — continua sem
// usar a base class de propósito (motivo de sempre: largura fixa igual à
// altura, não padding horizontal com texto do canal ao lado).
export const REACTIVATION_UNDO_BUTTON_CLASS =
  "inline-flex h-[25px] w-[25px] sm:h-[23px] sm:w-[23px] shrink-0 items-center justify-center rounded-lg text-[12px] sm:text-card font-semibold leading-none text-vexo-success transition-colors duration-150 hover:text-vexo-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vexo-accent focus-visible:ring-offset-1 focus-visible:ring-offset-vexo-surface";
