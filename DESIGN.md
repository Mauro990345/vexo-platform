# VEXO: guia de design

## Princípios
- Premium, minimalista e compacto. Interface escura, poucos elementos, bom espaçamento, sem blocos grandes ou espaçados demais.
- Hierarquia clara: títulos principais em off-white, textos de apoio em cinza. Cor aparece só em detalhes (palavras, ícones, indicadores), nunca em grandes preenchimentos.
- No máximo 2 matizes de destaque por bloco. Nada de etiquetas chamativas, faixas coloridas na lateral de blocos novos nem cores vivas.
- Mobile-first: nunca rolagem horizontal da página; abas rolam dentro da própria linha. Testar em 360, 390, 414 e 1366 px.

## Cor (decidido e aplicado)
- Azul da marca e das ações: #2b87bd. Usado em item ativo da sidebar, logo, botões principais, abas ativas (sublinhado), links, checkbox/toggle e foco de campos. Fundos de estado ativo com esse azul em ~12-14% de opacidade.
- Cores de significado, só para o que significam (não decorativas): verde do "Agendado" (ok/ativo/conectado), marrom do "Quente/Faltou" (atenção/destaque), roxo da coluna "Em conversa", e as cores de erro/alerta já existentes. Não adicionar vermelho nem rosa novos como decoração. O ícone do Instagram segue as cores da marca dele.
- Texto: títulos principais em off-white (~#e6e8ec, nunca #ffffff puro); textos que explicam ou informam em cinza (~#8b909a).
- Desagradam e não devem ser usados: verde-água/pastel apagado, azul muito vivo e saturado, rosa.

## Abas com ícone (aplicado; cores em atualização)
- Cor do ícone fixa por posição (da esquerda para a direita, recomeçando em cada página): 1ª #28a4c2, 2ª #dbb148, 3ª #547aca, 4ª #49b76c. Variáveis tab-icon-1 a tab-icon-4.
- Texto das abas em off-white; aba selecionada indicada pelo sublinhado azul.

## Bônus Full Face (identidade própria, não mexer sem aviso)
- Verde sutil e escuro no bloco grande (áudio + texto), via variável única; fundo da página no escuro padrão.
- Bloco "Ideia central": marrom escuro com borda vertical mais clara à esquerda (mesmo marrom do card "Faltou"). É a única faixa lateral aprovada.
- Fontes do Bônus: Bricolage Grotesque (títulos) e Figtree (texto). Resto do app: Inter. Todas hospedadas via pacotes @fontsource, sem buscar nada no Google durante o build.

## Direção desejada (a aplicar primeiro em UMA página piloto, depois estender)
- Base em camadas de cinza-azulado escuro: fundo da página, sidebar e blocos em 3 níveis sutis; mini-cards internos mais escuros que o card; bordas finas (~6-8% de branco), sem sombras pesadas.
- Sidebar minimalista: ícones de linha fina em cinza, cor só no item ativo, item ativo com fundo sutil e SEM contorno, tipografia regular e discreta.
- Cor por seção em detalhes (ícone do cabeçalho, título em caixa alta, palavras-chave), no máximo 4 cores no total: azul, dourado, verde e laranja/âmbar.
- Valores/números em off-white, unidade em cinza menor; títulos de seção pequenos em caixa alta com letter-spacing leve.

## Regras técnicas
- Todas as cores, tamanhos de fonte, espaçamentos, raios e bordas vêm de variáveis (tokens) em um único lugar. Proibido hex, rgb ou classe de cor escrita direto nas telas.
- Telas usam componentes compartilhados (Botão, Card, Campo, Abas, Badge, Tabela, Sidebar). Não duplicar versões locais.
- Erro/destrutivo: sempre a cor semântica `vexo-error` (nunca uma classe de cor solta tipo `red-500`), mesmo em hover de um botão "Remover".

## Tokens de raio e espaçamento (Etapa 1 da migração — ver docs/design-audit.md)
- Raio: `rounded-control` (0.5rem/8px — botões, campos, chips pequenos) e `rounded-block` (0.75rem/12px — cards/blocos de conteúdo), em `tailwind.config.ts`. Mesmos valores de `rounded-lg`/`rounded-xl` já usados hoje — só dão nome ao papel de cada um, pros componentes base consumirem. `rounded-card` (0.375rem/6px) continua existindo só pro Pipeline (não mexido nesta migração), não é o token pra blocos novos.
- Espaçamento: `control-x` (0.625rem/10px), `control-y` (0.375rem/6px) e `block` (0.875rem/14px), também em `tailwind.config.ts` — mesmos valores de `px-2.5`/`py-1.5`/`p-3.5`, os paddings mais comuns hoje em botões/campos e em blocos.
- `src/components/MobileCardScale.ts` continua como fonte PRÓPRIA e separada, só pro recorte mobile (abaixo de `sm`) de alguns elementos reaproveitados pelo Painel do cliente (ChannelStatusPill, LeadAvatar, NoShowButton/RetornoButton, botões de ação da faixa "Para fazer hoje") — não foi unificado com os tokens acima. O layout do Painel em si foi reorganizado na Etapa 4 (ver seção própria abaixo); boa parte dos valores antigos deste arquivo, específicos do layout anterior, foi removida junto com os componentes que só eles serviam. Ao mexer nele, não duplicar um valor que já existe como token nomeado aqui.

## Componentes base (Etapa 2 da migração)
Novos, só com os tokens acima, visual idêntico ao que já existia solto nas telas — ainda sem
nenhuma tela consumindo (chegam na Etapa 3, começando pela Automações):
- `Button` (`src/components/Button.tsx`) — variantes `primary` (preenchido), `outline` (contorno,
  a mais comum hoje) e `ghost` (discreto).
- `Card` (`src/components/Card.tsx`) — bloco com borda fina + fundo (`surface`/`surface2`);
  `as="form"` quando o próprio bloco é um formulário.
- `Badge` (`src/components/Badge.tsx`) — pílula com bolinha de cor, nas 5 famílias semânticas já
  usadas (`accent`/`success`/`error`/`warning`/`muted`). Chegou a ser o chip de tipo da faixa "Para
  fazer hoje" do Painel (Etapa 4), mas voltou a ficar sem tela consumindo no ajuste seguinte — ver
  seção do Painel abaixo: a etiqueta de tipo lá precisava ser mais discreta (texto + fundo bem
  sutil, igual pros 4 tipos) do que o selo colorido por família que o Badge produz.
- `MetricCard` (`src/components/MetricCard.tsx`) — rótulo pequeno + valor grande, baseado no
  `StatCard` existente. Ganhou `bare` (sem borda/fundo próprios, pra usar dentro de uma faixa já
  dividida por linha) e `highlight` (tom de destaque customizável, `painel.highlight`) na Etapa 4,
  ao se tornar o card de métrica do Painel — `PanelMetricCard.tsx` (antigo) foi removido.

## Painel do cliente (Etapa 4 da migração — reorganização, ver docs/design-audit.md)
Desktop: cabeçalho enxuto (nome da clínica + ícones de integração + seletor de Período, sem
repetir "Painel" — já dito pela aba quando ela existe); faixa fina de 4 métricas (`MetricCard`
`bare`) com linhas finas entre elas, no lugar dos 4 blocos grandes; navegação de semana/gráfico
"Abordagens por dia" atrás de um link discreto "Ver semana"; duas colunas (~55%/45%): "Para fazer
hoje" (`ReactivationRail.tsx`, SEMPRE aberta — une Reativação/Faltou/Quente/Não agendou numa lista
só, agrupada em "Atrasados"/"Hoje" por prioridade, sem rolagem interna) e "Agendamentos"
(`PanelAppointmentsColumn.tsx` — "Próximos" primeiro, sempre visível mesmo vazio — nesse caso uma
linha discreta "Sem agendamentos próximos", nunca uma caixa grande —, depois "Aguardando
resposta", com o Histórico atrás de um link). Celular: mesma estrutura numa coluna só, métricas em
2x2.

Ajustes feitos num segundo momento (mesma Etapa 4): cada item voltou a ser um cartão leve e
separado (`rounded-control`/borda fina/fundo sutil, ~8px de espaço entre eles via `space-y-2`) —
não mais uma linha dentro de um bloco único com `divide-y` (bordas duplicadas). Ícones de
integração do cabeçalho (Instagram/Google Calendar/WhatsApp, `ChannelStatusPill.tsx`) preenchem o
mesmo badge de ~24px por igual — antes só o Google tinha esse preenchimento (via `iconBg`),
Instagram/WhatsApp ficavam com um ícone pequeno boiando num badge maior. Linha de "Para fazer
hoje": nome completo do paciente em destaque na 1ª linha (nunca mais cortado pela etiqueta/@); 2ª
linha com a etiqueta de tipo (texto pequeno, fundo bem sutil — `bg-vexo-surface2`/`text-vexo-muted`
— igual pros 4 tipos, nunca mais o selo colorido por família), o motivo em cinza e o @ do Instagram
em cinza ainda menor. Rótulos de grupo ("Atrasados"/"Hoje"/"Próximos"/"Aguardando resposta") sempre
neutros (cinza, caixa alta pequena) — nunca vermelho, nem para "Atrasados". Botões de ação
(WhatsApp/Instagram) neutros (contorno `vexo-border`, texto `vexo-muted`) — a cor da marca fica só
no ícone (`WhatsAppGlyphIcon`/`InstagramGlyphIcon`, squircle colorido real da marca, mesmo usado no
cabeçalho/avatar), nunca mais na borda/texto do botão (que antes competia com a etiqueta de tipo).
Itens já enviados ficam num grupo recolhido "Enviados (N)" no fim de "Para fazer hoje" — a
contagem do título conta só os pendentes. Status em ponto colorido + texto, não selo sólido
(`AppointmentStatusBadge`, modo compact). Ação secundária (ex.: "Não compareceu", quando "Retorno"
também se aplica) num menu "⋯" (`OverflowMenu.tsx`).

Componentes removidos, substituídos pelos de cima: `PanelActivityColumn.tsx`,
`ApproachMetricsToggle.tsx`, `PanelMetricCard.tsx`, `PanelCardBadge.tsx`. Ícones removidos (ficaram
sem nenhum uso depois da troca pros botões neutros): `InstagramMonoIcon`/`WhatsAppMonoIcon`
(`BrandIcons.tsx`) e a borda em degradê do Instagram (`INSTAGRAM_ACTION_GRADIENT`,
`ReactivationActionButtonStyle.ts`). O menu "⋯" (`OverflowMenu.tsx`) foi removido num ajuste
seguinte — "Não compareceu" voltou a ficar sempre visível, empilhado com "Retorno".

### Cor por tipo em "Para fazer hoje" (ajuste dedicado, só nesta lista — Agendamentos não muda)
Cada item passou a ter a borda fina (1px) do cartão e o fundo da etiqueta de tipo tingidos pela
cor do tipo, em vez de neutros — SEM faixa lateral grossa, só a borda fina inteira. Dois grupos:
- **Reativação**: azul da marca (`--vexo-card-type-reativacao`, mesmo valor de `--vexo-accent`,
  #2b87bd). Borda do cartão a ~35% de opacidade (`border-vexo-cardTypeReativacao/35`), fundo da
  etiqueta a ~16% (`bg-vexo-cardTypeReativacao/16`); o texto da etiqueta usa um tom mais claro do
  mesmo azul, próprio pra legibilidade (`--vexo-card-type-reativacao-text`, #5aa8d6).
- **Follow-up e seus subtipos** (Faltou/Não agendou/Quente): marrom/dourado já usado no VEXO
  (`--vexo-card-type-followup`, #d1a468) — mesmo valor pra borda (~35%), fundo da etiqueta (~16%) e
  texto da etiqueta (100%).
- Qualquer outro tipo de card, e o grupo recolhido "Enviados (N)" (mesmo quando é um card de
  Reativação ou Follow-up): continuam neutros (`border-vexo-border`/`bg-vexo-surface2`/
  `text-vexo-muted`), igual a antes.

Os botões de ação continuam neutros (contorno `vexo-border`, cor só no ícone da marca) — a cor do
tipo não chega neles. Tokens em `globals.css`/`tailwind.config.ts` (ver comentário grande em
`globals.css`), nomeados pra reajuste fácil depois (`--vexo-card-type-reativacao[-text]`,
`--vexo-card-type-followup`) — igual ao padrão de `--vexo-whatsapp-action-border`/`--bonus-green`:
valores FIXOS, não acompanham o azul de marca personalizável nem nenhum token semântico existente.

## Follow-up (tela piloto do mesmo padrão visual do Painel — aguardando aprovação no celular)
`FollowUpView.tsx` é uma tela de CONFIGURAÇÃO (textos/prazos das sequências automáticas e dos
cards manuais), sem nenhuma lista de pacientes/agendamentos — diferente do Painel, aqui não existem
nome/@ do Instagram/telefone/avatar nem itens "pendentes" pra ordenar em Atrasados/Hoje/Próximos ou
agrupar em "Enviados (N)"/"Histórico (N)". Por isso, dos princípios do Painel, só os que fazem
sentido pra uma tela de configuração foram aplicados aqui:
- Blocos de conteúdo (os `<details>` recolhíveis de cada passo/grupo de textos, e os `<form>`
  "Salvar prazo") passam de `rounded-xl border border-vexo-border bg-vexo-surface` pra
  `rounded-block bg-vexo-surface` — mesmo valor de raio (12px), token nomeado em vez de solto, SEM
  borda (mesmo padrão que Automações já usa pros seus próprios blocos/`<details>`, ver
  `automacoes/page.tsx`) — a separação do fundo da página vem só do tom de superfície, não de uma
  borda. O bloco tracejado "Adicionar passo" mantém a borda (`border-dashed`, pedido visual
  deliberado de "adicionar algo novo", sem equivalente em Automações pra comparar), só o raio e o
  padding (`p-3.5` → `p-block`) acompanham o mesmo ajuste.
- Botões de salvar/adicionar (que antes eram `<button className="...">` cru, repetindo a mesma
  string de classe em 5 lugares) passam a usar o componente `Button` (`variant="outline"` pros
  "Salvar X", `variant="primary"` pro único "Adicionar passo") — mesmo componente/hierarquia que
  Automações já usa. Os botões pequenos ↑/↓/Remover (reordenar/remover um passo) continuam como
  estão: não há uma variante "destrutiva" no `Button` hoje, e inventar uma só pra isto ficaria fora
  do escopo de um ajuste só visual.
- Título em off-white e texto de apoio em cinza já valiam antes do ajuste (herdam `text-vexo-fg`/
  usam `text-vexo-muted`, sem nenhuma cor solta) — nada mudou aí.
- Não aplicável aqui (sem lista de itens pendentes pra reorganizar): "Atrasados/Hoje/Próximos",
  seções com contador tipo "Atrasados (N)", "Enviados (N)"/"Histórico (N)", tamanho de fonte de
  nome/@/telefone, avatar e selo do Instagram — nenhum desses elementos existe em Follow-up.

## Relatório de resultados (quinzenal/mensal) — envio automático por WhatsApp
Nova tela, administrada pela página "Contas" (`/crm`, só admin — ver DESIGN.md/CLAUDE.md,
`ClinicReportPanel.tsx`/`report-actions.ts`). Mesmos tokens/componentes de sempre, nenhuma cor solta:
- **Lista de Contas**: botão pequeno e discreto "Relatório" (`rounded-md border border-vexo-border
  text-vexo-muted`, mesmo padrão do "Excluir" ao lado — `gap-2` entre os dois de propósito, pra
  evitar clique errado entre "abrir configuração" e "apagar a clínica"). Quando o envio automático
  está ligado, o próprio texto do botão ganha o sufixo discreto " · DD/MM" (próximo envio) — sem
  segunda linha, a linha da lista não cresce.
- **Painel** (clicar em "Relatório" abre): modal no mesmo padrão já usado em `ClientAccessModal.tsx`
  (`rounded-2xl` + overlay + Escape pra fechar) — dentro dele, blocos `Card surface="surface2"` e
  botões pelo componente `Button` (`outline` pros de ação, texto/borda neutros pros de link
  secundários), igual ao resto do app. Compacto (`max-w-md`, `max-h-[85vh]` com scroll próprio em
  telas baixas) — nada grande.
- **Página do relatório** (`/relatorio/[token]`, pública, sem login, e o preview admin em
  `/crm/clinicas/[id]/relatorio-preview`, que NÃO é uma aba da clínica — não entra em
  `clinic-nav.tsx`, só alcançável pelo botão "Ver relatório" do painel, numa aba nova do
  navegador): tudo reaproveita `MetricCard` e os containers já existentes do Painel; a 4ª rodada
  criou tokens próprios SÓ desta tela (elevação, legenda, azul positivo — ver abaixo).
  - **10ª rodada — vale sobre TUDO abaixo quando houver conflito:**
    - **Nível único de bloco**: o nível "raised" (mais claro, só nos 2 blocos de gráfico) saiu —
      "Comparecimento"+"Abordados por semana" e "Evolução" agora usam a MESMA classe `.report-panel`
      (mesmo degradê escuro) que Resumo e Follow-up/Reativação já usavam. Nenhum valor de opacidade
      de linha/texto precisou mudar: são cores FIXAS (não um degradê proporcional ao fundo), então
      um fundo mais escuro só aumenta o contraste contra elas, nunca reduz.
    - **Celular (<640px, "empilhado"): "Comparecimento" e "Abordados por semana" são DOIS blocos
      próprios** (como "Evolução" já era), cada um com seu título no topo — antes ficavam dentro de
      um bloco só, empilhados sem título próprio de cada lado. A partir de `sm` (mesmo ponto onde já
      se juntavam) voltam a formar UM bloco só, lado a lado — e ganham altura mínima maior
      (`sm:min-h-[260px]`) pra dar respiro. Implementação: o MESMO JSX de cada coluna
      (`ringBlockContent`/`weeklyBlockContent`, em `ClinicReportContent.tsx`) é usado 2x — uma vez
      dentro de 2 `<section>` separados (`sm:hidden`), uma vez dentro de 1 `<section>` só
      (`hidden sm:grid`) — uma cópia sempre escondida por CSS (`display:none`), nunca duas árvores de
      componente diferentes pra manter.
    - **Título SEMPRE no topo do bloco, nunca dentro do grupo que centraliza o anel** (bug da 9ª
      rodada corrigido: "COMPARECIMENTO" ficava mais baixo que os outros 2 títulos porque descia
      junto com o anel). Agora o título é o 1º filho do `flex-col`, o anel centraliza num `div`
      PRÓPRIO (`flex-1 items-center justify-center`) logo abaixo, e o rodapé é o último filho —
      título/rodapé sempre nas mesmas posições (topo/base), anel flutuando no meio.
    - **A legenda sai do `ReportColumnChart`** e vira `ReportColumnLegend`, componente separado
      (`ReportColumnChart.tsx`) — é o que permite ao chamador fixar a legenda no RODAPÉ do bloco
      (último filho do `flex-col`, atrás da mesma linha fina `border-white/[0.06]` usada no rodapé
      do anel), alinhada com os outros 2 rodapés, independente da altura real do gráfico ou de uma
      frase de leitura extra (Evolução). Mesmo `leading-tight` nos 3 rodapés, pra não haver nenhuma
      diferença de pixel entre eles por causa da altura de linha.
    - **Texto do anel**: no celular, sempre 2 linhas ("X de Y atendimentos" / "com data no
      período", 12px+ de distância do anel via padding). A partir de `sm` (coluna estreita,
      `sm:w-32`): 1 linha só, versão curta (sem "com data no período", que raramente cabe em ~112px
      úteis) — nunca a frase completa numa coluna estreita.
    - **Colunas dos gráficos mais largas no celular**: `--vexo-report-col-w` base subiu de 22px pra
      36px — com poucos grupos (Evolução, sempre 3 meses; ou uma quinzena, 2-3 semanas) o conjunto
      de colunas ocupava menos da metade do bloco, com vazio nas laterais. O `flex-shrink` de
      `.report-col` continua encolhendo sozinho quando faltar espaço (o pior caso, 6 semanas no
      mesmo mês, não estica além do que cabe) — por isso os dois gráficos JÁ NÃO têm necessariamente
      a mesma largura efetiva de coluna (cada um encolhe só o que precisa). `sm`(32px)/`lg`(26px)
      ficam como estavam — pedido explícito "no desktop, manter como está".
    - **Grupo (semana/mês) nunca mostra rótulo sem coluna** — nenhuma mudança nesta rodada, já
      corrigido na 9ª (ver abaixo); só reafirmado porque a legenda, agora separada, poderia
      confundir com "rótulo do grupo" — são coisas diferentes.
  - **9ª rodada — vale sobre TUDO abaixo quando houver conflito:**
    - **Alinhamento do bloco anel + semanas**: o anel (+ título "Comparecimento") fica num `div`
      interno próprio com `flex-1 flex flex-col items-center justify-center`, CENTRALIZADO no
      espaço vertical disponível da coluna — antes ficava colado no título, com sobra de espaço
      embaixo (a coluna do anel sempre estica pra bater com a altura da coluna do gráfico ao lado,
      que normalmente é mais alta). O texto da base ("X de Y atendimentos...") é o 2º (e único
      outro) filho do `flex-col` externo — nunca cresce, fica sempre no rodapé da coluna, na MESMA
      altura da legenda do gráfico "Abordados por semana" ao lado (que também é sempre o último
      elemento da sua própria coluna) — as duas colunas, estendidas à mesma altura pelo grid, ficam
      com o rodapé alinhado por construção, sem precisar calcular nada.
    - **Fontes do Relatório (+1px, nunca os números grandes nem os títulos)**: todo texto de
      apoio/rótulo pequeno (frase de leitura da Evolução, "X de Y atendimentos...", "X% responderam"/
      "X% das enviadas", "vs. anterior", rótulos dos cards — "Abordados"/"Em conversa"/"Receberam"
      etc., legendas dos gráficos, valores do eixo Y, rótulo do mês/semana na base, número em cima
      da coluna) sobe 1px sobre o tamanho anterior (10→11 ou 11→12), usando `text-[11px]`/
      `text-[12px]` direto nos componentes PRÓPRIOS do relatório (`ReportColumnChart.tsx`,
      `ClinicReportContent.tsx` — nunca compartilhados com outra tela). No rótulo do `MetricCard`
      (componente COMPARTILHADO com o Painel, que nunca muda de tamanho) a sobrescrita usa
      `!text-[12px]` em `labelClassName` — o `!` (important) é necessário porque, sem ele, a ordem
      das classes geradas pelo Tailwind não garante qual dos dois tamanhos vence.
    - **"Abordados por semana"/"Evolução": nunca mostra grupo (semana/mês) totalmente vazio** —
      nem a coluna (já não aparecia) nem o RÓTULO dele, que antes "flutuava" sem coluna em cima
      (bug relatado: "28/09"/"26/10" sem dado nenhum). `ReportColumnChart.tsx` filtra qualquer grupo
      com os dois valores zerados ANTES de desenhar (só se sobrar pelo menos 1 grupo com dado —
      com tudo vazio, mantém a lista original em vez de um gráfico em branco); o destaque de cor
      cheia passa a cair sempre no último grupo QUE TEM dado, nunca no último índice da lista crua.
    - **"Em conversa" = "Abordados" só na Demo** (`fixDemoInConversationTie`, `report-metrics.ts`) —
      acontece quando o período não tem registro manual de abordagem (ApproachLog): o piso de
      `getClinicMetrics` (`Math.max(approachLogSum, responded, scheduled)`, ver `metrics.ts`) iguala
      os dois números. Comportamento CORRETO pra clínica real (não é bug de contagem — o sistema já
      tem `contactedFromApproachLogs` pra isso, usada em `computeConversionRates` pra esconder a taxa
      de conversão correspondente) — mas, só na Demo, cosmético: sintetiza um "Em conversa" MENOR
      (nunca maior) que "Abordados" (que fica intocado), aplicado também à série semanal pro mesmo
      efeito nunca aparecer em "Abordados por semana". Idempotente — nunca ativa se os números já
      são diferentes.
    - **Reativação simulada nunca mostra "0 (0%)"** — "voltaram" garante pelo menos 1 sempre que
      "enviadas" > 0 (a fórmula antiga podia arredondar pra 0 em períodos curtos). Só a Demo passa
      por essa fórmula; clínica real nunca é simulada.
  - **8ª rodada — vale sobre TUDO abaixo quando houver conflito:**
    - **Fallback de "Evolução" SÓ PRA CLÍNICA DEMO** (`buildDemoEvolutionFallback`,
      `report-metrics.ts`) — a regra de produção (só aparece com os 3 meses com dado, ver 7ª rodada
      abaixo) continua INTOCADA pra clínica real: lá o bloco some exatamente como antes quando o
      histórico de verdade não cobre 3 meses, sem excessão. Causa real do bloco sumido no preview da
      Demo: o período atual tinha dado real (não cai no fallback simulado do relatório inteiro), mas
      o banco de exemplo não tem agendamento algum num dos meses anteriores — um mês real e
      legitimamente vazio, não um bug de posição/renderização. Só pra `DEMO_CLINIC_ID`, e só quando
      a regra de produção não bateria sem isso: preenche O(S) MÊS(ES) genuinamente zerado(s) — nunca
      o último, que é sempre o dado real do próprio período — com uma fração determinística do
      último mês real (50%/60% e 70%/(5/7) pro mês mais antigo e do meio), nunca sobrescreve um mês
      que já tem QUALQUER dado real. Compareceram sintético nunca passa de Agendaram sintético no
      mesmo mês, por construção.
  - **7ª rodada — vale sobre TUDO abaixo quando houver conflito:**
    - **Gráfico de colunas único** (`ReportColumnChart.tsx`), usado pelos DOIS gráficos de série:
      duas colunas por grupo, **coladas** (zero espaço dentro do grupo e entre grupos), cantos retos
      com no máximo 2px no topo (`rounded-t-sm`), **largura fixa** pelo token `--vexo-report-col-w`
      (22px no celular, 32px a partir de `sm`, 26px no `lg`, onde o bloco divide espaço com o anel;
      classes `.report-col`/`.report-col-pair`: encolhe só se não couber, nunca estica), grupo
      centralizado. Cores (tons de azul): último grupo em cor cheia — série 1 `--vexo-report-col-a`
      #2b87bd, série 2 `--vexo-report-col-b` #7cc4e8; grupos anteriores em azul-acinzentado suave —
      `--vexo-report-col-a-muted` #3b617d, `--vexo-report-col-b-muted` #587f99. Linhas de grade 1px
      `reportGrid` (branco 8%) atrás das colunas, eixo Y à esquerda (0 até o máximo em 3–4 marcas
      redondas — `niceAxis`, `report-chart-scale.ts` —, 11px `vexo-reportCaption`), linha de base 1px
      `reportBaseline` (branco 16%, um pouco mais clara), rótulo do grupo na base (último em
      off-white `vexo-tabFg`, demais em cinza), número em cima de cada coluna (10px); valor 0 não tem
      coluna nem rótulo. Legenda pequena abaixo. Fundo = o do bloco de gráfico (plano, nível raised).
      PROIBIDO: seta, vinheta/escurecimento nas bordas, sombra interna, degradê preto.
    - **"Evolução · últimos 3 meses"** (substitui o gráfico de linhas): Agendaram/Compareceram,
      SEMPRE em meses-calendário — também no quinzenal (`evolutionMonthsOfPeriod`): os 3 últimos
      meses COMPLETOS até o fim do período (mensal e 2ª quinzena: termina no mês do relatório; 1ª
      quinzena: o mês ainda não fechou, termina no mês anterior). Só aparece com os 3 meses com dados;
      senão o bloco some. Frase de leitura abaixo do título mantida (mesma regra de cor da
      comparação). Rótulo do mês curto ("set", "out").
    - **"Abordados por semana"** (substitui "Abordagens por semana"): Abordados e Em conversa das
      últimas 6 semanas civis (segunda a domingo) terminando na semana do último dia do período
      (`lastWeeksOfPeriod`; a última recortada no fim do período), mesmas definições do Resumo
      (`getClinicMetrics` por semana, em paralelo). Rótulo = início da semana ("12/10"). Última semana
      em cor cheia, anteriores em azul-acinzentado — o destaque âmbar da semana de pico saiu.
    - **Anel**: só o azul mudou — o início do degradê passa de ciano #28a4c2 para o azul da marca
      #2b87bd (`--vexo-accent`), mais forte; o verde (`--tab-icon-4`), o traço (5) e o resto ficam
      iguais.
    - Bloco anel + semanas: anel numa coluna estreita (`sm:w-32`, a legenda quebra) e o gráfico
      ocupa o resto; no `lg`, lado a lado com a Evolução em `3fr`/`2fr`.
    - **Preview admin com dados de exemplo**: na Clínica Demo, o link "Ver com dados de exemplo"
      (`?exemplo=1`) força o fallback simulado mesmo com dados reais (selo "Dados de exemplo"
      visível); ignorado pra qualquer outra clínica. Semanas simuladas são fatias do mês simulado
      (somam ~ o "Abordados" do mês).
  - **6ª rodada — vale sobre TUDO abaixo quando houver conflito:**
    - **Cores da comparação "vs. anterior" (regra nova)**: ALTA em **verde** (`--vexo-report-delta-up`
      #3fd083, `text-vexo-reportDeltaUp`), QUEDA em **azul** (`--vexo-report-delta-down` #4ea8ee,
      `text-vexo-reportDeltaDown`), 0% em cinza (`vexo-reportCaption`), sem base (atual ou anterior =
      0) nenhum texto. Os dois tons são mais vivos (mais saturados) que as cores normais do sistema —
      SÓ nesta tela e SÓ na comparação (e no % da frase de leitura da Evolução, mesma regra; função
      única `deltaColorClass`, `report-rates.ts`). Contraste: verde >= 7.6:1 e azul >= 5.9:1 sobre os
      dois níveis de bloco. Substituem `--vexo-report-positive`/`vexo-reportPositive` (removidos).
      Nunca vermelho, rosa nem coral. Painel e outras telas não mudam. Não existe outro texto
      pequeno em azul no relatório (o rodapé do anel é todo cinza), então nada mais usa o azul vivo.
    - **Evolução em LINHAS** (`PeriodEvolutionChart.tsx`, SVG simples): duas séries — Agendaram
      (traço em degradê `--vexo-accent` → `--tab-icon-1`, com área MUITO suave sob a linha, ciano a
      16% → 0) e Compareceram (`--tab-icon-4`, verde). Traço 1.5 (fino como o anel), ponto em cada
      período, valor só quando > 0 (série maior acima do ponto, menor abaixo — não colidem), período
      zerado no meio vira ponto na linha de base (linha-base fina `stroke-vexo-reportLine`), eixo com
      rótulo curto ("jul", "1ª out"). viewBox 300×132 (um pouco mais alto que as barras antigas),
      escala com o bloco; no `lg` limitado a `max-h-36` pra não esticar o bloco. Acima, a **frase de
      leitura** (texto pequeno cinza, % na cor da regra acima): "Agendamentos: 10 em outubro, +43% sobre
      setembro" / "… na 1ª quinzena de novembro, +20% sobre a 2ª quinzena de outubro" — só com os
      dois últimos pontos da própria série; oculta sem base (`buildEvolutionReading`). Continuam:
      começa no 1º período com dados, oculta com < 3, mesmas métricas por período (1 consulta
      agregada), legenda pequena (traço curto em cada cor), `aria-label` com todos os valores.
    - **Follow-up** no mesmo formato da Reativação: "Receberam" e "Responderam" lado a lado + linha
      "X% responderam" (oculta quando Receberam = 0). Regra (`computeFollowUpReach`,
      `report-metrics.ts`): **Receberam** = leads distintos com pelo menos uma mensagem automática
      (sender AI, OUTBOUND) ENVIADA (status SENT, `sentAt` no período) dentro de uma janela de
      follow-up aberta — depois de `FollowUpLog.triggeredAt`, antes de `respondedAt`, num log com
      passo processado (`lastStepIndex` não nulo). **Responderam** = desses, os que têm `respondedAt`
      no período e depois do primeiro passo recebido — subconjunto de Receberam, nunca maior. Sem
      atribuição de "agendou depois do follow-up". O antigo box solto "Leads retomados" saiu.
      Bloco Follow-up/Reativação agora em 2 colunas iguais a partir de `sm`.
  - **5ª rodada (mais fino e sutil, mesmo conteúdo) — vale sobre TUDO abaixo quando houver conflito:**
    - **Tons em dois níveis** (o fundo da página não muda): blocos separados por linha ficam no
      nível **base**, mais escuro (`.report-panel` — `--vexo-report-base-top` #161c26 →
      `--vexo-report-base-bottom` #121720): Resumo (números + taxas) e Follow-up/Reativação. Blocos de
      gráfico ficam no nível **raised**, um tom mais claro (`.report-panel-raised` —
      `--vexo-report-raised-top` #1e2632 → `--vexo-report-raised-bottom` #1a212c): anel + semanas e
      Evolução. Áreas internas rebaixadas (trilha do anel, fundo das barras) em `--vexo-report-inset`
      (#0f141c, `bg-vexo-reportInset`/`stroke-vexo-reportInset`), mais escuro que o bloco que as
      contém. Como o contraste entre blocos escuros é baixo, a separação conta com a borda 1px clara a
      7% e a sombra escura suave (`--vexo-report-shadow`), as mesmas nos dois níveis. Os tokens
      `--vexo-report-panel-top/bottom` da 4ª rodada foram substituídos por estes.
    - **Traços finos e separadores**: toda borda/separador da tela tem 1px em `vexo-reportLine`
      (`--vexo-report-edge` a 7%, opacidade fixa no `tailwind.config.ts`) — nunca `vexo-border`. A
      linha fina é o recurso padrão de separação: entre os 4 números, entre os números e a faixa de
      taxas (dentro do mesmo bloco) e entre Follow-up e Reativação.
    - **Números**: `text-report-value` 24px / `sm:text-report-value-lg` 26px, semibold (antes
      28/30). Rótulos em `vexo-reportCaption` com peso normal (`font-normal`, via `labelClassName`
      do `MetricCard` — o padrão do componente passou a ser `font-medium text-vexo-muted`, mesmo
      visual de antes no Painel). Frase de abertura sem mudança.
    - **Anel**: traço 5 (reverte o 11 da 4ª rodada), trilha `vexo-reportInset` quase invisível,
      mesmo degradê ciano → verde, percentual central em peso normal.
    - **Barras** (semanas e Evolução): estreitas (`w-3` semanas, `w-2.5` cada barra da Evolução),
      bem menores que o espaço da coluna, centradas, com mais espaço entre colunas (`gap-3`/`gap-2`),
      topo arredondado (`rounded-t-sm`), apoiadas numa linha-base fina (`border-b
      border-vexo-reportLine`) sobre a área rebaixada. Âmbar só na semana de pico. Valor acima da
      barra SÓ quando > 0 — barra zero não tem rótulo nem barra.
    - **Faixa de taxas**: sai do bloco próprio e fica DENTRO do Resumo, abaixo dos números, depois
      de uma linha fina. Só as taxas válidas (`computeConversionRates` devolve a lista já filtrada;
      nunca uma célula "—"); "Agendaram → Compareceram" saiu (comparecimento fica só no anel, com a
      base). Uma linha por taxa no celular ("48%  Em conversa → Agendaram", sem quebra), lado a lado
      a partir de `sm`; nenhuma válida → a faixa some.
    - **Evolução**: começa no primeiro período com dados (`trimEvolution` — zeros iniciais somem, o
      título diz quantos períodos sobraram, ex. "últimos 4 meses"); oculta com < 3 períodos com
      dados; altura menor (`h-16`); legenda pequena com bolinhas nas mesmas cores.
    - **Layout**: celular empilhado em largura total (comprimento igual ao da 4ª rodada). Container
      `max-w-md` → `sm:max-w-xl` → `lg:max-w-4xl`; no `lg` o bloco anel + semanas e o de Evolução
      ficam lado a lado (quando a Evolução existe); Resumo e Follow-up/Reativação sempre em largura
      total.
    - Contraste testado (`report-tokens.test.ts`): legenda, azul positivo e off-white ≥ 4.5:1 sobre
      os dois níveis, o inset e o fundo.
  - **4ª rodada — vale sobre o que as rodadas anteriores dizem abaixo quando houver conflito:**
    - **Ordem**: cabeçalho (brilho + filete) → frase de abertura → Resumo (4 boxes) → **faixa de
      taxas de conversão** → anel + barras por semana → **evolução dos últimos 6 períodos** →
      Follow-up/Reativação (faixa única). No celular tudo empilha em largura total (testado: todo
      `.report-panel` com a largura do container em 360px). Container da página `max-w-md` no
      celular e `sm:max-w-xl` a partir de `sm` (os 4 boxes em linha cabem sem quebrar "vs. anterior").
    - **Elevação** (`.report-panel`, `globals.css`): degradê vertical sutil `--vexo-report-panel-top`
      (#1f2734) → `--vexo-report-panel-bottom` (#1a212c), ambos acima do `--vexo-bg`; borda 1px
      `--vexo-report-edge` (branco) a 7%; sombra escura suave `--vexo-report-shadow` (sem brilho
      colorido); raio `rounded-report` (14px = `block` + 2px). Sem esferas, formas decorativas,
      neumorfismo nem "HUD".
    - **Tipografia**: números dos boxes `text-report-value` (28px) / `sm:text-report-value-lg`
      (30px), semibold, off-white (`vexo-tabFg`) — via `valueClassName`/`labelClassName`, props
      opcionais novas do `MetricCard` (sem elas o visual é o de sempre; o Painel não passa nenhuma).
      Legendas em `vexo-reportCaption` (#8b909a). Títulos de seção `text-xs` (12px) off-white,
      caixa alta. Frase de abertura `text-report-lead` (18px).
    - **Topo**: `.report-header-glow` (radial do azul da marca a ~13%, `closest-side` — some antes
      das bordas, sem quina dura) + `.report-title-rule` (2px, `--vexo-accent` → `--tab-icon-1`) sob
      o nome da clínica. Nada além disso.
    - **Gráficos**: anel com traço 11 (era 9, ~20% mais grosso), mesmo degradê ciano → verde; barras
      com cantos superiores arredondados (`rounded-t-md`), mesmo degradê `.report-bar-fill` e a
      única barra âmbar na semana de pico. **Evolução** (`PeriodEvolutionChart.tsx`): Agendaram
      (`.report-bar-fill`) e Compareceram (`.report-attended-fill`, as cores do anel) por período,
      rótulos curtos ("mai", "1ª out" — `formatReportPeriodShortLabel`); só aparece com >= 3
      períodos com dados (`shouldShowEvolution`). Dados por UMA consulta agregada de agendamentos
      (mesmo filtro de "Agendaram" + `computeAttendanceMetrics`), último ponto = números do Resumo.
    - **Faixa de conversão** (`computeConversionRates`, `report-rates.ts`): Abordados → Em conversa,
      Em conversa → Agendaram, Agendaram → Compareceram, sempre com os números dos boxes
      (denominador = box anterior). "—" quando o denominador é 0, quando a taxa passaria de 100%
      (bases diferentes) e, na 1ª, quando "Abordados" não veio de registro manual de abordagem
      (`ApproachLog` < conversas → `getClinicMetrics` usa o nº de conversas como "Abordados", e a
      taxa seria um 100% artificial).
    - **Comparecimento**: o box "Compareceram" não tem mais linha de taxa. O anel mostra a taxa
      (attended/pastDue, definição do Painel) e logo abaixo a base exata ("9 de 9 atendimentos com
      data no período") — a taxa nunca parece contradizer "Agendaram" (outra base).
    - **Comparação "vs. anterior"**: só quando atual > 0 E anterior > 0 (`computePercentDelta`);
      positiva em `vexo-reportPositive` (#5aa8d6 — o #2b87bd puro dá ~3.8:1 sobre o painel, reprova
      AA em 11px), negativa/zero em `vexo-reportCaption`. Nunca vermelho/rosa, nunca "-100%".
    - **Reativação**: "Voltaram" ganha "X% das enviadas" (oculto sem envio). **Follow-up**: "Leads
      retomados" segue SEM taxa — não existe total confiável de follow-ups enviados por período
      (`FollowUpLog` só guarda o último passo, que avança também em passo descartado sem envio).
    - Contraste dos tokens novos testado em `report-tokens.test.ts` (>= 4.5:1 sobre painel e fundo).
  - **Ordem da página (3ª rodada)**: cabeçalho → **frase de abertura** → Resumo (4 boxes) →
    **gráficos** (anel de comparecimento + barras de abordagens por semana, lado a lado a partir
    de `sm`, empilhados no celular) → Follow-up/Reativação numa faixa só. O bloco "Não
    compareceram" (box próprio) e a seção "Funil" separada da rodada anterior saíram — o primeiro
    porque dá pra deduzir do Resumo, o segundo porque duplicava os mesmos 4 números.
  - **Frase de abertura**: uma linha calculada SÓ com os números do Resumo (nunca um dado novo —
    ver `buildOpeningSentence`, `report-opening-sentence.ts`), em `text-vexo-tabFg` (off-white,
    mesmo token do texto das abas) e `text-sm` (14px, maior que o `text-xs` do texto de apoio ao
    lado). Singular/plural tratados por ramo (nunca "0 pessoas"/"0 agendaram"); abordados=0 vira
    uma única linha neutra, sem mês/quinzena; agendaram=0 ou compareceram=0 (com o resto > 0)
    trocam só a cláusula correspondente por uma frase neutra, nunca "0 X".
  - **Resumo (início do funil)**: 4 boxes — Abordados/Em conversa/Agendaram/Compareceram (mesmos
    nomes do Painel, nunca "Contatados") — na MESMA faixa `rounded-block border bg-vexo-surface2
    divide-x`/`MetricCard bare` de `PanelOverview.tsx`, literalmente o mesmo container, não uma
    cópia parecida. A taxa de comparecimento não é mais um box: é uma linha (`hint`) dentro do
    próprio box "Compareceram", agora como **"X% de comparecimento"** (3ª rodada: o rótulo antigo,
    "X% dos agendados", prometia uma base — `funnel.scheduled`/"Agendaram", agendamentos CRIADOS
    no período — diferente da que a conta usa, `attended/pastDue` — agendamentos cuja DATA já
    passou dentro do período, mesma definição de `getAttendanceMetrics`/Painel; as duas bases
    coincidem na maioria dos casos mas podem divergir nas bordas do período, o que já produziu um
    "100% dos agendados" com 9 de 10 reais — 90%, não 100%. A CONTA não mudou, só o rótulo passou a
    descrever honestamente a base que ela sempre usou).
  - **Gráficos**: **anel de comparecimento** (`AttendanceRing.tsx`, SVG simples sem biblioteca,
    `role="img"` com `aria-label` do valor) — mesma taxa do box "Compareceram", nunca uma segunda
    conta; traço em degradê `--tab-icon-1` (#28a4c2, ciano) → `--tab-icon-4` (#49b76c, verde),
    mesmos tokens já usados nos ícones das abas, sobre uma trilha `vexo-border`. Sem base (nenhum
    atendimento no período): anel vazio, "—". **Barras "Abordagens por semana"**
    (`WeeklyApproachesChart.tsx`, puro HTML/CSS, sem SVG/biblioteca) — uma barra por semana civil
    (segunda a domingo, recortada nas bordas do período — ver `splitIntoWeeks`,
    `report-period.ts`), REUTILIZANDO `getClinicMetrics` por semana (mesma definição de
    "abordados" do Painel/Resumo, nenhuma métrica nova) com um ajuste final de arredondamento
    (`allocateToTotal`, método dos restos maiores) que garante a SOMA das barras bater sempre,
    exatamente, com o box "Abordados" — testado. Barras normais em degradê `--vexo-accent`
    (#2b87bd) → `--tab-icon-1` (#28a4c2); a semana com mais abordagens (só uma, mesmo em empate —
    a primeira) em âmbar sólido `--tab-icon-2` (#dbb148) — nenhuma cor nova em nenhum dos dois
    gráficos, mesmos tokens já usados nos ícones das abas.
  - **Follow-up + Reativação numa faixa só**: um container (`rounded-block border bg-vexo-surface2
    p-block`) com "Follow-up" (box "Leads retomados") de um lado e "Reativação" (boxes "Enviadas"
    e "Voltaram") do outro, divididos por uma borda fina a partir de `sm`; no celular empilham
    (Follow-up acima, Reativação com seus 2 boxes abaixo — ambos ocupando a largura toda do
    container, sem sobrar espaço vazio ao lado). Sem nenhuma reativação enviada no período, mostra
    os 2 boxes em 0 em vez de esconder a seção.
  - **Cor — uma regra só, SÓ NO RELATÓRIO**: nenhum dos 4 boxes do Resumo usa `highlight` (3ª
    rodada: removido também de "Agendaram") — decisão revista explicitamente pelo usuário após a
    rodada anterior já ter documentado o destaque como "igual ao Painel"; o Painel
    (`PanelOverview.tsx`) continua intocado, com o destaque `text-vexo-panelHighlight` (`#caa85c`)
    só em "Agendaram" ali — a regra "uma cor só" vale SÓ pra esta tela. A comparação com o período
    anterior usa o azul da marca (`text-vexo-accent`) só quando a variação é positiva; negativa,
    zero ou sem base fica em `text-vexo-muted` (cinza) — nunca vermelho/rosa em lugar nenhum da
    tela. Esse azul-só-no-positivo é o único toque de cor novo desta tela; fora dele, qualquer
    dúvida de cor segue o Painel.
  - **Títulos e profundidade (3ª rodada)**: títulos de seção (Resumo/Follow-up/Reativação/dos dois
    gráficos) em `text-vexo-tabFg` (off-white, mesmo token do texto das abas) e `text-card` (11px —
    um token já existente, +1px sobre o `text-caption` de 10px usado antes), em vez do cinza
    apagado da rodada anterior. Todo bloco (Resumo, gráficos, Follow-up/Reativação) ganha
    profundidade com o mesmo par já usado em todo o app — `bg-vexo-surface2` (um tom acima do
    `bg-vexo-bg` da página) + `border border-vexo-border` fina — nenhum token novo precisou ser
    criado nesta rodada: os tons de superfície, as cores dos ícones das abas e o azul da marca já
    cobriam tudo que esta tela precisava.
  - **Comparação com o período anterior**: aparece discreta só nos 4 boxes do Resumo (ex.: "+12%
    vs. anterior"). Quando o período anterior é zero ou não existe, não mostra percentual nenhum
    pra aquele box (nunca "-infinito%"/"-100%" artificial).
  - **Rótulo nunca cortado**: nenhum box usa largura fixa estreita pra número/rótulo — todos vivem
    dentro dos containers já testados do Painel (a faixa `divide-x` de 4 colunas pro Resumo, um
    grid de 2 colunas com 1 célula usada pros boxes avulsos), garantindo espaço suficiente pro
    rótulo em 360/390/414/1366px sem precisar tocar no `MetricCard` (que é compartilhado com o
    Painel e mantém seu `truncate` original).
  - "Dados de exemplo" (fallback simulado, só Clínica Demo, quando o período real está vazio) é um
    selo pequeno, mesmo padrão da etiqueta de tipo de "Para fazer hoje" (`bg-vexo-surface2`, texto
    `vexo-muted`, caixa alta pequena) — nunca uma cor de alerta. "Vazio" é definido como: Abordados
    = 0 E Agendaram = 0 E Compareceram = 0 E Reativação enviada = 0, todos ao mesmo tempo (ver
    `isEmptyFunnel`, `report-metrics.ts`) — qualquer sinal real diferente de zero já mostra dados
    reais, nunca troca por simulado. Quando simula, o período ATUAL e o ANTERIOR saem da mesma
    fonte simulada (decisão tomada uma única vez a partir do período atual), pra comparação
    aparecer de forma coerente — nunca compara um lado simulado com o outro real/vazio. A série
    semanal do gráfico de barras também sai simulada junto (`buildSimulatedWeeklyApproached`),
    somando sempre exatamente o "Abordados" simulado. Clínica real nunca recebe número simulado,
    nunca.
  - **Preview admin (`/crm/clinicas/[id]/relatorio-preview`)**: abre sempre no último período
    FECHADO de cada tipo (mês ou quinzena cheios, nunca o que está em andamento) — ver
    `computeLastClosedPeriod`, `report-period.ts`. Evita o artefato de comparar um período parcial
    contra um anterior completo (queda falsa só por o mês ainda não ter terminado). **"Enviar agora"
    usa este MESMO período** (4ª rodada — antes mandava o mês em andamento, todo zerado); o envio
    AGENDADO continua cobrindo o período que contém o momento do envio. O link sempre mostra o
    período gravado na entrega.
- Números REUTILIZADOS das mesmas fontes do Painel — nenhuma segunda definição: `getClinicMetrics`/
  `getAttendanceMetrics` (`metrics.ts`) pro resumo/funil, `getReactivationReturnStats`/
  `RETURN_ATTRIBUTION_DAYS` (`reactivation.ts`, via um adapter que reproduz o período de
  calendário pedido através da MESMA janela rolante existente, sem mexer numa linha daquele
  arquivo) pra Reativação. "Retomados" (Follow-up) é a única contagem nova, mas reaproveita um
  campo que já existia e já era escrito hoje (`FollowUpLog.respondedAt`), só uma agregação nova em
  cima dele — ver `report-metrics.ts`.

## Página pública (vexoia.com.br) — landing e páginas legais
Rotas públicas, sem login: `/` (landing), `/privacidade`, `/termos` (e `/termos-de-uso`, mesmo
conteúdo, rota antiga mantida) e `/exclusao-de-dados`. O login fica em `/entrar` (mesmo formulário de
antes, `LoginForm.tsx`); `/login` só redireciona pra `/entrar`. Paleta PRÓPRIA destas telas, em tokens
`--pub-*` (`globals.css`) / cores `vexo-pub*` (`tailwind.config.ts`) — independentes das cores do app
que a tela Configurações sobrescreve. Nunca "M8 Growth" nessas páginas.
- **Tokens**: fundo `--pub-bg` #070a11 com dois brilhos nos cantos superiores (`.pub-backdrop`:
  esquerdo `--pub-glow-left` #547aca a 30%, direito `--pub-brand` #2b87bd a 28%, radial que some em
  ~70%); texto `--pub-fg` #e6e8ec, secundário `--pub-fg-2` #a3a8b2, apoio `--pub-muted` #8b909a;
  destaque `--pub-accent` #5db4e6; botão primário `--pub-button` #2478a8 com texto branco (4.9:1),
  hover `--pub-brand`; verde `--pub-green` #49b76c SÓ em checks e variações positivas; cabeçalho
  `--pub-header-bg` #0e131c a 72%.
- **Blocos** (`.pub-block`): fundo branco 3%, borda 1px branco 8%, cantos `rounded-pub-sm` (32px),
  `rounded-pub` (36px) ou `rounded-pub-lg` (44px) — larguras variadas de propósito (grades 1fr/1.2fr,
  1.25fr/1fr alternando), nada "quadradão". Brilhos: `.pub-glow-top` (azul no topo — DEPOIS,
  Contato), `.pub-glow-corner` (canto, cor via `--pub-corner` = um dos `--tab-icon-*` — cards de
  "Como funciona"). Botões e etiquetas sempre em pílula (`rounded-full`).
- **Tipografia**: Inter. Hero `text-pub-hero` 38px / `md:text-pub-hero-lg` 68px, 600, -0.038em;
  títulos de seção `text-pub-h2` 28px / `md:text-pub-h2-lg` 40px; sobretítulos 11px caixa alta em
  `pubAccent`.
- **Logo** (`VexoLogo.tsx`): "X" fino de dois traços curvos (SVG 26×26, stroke 2.4 arredondado,
  um em #5db4e6 e outro em #e6e8ec a 75%) + "vexo" (minúsculas, 500, 24px, -0.02em) + " ia"
  (#8b909a, 400). Nunca em caixa alta. Favicon: `src/app/icon.svg`.
- **Estrutura da landing**: cabeçalho flutuante em pílula (máx. 1040px, links somem no celular) →
  hero → órbita (`OrbitDiagram.tsx`, um SVG 760×400 que escala inteiro; ícones genéricos lucide em
  traço fino, nunca logos da Meta; `.orbit-label` maior em unidades do SVG no celular) → Por que o
  VEXO (ANTES com pílulas inclinadas / DEPOIS com 4 passos) → Como funciona (4 cards) → Resultados
  (gráfico de colunas do Relatório, `ReportColumnChart`, com dados ESTÁTICOS e selo "Exemplo
  ilustrativo") → Segurança (bloco único 2×2 com linhas finas) → Contato (mailto) → rodapé.
- **Rodapé**: logo, colunas Produto/Legal/Contato, linha de marcas da Meta. Razão social e CNPJ vêm de
  `src/lib/legal-info.ts` e só aparecem quando os DOIS estiverem preenchidos (hoje vazios).
- **Páginas legais**: mesmo cabeçalho/rodapé, coluna de leitura de no máximo 720px (`LegalPage.tsx`),
  textos escritos a partir do que o código faz.
- Acessibilidade: header/nav/main/section/footer, "Pular para o conteúdo", ícones decorativos com
  `aria-hidden`, transições só com `motion-safe:` (respeita prefers-reduced-motion).
- **2ª rodada (vale sobre o que está acima quando houver conflito):**
  - **Logo**: "X" simétrico de dois traços retos (`M6 6l14 14` em #5db4e6, `M20 6L6 20` em #e6e8ec a
    80%), 20px no cabeçalho/rodapé, 34px no centro da órbita, 16px na etiqueta "Depois"; texto "vexo"
    21px/500/-0.02em + " ia" #8b909a/400, com `normal-case` explícito (nunca caixa alta).
  - **Hero**: título 34px (celular) / 58px (desktop), 600, -0.036em; subtítulo 18px; botões 15px.
    Canal: a conversa é no Instagram; o WhatsApp só confirma, lembra, faz follow-up, reativação e
    relatório — nenhum texto pode dizer que a IA conversa no WhatsApp.
  - **Cabeçalho**: links e "Entrar" em 13px, padding enxuto, link "Dúvidas" (#duvidas).
  - **Órbita colorida**: cada nó com fundo da própria cor a 12%, borda a 40% e brilho radial a ~20%
    (WhatsApp `--pub-whatsapp` #25d366, Agenda `--pub-agenda` #5b8def, Instagram com o traço do ícone
    em degradê `--pub-ig-orange`→`--pub-ig-pink`→`--pub-ig-purple` e brilho rosa, Follow-up
    `--tab-icon-2`, Relatório `--pub-accent`, Condução `--tab-icon-1`, Reativação `--pub-violet`
    #a78bfa). Ícones genéricos em traço (lucide), nunca logos oficiais.
  - **Faixas claras** (`.pub-light-band`): "Como funciona" e "Perguntas frequentes" — margem lateral
    16px, máx. 1280px, `rounded-pub-band` (56px), fundo `--pub-light-bg` #eef3f8 com degradê azul a
    20% nos primeiros 260px; títulos `--pub-light-title` #0b0f17, parágrafos `--pub-light-text`
    #4a5565 (6.8:1), sobretítulos `--pub-light-eyebrow` #1d6c9c (5.1:1). Cards brancos
    (`.pub-light-card`: borda 6%, sombra 0 16px 40px a 6%), numeral em serifa itálica #2478a8, ícone
    em círculo na cor do passo; cards 2 e 4 deslocados 28px pra baixo no desktop.
  - **Serifa de destaque**: Instrument Serif itálico (`font-pub-serif`, self-hospedada via
    `@fontsource/instrument-serif`, importada só na casca pública — sem `next/font/google`, mesmo
    motivo do Inter: nenhuma rede no build). Uma palavra/expressão por título, na cor de destaque da
    seção (#5db4e6 no escuro, #2478a8 no claro). O título do hero continua em Inter.
  - **DEPOIS** = conversa de exemplo (balão do paciente à esquerda, balão da IA à direita em degradê
    `.pub-bubble-ai` #2478a8→#3a5fb0), cartão "Avaliação agendada" com borda verde e selo
    "Confirmada", etiquetas "Lembrete no dia anterior" (amarela) e "Reativação programada" (violeta),
    "Exemplo ilustrativo".
  - **Funil em pontos** (Resultados): 21 círculos de 24px (7×3, espaço 14px) — 9 verdes, 1 azul, 5
    azul-claros, 6 cinza — com `role="img"` e legenda; exemplo fixo.
  - **Segurança**: ícones com cor própria (azul, verde, amarelo, violeta; fundo 12%, borda 35%) e uma
    linha de selos em pílula (mono 12px, caixa alta, 0.08em, cinza, check verde) — só o que é
    verdade no código: HTTPS, chaves cifradas AES-256, senhas em hash, login obrigatório, exclusão
    sob pedido. Nunca selos de certificação que não temos.
  - **FAQ** (#duvidas): `<details>/<summary>` nativos (sem JS), cartões brancos 24px, "+" que gira 45°
    ao abrir, a primeira aberta; respostas em `faq-items.tsx`, conferidas no código.
  - **Contato**: faixa em degradê `.pub-cta-band` (`--pub-cta-1/2/3`), `rounded-pub-cta` (48px),
    72px em cima e nada embaixo, botão branco, e o cartão do relatório (`--pub-peek-bg` #0b1018)
    "espiando", cortado pela borda inferior (210px visíveis).
