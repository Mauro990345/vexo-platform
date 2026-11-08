import { MOBILE_ACTION_BUTTON_HEIGHT, MOBILE_ACTION_BUTTON_SQUARE, MOBILE_ACTION_BUTTON_PADDING_X, MOBILE_BUTTON_TEXT, MOBILE_INLINE_GAP } from "@/components/MobileCardScale";

// Estilo compartilhado dos botões de ação da lista "Para fazer hoje"
// (WhatsApp e Instagram, ver ReactivationRail.tsx/InstagramDmButton.tsx) —
// CONTORNO minimalista, bem compacto: ~23px de altura, fonte 11px
// (text-card), padding horizontal reduzido, sem sombra/brilho.
//
// NEUTRO (pedido explícito do ajuste pós-reorganização do Painel, ver
// docs/design-audit.md): antes cada canal tinha sua própria cor de borda/
// texto (verde WhatsApp, degradê Instagram), competindo visualmente com a
// etiqueta de tipo da linha. Agora os dois usam a MESMA classe (contorno
// cinza fino, texto neutro) — a cor da marca fica só no ÍCONE
// (WhatsAppGlyphIcon/InstagramGlyphIcon, ver BrandIcons.tsx — já é a cor
// real da marca, mesmo tratamento usado no cabeçalho/avatar), nunca mais
// no botão em si.
//
// SÓ CELULAR (abaixo de sm/640px, pedido explícito — fator único 1,45
// sobre os valores de desktop + piso de toque de 48px, ver
// MobileCardScale.ts): 23px -> 48px de altura (piso de toque, maior que o
// fator puro), padding horizontal 6px -> 9px, fonte 11px -> 16px. Os
// valores com `sm:` são os de SEMPRE (idênticos a antes de qualquer ajuste
// de celular) — em tablet/notebook/desktop nada muda. Mobile-first: a
// classe sem prefixo vale até sm, a com `sm:` assume a partir de 640px.
export const REACTIVATION_ACTION_BUTTON_BASE_CLASS =
  `inline-flex ${MOBILE_ACTION_BUTTON_HEIGHT} shrink-0 items-center justify-center ${MOBILE_INLINE_GAP} rounded-lg border border-vexo-border ${MOBILE_ACTION_BUTTON_PADDING_X} ${MOBILE_BUTTON_TEXT} font-semibold leading-none text-vexo-muted transition-colors duration-150 hover:border-vexo-accent hover:text-vexo-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vexo-accent focus-visible:ring-offset-1 focus-visible:ring-offset-vexo-surface disabled:cursor-not-allowed disabled:opacity-40`;

// Os dois canais usam exatamente a mesma classe agora — mantidos como
// nomes separados só pra não precisar tocar nos call-sites
// (ReactivationRail.tsx/InstagramDmButton.tsx continuam importando cada
// um pelo nome do seu próprio canal).
export const WHATSAPP_ACTION_BUTTON_CLASS = REACTIVATION_ACTION_BUTTON_BASE_CLASS;
export const INSTAGRAM_ACTION_BUTTON_CLASS = REACTIVATION_ACTION_BUTTON_BASE_CLASS;

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
// (23px -> 48px, mesmo quadrado w=h, fonte 11px -> 16px — piso de toque do
// pedido) — continua sem usar a base class de propósito (motivo de
// sempre: largura fixa igual à altura, não padding horizontal com texto
// do canal ao lado).
export const REACTIVATION_UNDO_BUTTON_CLASS =
  `inline-flex ${MOBILE_ACTION_BUTTON_SQUARE} shrink-0 items-center justify-center rounded-lg ${MOBILE_BUTTON_TEXT} font-semibold leading-none text-vexo-success transition-colors duration-150 hover:text-vexo-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vexo-accent focus-visible:ring-offset-1 focus-visible:ring-offset-vexo-surface`;
