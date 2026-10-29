// Fonte ÚNICA dos valores "só celular" (abaixo de sm/640px) do Painel
// inteiro — cabeçalho, navegação de semana, seletor de período, gráfico,
// indicadores, títulos de seção e os cards (Reativação/Faltou/Quente/
// Agendamentos). PRÓXIMO AJUSTE: mudar os números abaixo (cada um já é o
// valor FINAL, não uma fórmula — Tailwind precisa da classe literal no
// código pra gerar o CSS, por isso não dá pra guardar só o fator e
// calcular em runtime).
//
// SUBSTITUI o fator anterior (1,28, só dos cards) — agora 1,45, aplicado
// aos valores ORIGINAIS de desktop (nunca ao valor já escalado da rodada
// anterior, que seria compor dois fatores). Cálculo de cada valor: pixel
// de DESKTOP (original, intocado) × 1,45, arredondado ao pixel mais
// próximo — EXCETO quando um mínimo explícito do pedido for maior, caso
// em que o mínimo vale (comentado em cada constante). `sm:` em toda
// constante é SEMPRE o valor de desktop/tablet/notebook — pixel-idêntico
// a antes de qualquer ajuste de celular já feito.
//
// AJUSTE FINO (2026-10-29): o bloco título "Painel" → gráfico "Abordagens
// por dia" (inclusive) ficou grande demais no 1,45 — pedido explícito pra
// usar um fator MENOR só nesse trecho (sem clamping por mínimo: aqui o
// fator manda sozinho). Ver cada constante da seção "Cabeçalho do Painel
// (...) + navegação de semana + gráfico" abaixo pro valor usado. O resto
// do Painel (Período, indicadores, títulos de seção, cards) continua no
// 1,45 original, sem mudança.
//
// Mínimos do pedido original (o maior entre escalado×1,45 e este mínimo
// vale — NÃO se aplica ao bloco reduzido acima, ver AJUSTE FINO):
//   - título "Painel" 28px, texto abaixo 16px, nome da clínica 22px
//   - ícones de status da clínica (badge Instagram/Calendário/WhatsApp) 36px
//   - navegação de semana/seletor de período/rótulos do gráfico: texto 15px,
//     botões/select com 48px de altura
//   - indicadores: rótulo 14px, número 32px
//   - títulos de seção 20px, contador 15px
//   - cards: nome 19px, @ 16px, motivo/horário/status/telefone 15px,
//     chip 14px, ícone do chip 17px, barra lateral 4px, padding 14px,
//     botões de ação 48px de altura mínima, altura mínima do card ~100px
//
// Contraste (pedido explícito, igual rodada anterior): motivo/chip/status
// já medem entre ~5.1:1 e ~15.8:1 contra o fundo de cada card — acima do
// piso de 4.5:1, nenhuma cor precisou mudar.

// Cabeçalho do Painel (título, subtítulo, nome da clínica, ícones de
// status) + navegação de semana + gráfico "Abordagens por dia" ----------
//
// Esse bloco (do título "Painel" até o gráfico, inclusive — título,
// subtítulo, nome da clínica, ícones de status/pontinhos, navegação de
// semana e rótulos do gráfico) usa um fator PRÓPRIO, menor que o resto do
// Painel: pedido explícito de ajuste fino (2026-10-29) — o 1,45 geral
// ficou grande demais nessa região específica, mas não é pra voltar ao
// tamanho pequeno de antes. Fator usado: **1,36** (meio do intervalo
// 1,35-1,38 pedido), sobre os mesmos pixels ORIGINAIS de desktop de
// sempre — SEM clamping pelos mínimos do pedido anterior (28/22/36px
// etc.): aqui o pedido é reduzir de propósito, então o fator manda
// sozinho, arredondado ao pixel mais próximo. O resto do Painel
// (Período/indicadores/títulos de seção/cards) continua no 1,45 de
// sempre, intocado.
//
// Exceção: a altura mínima de toque dos botões "← Semana"/"Hoje"/
// "Semana →" continua em 48px (MOBILE_NAV_BUTTON_MIN, não mudou) — é o
// piso de acessibilidade (WCAG 2.5.5) pedido desde a primeira rodada,
// não um valor calculado por fator; só o texto/padding deles encolheu.

// "Painel": 18px (text-lg) × 1,36 = 24,48 → 24px.
export const MOBILE_TITLE_TEXT = "text-[24px] sm:text-lg";
// Texto abaixo do título: 14px (text-sm) × 1,36 = 19,04 → 19px.
export const MOBILE_SUBTITLE_TEXT = "text-[19px] sm:text-sm";
// Nome da clínica: 16px (text-base) × 1,36 = 21,76 → 22px.
export const MOBILE_CLINIC_NAME_TEXT = "text-[22px] sm:text-base";
// Badge de status (Instagram/Calendário/WhatsApp, ver ChannelStatusPill.tsx):
// 24px (h-6 w-6) × 1,36 = 32,64 → 33px. O ícone do Instagram/WhatsApp
// preenche o badge inteiro (mesma proporção 1:1 de desktop), por isso usa
// o mesmo tamanho do badge.
export const MOBILE_STATUS_BADGE_SIZE = "h-[33px] w-[33px] sm:h-6 sm:w-6";
// Ícone do Google Calendar DENTRO do badge: 12px (h-3 w-3, sempre menor
// que o badge, dentro de um círculo colorido — proporção diferente do
// Instagram/WhatsApp de propósito, desktop já é assim) × 1,36 = 16,32 →
// 16px.
export const MOBILE_STATUS_BADGE_ICON_SIZE = "h-[16px] w-[16px] sm:h-3 sm:w-3";
// Pontinho de conectado/desconectado no canto do badge: 8px (h-2 w-2) ×
// 1,36 = 10,88 → 11px.
export const MOBILE_STATUS_DOT_SIZE = "h-[11px] w-[11px] sm:h-2 sm:w-2";
// Bolinha antes dos títulos de SEÇÃO (Reativação/Agendamentos) — fora do
// bloco reduzido desta rodada (fica no 1,45 de sempre): 6px (h-1.5 w-1.5)
// × 1,45 = 8,7 → 9px.
export const MOBILE_SECTION_DOT_SIZE = "h-[9px] w-[9px] sm:h-1.5 sm:w-1.5";
// Bolinha maior, só antes do nome da clínica — dentro do bloco reduzido
// desta rodada: 8px (h-2 w-2) × 1,36 = 10,88 → 11px (mesmo valor de
// MOBILE_STATUS_DOT_SIZE, constante própria só por clareza de uso).
export const MOBILE_CLINIC_DOT_SIZE = "h-[11px] w-[11px] sm:h-2 sm:w-2";

// Navegação de semana ("← Semana"/"Hoje"/"Semana →") — dentro do bloco
// reduzido desta rodada: 12px (text-xs) × 1,36 = 16,32 → 16px. Padding:
// 10px/4px (px-2.5/py-1) × 1,36 = 13,6/5,44 → 14px/5px.
export const MOBILE_NAV_TEXT = "text-[16px] sm:text-xs";
export const MOBILE_NAV_BUTTON_PADDING = "px-[14px] py-[5px] sm:px-2.5 sm:py-1";
// Altura mínima de toque dos botões de navegação/select — piso de
// acessibilidade (48px, WCAG 2.5.5), não muda com nenhum fator.
export const MOBILE_NAV_BUTTON_MIN = "min-h-[48px] sm:min-h-0";
// Texto do seletor de período e do rótulo "PERÍODO" (ApproachMetricsToggle.tsx)
// — FORA do bloco reduzido desta rodada (o pedido não citou "Período"),
// continua no 1,45 de sempre: 10px (text-caption) × 1,45 = 14,5 → 15px
// (empata com o mínimo antigo de 15px).
export const MOBILE_CHART_TEXT = "text-[15px] sm:text-caption";
export const MOBILE_SELECT_PADDING = "px-[17px] py-[6px] sm:px-3 sm:py-1";
// Legenda "ABORDAGENS POR DIA" e rótulos de dentro do gráfico (dias da
// semana, números) — dentro do bloco reduzido desta rodada: 10px
// (text-caption) × 1,36 = 13,6 → 14px.
export const MOBILE_CHART_ROW_TEXT = "text-[14px] sm:text-caption";
// Largura fixa do rótulo do dia da semana (w-7=28px) e do número de
// abordagens (w-4=16px) no gráfico — mesma proporção do texto acima, pra
// caber sem cortar ("Seg"/"Ter"/etc., número de até 2 dígitos): 28×1,36=
// 38,08→38px; 16×1,36=21,76→22px.
export const MOBILE_CHART_DAY_LABEL_WIDTH = "w-[38px] sm:w-7";
export const MOBILE_CHART_COUNT_WIDTH = "w-[22px] sm:w-4";

// Indicadores (ABORDADOS/EM CONVERSA/AGENDARAM/COMPARECERAM, ver
// PanelMetricCard.tsx) ----------------------------------------------------

// Rótulo: 10px (text-caption) -> ×1,45=14,5: 15 > mínimo (14).
export const MOBILE_METRIC_LABEL_TEXT = "text-[15px] sm:text-caption";
// Número: 24px (text-2xl) -> ×1,45=34,8: 35 > mínimo (32).
export const MOBILE_METRIC_VALUE_TEXT = "text-[35px] sm:text-2xl";
export const MOBILE_METRIC_CARD_PADDING = "px-[15px] py-[12px] sm:px-2.5 sm:py-2";
export const MOBILE_METRIC_VALUE_MARGIN_TOP = "mt-[6px] sm:mt-1";

// Títulos de seção ("Reativação"/"Agendamentos") e contador --------------

// 12px (text-xs) -> ×1,45=17,4: mínimo do pedido (20px) vale.
export const MOBILE_SECTION_TITLE_TEXT = "text-[20px] sm:text-xs";
// Contador ("3 pendências"): 10px (text-caption) -> ×1,45=14,5: 15,
// empata com o mínimo (15px).
export const MOBILE_SECTION_COUNTER_TEXT = "text-[15px] sm:text-caption";

// Espaçamento (padding/gap) dos cards -------------------------------------

// Linha de Reativação: padding 8/10px -> ×1,45: 12/15 — o mínimo geral de
// padding do pedido (14px) é MAIOR que o 12 escalado, então o lado
// simétrico usa 14; o pl extra (que já era maior que o padding simples em
// desktop) escala puro pra 15, que já fica acima do piso de 14 sozinho.
export const MOBILE_REACTIVATION_ROW_PADDING = "p-[14px] pl-[15px] sm:p-2 sm:pl-2.5";
// Linha de Agendamentos: padding 8px -> ×1,45=11,6: mínimo (14px) vale.
export const MOBILE_APPOINTMENT_ROW_PADDING = "p-[14px] sm:p-2";
// Altura mínima do card (pedido novo, ~100px) — garante um piso mesmo
// com nome/motivo curtos (uma linha só); nomes longos (até 2 linhas, ver
// MOBILE_NAME_TEXT_*) naturalmente ultrapassam isso.
export const MOBILE_CARD_MIN_HEIGHT = "min-h-[100px] sm:min-h-0";
// Gap entre avatar/conteúdo/botão dentro da linha: 8px -> ×1,45=11,6→12px.
export const MOBILE_ROW_GAP = "gap-[12px] sm:gap-2";
// Gap entre as linhas da lista (toque: espaço entre os botões de linhas
// vizinhas): 6px -> ×1,45=8,7→9px.
export const MOBILE_LIST_GAP = "space-y-[9px] sm:space-y-1.5";
// Gap vertical entre a linha nome/@ e a linha chip/motivo: 2px -> ×1,45=
// 2,9→3px.
export const MOBILE_STACK_GAP = "space-y-[3px] sm:space-y-0.5";
// Gap nome/@ (quando lado a lado, desktop) e ícone/texto dos botões: 4px
// -> ×1,45=5,8→6px.
export const MOBILE_INLINE_GAP = "gap-[6px] sm:gap-1";
// Gap entre o chip de tipo e a linha de motivo: 6px -> ×1,45=8,7→9px.
export const MOBILE_CHIP_ROW_GAP = "gap-[9px] sm:gap-1.5";
// Gap na linha data · status · telefone dos Agendamentos: 4px -> ×1,45=
// 5,8→6px.
export const MOBILE_DATE_ROW_GAP = "gap-[6px] sm:gap-1";
// Margem acima da linha data/status/telefone: 2px -> ×1,45=2,9→3px.
export const MOBILE_DATE_ROW_MARGIN_TOP = "mt-[3px] sm:mt-0.5";

// Fontes dos cards ---------------------------------------------------------

// Nome (Reativação/Faltou/Quente, antes text-xs/12px): 12×1,45=17,4:
// mínimo do pedido (19px) vale.
export const MOBILE_NAME_TEXT_REACTIVATION = "text-[19px] sm:text-xs";
// Nome (Agendamentos, antes text-sm/14px): 14×1,45=20,3: 20 > mínimo (19).
export const MOBILE_NAME_TEXT_APPOINTMENT = "text-[20px] sm:text-sm";
// @ do lead — mínimo do pedido (16px) vale: escalado seria 10×1,45=14,5→15.
export const MOBILE_HANDLE_TEXT = "text-[16px] sm:text-caption";
// Motivo/horário/status/telefone/chip/rótulos ("Limite diário", "Sem
// WhatsApp"): 10px (text-caption) -> ×1,45=14,5: 15, acima de qualquer
// mínimo pedido pra esse grupo (14 ou 15, "o maior vale" sempre dá 15) —
// um valor só serve todo mundo.
export const MOBILE_SECONDARY_TEXT = "text-[15px] sm:text-caption";
// Texto dos botões de ação (WhatsApp/Instagram/"Enviando…"/"✓"): 11px
// (text-card) -> ×1,45=15,95→16px.
export const MOBILE_BUTTON_TEXT = "text-[16px] sm:text-card";

// @ do lead: SÓ CELULAR vira encolhível no layout empilhado (herda o
// "truncate" ao lado — reticências de verdade quando um @ muito longo não
// couber); em telas ≥640px volta a ser fixo (shrink-0, lado a lado com o
// nome, igual sempre foi).
export const MOBILE_HANDLE_SHRINK = "min-w-0 shrink sm:shrink-0";

// Ícones --------------------------------------------------------------------

// Ícones mono (WhatsApp/Instagram) e ícone do chip: 12px -> ×1,45=17,4:
// 17, empata com o mínimo do chip (17px).
export const MOBILE_ICON_SIZE = "h-[17px] w-[17px] sm:h-3 sm:w-3";

// Chip de tipo ----------------------------------------------------------

// Largura 92 -> ×1,45=133,4→133px (ainda cabe ícone + a palavra numa
// linha só, nenhum dos 3 rótulos — "Reativação"/"Faltou"/"Quente" — chega
// a quebrar). Padding 6/2px -> ×1,45: 9/3px.
export const MOBILE_CHIP_SIZE = "w-[133px] sm:w-[92px] px-[9px] py-[3px] sm:px-1.5 sm:py-0.5";

// Barra lateral colorida -------------------------------------------------

// 3px -> ×1,45=4,35: 4, empata com o mínimo do pedido (4px).
export const MOBILE_BAR_WIDTH = "w-[4px] sm:w-[3px]";

// Avatar (LeadAvatar, SÓ o tamanho "md" — usado exclusivamente pelos dois
// cards desta tela; Pipeline usa "lg" e o banner "precisa de humano" usa
// "sm", nenhum dos dois é afetado) ----------------------------------------

// 32px -> ×1,45=46,4→46px.
export const MOBILE_AVATAR_SIZE = "h-[46px] w-[46px] sm:h-8 sm:w-8";
// Ícone de fallback (sem foto): 16px -> ×1,45=23,2→23px.
export const MOBILE_AVATAR_ICON_SIZE = "h-[23px] w-[23px] sm:h-4 sm:w-4";
// Badge de origem (Instagram) sobreposto no avatar: 12px -> ×1,45=17,4→17px.
export const MOBILE_AVATAR_BADGE_SIZE = "h-[17px] w-[17px] sm:h-3 sm:w-3";

// Botões de ação (WhatsApp/Instagram/retorno/"Retorno"/"Não compareceu") -
// Mínimo de toque do pedido (48px) é maior que o escalado puro (23×1,45≈
// 33px) — por isso altura/largura usam o mínimo fixo, não o fator.

// Altura (WhatsApp/Instagram, retangular — a largura já passa de 48px só
// com o texto do canal): 23px -> 48px (piso).
export const MOBILE_ACTION_BUTTON_HEIGHT = "h-[48px] sm:h-[23px]";
// Altura E largura (botão "✓" de desfazer, quadrado): 23px -> 48px (piso).
export const MOBILE_ACTION_BUTTON_SQUARE = "h-[48px] w-[48px] sm:h-[23px] sm:w-[23px]";
// Padding horizontal dos botões de WhatsApp/Instagram (sem mínimo de
// toque próprio — a altura já garante os 48px; aqui é só o fator): 6px ->
// ×1,45=8,7→9px.
export const MOBILE_ACTION_BUTTON_PADDING_X = "px-[9px] sm:px-1.5";
// "Retorno"/"Não compareceu" não têm altura fixa (texto varia) — usam
// min-h/min-w pra garantir os 48px de toque mesmo com o texto mais curto.
export const MOBILE_TOGGLE_BUTTON_MIN = "min-h-[48px] min-w-[48px] sm:min-h-0 sm:min-w-0";

// Reordenação SÓ CELULAR: nome/@ e chip/motivo trocam de posição -----------
//
// Pedido explícito (nome longo): no celular, a linha do TOPO do card de
// Reativação/Faltou/Quente passa a ser chip+motivo (1 linha); abaixo, o
// nome (até 2 linhas, reticências só depois disso); abaixo dele, o @ (1
// linha, reticências). Em desktop nada muda — a ordem volta a ser nome/@
// primeiro, chip/motivo depois, exatamente como sempre foi.
//
// NÃO é um truque de CSS order: a verificação visual desta rodada achou
// que, com CSS order (um contêiner só, dividindo largura com o botão de
// WhatsApp/Instagram nas duas linhas), o motivo ficava sem nenhum espaço
// sobrando em telas de 320-375px — avatar(46px) + chip(133px fixo) +
// botão de texto completo ("WhatsApp"/"Instagram", ~135px) já esgotavam a
// largura da tela sozinhos, e o motivo sumia (0px, nem reticências).
// ReactivationRail.tsx resolve isso com DOIS blocos de layout (um só
// visível por vez, via sm:hidden/hidden sm:flex): no celular, chip+motivo
// ganham uma linha cheia que NÃO divide espaço com o botão (motivo tem
// que caber sempre, pedido explícito); nome (tolera 2 linhas) e @ (tolera
// truncar) é que dividem a linha de baixo com o botão. Em desktop, o
// segundo bloco reproduz a estrutura de sempre (nome/@ e chip/motivo
// empilhados numa coluna só, ao lado do botão) sem nenhuma mudança.

// Empilha nome (até 2 linhas) acima do @ (1 linha) no celular; lado a
// lado (baseline), como sempre, em telas ≥640px.
export const MOBILE_NAME_HANDLE_STACK = "flex min-w-0 flex-col sm:flex-row sm:items-baseline";

// Nome: até 2 linhas com reticências no celular (line-clamp-2); 1 linha
// com reticências em desktop, igual sempre foi (line-clamp-none desfaz o
// "display: -webkit-box" do line-clamp-2 antes do truncate de sempre
// entrar — mesmo mecanismo já usado na linha de motivo da rodada
// anterior, agora aplicado ao nome em vez do motivo).
export const MOBILE_NAME_CLAMP = "line-clamp-2 sm:line-clamp-none sm:truncate";

// Linha de botões dos Agendamentos (Retorno/Não compareceu) — no celular
// vira uma linha PRÓPRIA, alinhada à direita, abaixo do conteúdo (pedido
// explícito: "numa linha própria alinhada à direita, sem apertar"); em
// desktop volta a ficar ao lado do conteúdo, na mesma linha, como sempre
// foi (w-auto, sem forçar alinhamento).
export const MOBILE_APPOINTMENT_BUTTON_ROW = "flex w-full items-center justify-end gap-[9px] sm:w-auto sm:justify-start sm:gap-1.5";
