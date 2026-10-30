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
// grande demais"). AJUSTE (pedido explícito, só celular: "diminuir um
// pouco, ~1-2px"): 18 -> 16px. Não mexe em altura de card nenhum — este
// texto vive no cabeçalho do Painel, fora de qualquer card. `sm:`
// inalterado ("em ≥640px nada muda").
export const MOBILE_SUBTITLE_TEXT = "text-[16px] sm:text-sm";
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

// 12px (text-xs) -> ×1,45=17,4: mínimo do pedido (20px) vale. AJUSTE
// (pedido explícito, só celular: "diminuir um pouco, ~1-2px", títulos
// "Agendamentos"/"Reativação" — compartilham esta MESMA constante, ver
// usos em ClientPanelView.tsx/ReactivationRail.tsx): 20 -> 18px. Fica
// num h2 numa linha própria, acima da lista de cards — não altera
// altura de nenhum card. `sm:` inalterado.
export const MOBILE_SECTION_TITLE_TEXT = "text-[18px] sm:text-xs";
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

// Linha de Reativação/Faltou/Quente — AJUSTE (2026-10-30, pedido
// explícito "alinhe os três tipos ao mesmo padrão dos cards de
// Agendamentos"): vertical igual ao de Agendamentos (14px, ver
// MOBILE_APPOINTMENT_ROW_PADDING); horizontal direito também 8px, igual;
// esquerdo fica em 12px (não 8px) — só este card tem a barra colorida
// lateral (PanelCardTypeBar, 4px) encostada na borda, precisa de um
// pouco mais de respiro pra não colar no conteúdo. `sm:` INALTERADO
// (pedido explícito "em ≥640px nada muda") — continua p-2/pl-2.5 de
// sempre, pixel-idêntico a antes desta rodada.
// AJUSTE 2 (mesmo pedido, novo layout de 3 linhas, medição ao vivo):
// pr 8->5px, pl 12->10px — SÓ este card (constante própria, não
// compartilhada com Agendamentos, então não viola "não mexa nos cards de
// Agendamentos"); nome truncado a 2 palavras (truncateNameToTwoWords)
// ainda estourava a linha por ~3,7px no caso extremo de 2 palavras bem
// longas (ex. do próprio pedido, "Espaçolaser Depilação…") — o `truncate`
// de CSS cortava DENTRO da 2ª palavra em vez de mostrar as 2 palavras
// inteiras + reticências. 5px a mais na coluna de conteúdo (com folga
// real, não só no arredondamento — ver AJUSTE 3 de MOBILE_CHIP_ROW_GAP
// acima pro mesmo tipo de problema) resolve esse caso sem tocar no
// botão, no avatar, nem em nenhuma constante compartilhada com
// Agendamentos.
export const MOBILE_REACTIVATION_ROW_PADDING = "py-[14px] pr-[5px] pl-[10px] sm:p-2 sm:pl-2.5";
// Linha de Agendamentos: reduzido na 3ª rodada (2026-10-29) pra ficar do
// tamanho de um card de métrica — ficou um pouco BAIXO demais (~77px na
// medição daquela rodada, contra ~90px do card de métrica, medido ao
// vivo — ver PanelMetricCard). AJUSTE (2026-10-29, 4ª rodada, pedido
// explícito "aumentar um pouquinho a altura"): padding VERTICAL
// aumentado de 8 pra 20px (horizontal continua 8px — pedido explícito
// "sem aumentar a largura dos botões", então só o vertical muda).
// Medido ao vivo (app real, não mockup) com os valores finais: card de
// 1 botão só (caso comum) ~87px — dentro do alvo (~85-90px). Card com os
// DOIS botões juntos (Retorno + Não compareceu — ver comentário grande
// em ClientPanelView.tsx sobre quando isso acontece) fica mais alto,
// ~119px — empilhar os 2 botões (flex-col) precisa de espaço vertical de
// verdade (2×32px + gap), não dá pra evitar sem violar "sem aumentar a
// largura dos botões"; esse caso é a exceção, não a regra.
// AJUSTE (2026-10-29, 5ª rodada, pedido explícito "sobrando espaço em
// cima e embaixo"): padding vertical reduzido de 20 pra 14px (horizontal
// continua 8px, não mexido). Combinado com fonte maior + avatar maior
// desta mesma rodada (ver seções "Fontes dos cards"/"Avatar" abaixo) — a
// altura final do card foi conferida ao vivo (app real) pra continuar
// dentro da margem de +15% contra o card de métrica (pedido explícito),
// ver MOBILE_CARD_MIN_HEIGHT.
export const MOBILE_APPOINTMENT_ROW_PADDING = "px-[8px] py-[14px] sm:p-2";
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
// Gap vertical entre as linhas do conteúdo (chip+motivo / nome / @): 2px
// (space-y-0.5) × 1,29 = 2,58 → 3px. AJUSTE (2026-10-30, mesmo pedido,
// medição ao vivo): 3 -> 2px — com a coluna virando 3 linhas (não mais
// 2) no novo layout, a altura final do card ficou ~94,5px, 1,5px acima
// do teto medido do card de Agendamentos (93px, ver MOBILE_CARD_MIN_HEIGHT);
// esse gap é só decorativo (2 ocorrências entre as 3 linhas), por isso
// cedeu os ~2-4px que faltavam pra encaixar na mesma faixa.
export const MOBILE_STACK_GAP = "space-y-[2px] sm:space-y-0.5";
// Gap nome/@ (quando lado a lado, desktop) e ícone/texto dos botões: 4px
// (gap-1) × 1,29 = 5,16 → 5px.
export const MOBILE_INLINE_GAP = "gap-[5px] sm:gap-1";
// Gap entre o chip de tipo e a linha de motivo: 6px (gap-1.5) × 1,29 =
// 7,74 → 8px. AJUSTE (2026-10-30, pedido explícito "tag... e, logo ao
// lado, um texto curto de motivo" — novo layout de 3 linhas): 8 -> 5px —
// a coluna de conteúdo ficou mais estreita dividindo espaço com o botão
// (que não pode mudar de tamanho, pedido explícito), então todo pixel
// sobrando pro motivo importa. AJUSTE 2 (mesmo pedido, medição ao vivo):
// 5 -> 2px — "120 dias após" (o maior dos motivos curtos de Reativação,
// por ter 3 dígitos) ainda cortava por 3px faltantes mesmo depois do chip
// virar w-fit e encolher ícone/padding; não dá pra tirar esses 3px de
// MOBILE_APPOINTMENT_ACTION_GAP (constante compartilhada com o espaço
// conteúdo↔botão do card de Agendamentos, intocável) nem de
// MOBILE_CHIP_SIZE sem arriscar o chip ficar espremido demais, então o
// gap entre chip e motivo (que já é só decorativo, não precisa ser
// grande) cedeu o espaço que faltava. AJUSTE 3 (mesma medição, checagem
// em subpixel): a 2px "120 dias após" batia clientWidth===scrollWidth em
// pixel inteiro, mas o layout real (fracionário) ainda cortava por
// ~0,1px — margem zero é frágil a arredondamento de fonte; 2 -> 1px dá
// uma folga de verdade. `sm:` inalterado.
export const MOBILE_CHIP_ROW_GAP = "gap-[1px] sm:gap-1.5";
// Gap na linha data · status · telefone dos Agendamentos — AJUSTE
// (2026-10-29, 3ª rodada): a linha virou flex-wrap (pedido explícito, só
// quebra quando não cabe — ver ClientPanelView.tsx, agrupado em "data ·"
// / badge / "· telefone" pra nunca sobrar um "·" sozinho numa linha);
// gap-x/gap-y separados porque o gap vertical entre as linhas quebradas
// precisa ser 0 (a margem já vem de fora, mt abaixo), só o horizontal
// mantém espaço entre os grupos: 5px.
export const MOBILE_DATE_ROW_GAP = "gap-x-[5px] gap-y-0 sm:gap-1";
// Margem acima da linha data/status/telefone — AJUSTE (2026-10-29, 4ª
// rodada, pedido explícito "aumentar... espaçamento entre as duas
// linhas"): 2px -> 6px. AJUSTE (2026-10-29, 5ª rodada, pedido explícito
// "reduza ~2px do espaçamento entre as linhas", junto da margem vertical
// do card): 6px -> 4px.
export const MOBILE_DATE_ROW_MARGIN_TOP = "mt-[4px] sm:mt-0.5";

// Fontes dos cards ---------------------------------------------------------

// Nome (Reativação/Faltou/Quente): 12px (text-xs) × 1,29 = 15,48 → 15px.
export const MOBILE_NAME_TEXT_REACTIVATION = "text-[15px] sm:text-xs";
// Nome (Agendamentos) — AJUSTE (2026-10-29, 3ª rodada): pedido explícito
// pra ficar do tamanho de um card de métrica — 14px, o MESMO valor de
// desktop (não é mais maior que desktop nesse card específico; os outros
// elementos do card já encolheram o bastante que não precisa de um
// "boost" de fator aqui pra continuar legível). AJUSTE (2026-10-29, 5ª
// rodada, pedido explícito "aumentar um pouquinho TUDO"): 14 -> 15px.
export const MOBILE_NAME_TEXT_APPOINTMENT = "text-[15px] sm:text-sm";
// @ do lead — AJUSTE (2026-10-29, 3ª rodada): 12px (era 13px). Usada só
// pela Reativação/Faltou/Quente (ReactivationRail.tsx) desde a 5ª rodada
// (ver MOBILE_APPOINTMENT_HANDLE_TEXT, valor próprio do Agendamentos).
// AJUSTE (2026-10-30, pedido explícito "alinhe... ao mesmo padrão dos
// cards de Agendamentos"): 12 -> 13px — mesmo valor mobile de
// MOBILE_APPOINTMENT_HANDLE_TEXT agora (os dois já compartilhavam o
// mesmo `sm:text-caption` de desktop, então só igualar o número mobile
// já basta — não precisou virar a mesma constante).
export const MOBILE_HANDLE_TEXT = "text-[13px] sm:text-caption";
// @ do lead — SÓ Agendamentos (2026-10-29, 5ª rodada, pedido explícito
// "aumentar um pouquinho TUDO... exceto o texto dos botões"): constante
// própria, separada de MOBILE_HANDLE_TEXT (que continua servindo só a
// Reativação/Faltou/Quente, inalterada — pedido era "somente" o card de
// Agendamentos). 12 -> 13px.
export const MOBILE_APPOINTMENT_HANDLE_TEXT = "text-[13px] sm:text-caption";
// Motivo (Reativação/Faltou/Quente) e rótulos ("Limite diário", "Sem
// WhatsApp") — 10px (text-caption) -> ×1,45=14,5→15px. AJUSTE
// (2026-10-30, pedido explícito "alinhe... ao mesmo padrão dos cards de
// Agendamentos... texto da linha 2 em 13px"): 15 -> 13px, mesmo valor
// mobile de MOBILE_APPOINTMENT_INFO_TEXT (os dois já compartilhavam o
// mesmo `sm:text-caption` de desktop).
export const MOBILE_SECONDARY_TEXT = "text-[13px] sm:text-caption";
// Motivo CURTO da linha 1 (chip + texto), SÓ celular — AJUSTE (2026-10-30,
// pedido explícito, novo layout de 3 linhas): constante própria,
// separada de MOBILE_SECONDARY_TEXT (que continua em 13px, usada pelo
// `reason` completo do desktop via PanelCardReasonLine, e pelos rótulos
// "Limite diário"/"Sem WhatsApp", que aparecem nos dois tamanhos de
// tela). 13 -> 12px: a coluna de conteúdo deste layout é bem mais
// estreita (divide espaço com o botão de ação, que não muda de
// tamanho), e mesmo o texto já encurtado (ex. "30 dias após") só cabe
// inteiro com esse ajuste fino de fonte. `sm:` nunca é alcançado de
// verdade (este elemento só existe dentro do bloco `sm:hidden`) — mantido
// por consistência com o padrão de todas as outras constantes do
// arquivo, não por necessidade funcional.
export const MOBILE_REACTIVATION_REASON_SHORT_TEXT = "text-[12px] sm:text-caption";
// Texto dos botões "Retorno"/"Não compareceu" (gatilho + opções do
// popover de prazo) do card de Agendamentos — NOVO (2026-10-29, 3ª
// rodada), separado de MOBILE_SECONDARY_TEXT de propósito (motivo/data
// dos OUTROS cards não mudam, ver acima; só este card ganhou fonte menor,
// pedido explícito "fonte pequena"): 12px. AJUSTE (2026-10-29, 5ª
// rodada, pedido explícito "aumentar... EXCETO o texto dos botões
// 'Retorno' e 'Não compareceu'"): fica INALTERADO — por isso a linha de
// data/status/telefone e a tag de status, que usavam esta MESMA
// constante, passaram a usar MOBILE_APPOINTMENT_INFO_TEXT (nova, abaixo)
// em vez desta — só assim dá pra aumentar uma sem aumentar a outra, já
// que RetornoButton.tsx/NoShowButton.tsx continuam usando esta aqui, sem
// mudança nenhuma.
export const MOBILE_APPOINTMENT_SECONDARY_TEXT = "text-[12px] sm:text-caption";
// Data/status/telefone (linha embaixo do nome/@) e texto da tag de status
// (AppointmentStatusBadge, modo compact) do card de Agendamentos — NOVO
// (2026-10-29, 5ª rodada, pedido explícito "aumentar um pouquinho TUDO
// ... EXCETO o texto dos botões"): separada de
// MOBILE_APPOINTMENT_SECONDARY_TEXT (ver comentário acima) só pra poder
// crescer sem arrastar o texto dos botões junto, que usa a mesma
// constante antiga. 12 -> 13px.
export const MOBILE_APPOINTMENT_INFO_TEXT = "text-[13px] sm:text-caption";
// Texto dos botões de ação (WhatsApp/Instagram/"Enviando…"/"✓"): 11px
// (text-card) × 1,29 = 14,19 → 14px. AJUSTE (2026-10-30, pedido
// explícito "texto igual" ao dos botões Retorno/Não compareceu): 14 ->
// 12px, mesmo valor mobile de MOBILE_APPOINTMENT_SECONDARY_TEXT. `sm:`
// inalterado (text-card de desktop, de sempre — diferente do `sm:`
// de MOBILE_APPOINTMENT_SECONDARY_TEXT de propósito, cada botão mantém
// seu PRÓPRIO desktop, só o mobile converge).
export const MOBILE_BUTTON_TEXT = "text-[12px] sm:text-card";

// @ do lead: SÓ CELULAR vira encolhível no layout empilhado (herda o
// "truncate" ao lado — reticências de verdade quando um @ muito longo não
// couber); em telas ≥640px volta a ser fixo (shrink-0, lado a lado com o
// nome, igual sempre foi).
export const MOBILE_HANDLE_SHRINK = "min-w-0 shrink sm:shrink-0";

// Ícones --------------------------------------------------------------------

// Ícones mono (WhatsApp/Instagram) dentro dos botões de ação da
// Reativação/Faltou/Quente — 12px (h-3 w-3) × 1,29 = 15,48 → 15px. NÃO é
// mais usado pelo chip de tipo (ver MOBILE_CHIP_ICON_SIZE abaixo,
// separado pra poder encolher o chip sem mexer nos ícones dos botões).
// AJUSTE (2026-10-30, pedido explícito "mesmo estilo compacto dos
// botões Retorno/Não compareceu"): 15 -> 12px — mesmo valor mobile do
// ícone do RetornoButton (MOBILE_APPOINTMENT_BUTTON_ICON_SIZE), que já
// usava o mesmo `sm:h-3 sm:w-3` de desktop.
export const MOBILE_ICON_SIZE = "h-[12px] w-[12px] sm:h-3 sm:w-3";

// Chip de tipo ----------------------------------------------------------
//
// Fonte e ícone PRÓPRIOS (não mais MOBILE_SECONDARY_TEXT/MOBILE_ICON_SIZE
// — separados nesta rodada): pedido explícito pra reduzir o chip
// especificamente, sem reduzir o motivo (que usa MOBILE_SECONDARY_TEXT,
// mantido). Texto: 10px (text-caption) × 1,29 = 12,9 → 13px. Ícone: 12px
// (h-3 w-3) × 1,29 = 15,48 → um pouco menor que o texto proporcionalmente
// faria sentido num chip pequeno — 14px.
export const MOBILE_CHIP_TEXT = "text-[13px] sm:text-caption";
// AJUSTE (2026-10-30, pedido explícito — novo layout de 3 linhas): 14 ->
// 12px — mesmo valor de desktop (sm:h-3), libera ~2px a mais pro texto
// de motivo ao lado, que agora divide uma linha bem mais estreita (ver
// MOBILE_CHIP_SIZE acima).
export const MOBILE_CHIP_ICON_SIZE = "h-[12px] w-[12px] sm:h-3 sm:w-3";
// Largura: precisa caber "Reativação" (o rótulo mais longo dos 3) numa
// linha só, no novo texto/ícone/padding menores — 96px (desktop
// permanece 92px, quase igual: o texto/ícone móvel já ficou bem perto do
// tamanho de desktop). Padding 6/2px (px-1.5/py-0.5) × 1,29 = 7,74/2,58
// → 8px/3px.
// AJUSTE (2026-10-30, rodada anterior, pedido "chip mantido, só reduzido
// pro novo tamanho"): padding 8/3px -> 6/2px. AJUSTE (2026-10-30, pedido
// explícito "logo ao lado, um texto curto de motivo" — novo layout de 3
// linhas): largura mobile deixa de ser FIXA (96px, dimensionada pro
// rótulo mais longo, "Reativação") e vira `w-fit` (abraça o conteúdo) —
// no layout novo o chip divide uma linha BEM mais estreita com o texto
// de motivo (a coluna de conteúdo inteira já compete por espaço com o
// botão de ação, que não muda de tamanho); com largura fixa de 96px,
// "Faltou"/"Quente" (rótulos mais curtos) desperdiçavam espaço que o
// motivo loga ao lado precisa. `whitespace-nowrap` garante que o rótulo
// nunca quebra linha dentro do chip, mesmo sem a largura mínima de
// antes. `sm:` inalterado (continua w-[92px] fixo — não é o alvo deste
// ajuste, "em ≥640px nada muda"). AJUSTE 2 (mesma medição em subpixel que
// MOBILE_CHIP_ROW_GAP acima): padding horizontal 4 -> 3px — folga extra
// pro motivo de "120 dias após" não cortar por fração de pixel.
export const MOBILE_CHIP_SIZE = "w-fit whitespace-nowrap sm:w-[92px] px-[3px] py-[2px] sm:px-1.5 sm:py-0.5";

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
// Avatar — SÓ Agendamentos (2026-10-29, 5ª rodada, pedido explícito "a
// foto... de 28 para ~34px"): o par acima (MOBILE_AVATAR_SIZE/ICON_SIZE)
// continua servindo a Reativação/Faltou/Quente, inalterado ("somente" o
// card de Agendamentos, ver LeadAvatar.tsx — novo size="appointment").
// Ícone de fallback escalado na mesma proporção (14/28 = 0,5 → 34×0,5 =
// 17px). Badge do canal (Instagram) REUSA MOBILE_AVATAR_BADGE_SIZE sem
// mudança — pedido explícito "mantendo o ícone do canal posicionado no
// canto como está" (a posição, já relativa ao canto do avatar via
// -bottom-0.5/-right-0.5, acompanha o avatar maior sozinha; o tamanho do
// badge em si não foi pedido pra mudar).
export const MOBILE_APPOINTMENT_AVATAR_SIZE = "h-[34px] w-[34px] sm:h-8 sm:w-8";
export const MOBILE_APPOINTMENT_AVATAR_ICON_SIZE = "h-[17px] w-[17px] sm:h-4 sm:w-4";

// Botões de ação (WhatsApp/Instagram/retorno/"Retorno"/"Não compareceu") -
//
// AJUSTE (2026-10-29, 2ª rodada): o piso de toque de 48px (WCAG 2.5.5)
// virou **40px** — pedido explícito: "botões fáceis de tocar, altura
// mínima razoável, sem exagero". AJUSTE (2026-10-30, pedido explícito
// "mesma altura (~32px)... dos botões Retorno/Não compareceu"): 40 ->
// 32px — mesmo piso de MOBILE_TOGGLE_BUTTON_MIN (botões de Agendamentos).
// `sm:` inalterado (23px de desktop, de sempre).
export const MOBILE_ACTION_BUTTON_HEIGHT = "h-[32px] sm:h-[23px]";
// Altura E largura (botão "✓" de desfazer, quadrado): mesmo piso acima.
export const MOBILE_ACTION_BUTTON_SQUARE = "h-[32px] w-[32px] sm:h-[23px] sm:w-[23px]";
// Padding horizontal dos botões de WhatsApp/Instagram (sem mínimo de
// toque próprio — a altura já garante o piso; aqui é só o fator): 6px
// (px-1.5) × 1,29 = 7,74 → 8px.
export const MOBILE_ACTION_BUTTON_PADDING_X = "px-[8px] sm:px-1.5";
// "Retorno"/"Não compareceu" não têm altura fixa (texto varia) — usam
// min-h/min-w pra garantir um piso de toque mesmo com o texto mais
// curto. AJUSTE (2026-10-29, 3ª rodada): 40px -> 32px — pedido explícito
// ("botões... compactos, altura ~32px"), pra caber no card do tamanho de
// um card de métrica; ainda um alvo de toque razoável. Exclusivo do
// Agendamentos (RetornoButton/NoShowButton), não afeta os botões de
// WhatsApp/Instagram da Reativação (que usam MOBILE_ACTION_BUTTON_HEIGHT/
// SQUARE, constante separada, inalterada). Os dois PODEM aparecer juntos
// na mesma linha (um agendamento vencido e ainda não marcado mostra os
// dois — ver comentário grande em ClientPanelView.tsx); o wrapper deles
// empilha em flex-col nesse caso, então esse piso de 32px nunca disputa
// largura entre os dois, só altura (aceitável, ver AJUSTE de altura do
// card logo abaixo).
export const MOBILE_TOGGLE_BUTTON_MIN = "min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0";

// Reordenação SÓ CELULAR: nome/@ e chip/motivo trocam de posição -----------
//
// Pedido explícito (nome longo): no celular, a linha do TOPO do card de
// Reativação/Faltou/Quente passa a ser chip+motivo (1 linha); abaixo, o
// nome+@ (1 linha cada, lado a lado como no Agendamentos — ver AJUSTE
// abaixo). Em desktop nada muda — a ordem volta a ser nome/@ primeiro,
// chip/motivo depois, exatamente como sempre foi.
//
// NÃO é um truque de CSS order: a verificação visual da rodada que criou
// isso achou que, com CSS order (um contêiner só, dividindo largura com o
// botão de WhatsApp/Instagram nas duas linhas), o motivo ficava sem
// nenhum espaço sobrando em telas de 320-375px — avatar + chip (133px
// fixo) + botão de texto completo ("WhatsApp"/"Instagram") já esgotavam a
// largura da tela sozinhos, e o motivo sumia (0px, nem reticências).
// ReactivationRail.tsx resolve isso com DOIS blocos de layout (um só
// visível por vez, via sm:hidden/hidden sm:flex): no celular, chip+motivo
// ganham uma linha cheia que NÃO divide espaço com o botão (motivo tem
// que caber sempre, pedido explícito); nome/@ é que dividem a linha de
// baixo com o botão. Em desktop, o segundo bloco reproduz a estrutura de
// sempre (nome/@ e chip/motivo empilhados numa coluna só, ao lado do
// botão) sem nenhuma mudança.
//
// AJUSTE (2026-10-30, pedido explícito "alinhe... ao mesmo padrão dos
// cards de Agendamentos... o nome não pode quebrar em duas linhas"): o
// nome deixou de tolerar 2 linhas (removido MOBILE_NAME_CLAMP, que dava
// line-clamp-2 só no celular) — agora é sempre 1 linha com reticências
// (`truncate` simples, aplicado direto em ReactivationRail.tsx), igual
// ao Agendamentos, no celular E no desktop (desktop já truncava 1 linha
// antes, nenhuma mudança lá). Nome e @ também pararam de empilhar
// (flex-col) e passaram a dividir uma linha SÓ, lado a lado — mesma
// estrutura de ClientPanelView.tsx (Agendamentos).

// Card de Agendamentos — layout de 2 linhas com botão ao lado -----------
//
// AJUSTE (2026-10-29, 3ª rodada): pedido explícito pra REVERTER a "linha
// própria embaixo" da rodada anterior — o(s) botão(ões) (Retorno e/ou
// Não compareceu — PODEM aparecer os dois juntos, ver comentário grande
// em ClientPanelView.tsx) voltam a ficar AO LADO do conteúdo, igual
// sempre foi em desktop — por isso MOBILE_APPOINTMENT_BUTTON_ROW (a
// versão "linha própria embaixo") foi removida: não tem mais nenhuma
// diferença de layout entre mobile/desktop aqui além de tamanho, então o
// wrapper usa classes simples direto em ClientPanelView.tsx (flex-col
// pra empilhar os até-2 botões sem disputar largura com o conteúdo —
// achado na validação ao vivo da 4ª rodada), sem precisar de constante
// própria aqui — não há nenhum valor que mude por breakpoint nesse
// wrapper específico.
//
// Nome/@ também pararam de empilhar (o antigo MOBILE_NAME_HANDLE_STACK,
// que só o Agendamentos usava, foi removido por ficar órfão — a
// Reativação/Faltou/Quente adotou a MESMA estrutura numa rodada
// posterior, ver AJUSTE acima): pedido explícito "nome + @ numa linha
// única, com reticências se longo" — igual ao desktop já era, então o
// Agendamentos passou a usar uma classe simples direto em
// ClientPanelView.tsx (mesma estrutura de linha em mobile e desktop, só
// o tamanho muda por `sm:`).
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
