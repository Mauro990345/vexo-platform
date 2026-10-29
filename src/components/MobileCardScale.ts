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
// AJUSTE FINO 2 (mesmo dia, pedido seguinte): o 1,36 da primeira rodada
// ainda estava grande — reduzido pra **1,29** (meio do intervalo 1,28-
// 1,30 pedido), mesmo bloco, mesmo cálculo (pixel de desktop × fator,
// sem clamping por mínimo). Também nesta rodada: os cards de Reativação/
// Faltou/Quente/Agendamentos ganharam uma escala PRÓPRIA, mais compacta
// (pra ficar "proporcional aos cards de métricas" — pedido explícito),
// ver seções "Espaçamento dos cards", "Fontes dos cards", "Ícones",
// "Chip de tipo", "Avatar" e "Botões de ação" mais abaixo.
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
// Painel: pedido explícito de ajuste fino (2026-10-29, 2 rodadas no mesmo
// dia) — o 1,45 geral ficou grande demais nessa região específica, mas
// não é pra voltar ao tamanho pequeno de antes. Fator usado agora:
// **1,29** (meio do intervalo 1,28-1,30 pedido na 2ª rodada — a 1ª usou
// 1,36, que ainda estava grande), sobre os mesmos pixels ORIGINAIS de
// desktop de sempre — SEM clamping pelos mínimos do pedido original
// (28/22/36px etc.): aqui o pedido é reduzir de propósito, então o fator
// manda sozinho, arredondado ao pixel mais próximo. O resto do Painel
// (Período/indicadores/títulos de seção) continua no 1,45 de sempre,
// intocado; os cards (Reativação/Faltou/Quente/Agendamentos) ganharam
// escala própria nesta 2ª rodada (ver seções mais abaixo).
//
// Exceção: a altura mínima de toque dos botões "← Semana"/"Hoje"/
// "Semana →" continua em 48px (MOBILE_NAV_BUTTON_MIN, não mudou) — é o
// piso de acessibilidade (WCAG 2.5.5) pedido desde a primeira rodada,
// não um valor calculado por fator; só o texto/padding deles encolheu.

// "Painel": 18px (text-lg) × 1,29 = 23,22 → 23px.
export const MOBILE_TITLE_TEXT = "text-[23px] sm:text-lg";
// Texto abaixo do título: 14px (text-sm) × 1,29 = 18,06 → 18px. Entrelinha
// e espaço até o título reduzidos à parte — ver leading-tight/mt no uso
// em ClientPanelView.tsx (pedido explícito: "espaçamento entre linhas
// grande demais").
export const MOBILE_SUBTITLE_TEXT = "text-[18px] sm:text-sm";
// Nome da clínica: 16px (text-base) × 1,29 = 20,64 → 21px.
export const MOBILE_CLINIC_NAME_TEXT = "text-[21px] sm:text-base";
// Badge de status (Instagram/Calendário/WhatsApp, ver ChannelStatusPill.tsx):
// 24px (h-6 w-6) × 1,29 = 30,96 → 31px. O ícone do Instagram/WhatsApp
// preenche o badge inteiro (mesma proporção 1:1 de desktop), por isso usa
// o mesmo tamanho do badge.
export const MOBILE_STATUS_BADGE_SIZE = "h-[31px] w-[31px] sm:h-6 sm:w-6";
// Ícone do Google Calendar DENTRO do badge: 12px (h-3 w-3, sempre menor
// que o badge, dentro de um círculo colorido — proporção diferente do
// Instagram/WhatsApp de propósito, desktop já é assim) × 1,29 = 15,48 →
// 15px.
export const MOBILE_STATUS_BADGE_ICON_SIZE = "h-[15px] w-[15px] sm:h-3 sm:w-3";
// Pontinho de conectado/desconectado no canto do badge: 8px (h-2 w-2) ×
// 1,29 = 10,32 → 10px.
export const MOBILE_STATUS_DOT_SIZE = "h-[10px] w-[10px] sm:h-2 sm:w-2";
// Bolinha antes dos títulos de SEÇÃO (Reativação/Agendamentos) — fora do
// bloco reduzido desta rodada (fica no 1,45 de sempre): 6px (h-1.5 w-1.5)
// × 1,45 = 8,7 → 9px.
export const MOBILE_SECTION_DOT_SIZE = "h-[9px] w-[9px] sm:h-1.5 sm:w-1.5";
// Bolinha maior, só antes do nome da clínica — dentro do bloco reduzido
// desta rodada: 8px (h-2 w-2) × 1,29 = 10,32 → 10px (mesmo valor de
// MOBILE_STATUS_DOT_SIZE, constante própria só por clareza de uso).
export const MOBILE_CLINIC_DOT_SIZE = "h-[10px] w-[10px] sm:h-2 sm:w-2";

// Navegação de semana ("← Semana"/"Hoje"/"Semana →") — dentro do bloco
// reduzido desta rodada: 12px (text-xs) × 1,29 = 15,48 → 15px. Padding:
// 10px/4px (px-2.5/py-1) × 1,29 = 12,9/5,16 → 13px/5px.
export const MOBILE_NAV_TEXT = "text-[15px] sm:text-xs";
export const MOBILE_NAV_BUTTON_PADDING = "px-[13px] py-[5px] sm:px-2.5 sm:py-1";
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
// (text-caption) × 1,29 = 12,9 → 13px.
export const MOBILE_CHART_ROW_TEXT = "text-[13px] sm:text-caption";
// Largura fixa do rótulo do dia da semana (w-7=28px) e do número de
// abordagens (w-4=16px) no gráfico — mesma proporção do texto acima, pra
// caber sem cortar ("Seg"/"Ter"/etc., número de até 2 dígitos): 28×1,29=
// 36,12→36px; 16×1,29=20,64→21px.
export const MOBILE_CHART_DAY_LABEL_WIDTH = "w-[36px] sm:w-7";
export const MOBILE_CHART_COUNT_WIDTH = "w-[21px] sm:w-4";

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
//
// AJUSTE (2026-10-29, 2ª rodada): pedido explícito pra ficar "proporcional
// aos cards de métricas" (PanelMetricCard, ~15px rótulo/35px número/12px
// de padding) — os cards de Reativação/Faltou/Quente/Agendamentos tinham
// MUITOS elementos grandes empilhados (avatar 46px + chip 133px + nome
// 19-20px + botão 48px + gaps generosos + piso de 100px de altura) que,
// somados, deixavam o card bem mais alto que um card de métrica, mesmo
// com fontes individualmente não tão diferentes. Fator usado agora nesse
// grupo (padding/gap/nome/@/chip/avatar/ícones): **1,29** (mesmo da
// seção de cabeçalho acima, por consistência), sobre os mesmos pixels de
// desktop — EXCETO altura dos botões de ação (ver seção própria mais
// abaixo, não é um valor de fator) e o motivo/data/status/telefone
// (MOBILE_SECONDARY_TEXT, mantido em 15px de propósito — já estava no
// "mesmo nível" do rótulo do card de métrica, e o pedido foi "mantenha
// motivo visível e sem cortar", não reduzir mais).

// Linha de Reativação: padding 8/10px (p-2/pl-2.5) × 1,29 = 10,32/12,9 →
// 10px/13px.
export const MOBILE_REACTIVATION_ROW_PADDING = "p-[10px] pl-[13px] sm:p-2 sm:pl-2.5";
// Linha de Agendamentos: reduzido mais uma vez (2026-10-29, 3ª rodada) —
// pedido explícito pra ficar do tamanho de um card de métrica (ver
// MOBILE_CARD_MIN_HEIGHT abaixo); 8px (p-2) não escala mais por fator
// aqui, é o mesmo valor de desktop.
export const MOBILE_APPOINTMENT_ROW_PADDING = "p-[8px] sm:p-2";
// Altura mínima do card: AJUSTE (2026-10-29, 3ª rodada) — pedido
// explícito pra medir contra a altura REAL (DOM) dos cards de métrica
// (PanelMetricCard) e ficar parecido (tolerância de até +15%). Medido
// via Playwright offline: PanelMetricCard ~89,5px de altura a 375px.
// 56px aqui é só um PISO (não um valor de fator) — o card de Agendamentos
// raramente bate nele: com avatar+nome+@ numa linha e data/status/
// telefone na linha de baixo (ver reestruturação em ClientPanelView.tsx),
// a altura natural já fica entre ~53px (2 linhas, caso comum) e ~90px
// (3 linhas, quando o telefone não cabe ao lado de data+status+botão e
// quebra sozinho pra uma linha própria — ver comentário no date-row em
// ClientPanelView.tsx) — sempre dentro da margem de +15% medida.
export const MOBILE_CARD_MIN_HEIGHT = "min-h-[56px] sm:min-h-0";
// Gap entre avatar/conteúdo/botão dentro da linha: reduzido de 10 pra
// 8px nesta rodada (não é mais um valor de fator puro — ajuste pra
// aproximar da densidade do card de métrica).
export const MOBILE_ROW_GAP = "gap-[8px] sm:gap-2";
// Gap entre o conteúdo (avatar+texto) e o botão de ação dos Agendamentos
// — SÓ nesse card (ReactivationRail usa MOBILE_ROW_GAP tanto pro gap
// externo quanto pro interno; aqui os dois viraram valores diferentes
// nesta rodada, por isso uma constante própria): 6px.
export const MOBILE_APPOINTMENT_ACTION_GAP = "gap-[6px] sm:gap-2";
// Gap entre as linhas da lista: 6px (space-y-1.5) × 1,29 = 7,74 → 8px.
export const MOBILE_LIST_GAP = "space-y-[8px] sm:space-y-1.5";
// Gap vertical entre a linha nome/@ e a linha chip/motivo: 2px
// (space-y-0.5) × 1,29 = 2,58 → 3px.
export const MOBILE_STACK_GAP = "space-y-[3px] sm:space-y-0.5";
// Gap nome/@ (quando lado a lado, desktop) e ícone/texto dos botões: 4px
// (gap-1) × 1,29 = 5,16 → 5px.
export const MOBILE_INLINE_GAP = "gap-[5px] sm:gap-1";
// Gap entre o chip de tipo e a linha de motivo: 6px (gap-1.5) × 1,29 =
// 7,74 → 8px.
export const MOBILE_CHIP_ROW_GAP = "gap-[8px] sm:gap-1.5";
// Gap na linha data · status · telefone dos Agendamentos — AJUSTE
// (2026-10-29, 3ª rodada): a linha virou flex-wrap (pedido explícito, só
// quebra quando não cabe — ver ClientPanelView.tsx, agrupado em "data ·"
// / badge / "· telefone" pra nunca sobrar um "·" sozinho numa linha);
// gap-x/gap-y separados porque o gap vertical entre as linhas quebradas
// precisa ser 0 (a margem já vem de fora, mt abaixo), só o horizontal
// mantém espaço entre os grupos: 5px.
export const MOBILE_DATE_ROW_GAP = "gap-x-[5px] gap-y-0 sm:gap-1";
// Margem acima da linha data/status/telefone: 2px.
export const MOBILE_DATE_ROW_MARGIN_TOP = "mt-[2px] sm:mt-0.5";

// Fontes dos cards ---------------------------------------------------------

// Nome (Reativação/Faltou/Quente): 12px (text-xs) × 1,29 = 15,48 → 15px.
export const MOBILE_NAME_TEXT_REACTIVATION = "text-[15px] sm:text-xs";
// Nome (Agendamentos) — AJUSTE (2026-10-29, 3ª rodada): pedido explícito
// pra ficar do tamanho de um card de métrica — 14px, o MESMO valor de
// desktop (não é mais maior que desktop nesse card específico; os outros
// elementos do card já encolheram o bastante que não precisa de um
// "boost" de fator aqui pra continuar legível).
export const MOBILE_NAME_TEXT_APPOINTMENT = "text-[14px] sm:text-sm";
// @ do lead — AJUSTE (2026-10-29, 3ª rodada): 12px (era 13px).
export const MOBILE_HANDLE_TEXT = "text-[12px] sm:text-caption";
// Motivo/horário/status/telefone/rótulos ("Limite diário", "Sem
// WhatsApp") — NÃO mudou nesta rodada de propósito (pedido explícito:
// "mantenha motivo visível e sem cortar"; já está no mesmo nível do
// rótulo do card de métrica, ver MOBILE_METRIC_LABEL_TEXT, ambos 15px):
// 10px (text-caption) -> ×1,45=14,5→15px.
export const MOBILE_SECONDARY_TEXT = "text-[15px] sm:text-caption";
// Data/status/telefone/texto dos botões do card de Agendamentos —
// NOVO (2026-10-29, 3ª rodada), separado de MOBILE_SECONDARY_TEXT de
// propósito (motivo/data dos OUTROS cards não mudam, ver acima; só este
// card ganhou fonte menor, pedido explícito "fonte pequena"): 12px.
export const MOBILE_APPOINTMENT_SECONDARY_TEXT = "text-[12px] sm:text-caption";
// Texto dos botões de ação (WhatsApp/Instagram/"Enviando…"/"✓"): 11px
// (text-card) × 1,29 = 14,19 → 14px.
export const MOBILE_BUTTON_TEXT = "text-[14px] sm:text-card";

// @ do lead: SÓ CELULAR vira encolhível no layout empilhado (herda o
// "truncate" ao lado — reticências de verdade quando um @ muito longo não
// couber); em telas ≥640px volta a ser fixo (shrink-0, lado a lado com o
// nome, igual sempre foi).
export const MOBILE_HANDLE_SHRINK = "min-w-0 shrink sm:shrink-0";

// Ícones --------------------------------------------------------------------

// Ícones mono (WhatsApp/Instagram) dentro dos botões de ação e ícone do
// RetornoButton: 12px (h-3 w-3) × 1,29 = 15,48 → 15px. NÃO é mais usado
// pelo chip de tipo (ver MOBILE_CHIP_ICON_SIZE abaixo, separado nesta
// rodada pra poder encolher o chip sem mexer nos ícones dos botões).
export const MOBILE_ICON_SIZE = "h-[15px] w-[15px] sm:h-3 sm:w-3";

// Chip de tipo ----------------------------------------------------------
//
// Fonte e ícone PRÓPRIOS (não mais MOBILE_SECONDARY_TEXT/MOBILE_ICON_SIZE
// — separados nesta rodada): pedido explícito pra reduzir o chip
// especificamente, sem reduzir o motivo (que usa MOBILE_SECONDARY_TEXT,
// mantido). Texto: 10px (text-caption) × 1,29 = 12,9 → 13px. Ícone: 12px
// (h-3 w-3) × 1,29 = 15,48 → um pouco menor que o texto proporcionalmente
// faria sentido num chip pequeno — 14px.
export const MOBILE_CHIP_TEXT = "text-[13px] sm:text-caption";
export const MOBILE_CHIP_ICON_SIZE = "h-[14px] w-[14px] sm:h-3 sm:w-3";
// Largura: precisa caber "Reativação" (o rótulo mais longo dos 3) numa
// linha só, no novo texto/ícone/padding menores — 96px (desktop
// permanece 92px, quase igual: o texto/ícone móvel já ficou bem perto do
// tamanho de desktop). Padding 6/2px (px-1.5/py-0.5) × 1,29 = 7,74/2,58
// → 8px/3px.
export const MOBILE_CHIP_SIZE = "w-[96px] sm:w-[92px] px-[8px] py-[3px] sm:px-1.5 sm:py-0.5";

// Barra lateral colorida -------------------------------------------------

// 3px -> ×1,45=4,35: 4, empata com o mínimo do pedido (4px). Fora do
// ajuste desta rodada (impacto de altura irrelevante, 1px).
export const MOBILE_BAR_WIDTH = "w-[4px] sm:w-[3px]";

// Avatar (LeadAvatar, SÓ o tamanho "md" — usado exclusivamente pelos dois
// cards desta tela; Pipeline usa "lg" e o banner "precisa de humano" usa
// "sm", nenhum dos dois é afetado) ----------------------------------------

// AJUSTE (2026-10-29, 3ª rodada): avatar ainda menor — pedido explícito
// ("avatar pequeno") pra caber no card de Agendamentos do tamanho de um
// card de métrica. Não é mais escalado por fator a partir de desktop (o
// resultado ficaria grande demais pro pedido) — valor deliberado, 28px.
// Como "md" é usado só pelos cards de Reativação/Faltou/Quente e
// Agendamentos (ver comentário acima), o ajuste casceia pros dois sem
// precisar duplicar — pedido explícito permite isso ("se os outros tipos
// usarem o mesmo componente, o ajuste vale pra eles também").
export const MOBILE_AVATAR_SIZE = "h-[28px] w-[28px] sm:h-8 sm:w-8";
// Ícone de fallback (sem foto): mesma proporção do avatar acima — 14px.
export const MOBILE_AVATAR_ICON_SIZE = "h-[14px] w-[14px] sm:h-4 sm:w-4";
// Badge de origem (Instagram) sobreposto no avatar: 10px.
export const MOBILE_AVATAR_BADGE_SIZE = "h-[10px] w-[10px] sm:h-3 sm:w-3";

// Botões de ação (WhatsApp/Instagram/retorno/"Retorno"/"Não compareceu") -
//
// AJUSTE (2026-10-29, 2ª rodada): o piso de toque de 48px (WCAG 2.5.5)
// virou **40px** — pedido explícito: "botões fáceis de tocar, altura
// mínima razoável, sem exagero". 40px continua um alvo de toque
// confortável (acima do mínimo de 44pt/48dp usado como referência em
// iOS/Android só por segurança extra em listas densas como essa, onde
// cada linha já tem espaço vertical reduzido de propósito) — não é um
// valor de fator, é um piso deliberado, igual o 48px anterior era.
export const MOBILE_ACTION_BUTTON_HEIGHT = "h-[40px] sm:h-[23px]";
// Altura E largura (botão "✓" de desfazer, quadrado): mesmo piso acima.
export const MOBILE_ACTION_BUTTON_SQUARE = "h-[40px] w-[40px] sm:h-[23px] sm:w-[23px]";
// Padding horizontal dos botões de WhatsApp/Instagram (sem mínimo de
// toque próprio — a altura já garante o piso; aqui é só o fator): 6px
// (px-1.5) × 1,29 = 7,74 → 8px.
export const MOBILE_ACTION_BUTTON_PADDING_X = "px-[8px] sm:px-1.5";
// "Retorno"/"Não compareceu" não têm altura fixa (texto varia) — usam
// min-h/min-w pra garantir um piso de toque mesmo com o texto mais
// curto. AJUSTE (2026-10-29, 3ª rodada): 40px -> 32px — pedido explícito
// ("botões... compactos, altura ~32px"), pra caber no card do tamanho de
// um card de métrica; ainda um alvo de toque razoável (os dois só
// aparecem um de cada vez nessa linha — nunca os dois juntos, ver
// comentário em ClientPanelView.tsx — então não competem por espaço
// entre si). Exclusivo do Agendamentos (RetornoButton/NoShowButton), não
// afeta os botões de WhatsApp/Instagram da Reativação (que usam
// MOBILE_ACTION_BUTTON_HEIGHT/SQUARE, constante separada, inalterada).
export const MOBILE_TOGGLE_BUTTON_MIN = "min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0";

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

// Nome: até 2 linhas com reticências no celular (line-clamp-2); 1 linha
// com reticências em desktop, igual sempre foi (line-clamp-none desfaz o
// "display: -webkit-box" do line-clamp-2 antes do truncate de sempre
// entrar — mesmo mecanismo já usado na linha de motivo da rodada
// anterior, agora aplicado ao nome em vez do motivo).
export const MOBILE_NAME_CLAMP = "line-clamp-2 sm:line-clamp-none sm:truncate";

// Card de Agendamentos — layout de 2 linhas com botão ao lado -----------
//
// AJUSTE (2026-10-29, 3ª rodada): pedido explícito pra REVERTER a "linha
// própria embaixo" da rodada anterior — o botão (Retorno OU Não
// compareceu, nunca os dois juntos — COMPLETED, o único status que
// mostra Retorno, nunca está em ACTIONABLE_STATUSES, o único grupo que
// mostra Não compareceu) volta a ficar AO LADO do conteúdo, igual sempre
// foi em desktop — por isso MOBILE_APPOINTMENT_BUTTON_ROW (a versão
// "linha própria embaixo") foi removida: não tem mais nenhuma diferença
// de layout entre mobile/desktop aqui além de tamanho, então o botão
// pode usar o wrapper simples de sempre (`shrink-0 flex items-center`,
// direto em ClientPanelView.tsx, sem precisar de uma constante — não há
// nenhum valor que mude por breakpoint nesse wrapper específico).
//
// Nome/@ também pararam de empilhar (MOBILE_NAME_CLAMP, usada pela
// Reativação, CONTINUA como está — não mexida nesta rodada; o antigo
// MOBILE_NAME_HANDLE_STACK, que só o Agendamentos usava, foi removido
// por ficar órfão): pedido explícito "nome + @ numa linha única, com
// reticências se longo" — igual ao desktop já era, então o Agendamentos
// passou a usar uma classe simples direto em ClientPanelView.tsx (mesma
// estrutura de linha em mobile e desktop, só o tamanho muda por `sm:`).
//
// @ do lead do Agendamentos — AJUSTE (2026-10-29, 3ª rodada): como nome
// e @ dividem uma linha SÓ (e nome entra como flex-1, prioridade pra
// ficar visível), um @ de Instagram incomumente longo (ex.:
// "@maria.fernanda.albuquerque.costa.oficial") sozinho já tomaria quase
// toda a linha (shrink-0 = nunca encolhe, mostra sempre o conteúdo
// inteiro) — sobrando só 1-2 letras pro nome. max-w-[40%] garante um
// piso mínimo de espaço pro nome mesmo nesse caso extremo (@ comuns,
// bem mais curtos que 40% da linha, continuam aparecendo inteiros, sem
// reticências — só o caso extremo trunca). Em desktop (sm:) reverte pro
// de sempre: sem limite de largura, sempre mostra o @ inteiro.
export const MOBILE_APPOINTMENT_HANDLE_CAP = "max-w-[40%] shrink-0 truncate sm:max-w-none sm:shrink-0";
// Ícone do botão "Retorno" — PRÓPRIO (não mais MOBILE_ICON_SIZE, que
// também serve os botões de WhatsApp/Instagram da Reativação/
// InstagramDmButton — separado pra poder encolher só este sem afetar os
// outros dois): 12px (h-3 w-3), mesmo valor de desktop.
export const MOBILE_APPOINTMENT_BUTTON_ICON_SIZE = "h-[12px] w-[12px] sm:h-3 sm:w-3";
