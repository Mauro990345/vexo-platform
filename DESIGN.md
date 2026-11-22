# VEXO: guia de design

## Princípios
- Premium, minimalista e compacto. Interface escura, poucos elementos, bom espaçamento, sem blocos grandes ou espaçados demais.
- Hierarquia clara: títulos principais em branco puro (ver "Cor" abaixo), textos de apoio em cinza. Cor aparece só em detalhes (palavras, ícones, indicadores), nunca em grandes preenchimentos.
- No máximo 2 matizes de destaque por bloco. Nada de etiquetas chamativas, faixas coloridas na lateral de blocos novos nem cores vivas.
- Mobile-first: nunca rolagem horizontal da página; abas rolam dentro da própria linha. Testar em 360, 390, 414 e 1366 px.

## Cor (decidido e aplicado)
- Azul da marca e das ações: #2b87bd. Usado em item ativo da sidebar, logo, botões principais, abas ativas (sublinhado), links, checkbox/toggle e foco de campos. Fundos de estado ativo com esse azul em ~12-14% de opacidade.
- Cores de significado, só para o que significam (não decorativas): verde do "Agendado" (ok/ativo/conectado), marrom do "Quente/Faltou" (atenção/destaque), roxo da coluna "Em conversa", e as cores de erro/alerta já existentes. Não adicionar vermelho nem rosa novos como decoração. O ícone do Instagram segue as cores da marca dele.
- Texto: títulos e texto principal em branco puro (#ffffff — `--vexo-fg`; `--vexo-tab-fg`, abas/alguns rótulos, segue o mesmo valor). Era off-white (~#f1f4f8/#e6e8ec, regra antiga "nunca #ffffff puro") — revertido por pedido explícito: lia como acinzentado/opaco, baixa definição, comparado ao branco nítido de outras plataformas. Textos que explicam ou informam continuam em cinza (~#8b909a).
- Desagradam e não devem ser usados: verde-água/pastel apagado, azul muito vivo e saturado, rosa.

## Abas com ícone (aplicado; cores em atualização)
- Cor do ícone fixa por posição (da esquerda para a direita, recomeçando em cada página): 1ª #28a4c2, 2ª #dbb148, 3ª #547aca, 4ª #49b76c. Variáveis tab-icon-1 a tab-icon-4.
- Texto da aba **ativa** em branco puro (`--vexo-tab-fg`, ver "Cor" acima), com o sublinhado azul
  fino embaixo dela (já existia, continua animado). Texto das abas **inativas** em cinza
  (`text-vexo-muted`) — antes todas ficavam no mesmo tom e só o sublinhado indicava a seleção;
  pedido explícito (inspirado num app concorrente) pra aumentar o contraste entre ativa/inativa.
  Vale pro `Tabs.tsx` reutilizável
  (ex.: dentro de "Agente de IA": "Prompt de conversação da IA"/"Fotos de resultado"/"Timing de
  resposta da IA"/"Janela de envio") e qualquer outra tela com esse mesmo padrão de abas.

## Bônus Full Face (identidade própria, não mexer sem aviso)
- Verde sutil e escuro no bloco grande (áudio + texto), via variável única; fundo da página no escuro padrão.
- Bloco "Ideia central": marrom escuro com borda vertical mais clara à esquerda (mesmo marrom do card "Faltou"). É a única faixa lateral aprovada (além da barra de Reativação em "Para fazer hoje", ver rodada 2 daquela seção).
- Fontes do Bônus: Bricolage Grotesque (títulos) e Figtree (texto). Resto do app: **Inter
  Variable** — ver seção própria "Fonte (Inter Variable)" abaixo.

## Fonte (Inter Variable)
Investigado a fundo depois de um pedido explícito pra trocar "a fonte datada do VEXO" por Inter
Variable self-hosted: o VEXO **já usava exatamente isso**, não a fonte estática. Confirmado em
`node_modules/@fontsource-variable/inter/wght.css` — `font-family: 'Inter Variable'`,
`font-weight: 100 900` (um único arquivo `.woff2-variations` por range de caracteres, não um
arquivo por peso), importado em `src/app/layout.tsx` via `@fontsource-variable/inter/wght.css` (o
pacote variável, não o `@fontsource/inter` estático) — mesmo princípio de sempre (self-hosted,
sem chamada a fonts.googleapis.com no build do Railway, ver `--font-inter` em `globals.css`).
Nada precisou trocar aqui; a sensação de "datada" vinha do tamanho dos títulos (pequenos demais,
não do peso — os títulos já usavam `font-semibold`/600, não 400) — ver "Tamanho dos títulos"
abaixo, que é a correção de verdade pra esse pedido.

Pedido explícito de confirmar com PROVA (não só ler o código): rodado o app de verdade
(`npm run dev`) e inspecionado com Playwright. `getComputedStyle(document.body).fontFamily` e o
mesmo em um `<h1>` retornam `"Inter Variable", ui-sans-serif, system-ui, -apple-system, sans-serif`
— e a aba de rede mostra o arquivo `inter-latin-wght-normal.*.woff2` sendo baixado (o pacote
VARIÁVEL, nome do arquivo tem `-wght-`; a versão estática teria um arquivo por peso, tipo
`inter-latin-400-normal.woff2`, `inter-latin-600-normal.woff2` etc. — não é isso que carrega).
Confirmado, nada a trocar.

## Abas com ícone — rodada 2 (título maior)
Pedido explícito: o texto das abas (`Tabs.tsx`) estava pequeno/desproporcional ao resto da tela —
`text-sm` (14px), era `text-xs` (12px). Único lugar que define esse estilo, então vale pra TODA
tela que usa o componente (Agente de IA, Follow-up, Automações, Fila de abordagem e qualquer outra
com esse padrão de abas), não só pras que apareceram no pedido como exemplo.

### Abas com ícone — rodada 3 (correção: Agente de IA ganhou rolagem horizontal feia depois da fonte maior)
Efeito colateral da rodada 2: com a fonte maior, as 4 abas de Agente de IA ("Prompt de conversação
da IA"/"Fotos de resultado"/"Timing de resposta da IA"/"Janela de envio") passaram a somar mais
largura que o container da própria página (`max-w-3xl`, 768px) — por ~16px, medido com o CSS real
do app — e a linha de abas (que tem `overflow-x-auto` por design, ver rodada 1 desta seção) ganhou
sua própria barra de rolagem horizontal, visível mesmo em telas de computador largas. Corrigido
alargando só o container de Agente de IA (`max-w-3xl` → `max-w-4xl`, 896px — dá folga suficiente,
confirmado com o mesmo método de medição), em vez de reduzir a fonte de novo. Automações e Follow-up
não precisaram de ajuste: já cabiam folgado nos containers deles (`max-w-3xl`/`max-w-lg`) mesmo com
a fonte maior. Teste de regressão em `Tabs.layout.test.ts` cobre os 3 containers reais.

## Ícone decorativo da sidebar — rodada 2 (robô, sozinho, sem sobrepor o logo) [SUBSTITUÍDO, ver rodada 3]
Pedido explícito corrigindo a 1ª rodada: a versão anterior colocava um ícone "mascote" (dois
círculos) por CIMA do quadrado azul liso de sempre, os dois sobrepostos — visualmente errado.
Agora é um ícone SÓ, no lugar do quadrado: cara de robô (estilo do ícone "Eli" do app de
referência) — cabeça arredondada azul (`fill-vexo-accent`) com "olhos" e antena brancos
(`fill-vexo-accentFg`), `VexoRobotIcon` em `AppShell.tsx`, só tokens de sempre, nenhuma cor nova.
Ao lado do nome "VEXO" no topo da sidebar **desktop**, puramente estético, sem nenhuma função de
busca/comando associada. Só na sidebar desktop; o cabeçalho mobile (`sm:hidden`) não muda — continua
com o quadrado azul liso de sempre, não é a sidebar.

## Ícone da sidebar — rodada 3 (decisão final: o mesmo "X" da logo pública, não um ícone novo)
Decisão explícita: esquecer o robô (e qualquer outra referência de app concorrente) pro ícone da
sidebar. Em vez de desenhar algo novo/próprio pra sidebar, reaproveita DIRETO o `VexoMark`
(`components/public/VexoLogo.tsx`) — o mesmo "X" de dois traços retos cruzados que já é a logo da
página pública (vexoia.com.br, "X vexo ia" no topo). Mesmo componente, mesmo desenho, mesma cor
(`stroke-vexo-pubAccent`/`stroke-vexo-pubFg`, os tokens que o próprio `VexoMark` já usa — não um
token novo), importado em `AppShell.tsx` em vez de duplicado. Único ícone ali (substitui de vez o
quadrado azul liso E o robô das rodadas anteriores). Só na sidebar desktop; o cabeçalho mobile
(`sm:hidden`) não muda — continua com o quadrado azul liso de sempre, não é a sidebar. Verificado
visualmente (screenshot comparando o X da sidebar lado a lado com o da página pública) antes de
fechar.

## Fundo da sidebar (desktop) — mesmo tom do conteúdo, separados só por uma linha fina
Pedido explícito (estilo Linear/Vercel): o `<aside>` da sidebar desktop usava `bg-vexo-surface`
(#141a24, mesmo tom dos cards) — mais claro que o fundo da página (`bg-vexo-bg`, #0b0f17, usado no
`<body>`), criando um contraste de blocos que não era a intenção. Trocado pra `bg-vexo-bg` — agora
sidebar e conteúdo principal têm exatamente o mesmo fundo; a separação entre os dois vira só a
borda fina de 1px que já existia (`border-r border-vexo-border`), sem precisar de nada novo. Cor de
ícones/texto da sidebar (item ativo, grupos, badge etc.) não foi tocada — só o `bg-*` do `<aside>`
mudou. Só a sidebar **desktop**; o cabeçalho mobile (`sm:hidden`) continua em `bg-vexo-surface`, não
é a sidebar. Verificado visualmente (screenshot antes/depois) antes de fechar.

## Tamanho dos títulos — rodada 3 (pedido explícito: títulos ligeiramente maiores, como no app de referência)
Dois tokens novos de `fontSize` (`tailwind.config.ts`), peso 600 (`font-semibold`) já embutido —
mesmo peso de sempre, só o tamanho muda:
- `sidebar-title` (14px, era 12px/`text-xs`): só o "VEXO" no topo da sidebar desktop.
- `page-title` (22px, era 16px/`text-base` na maioria das telas por clínica, ou 20px/`text-xl` nas
  telas globais "Pipeline"/"Contas"/"Painel"/"Nova clínica") — **unificado num tamanho só**: as
  duas famílias de h1 que existiam (16px e 20px) eram uma inconsistência não documentada; em vez de
  só aumentar cada uma separadamente, ficou um token único reaproveitado por todo cabeçalho de
  tela do CRM (Pipeline, Contas, Painel, Nova clínica, Agente de IA, Automações, Briefing,
  Configurações, Conexões, Conectar WhatsApp, Status, Abordagem — todas as variantes, Envio de
  mensagens, Logs do webhook, Follow-up, Buscar seguidores, Mensagens). Ficaram de fora
  (deliberado): o título do Bônus Full Face (identidade própria, não mexer sem aviso) e o cabeçalho
  da Conversa (`crm/conversas/[id]`, mostra o NOME do lead, não um título de seção fixo).

### Tamanho dos títulos — rodada 4 (correção: aumento ficou grande demais, pedido era sutil)
Pedido explícito corrigindo a rodada anterior: o salto de `page-title` pra 22px (vindo de 16/20px)
e das abas internas (`Tabs.tsx`) pra 14px (vindo de 12px) foi longe demais do "aumento sutil"
pedido originalmente — ficou desproporcional ao resto da tela, repetido em Agente de IA,
Automações e Follow-up (título principal + abas internas das três). Reduzido:
- `page-title`: 22px → **18px** (`1.125rem`). Ainda um degrau acima da maioria das telas por
  clínica (que usava 16px antes da rodada 3), sem o salto que 22px dava.
- Abas internas (`Tabs.tsx`): 14px → **13px** (`text-meta`, token já existente — reaproveitado em
  vez de criar um novo só pra este valor, mesmo princípio de sempre). Um meio-termo entre o 12px
  original (pequeno demais) e o 14px da rodada anterior (grande demais).

## Direção desejada (a aplicar primeiro em UMA página piloto, depois estender)
- Base em camadas de cinza-azulado escuro: fundo da página, sidebar e blocos em 3 níveis sutis; mini-cards internos mais escuros que o card; bordas finas (~6-8% de branco), sem sombras pesadas.
- Sidebar minimalista: ícones de linha fina em cinza, cor só no item ativo, item ativo com fundo sutil e SEM contorno, tipografia regular e discreta.
- Cor por seção em detalhes (ícone do cabeçalho, título em caixa alta, palavras-chave), no máximo 4 cores no total: azul, dourado, verde e laranja/âmbar.
- Valores/números em off-white, unidade em cinza menor; títulos de seção pequenos em caixa alta com letter-spacing leve.

## Feedback de clique e botões "Salvar" (rodada inspirada num app concorrente)
- Todo botão clicável (`<button>`, qualquer variante) ganhou um estado "pressed" global: ao
  clicar, encolhe levemente (`scale(0.97)`) e escurece um pouco (`brightness(0.9)`), por 100ms —
  regra única em `globals.css` (`@layer base`, seletor `button:not(:disabled)`), não repetida por
  componente/tela. Resolve o problema de botões parecerem "mortos" ao clicar, sem nenhum sinal de
  que a ação foi registrada — cobre o `Button` e qualquer `<button>` cru, inclusive os que ainda
  existirem soltos nas telas.
- Botões de "Salvar" (configuração/lembretes/prazos/textos/janela/mensagens/cores, no Agente de
  IA, Automações, Follow-up, Abordagem, Configurações e nos forms de Reativação/Quente) passaram
  de `variant="outline"` (ou `<button>` cru com borda azul/fundo vazio) pra fundo azul PREENCHIDO
  (`bg-vexo-accent`) + texto branco (`text-vexo-accentFg`) — `variant="primary"` do `Button` onde
  o componente já era usado, ou a mesma combinação de classes direto onde ainda é `<button>` cru
  (`ReactivationConfigForms.tsx`, `WhatsappConnectionPanel.tsx`, `configuracoes/page.tsx`). O
  sombreado sutil (`shadow-button`, token em `tailwind.config.ts`) dá profundidade — nunca uma
  sombra pesada (ver Princípios). Ficou de fora deliberadamente: "Salvar legenda" (botão pequeno
  dentro de um card de foto, no Agente de IA) — é o próprio exemplo usado no comentário do `ghost`
  em `Button.tsx` pra esse tipo de ação secundária/discreta, e "Enviar lista"/"Copiar script" (não
  são botões de salvar).

### Botões "Salvar" — rodada 3 (correção: alguns ficaram outline por engano, sombra só embaixo)
Dois problemas da rodada anterior, corrigidos:
- Vários "Salvar" **não foram pegos** na 1ª rodada porque vivem fora dos arquivos de tela
  verificados então, em componentes compartilhados: `ReactivationConfigForms.tsx` (classe
  `SAVE_BUTTON_CLASS`, usada pelos 3 forms de prazo/limite da Reativação e do card Quente —
  ficaram com borda azul/fundo vazio), `WhatsappConnectionPanel.tsx` ("Salvar" do nome da
  instância, `<button>` cru) e `ClinicReportPanel.tsx` (`variant="outline"` explícito). Todos
  passaram pro mesmo padrão preenchido acima.
- O token `shadow-button` tinha 2 camadas de sombra; reduzido pra 1 só, com `x=0` e sem
  `spread` (`0 2px 3px 0 rgb(0 0 0 / 0.35)`) — pra garantir que a sombra só aparece embaixo do
  botão (efeito de elevação), nunca "contornando" as 4 bordas.

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
Instagram/WhatsApp ficavam com um ícone pequeno boiando num badge maior. `ChannelStatusPill.tsx`
tem um terceiro estado além de conectado/não conectado: `needsReconnect` (token vencido de verdade,
ex. sessão expirada da Meta) — ponto de status âmbar (`bg-vexo-warning`, nunca vermelho/rosa) em vez
do verde de "conectado" ou cinza de "não conectado", badge esmaecido igual ao de "não conectado"
(a cor continua só no pontinho, nunca no ícone/fundo inteiro). Mesma regra em Conexões
(`conexoes/page.tsx`): "Reconexão necessária" com `bg-vexo-warning`, nunca mais que isso — já era o
padrão pro Google Calendar, estendido aqui pro Instagram. Linha de "Para fazer
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

### Cor por tipo em "Para fazer hoje" — rodada 2 (barra lateral de volta só pra Reativação, etiqueta vira verde)
Pedido explícito (inspirado num app concorrente), que **reverte pontualmente** a regra "SEM faixa
lateral grossa" decidida acima e em Princípios ("nada de... faixas coloridas na lateral de blocos
novos") — só pro card de Reativação, só nesta lista, pra diferenciar visualmente das Agendamento
que ficam juntas:
- Cartão de Reativação (quando não está no grupo "Enviados") ganhou uma barra vertical azul
  (`bg-vexo-accent`, `h-8 w-1 rounded-full`) antes do avatar — a borda fina do cartão continua
  exatamente como estava (azul, ~35%, `--vexo-card-type-reativacao`), a barra é um elemento extra,
  não substitui nada. Cards de Faltou/Quente/Não agendou nunca ganham essa barra.
- A etiqueta/texto "REATIVAÇÃO" passa de azul pra **verde** — token novo e FIXO,
  `--vexo-card-type-reativacao-chip-text` (#34d399, mesmo tom do `--vexo-success` já aprovado no
  app, mas um valor próprio e independente dele: `--vexo-success` é semântico/customizável via
  Tema, este é fixo só pra esta etiqueta). Importante: só a etiqueta muda de cor — a borda do
  cartão continua usando o token azul de sempre, por isso a etiqueta precisou de um token separado
  em vez de reaproveitar `--vexo-card-type-reativacao`.
- Faltou (roxo) e Quente (laranja), como já eram: sem nenhuma mudança — continuam no mesmo
  `--vexo-card-type-followup` (marrom/dourado) de antes; a descrição de cor nesta rodada do pedido
  não bateu com o valor real no código, então nada foi tocado neles.

### Cor por tipo em "Para fazer hoje" — rodada 3 (correção: a barra vira a própria borda do cartão)
Pedido explícito corrigindo a rodada anterior: a barra era um `<span>` DENTRO do cartão (encostada
na borda, mas por dentro da área de conteúdo) — o pedido original era a própria borda esquerda do
cartão virando essa barra grossa. Trocado: o `<span>` interno saiu; agora, só nos cards de
Reativação (e só fora do grupo "Enviados"), a borda esquerda do cartão ganha `border-l-4
border-l-vexo-accent` por cima do `border` fino dos outros 3 lados (que continuam no mesmo tom
tingido de sempre, `border-vexo-cardTypeReativacao/35`) — é a borda de verdade do elemento, não
mais um indicador interno. Mesmo azul de sempre, nenhum token novo.

### Cor por tipo em "Para fazer hoje" — rodada 4 (correção: ficaram DUAS barras juntas; fina+curta, não a borda inteira)
Bug introduzido pelas 2 rodadas anteriores: o merge de uma PR anterior trouxe de volta o `<span>`
interno da rodada 1 (nunca tinha sido removido de verdade do arquivo final, só da intenção) ao
mesmo tempo que a borda grossa da rodada 3 — resultado: duas barras juntas no mesmo card. Pedido
explícito pra corrigir, com 4 partes:
1. Removido de vez o `<span>` interno (o que ocupava espaço no flex, empurrando o avatar).
2. Removida também a borda esquerda grossa (`border-l-4`) — ela cobria a altura INTEIRA do cartão,
   o que não era o pedido ("não a borda inteira, mais curta").
3. Ficou **uma barrinha só**: um `<span>` com posição `absolute` (não ocupa espaço no flex, não
   empurra o avatar — diferença-chave da rodada 1) dentro do cartão (que agora é `relative`),
   `left-0 top-1/2 -translate-y-1/2` (centralizada verticalmente, sobreposta na borda esquerda de
   1px de sempre).
4. Fina (`w-1`, 4px — mais fina que a borda grossa de 4px da rodada 3 só porque não soma mais à
   borda normal de 1px por baixo) e curta (`h-8`, 32px — bem menor que a altura do cartão,
   centralizada, não de ponta a ponta).

A borda do cartão (4 lados) volta a ser só a tingida normal (`CARD_BORDER_CLASS`, igual às outras
rodadas, sem engrossar nenhum lado). Mesmo azul de sempre (vexo-accent), nenhum token novo.
Verificado visualmente (screenshot do card renderizado com o CSS real do app) antes de fechar.

### Cor por tipo em "Para fazer hoje" — rodada 5 (ajuste fino: barra mais fina/alta, verde menos saturado)
Dois ajustes finos pedidos depois de aprovar a barra única da rodada 4:
- Barrinha: mais fina (`w-0.5`, era `w-1`) e um pouco mais alta (`h-10`, era `h-8`) — continua
  absoluta, centralizada verticalmente, sem ocupar espaço no flex do conteúdo.
- Etiqueta "REATIVAÇÃO": o verde estava um pouco saturado demais. Reduzida a saturação do token
  `--vexo-card-type-reativacao-chip-text` de ~64% pra ~50% (mesmo matiz/luminosidade — só menos
  vívido): de `52 211 153` (#34d399) pra `71 194 149` (#47c295). Continua um valor PRÓPRIO e fixo,
  independente do `--vexo-success` semântico/customizável.
Verificado visualmente (screenshot do card renderizado com o CSS real do app) antes de fechar.

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

## Fila de abordagem (1ª mensagem manual, pelo Instagram do celular)
`/crm/abordagem` (preparação, só admin), `/crm/abordagem/[clinicId]/mensagens` e `/crm/abordagem/fila`
(a tela principal, usada no celular) — ver `src/lib/approach-queue.ts`. Mobile-first de verdade, não
só "funciona no celular": uma coluna só, centralizada em `max-w-[520px]` também no computador (nunca
colunas lado a lado) — compacto e sem nenhum espaçamento grande de propósito, usando `Button`/`Card`/
`rounded-control`/`rounded-block`/`control-x`/`control-y` (Etapa 2 da migração) em vez de qualquer
classe solta nova.
- **Bolinha de estado da conta** (linha de contas no topo da Fila): 4 estados, cada um reaproveitando
  um token semântico já existente (nenhuma cor nova no projeto) — verde (`bg-vexo-success/25`) =
  liberada; cinza (`bg-vexo-muted/20`) = aguardando (mostra o `m:ss` regressivo no lugar do contador);
  dourado (`bg-vexo-warning/25`) = limite do dia atingido; cinza ESCURO (`bg-vexo-border`, mais sólido
  que o cinza de aguardando, sem precisar de um token novo) = pausada. A distinção "cinza" vs "cinza
  escuro" vem do PREENCHIMENTO (translúcido vs sólido) do mesmo par `vexo-muted`/`vexo-border`, não de
  uma cor nova.
- **Só o primeiro card de lead é ativo** (grande, com botão) — os outros 2 abaixo ficam esmaecidos
  (`opacity-50`, só nome/@), igual ao padrão de itens "esmaecidos/recolhidos" já usado alhures no
  Painel (grupo "Enviados (N)"). O botão "Enviar mensagem" (azul, `bg-vexo-accent`) ocupa a largura
  toda; "Pular" é um botão pequeno de contorno ao lado, nunca do mesmo tamanho — discreto de propósito
  (pedido explícito: evitar toque errado).
- **Espera (3-5min, sorteada a cada envio)**: o botão do card ativo vira cinza/desativado
  ("Aguarde m:ss") — nunca some, só desativa, mesmo padrão visual de qualquer botão `disabled` do
  projeto (`bg-vexo-surface2`/`text-vexo-muted`). O `m:ss` é recalculado no cliente a cada segundo a
  partir de um timestamp absoluto (`lockedUntil`, vindo do servidor) — nunca um contador decrescente
  "cru" no estado local, que dessincronizaria ao trocar de aba/aparelho.
- **Fora do horário (7h-20h, São Paulo)**: tela inteira substituída por um aviso só (`Card` com texto
  centralizado) — nenhuma conta nem card aparece, igual ao "não mostrar nada além disso" pedido
  explicitamente (sem totais, sem lista de próximos, sem texto de origem do lead).
- **Tela de preparação**: linha compacta por clínica (checkbox + nome/@ + campo numérico pequeno de
  limite + link "Mensagens") dentro de `rounded-control`/`border-vexo-border`/`bg-vexo-surface` —
  mesmo visual de linha de lista já usado em `ClinicSearchList.tsx`, só com os controles extras que
  esta tela precisa. Link "Mensagens" em `text-vexo-warning` (não `text-vexo-accent`) quando a clínica
  ainda não tem nenhuma mensagem cadastrada — mesmo princípio semântico do ponto âmbar de
  "needsReconnect" (chama atenção pra uma pendência, sem usar vermelho/rosa).

### Fila de abordagem — rodada 2 (bug de 3 cards, sem nome, layout limpo, horário configurável)
- **Bug real corrigido — só 1 card em vez de 3**: a detecção de cabeçalho do CSV comparava cada
  célula por SUBSTRING (`.includes("user")` etc.) contra os termos conhecidos. Um @ de verdade podia
  "conter" um desses termos por acaso (ex.: `novo_user_99` contém "user") — a 1ª linha do arquivo era
  então tratada como cabeçalho e descartada (`slice(1)`), levando embora um lead de verdade junto.
  Corrigido em `resolveApproachUploadRows` (approach-queue.ts): a comparação agora é SEMPRE EXATA (a
  célula inteira, já normalizada — minúsculo, sem acento, sem espaço/underscore/pontuação — precisa
  bater com um dos termos, nunca conter um pedaço). Sem nenhuma célula batendo exatamente, o arquivo
  inteiro (inclusive a 1ª linha) vira uma lista simples de @ — 1ª coluna de cada linha, sem nome
  nenhum (pedido explícito: "se não tiver cabeçalho, trate como lista de @"). Termos aceitos:
  `@`/`usuario`/`username`/`user`/`handle` (coluna de @) e `nome`/`name`/`full_name`/`nome completo`
  (coluna de nome) — comparação já tolera `_`/espaço (`full_name` e `nome completo` normalizam pro
  mesmo token).
- **Lead sem nome (caso comum — a lista só traz o @)**: o card mostra SÓ o `@usuario` em destaque,
  nunca repetido numa 2ª linha embaixo (bug visual corrigido — antes o @ aparecia duas vezes). Com
  nome, primeiro nome em destaque + `@usuario` embaixo, como antes. Vale pro card ativo (grande) e
  pros 2 esmaecidos.
- **Tela da Fila sem o cabeçalho/abas do Painel**: `/crm/abordagem/fila` saiu de dentro do grupo de
  rotas `(global)` (que aplica o `AppShell` — cabeçalho + sidebar/abas) pra uma pasta irmã
  `crm/abordagem/fila/` (fora do grupo, mesma URL — grupos de rota do Next.js não entram na URL, só
  decidem qual layout se aplica). Sem nenhum `layout.tsx` próprio nessa pasta, a página herda só o
  layout mais básico (`crm/layout.tsx`, que só garante sessão, sem chrome nenhum) — assim, a tela some
  com o cabeçalho e as abas, sobrando só o link pequeno "← Preparação" que a própria tela desenha. As
  telas de Preparação e Mensagens continuam dentro de `(global)` normalmente (ninguém reclamou delas).
- **Horário permitido configurável**: antes fixo no código (7h-20h); agora um singleton global
  (`ApproachWindowSettings`, mesmo padrão exato de `FollowUpSettings` — um `id` fixo "singleton",
  minutos desde a meia-noite em Brasília/São Paulo) editado na tela de Preparação com o MESMO modelo
  visual do "Horário inicial/final" do Follow-up (`<input type="time">` Das/às + botão Salvar,
  validando início < fim). Vale pra todas as clínicas (nunca por clínica). O aviso "Fora do horário"
  na Fila usa `formatApproachWindowLabel` a partir do valor salvo, nunca mais um número fixo no texto.

### Fila de abordagem — rodada 3 (bug real: "Enviar mensagem" não abria o Instagram no Safari/iOS)
Nenhuma mudança visual nesta rodada — só de mecânica interna. Documentado aqui porque é a 2ª vez que
um comportamento específico do Safari/iOS (gesto do usuário) quebra silenciosamente uma ação que
funciona normal no Chrome/desktop; vale a pena deixar registrado o porquê pra não reintroduzir o
mesmo bug num ajuste futuro.
- **Causa raiz**: o toque em "Enviar mensagem" esperava uma resposta do SERVIDOR (que sorteava a
  mensagem) antes de copiar pra área de transferência e abrir o Instagram (`window.open`). No Safari/
  iOS, `window.open`/clipboard só são autorizados DENTRO do mesmo "gesto do usuário" (clique/toque) —
  um `await` de uma chamada de REDE no meio quebra esse gesto e a abertura é bloqueada silenciosamente
  (sem erro visível; o VEXO já tinha marcado como enviado, por isso parecia "funcionar errado" em vez
  de simplesmente falhar). `InstagramDmButton.tsx` (Reativação) nunca teve esse problema porque a
  mensagem/link já chegam prontos nas props, sem nenhuma espera de rede entre o toque e o
  `window.open` — só um `await` rápido (cópia pro clipboard, não uma chamada ao servidor).
- **Correção**: a mensagem sorteada (e o link `ig.me/m/<@>` correspondente) passam a ser calculados e
  GUARDADOS no próprio item da fila (`ApproachQueueItem.assignedMessage`/`assignedMessageSlot`) assim
  que ele vira o card ATIVO — nunca mais no instante do toque. O board (`getApproachBoardAccount`) já
  devolve `message`/`dmLink` prontos pro card ativo; "Enviar mensagem" primeiro copia + abre (mesma
  ordem exata do `InstagramDmButton`) e só DEPOIS avisa o servidor pra registrar o envio
  (`confirmApproachSend`, que não sorteia nada — só confere as travas de novo e faz o claim atômico
  de sempre). "Desfazer" nunca apaga `assignedMessage` — é isso que garante a mesma mensagem de volta;
  "Pular" descarta o item (e a mensagem que ele tinha) pra sempre, e o PRÓXIMO item só ganha a sua
  própria quando ele mesmo virar o card ativo (nunca sorteia adiantado pros 2 cards de prévia, que não
  têm botão nenhum pra precisar disso).

### Fila de abordagem — rodada 4 (ajuste de tamanho/cor, sem mexer em layout/lógica)
Pedido explícito: só tamanho de letra, tamanho de círculo e tom de cinza — mesma ordem, mesmos
textos, mesmo comportamento. Dois tokens novos (nenhum existente mudou de valor, então nada mais na
tela é afetado):
- `fontSize.meta` (13px) e `fontSize.body-sm` (15px) em `tailwind.config.ts` — nomeados por PAPEL
  (texto de apoio pequeno / texto secundário um degrau mais legível), não pela tela, pra poderem ser
  reaproveitados em qualquer lugar que precise do mesmo degrau entre `caption` (10px) e o padrão
  `text-sm` do Tailwind (14px).
- `colors.vexo.mutedLight` (`--vexo-muted-light`, `#b2bac7`) — meio-termo entre `--vexo-muted`
  (`#8b96a8`) e `--vexo-fg` (`#f1f4f8`): mais legível que o cinza apagado padrão, mas ainda
  visivelmente mais discreto que o texto principal/ativo.
- **Linha de contas no topo**: círculo 36px -> 48px (`h-9 w-9` -> `h-12 w-12`), iniciais 12px -> 16px
  (`text-xs` -> `text-base`, mesma proporção de crescimento do círculo); nome da clínica 10px -> 14px
  (`text-caption` -> `text-sm`, já existe na escala padrão do Tailwind, sem token novo); contador
  embaixo (`m:ss`/`N/limite`) 10px -> 13px (`text-caption` -> `text-meta`), cor inalterada
  (`text-vexo-muted`). Preenchimento do botão (`px-2.5 py-2`, antes `px-2 py-1.5`) e `gap-1.5` (antes
  `gap-1`) cresceram na mesma proporção dos elementos internos, só o suficiente pra não apertar —
  continua compacto, cabendo várias contas com rolagem lateral no celular.
- **2 cards de prévia** (atrás do card ativo): 10px -> 15px (`text-caption` -> `text-body-sm`);
  trocou o truque antigo (`opacity-50` por cima de `text-vexo-fg`/`text-vexo-muted`, que esmaecia o
  BLOCO inteiro incluindo a borda) por cor direta — `text-vexo-mutedLight` pro nome/@ sozinho,
  `text-vexo-muted` pro @ quando há nome junto (mesma hierarquia nome-claro/@-mais-apagado que o
  card ativo já usa, só um degrau abaixo) — mais legível porque não há opacidade reduzindo contraste,
  e a borda/fundo do card ficam no tom normal (não translúcidos). Padding vertical `py-2` -> `py-2.5`
  (card um pouco mais alto, acompanhando o texto maior).
- **Textos auxiliares** ("Não enviei · Desfazer", "Pausar esta conta", e a linha abaixo do nome da
  conta selecionada — @ conectado ou "sem Instagram conectado"): 10px -> 13px (`text-caption` ->
  `text-meta`) e cor `text-vexo-muted` -> `text-vexo-mutedLight`.
- **Intocado, por pedido explícito**: o card ativo (nome/@ grande, botão azul "Enviar mensagem",
  "Pular", "Aguarde m:ss") e "Retomar conta"/"Pausada"/"Limite de hoje"/"Fila vazia" (não citados no
  pedido) continuam exatamente como estavam.

### Fila de abordagem — rodada 5 (foto de perfil do Instagram no círculo da clínica)
Levantamento no projeto inteiro (pedido explícito) encontrou só UM lugar com o círculo de iniciais
da clínica — `AccountChip` (`FilaView.tsx`); `ClinicAvatar.tsx` (`src/components/`) é o componente
ÚNICO novo que substitui essa implementação, pronto pra qualquer tela futura reaproveitar sem
duplicar a lógica de foto/fallback.
- **Foto com fallback pras iniciais**: mesmo padrão exato de `LeadAvatar.tsx` já usado no projeto —
  `<img>` puro (nunca `next/image`: URLs do CDN do Instagram vêm de subdomínios que mudam, não dá
  pra allowlistar um domínio fixo em `next.config.js`) com `onError` trocando pra iniciais — nunca
  um ícone de imagem quebrada. Tamanho mantido em 48px (`h-12 w-12`, Etapa 2 da migração de design),
  nada mudou aí. As classes de cor do estado da conta (verde/cinza/dourado/cinza escuro) passam a se
  aplicar SÓ no fallback de iniciais (`initialsClassName`) — uma foto de verdade nunca fica tingida
  de verde/dourado por cima.
- **Fonte da foto**: API oficial do Instagram (Graph API, produto "Instagram API with Instagram
  Login" já usado pra tudo mais da conexão — nenhuma permissão nova: `profile_picture_url` é um
  campo do MESMO node `/me` que já é lido com `instagram_business_basic`, o mesmo escopo já
  concedido pra username/id da conta). Nunca scraping nem fonte externa.
- **URL expira — resolvido com o MESMO padrão já existente** pra foto de LEAD
  (`Lead.profilePictureUrl`/`profilePictureFetchedAt`, `lead-profile-picture-backfill.ts`): campos
  gêmeos em `InstagramAccount` + `clinic-profile-picture-backfill.ts`, um job a cada 10min no worker
  que renova qualquer foto sem busca há mais de 24h (nunca uma busca única). Também preenchida na
  hora, sem esperar o próximo ciclo, a cada reconexão OAuth bem-sucedida (a mesma chamada de `/me`
  que já lê id/username passa a pedir `profile_picture_url` junto — zero requisição extra). Contas
  com `needsReconnectAt` setado (token sabidamente inválido) são puladas pelo job periódico — só
  reconectar resolve, e a reconexão já grava a foto nova na hora.

### Fila de abordagem — rodada 6 (3 cards de clínicas diferentes na mesma tela + pausa de lote)
Mudança de layout: em vez de UMA clínica selecionada por vez (faixa de círculos no topo +
card grande), a tela mostra direto até 3 `ClinicQueueCard`, um embaixo do outro — cada card já é de
uma clínica DIFERENTE (cada clínica participante tem sempre só 1 lead ativo na tela — o próximo @
dela), sem precisar tocar pra trocar de conta. A faixa de círculos/`AccountChip` e o
`SelectedAccountPanel` saíram; nenhum token novo de cor foi necessário, só o novo tamanho de círculo
abaixo.
- **Conteúdo do card** (`rounded-block`/`p-block`/`border-vexo-border`/`bg-vexo-surface`, mesmo
  container do card ativo de antes): `ClinicAvatar` + nome da clínica numa linha, primeiro nome
  (se houver) + `@usuario` do lead na linha de baixo, botão por estado embaixo, e por fim 2 links
  pequenos (`text-meta`/`text-vexo-mutedLight`) — "Pular" e "Pausar esta conta"/"Retomar conta".
  Tamanhos de letra do `@` e do botão azul mantidos (herdados do card ativo da rodada 4); só o
  círculo da clínica encolheu.
- **`ClinicAvatar` ganhou o tamanho `md` (36px, `h-9 w-9`/`text-sm`)** — o `lg` (48px) de antes não
  cabia 3 vezes empilhado sem rolar no celular; `md` é literalmente o tamanho pré-rodada-4, só
  reaproveitado como uma opção formal do componente (nenhuma dimensão nova inventada).
- **Botão por estado**: liberada = azul "Enviar mensagem" (igual sempre); em espera = cinza
  desativado "Aguarde m:ss" + "Não enviei · Desfazer" embaixo (igual sempre); NOVO estado **pausa de
  lote** = cinza desativado com contagem em HORAS, formato `h:mm:ss` (`formatApproachPauseCountdown`,
  ex. "Pausa 1:48:00") — sem o link de Desfazer embaixo (só a espera comum tem esse link, a pausa de
  lote não representa um envio "pendente de confirmar"); limite do dia/pausada manualmente/fora do
  horário = cinza com o texto do motivo, como já existia. Nenhum botão desativado recebe `onClick`.
- **Ordem dos cards decidida no SERVIDOR** (`approachAccountSortKey`, `approach-queue.ts`): liberadas
  primeiro, depois por ordem de "quem volta mais cedo" (espera comum e pausa de lote comparadas pelo
  mesmo `msRemaining`, sem tratamento especial — uma espera de 1min sempre vem antes de uma pausa de
  2h). Clínicas sem nenhum lead na fila nunca entram na lista (sem lead, não há card pra mostrar).
  Com mais de 3 clínicas qualificadas, só as 3 primeiras nessa ordem aparecem. O cliente nunca ordena
  nada sozinho: depois de qualquer toque (enviar/pular/desfazer/pausar), ele busca o board inteiro de
  novo no servidor — é assim que um card "desce" pra espera e o próximo "sobe" no lugar sozinho.
- **Pausa de lote (a cada N envios, padrão 30, pausa por 2h)**: contador (`batchSentCount`) e
  horário de término (`batchPausedUntil`) persistidos em `ApproachQueueConfig`, sobrevivem a
  recarregar a página — mesmo padrão do `lockedUntil` da espera comum, só que em horas em vez de
  minutos. Limite do dia e horário permitido continuam valendo por cima (checados antes da pausa de
  lote em `computeApproachAccountState`); a meia-noite zera o contador do DIA mas nunca mexe na pausa
  de lote em andamento — se ela terminar fora do horário permitido, o botão mostra o motivo do
  horário, não volta sozinha. "Desfazer" sempre volta o contador do lote em 1 e cancela a pausa (regra
  única, cobre tanto o desfazer comum quanto o do envio que fechou o lote, que volta pra 29 e libera
  na hora). "Pular" nunca mexe no contador do lote nem no do dia.
- **3 campos novos na tela de Preparação** (`TimingForm`, mesmo `Card` do "Horário permitido" logo
  acima, mesmo modelo visual de `<input>`/`Button`): espera mínima/máxima em minutos (padrão 1-2),
  envios por lote (padrão 30) e pausa após o lote em horas (padrão 0 = sem pausa). Globais (iguais
  pra todas as clínicas, como o horário), salvos em `ApproachTimingSettings` (singleton, mesmo padrão
  de `ApproachWindowSettings`) e validados tanto no cliente quanto no servidor
  (`validateApproachTiming`). Mudar os valores só afeta as PRÓXIMAS esperas/pausas sorteadas — nunca
  apaga uma espera ou pausa já em andamento.

### Fila de abordagem — rodada 7 (até 5 cards em vez de 3, altura mais enxuta)
Só ajuste de quantidade/altura, pedido explícito — nenhuma lógica de seleção/ordem/toque/espera/pausa
de lote mudou, só o limite de quantos cards aparecem e o respiro vertical de cada um.
- **`APPROACH_BOARD_MAX_ACCOUNTS` (approach-queue-db.ts): 3 -> 5** — mesma função/ordem de sempre
  (`approachAccountSortKey`: liberadas primeiro, depois por quem volta mais cedo), só o `slice` final
  mudou de tamanho. Com menos de 5 clínicas qualificadas, mostra só as que existem, como já acontecia
  com 3.
- **Token novo `spacing["block-y"]` (10px)** em `tailwind.config.ts`, nomeado por papel ("padding
  vertical reduzido do bloco") — o `ClinicQueueCard` passa de `p-block` (14px nos 4 lados) para
  `px-block py-block-y` (14px nas laterais, 10px em cima/embaixo). Reduz só a altura, mantém o mesmo
  respiro horizontal; nenhum tamanho de letra ou tom de cinza mudou. O espaçamento ENTRE os cards
  (`space-y-2`, já existente) continua o mesmo.
- **Sem rolagem forçada nem limite artificial**: a página não ganhou nenhum container de altura fixa
  nem `overflow`; num celular pequeno que não caiba os 5 cards inteiros, a PÁGINA rola normalmente
  (comportamento padrão do navegador) — preferível a espremer os cards, pedido explícito.

### Buscar seguidores (interno, `/crm/abordagem/seguidores`) — atrás de interruptor
Ferramenta nova, SÓ interna (nunca aparece em tela pública, vídeo ou documento voltado a cliente):
entrega um script pronto pra copiar e colar no Console do navegador do operador, autenticado
manualmente no instagram.com na conta da própria clínica — o VEXO nunca roda nem acessa nada do
Instagram sozinho (o navegador bloqueia a página do VEXO de ler instagram.com; é por isso que a
leitura só pode acontecer no console da própria aba do instagram.com). Mesmo estilo compacto da
tela de Preparação (`Card`/`Button`/`rounded-control`, nenhuma cor/tamanho/espaçamento solto).
- **Atrás do interruptor `FOLLOWER_TOOL_ENABLED`** (`src/lib/follower-tool.ts`), que precisa ficar
  DESLIGADO durante a análise da Meta (ver README.md) — padrão fail-closed, igual ao
  `ADMIN_SETUP_TOKEN` da tela `/setup`. Desligada (ausente ou diferente de `"true"`): a rota
  `/crm/abordagem/seguidores` chama `notFound()` (404) ANTES de consultar sessão — pra todo mundo,
  inclusive admin — e nenhuma `action` do servidor (`getFollowerToolClinicsAction`/
  `generateFollowerToolScriptAction`) devolve nada, mesmo chamada direto; sem isso, nenhum link
  aparece em lugar nenhum (nem na Preparação, nem no menu). Ligada: só quem está logado como
  `INTERNAL_ADMIN` acessa — nunca `INTERNAL_STAFF` (diferente de todo o resto da Fila de
  abordagem, que libera STAFF também) — um gate próprio (`requireFollowerToolAdmin`), separado do
  `requireApproachAdmin` que o resto da pasta usa.
- **Link na Preparação**: "Buscar seguidores" (`text-caption`/`text-vexo-accent`) só é renderizado
  quando o SERVIDOR confirma (`isFollowerToolAvailableAction`, chamada no `page.tsx`) que a
  ferramenta está ligada E o usuário logado é admin — nunca uma checagem só no cliente.
- **Conteúdo da tela, nesta ordem**: aviso curto de uso interno; seletor de clínica (mostrando o @
  conectado, quando houver, e o aviso pra confirmar a conta logada no instagram.com); quantidade
  por rodada (padrão 300, 50–500) + "Começar do zero"; botão "Copiar script" (usa o mesmo
  `copyToClipboard` do resto do projeto, com o mesmo aviso "Não foi possível copiar" se falhar);
  passo a passo numerado; cuidados (limite de rodadas/dia, erros 400/403/429, retomada automática).
  Por fim, o MESMO componente `UploadForm` (exportado de `AbordagemPrepView.tsx`) da Preparação —
  nunca duplicado, só importado.
- **Script guardado como texto-modelo** no servidor (`follower-tool.ts`), com 2 placeholders
  (`{{LIMITE}}`/`{{RECOMECAR}}`) substituídos só depois de validar `LIMITE` (inteiro, 50–500) —
  nunca editado além disso. O texto do script só é gerado por uma `action` (nunca embutido no HTML/
  JS da página), e essa `action` já está atrás do mesmo gate acima — com o interruptor desligado,
  o texto do script literalmente não existe em nenhum bundle enviado ao navegador.

### Fila de abordagem — rodada 8 (card horizontal, botão "Enviar" à direita)
Pedido explícito: só visual, nenhuma lógica mudou — o card vertical (foto+nome+@ numa faixa,
botão na largura toda embaixo) virou uma ÚNICA linha horizontal, pra reduzir a altura e caber os 5
cards (o máximo da tela) na primeira tela de um iPhone comum sem rolar. Validado com um teste real
de layout (Playwright + Tailwind compilado, mesmo padrão de `page.layout.test.ts`) nas larguras/
alturas do iPhone SE (375×667, a tela mais estreita ainda comum), iPhone 12/13/14 (390×844) e
iPhone 14 Pro Max (430×932) — ver `FilaView.layout.test.tsx`.
- **Uma linha só**: `ClinicAvatar` (esquerda) + bloco de texto (nome/@/links, `flex-1 min-w-0`) +
  botão (direita, `shrink-0`), tudo dentro de um único `flex items-center` — o botão fica
  centralizado verticalmente pela própria altura da linha, sem precisar de nenhum cálculo manual.
- **`ClinicAvatar` tamanho `md`: 36px -> 44px** (`h-11 w-11`, escala padrão do Tailwind) — só
  usado neste card; o layout horizontal pede um círculo um pouco maior pra equilibrar a linha
  inteira com o botão do lado.
- **Letra do nome/@ do lead**: nome continua em `text-body-sm` (15px, inalterado); o @ do lead
  passa de `text-caption` (10px) pra `text-meta` (13px, mesmo token já usado nos links auxiliares)
  — cor (`text-vexo-muted`) inalterada. Os links "Pular"/"Pausar conta"/"Não enviei · Desfazer"
  continuam exatamente no mesmo tamanho/cor de sempre (`text-meta`/`text-vexo-mutedLight`) — texto
  "Pausar esta conta" encurtado pra "Pausar conta" (só o texto; "Retomar conta" não muda). As 2 ou 3
  linhas de texto (nome, @, links) ficam dentro do MESMO bloco à esquerda, ao lado do círculo —
  nunca mais embaixo do card inteiro.
- **Botão "Enviar"** (era "Enviar mensagem"): mesmo azul (`bg-vexo-accent`) e mesmo `rounded-control`
  de sempre, só que agora curto e à direita, não mais na largura toda. `px-8` (32px, escala padrão
  do Tailwind) de cada lado e `text-body-sm` (15px) — a combinação dá a altura visual pedida
  (~38px) só com o padding normal do texto, sem precisar fixar uma altura em pixel (é por isso que
  o botão também "nunca cresce em altura": a altura é sempre `padding + altura da linha de texto`,
  constante; só a LARGURA cresce quando o texto do motivo é mais longo, ex. "Fora do horário").
  Largura mínima nova: `minWidth["cta-sm"]` (116px, `tailwind.config.ts`) — nomeado por papel
  ("largura mínima de um botão curto de ação principal"), reaproveitável em qualquer botão parecido
  fora da Fila.
- **Área de toque do botão ampliada pra >= 44px de altura SEM mudar o desenho visual** (~38px) —
  técnica nova, documentada aqui pra não ser redescoberta: um `::before` absoluto, com
  `min-h-11` (44px, escala padrão) e `top-1/2 -translate-y-1/2` (centralizado na vertical,
  independente da altura visual real do botão) e `inset-x-0` (largura igual à do próprio botão).
  Sem conteúdo visível (`content-['']`, sem cor de fundo) — e, como pseudo-elemento, um toque nele
  ainda dispara o clique do botão (borbulha pro elemento pai), então a área tocável cresce de
  verdade, só que invisível. Os links pequenos (Pular/Pausar conta/Desfazer) usam um truque mais
  simples pro mesmo fim: `padding` pequeno + `margin` negativa igual (`-mx-1 -my-1 px-1 py-1`) — a
  área de toque cresce um pouco sem deslocar visualmente o texto nem encostar um link no outro.
- **Padding do card**: horizontal continua `px-block` (14px, inalterado); vertical
  (`spacing["block-y"]`, `tailwind.config.ts`) passou de 10px (rodada 7) pra 12px — o layout
  horizontal tem mais ar vertical de sobra que o antigo card em coluna, então o padding pôde
  crescer um pouco mesmo com o card mais baixo no total. Espaço ENTRE os cards (`space-y-2`, 8px)
  inalterado, por pedido explícito ("o mesmo que existe hoje").
- **Faixa do topo mais compacta**: o container da página perdeu um pouco de padding vertical
  (`py-4` -> `py-2`) e a margem entre o título e os cards encolheu (`mt-3` -> `mt-2`) — nenhuma
  cor/tamanho de letra mudou, só espaçamento, pra sobrar altura pros 5 cards caberem.
- **Nome/@ longos**: continuam com `truncate` (uma linha, "…", nunca quebram o card nem empurram o
  botão) — já existia, só mudou de posição (agora dentro da linha horizontal).

### Fila de abordagem — rodada 9 (botão "Enviar" mais compacto + contador de leads restantes)
Ajuste fino sobre o card horizontal da rodada 8 (nenhuma lógica de envio mudou, só visual + 1
contagem nova) — pedido explícito: o botão "Enviar" não devia ter largura mínima grande.
- **Botão "Enviar" mais compacto**: a largura mínima nova da rodada 8 (`minWidth["cta-sm"]`,
  116px) foi REMOVIDA — o token saiu do `tailwind.config.ts` (não ficou nenhum uso órfão). Padding
  horizontal `px-8` (32px) -> `px-5` (20px, escala padrão do Tailwind) — o botão agora cresce só o
  estritamente necessário pro texto (ex. "Fora do horário"), sem nenhuma largura "de reserva". A
  altura (`py-2` + `text-body-sm`, ~38px visual) e a área de toque ampliada (`::before` >= 44px,
  ver rodada 8) continuam exatamente iguais.
- **Contador de leads restantes por clínica** (pedido explícito: "pra saber quando reabastecer a
  lista") — conta `ApproachQueueItem` com `status: "QUEUED"` (nem enviado, nem pulado; inclui o
  item ATIVO no card, que também é `QUEUED` até o toque em "Enviar"):
  `countApproachQueueRemaining` (`approach-queue-db.ts`) pro board/card da Fila, e
  `_count.approachQueueItems` (relação filtrada, resolvida numa query só pra todas as clínicas —
  nenhum N+1) em `listClinicsForPrep` pra tela de Preparação.
  - **Card da Fila**: o número aparece logo depois do nome da clínica, dentro do MESMO `<p>`
    (`text-meta`/`text-vexo-mutedLight`, peso normal, nunca a cor de aviso) — ex. "Aura Clinic ·
    320". Atualiza sozinho a cada envio/pulo/desfazer, junto com o `refreshBoard()` que a tela já
    chama depois de qualquer ação (nenhum polling novo).
  - **Tela de Preparação**: 2ª linha pequena (`text-meta`, 13px) embaixo do @ da clínica, dentro da
    mesma `ClinicRow` compacta — "320 na fila · uns 5 dias" (`formatApproachDaysRemainingLabel`,
    `approach-queue.ts`: dias = leads restantes ÷ limite por dia daquela clínica; acima de 3 dias
    arredonda pra inteiro plural, "uns 5 dias"; entre 1 e 3 arredonda pra 1 casa decimal com
    vírgula, singular, "uns 1,5 dia"; abaixo de 1, "menos de 1 dia"). Fila vazia é um caso próprio —
    a linha mostra só "Fila vazia", nunca "0 na fila". Cor por nível de urgência
    (`approachQueueLevel`, mesmos limiares da função de texto): `text-vexo-mutedLight` com 2 dias ou
    mais; `text-vexo-warning` abaixo de 2 dias; `text-vexo-error` abaixo de 1 dia OU fila vazia —
    tokens de cor já existentes no design system, nenhum novo. Atualiza ao abrir a tela (sempre
    recalculada no servidor, página `force-dynamic`) e depois de um upload de lista
    (`uploadApproachLeadsAction` já chama `revalidatePath` da Preparação).

### Fila de abordagem — rodada 10 (botão "Enviar"/cinza mais baixos, ~34px)
Ajuste fino só de altura sobre o card da rodada 9 (nenhuma lógica mudou). Padding vertical do
botão (`py-2`, 8px) -> `py-1.5` (6px, escala padrão do Tailwind, já usada em outros botões do
projeto) nos dois botões (azul "Enviar" e cinza dos estados de espera/pausa/limite/pausada/fora do
horário) — a altura visual cai de ~38px pra ~34px, confirmada num teste real (Playwright). Nada
mais muda: largura (`px-5`), letra (`text-body-sm`), cor (`bg-vexo-accent`/`bg-vexo-surface2`),
cantos (`rounded-control`) e a área de toque ampliada (`::before` >= 44px, ver rodada 8) continuam
exatamente iguais — a técnica do `::before` já usava `min-h-11` fixo, independente da altura
visual do botão, então reduzir o padding não afeta a área tocável. Padding do card e espaço entre
os cards (`px-block`/`py-block-y`/`space-y-2`) inalterados, por pedido explícito.

### Fila de abordagem — rodada 11 (@ do Instagram conectado no card + Fila por clínica)

Pedido explícito: operar várias clínicas ao mesmo tempo, um perfil do Chrome por clínica (cada
aba sempre presa na mesma conta do Instagram) — precisava de 1) um jeito de conferir, antes de
apertar "Enviar", se o card bate com a conta logada naquele navegador, e 2) uma Fila com link
próprio por clínica, pra abrir uma aba fixa por clínica em vez de uma tela global misturando
todas.

- **@ do Instagram CONECTADO desta clínica, em destaque, na linha do nome** (`ClinicQueueCard`,
  `FilaView.tsx` — usado pelas DUAS telas, a global e a nova por clínica): `@{igUsername}`
  (semibold, com o glifo do Instagram, `InstagramGlyphIcon`) + `· {nome da clínica}` (truncado) +
  `· {leadsRemaining}`, nessa ordem — o @ é o PRIMEIRO elemento da linha, então sempre antes do
  nome da clínica e do @ do LEAD (que continua intocado, numa linha de baixo). Sem Instagram
  conectado: "Instagram não conectado" no lugar do @, nunca inventa um valor.
  - **Decisão de layout**: o @ entra na MESMA linha do nome da clínica, não numa linha nova — uma
    linha extra por card quebrava o orçamento de altura da rodada 7 (os 5 cards cabendo na 1ª
    tela de um iPhone SE sem rolar, `FilaView.layout.test.tsx`: uma linha nova a mais custava
    ~14px por card, 70px no total pros 5 — o viewport do SE (667px) não sobrava isso). Testado de
    verdade (Playwright) depois do ajuste: os 5 cards continuam cabendo, sem rolagem.
- **Fila por clínica, nova rota** (`/crm/clinicas/[id]/abordagem/fila`, `ClinicFilaView.tsx`) —
  mesmo comportamento da Fila global (tempos, pausa de lote, botão "Enviar" reaproveitando a
  mesma aba do Instagram, ver rodada anterior/PR #255) e o MESMO componente de card
  (`ClinicQueueCard`, reaproveitado — qualquer ajuste nele, como o @ conectado acima, vale pras
  duas telas de uma vez), só que mostrando SÓ o card desta clínica. Independente do toggle "ativa
  na fila" da Preparação — `getApproachBoardForClinicAction` busca a conta direto
  (`getApproachBoardAccount`), nunca passa pela lista de contas ATIVAS que a Fila global usa.
  - Card centralizado, `max-w-[520px]` (mesma largura da Fila global) dentro do shell cheio da
    clínica (`clinicas/[id]/layout.tsx`, sidebar normal) — sem isso, o card ficaria esparramado
    na largura padrão (`max-w-6xl`) do resto das telas da clínica.
  - **Não entra em `clinic-nav.tsx`** — alcançada só pelo link direto, pra abrir numa aba/perfil
    de navegador dedicado (é esse o ponto: um link fixo por clínica). Mesmo padrão já usado por
    `relatorio-preview/page.tsx` (admin-only, também fora da sidebar).
  - A Fila global (`/crm/abordagem/fila`) continua existindo exatamente como estava — tela nova,
    a mais, nunca uma substituição.

### Fila de abordagem — rodada 12 (@ conectado sobe pro topo da página + próximos leads empilhados, só na Fila por clínica)

Dois ajustes pedidos na Fila por clínica (`/crm/clinicas/[id]/abordagem/fila`, rodada anterior) —
a Fila global (`/crm/abordagem/fila`) não muda em nada aqui.

- **@ conectado sobe pro topo da PÁGINA, não mais dentro do card** — ao lado do título
  "Abordagem", separado por "·": `InstagramOutlineIcon` (novo, `BrandIcons.tsx` — mesmo desenho
  do glifo de sempre, quadrado arredondado + círculo + pontinho, SEM o squircle com o gradiente da
  marca, em `currentColor` pra herdar a cor do texto ao lado) + o username, **sem "@" na frente**
  (pedido explícito), `text-base font-semibold` (16px, mesmo tamanho do próprio título).
  `ClinicQueueCard` ganha a prop `hideConnectedHandle` (`FilaView.tsx`, usada só aqui — default
  `false` preserva a Fila global 100% intocada) que troca a linha do @ pelo texto simples de
  sempre (nome da clínica + contador), pra não repetir a mesma informação duas vezes na tela.
- **Próximos leads empilhados atrás do ativo** (`CLINIC_FILA_STACK_SIZE = 5`,
  `approach-queue-db.ts`) — só o 1º card é o de sempre (`ClinicQueueCard`, botão "Enviar" real);
  os outros 4 são uma prévia esmaecida (`opacity-50`), sem avatar nem links de ação, só
  nome/@ do lead + uma estimativa de quando devem liberar (ex.: "1min 20s" — `formatApproachEstimateLabel`,
  approach-queue.ts). **Nunca clicáveis** — a regra de "só um envio por vez liberado" (espera de
  1-2min, pausa de 2h a cada 30) não muda em nada; isto é só visual.
  - **A estimativa é uma projeção, nunca uma promessa** (`estimateQueuedItemsMsRemaining`,
    approach-queue.ts): o espaçamento real entre envios só é sorteado (`randomApproachWaitMs`) no
    momento em que cada um sai de verdade — a função assume "liberou, enviou na hora, esperou a
    média configurada" repetido item a item, somando a pausa de lote inteira quando o item
    hipotético cruzaria o tamanho do lote (`ApproachQueueConfig.batchSentCount`). Calculada no
    SERVIDOR (`getApproachBoardAccount`, novo parâmetro `itemsLimit` — 1 de sempre pra Fila
    global, nunca entra nesse cálculo; 5 só na Fila por clínica) e anexada em
    `ApproachBoardItem.estimatedMsRemaining` (undefined pro item ativo). Tique ao vivo no cliente
    (mesmo `now`/`fetchedAt` de sempre), nunca precisa recarregar a página pra contar.
  - Mensagem/link de DM **nunca** são sorteados/atribuídos pros itens empilhados (só o item 0,
    igual já era) — evita "prender" uma mensagem a um lead que ainda pode ser pulado antes de
    chegar a vez dele.
  - **Orçamento de altura validado de novo** (`ClinicFilaView.layout.test.tsx`, mesmo padrão da
    rodada 7): 1 card ativo + 4 empilhados cabem na 1ª tela de um iPhone SE sem rolar.

### Fila de abordagem — rodada 13 (segundo link de acesso do cliente: só a Fila, nunca o painel)

Pedido explícito: dar acesso à Fila de abordagem desta clínica (mesma tela/mesmas regras da
rodada 12) a quem NÃO deve ver o painel inteiro (`/dashboard`) — uma pessoa que só vai mandar
mensagens pelo Instagram, não precisa ver agendamentos nem métricas. Em vez de um papel novo ou
uma tabela de permissão, é um SEGUNDO link permanente por clínica, independente do link do
painel que já existia (`ClientPanelLink`/`/acesso/[token]`), com um claim só no token que trava a
tela errada.

- **`ClientFilaLink` (schema, mesmo shape do `ClientPanelLink`)** — token próprio, `clinicId
  @unique` (só 1 link válido por clínica, igual o original), criar/cancelar sem "regenerar"
  separado (`getOrCreateClientFilaLink`/`revokeClientFilaLink`, `clinicas/actions.ts`). Mostrado
  no mesmo modal "Acesso do cliente" que já existia (`ClientAccessModal.tsx`, agora com duas
  seções — "Painel completo" e "Só a Fila de abordagem", cada uma com seu próprio componente:
  `ClientPanelLinkSection`/`ClientFilaLinkSection`, cópia adaptada, não generalizada, mesmo
  padrão já usado pelo `BriefingLinkSection`).
- **`/acesso-fila/[token]/route.ts` (novo, cópia do `/acesso/[token]` original)** — mesmo login
  automático por cookie montado manualmente (não existe `signIn()` chamável fora de um `<form>`
  no NextAuth v4), só que grava um claim extra no JWT: `scope: "fila"`. **Esse claim, e não um
  papel novo, é a ÚNICA coisa que distingue os dois links** — os dois continuam `role: "CLIENT"`.
  Equipe interna já logada no mesmo navegador vai pra Fila INTERNA desta clínica
  (`/crm/clinicas/[id]/abordagem/fila`) em vez de ter a própria sessão sobrescrita (mesmo desvio
  do link original, só que pro equivalente certo).
- **Regra de segurança pedida explicitamente, em duas camadas**: quem só tem o link da Fila
  nunca alcança `/dashboard`, mesmo digitando a URL direto, mesmo logado.
  1. **Middleware** (`isFilaScopeAllowedPath`, `client-fila-access.ts` — mesmo molde de
     `isReviewerAllowedPath`/`reviewer-access.ts`): decide só por pathname, sem tocar banco;
     `scope: "fila"` em qualquer rota sob `/dashboard` que não seja `/dashboard/fila` redireciona
     de volta pra ela (nunca 404 — um cliente de verdade só errou o caminho, não está sondando).
  2. **`requireClientSession` (session.ts)** repete a mesma checagem como segunda camada —
     redireciona pro `/dashboard/fila` se `scope === "fila"`, antes de devolver a sessão pra
     `/dashboard`/`/dashboard/bonus`.
  - **O inverso é permitido de propósito** (pedido explícito): quem tem o link do painel
    completo (sem esse claim) também abre a Fila — `requireClientFilaSession` (novo gate, usado
    só por `/dashboard/fila`) não exige `scope` nenhum, só `CLIENT` + `clinicId`.
- **Botão "Abrir Fila de abordagem" dentro do `/dashboard`** (`headerAction` do `ClientPanelView`,
  mesmo slot que já existia pro "Criar painel" no CRM) — só aparece pra quem chega até ali, ou
  seja, só pra quem TEM o painel completo (quem só tem o link da Fila já foi redirecionado antes
  de chegar nesta página).
- **Mesmo componente, mesmo visual, mesmas regras de negócio — só troca a autenticação por
  baixo**: `ClinicFilaView.tsx` ganhou as 5 actions (buscar board, confirmar envio, desfazer,
  pular, pausar) e o link "Fila de todas as clínicas" como PROPS injetáveis, com default = os
  mesmos imports de sempre (gated por `requireInternalSession`) — a tela interna não mudou nada.
  `dashboard/fila/page.tsx` passa a dupla própria (`dashboard/fila/actions.ts`, gated por
  `requireClientFilaSession`, conferindo `session.user.clinicId` antes de qualquer ação — nunca
  confia só no `clinicId` que a tela devolve) e `showGlobalFilaLink={false}` (o link de volta pra
  Fila global não faz sentido pro cliente, que só vê a própria clínica).
- **BUG REAL encontrado e corrigido ao construir isto**: `requireSession` (`session.ts`) sempre
  consultava `prisma.user.findUnique({ where: { id: session.user.id } })` pra checar
  `User.active` — pra uma sessão nascida de QUALQUER um dos dois links (`sub` sintético,
  `"client-panel-link:<clinicId>"`/`"client-fila-link:<clinicId>"`, sem `User` real por trás, só
  `Clinic`), isso sempre devolvia `null` e tratava o acesso como desativado, mandando pro
  `/entrar` — ou seja, **o link do painel original também caía nesse bug**; nunca tinha sido
  validado de ponta a ponta depois do checkpoint de `User.active` ter sido adicionado (pensado só
  pro login Revisor). `requireSession` agora detecta os dois prefixos e valida pela `Clinic.active`
  em vez do `User`.

### Fila de abordagem — rodada 14 (botão "Link da Fila" direto na Preparação, ao lado de "Mensagens")

Pedido explícito: copiar o link da Fila (`ClientFilaLink`, rodada 13) direto da lista de clínicas
em `AbordagemPrepView.tsx` (Preparação — a mesma tela do checkbox/limite diário/"Mensagens"), sem
precisar abrir "Criar painel" (`clinicas/[id]/painel/page.tsx`) só pra pegar esse link.

- **Reaproveita a MESMA action, nenhum mecanismo novo** — `FilaLinkButton` chama
  `getOrCreateClientFilaLink` (`clinicas/actions.ts`) direto, igual o `ClientFilaLinkSection` do
  modal já fazia; cria o link na hora se a clínica ainda não tiver um, devolve o mesmo token se já
  tiver (nunca gera um segundo/diferente) — os dois pontos de entrada (aqui e o modal) sempre
  mostram/copiam o MESMO link.
- **Copia e dá feedback, sem mostrar a URL** — diferente do `ClientFilaLinkSection` (que exibe a
  URL pra conferência visual antes de copiar), aqui é um atalho de um clique só: copia
  (`copyToClipboard`, `lib/clipboard.ts` — mesmo helper com fallback já usado pelo botão "Enviar"
  da própria Fila) e o texto do próprio botão vira "Copiado!" por 1,5s, depois volta a "Link da
  Fila" — mesmo padrão de feedback rápido do "✓ Salvo" dos outros formulários desta tela.
- **Não mexe em nada do Painel nem do modal "Criar painel"** (pedido explícito) — é só mais um
  jeito de pegar o mesmo link, sem alterar `ClientAccessModal.tsx`/`ClientFilaLinkSection.tsx`.
- **Mesmo padrão visual dos outros botões da linha** — `text-caption font-medium
  underline-offset-2 hover:underline`, mesma cor de ação (`text-vexo-accent`) do link "Mensagens"
  ao lado; um `<button>`, nunca um link (não navega, só copia).
- **Largura validada via Playwright** (`AbordagemPrepView.layout.test.tsx`, mesmo padrão de
  sempre) — checkbox + nome/@ longo + contador + limite diário + "Link da Fila" + "Mensagens" na
  mesma linha, sem rolagem horizontal em 360/390/414px.

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

### Preparação pra análise da Meta — razão social/CNPJ reais, sem "M8 Growth", sem privacidade@
A marca pública é só VEXO (VEXO IA); o nome legal é Mauro da Silva — nenhuma tela mostra "M8
Growth" em lugar nenhum (removido, não só escondido): a linha de subtítulo que aparecia sozinha
embaixo do nome "VEXO" (barra lateral do CRM, páginas públicas de auto-conexão/sucesso/briefing)
foi tirada de vez, sem deixar um espaço vazio no lugar (nenhum tamanho/espaçamento mudou — só a
linha de texto saiu). Onde o texto pedia um link novo "ao M8 Growth", passou a pedir "ao VEXO".
- **Razão social/CNPJ preenchidos** em `src/lib/legal-info.ts` (`companyName`/`cnpj`) — antes
  ficavam vazios de propósito (sem CNPJ ainda). O rodapé público e as 3 páginas legais passam a
  mostrar "70.193.804 MAURO DA SILVA · CNPJ 70.193.804/0001-30" (`formatCompanyLine`, já existia,
  só não tinha dado pra mostrar ainda).
- **`privacidade@vexoia.com.br` nunca existiu de verdade** — removido de `LEGAL_INFO.emails` (que
  agora só tem `contact`/`support`) e de todo lugar que apontava pra ele (rodapé, `/privacidade`
  como "Encarregado (DPO)" e no texto dos seus direitos, `/exclusao-de-dados` como e-mail do
  pedido). Nesses 3 lugares, `contato@vexoia.com.br` assume o papel.

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
- **Rodada final (vale sobre o que está acima quando houver conflito):**
  - **Princípio de conteúdo**: a página pública diz O QUE o VEXO faz, nunca COMO — nenhum canal por
    função ("pelo WhatsApp", "no Instagram"), nada sobre quem faz a primeira mensagem, nenhuma regra
    de reativação nem fluxo interno. Esses detalhes ficam só nas páginas legais (exigência da Meta).
    Testado em `public-pages.test.tsx`.
  - **Hero**: título ~68px (`text-pub-hero-lg`, 38px no celular); subtítulo menor, 15px, máx. 560px.
  - **Cabeçalho**: links Como funciona, Resultados, Segurança, Dúvidas.
  - **Ícones fora da órbita** (Como funciona, Segurança, cartão "Avaliação agendada"): só o traço
    (stroke 1.5, 30px), sem círculo/fundo/borda, cor única — `pubAccent` #5db4e6 no escuro,
    `pubButton` #2478a8 nas faixas claras (`LineIcon`). A órbita do hero continua colorida.
  - **DEPOIS**: final só em azul/neutro — cartão com borda azul clara, selo "Confirmada" azul, tags em
    cinza neutro. Sem verde, dourado ou roxo ali.
  - **Funil em pontos**: 60 pontos de 10px, 12 colunas, espaço 9px — 26 verdes, 3 `pubBrand`, 14
    `reportColB`, 17 cinza; rotulado "Exemplo ilustrativo".
  - **Selos**: HTTPS, chaves cifradas, senhas em hash, login obrigatório.
  - **FAQ**: 8 perguntas (removidas as de canal do WhatsApp e regra de reativação).
  - **Ajuste fino**: o cartão do relatório no CTA não tem mais altura fixa nem corte — aparece
    inteiro, colado na base da faixa (cantos só no topo), com os 4 números em 2×2 no celular
    (`min-w-0`). O bloco "Depois" fica mais baixo só a partir de 900px (`.pub-after*` em
    `globals.css` — valores atualizados na rodada "Antes/Depois" abaixo); abaixo de 900px nada
    muda.
  - **"Geração de demanda"**: subtítulo do hero (`text-[15px]`, abaixo do H1) e o `metadata`
    (title/description) da página passaram a nomear "geração de demanda" explicitamente. H1,
    etiqueta acima dele (eyebrow "Social selling para clínicas de saúde") e o resto dos textos
    ficaram como estavam — a etiqueta do rodapé (`PublicFooter.tsx`) também não mudou, é outro
    texto, não a mesma string do title/description. `layout.tsx` (fallback de título/descrição do
    app inteiro, não só da página pública) e `sitemap.ts` não duplicam esse texto, por isso não
    mudaram.
  - **Marca d'água "VEXO" no bloco de contato**: `<p aria-hidden>` dentro de `.pub-cta-band`,
    decorativa — `pointer-events-none select-none`, nunca disputa leitura/clique. Cor: token
    `pubWatermark` (`--pub-watermark`, branco puro) usado a 4% de opacidade
    (`text-vexo-pubWatermark/[0.04]`) — "só um pouco mais clara que o fundo", nunca sólida; se
    precisar ajustar a intensidade depois, mexer só nesse número de opacidade no uso, não na
    variável. Ancorada ao rodapé do GRUPO título/subtítulo/botão (não ao rodapé da faixa inteira):
    o cartão do relatório logo abaixo é opaco e cola na base real da faixa sem margem nenhuma
    (inclusive no celular, onde ele ocupa 100% da largura disponível) — ancorar no fundo da faixa
    inteira escondia a palavra 100% atrás dele em qualquer largura de tela. `translate-y-1/2` corta
    a metade de baixo; o que sobra da largura (ela cresce livre, centrada) é cortado pelo
    `overflow-hidden` que a própria `.pub-cta-band` já tinha, sem precisar de nenhum contêiner novo
    só pra isso. Pegadinha de empilhamento: o bloco pai precisou ganhar `z-0` além de `relative` —
    só `relative` (sem `z-index` próprio) não cria um novo contexto de empilhamento, e um
    `z-index` negativo do filho "escapa" pra trás do PRÓPRIO degradê de fundo do bloco, ficando
    100% invisível (armadilha real, encontrada só testando com captura de tela — visualmente
    idêntico a "não renderizou nada"). Tamanho: ver "rodada 2" logo abaixo — não são mais 2 tokens
    fixos de fonte, viraram um tamanho fluido.

### Marca d'água "VEXO" — rodada 2 (tamanho fluido, proporcional à largura do bloco)

- **Problema da versão original**: só 2 tamanhos fixos (`pub-watermark` 104px / `pub-watermark-lg`
  320px, trocados no breakpoint `md`, 768px) — no celular a palavra ficava pequena e desproporcional
  ao bloco (só ~78% da largura dele, variando bastante entre celulares de tamanhos diferentes), e
  exatamente em 768px havia um salto brusco de tamanho (104→320px de uma vez).
- **Correção: tamanho fluido via Container Query units (`cqw`)**, não mais tokens fixos nem `vw` —
  escala com a largura REAL do próprio bloco `.pub-cta-band` (que tem `container-type: inline-size`
  próprio), não com a largura da viewport. Isso importa porque o bloco tem `max-w-[1040px]`: usar
  `vw` continuaria crescendo acima de telas de 1040px+, mudando o tamanho no notebook (proibido).
  `cqw`, por sua vez, acompanha a largura do BLOCO, que trava em 1040px — então o tamanho também
  trava sozinho, sem precisar de nenhum breakpoint manual.
- **Fórmula** (`.pub-watermark-fluid`, `globals.css`): `clamp(6.5rem, calc(32.26px + 28.7745cqw), 20rem)`
  — uma reta (técnica padrão de "fluid typography", 2 pontos calibrados) limitada por `clamp()`.
  Os 2 pontos usados pra calibrar a reta: no menor celular testado (390px de tela → ~358px de
  bloco), a palavra ocupa ~93% da largura do bloco (pedido: "em torno de 85% a 100%"); na largura
  em que o bloco já bate no próprio limite (`max-w-[1040px]`), o tamanho bate EXATAMENTE nos 320px
  de antes — notebook e telas largas ficam pixel-idênticos ao que já era. `clamp()` usa os 2
  tamanhos antigos como piso/teto (nunca menor que 104px, nunca maior que 320px) — os tokens
  `pub-watermark`/`pub-watermark-lg` em si foram removidos do `tailwind.config.ts` (sem mais
  nenhum uso depois da troca pra `cqw`), mas os valores continuam vivendo como piso/teto do
  `clamp()`. Peso (700) e tracking (-0.03em) continuam na mesma classe CSS, já que não dependem
  do tamanho.
- **Fallback sem Container Queries**: a classe declara `font-size: 6.5rem;` ANTES do `clamp()`
  com `cqw` — um navegador sem suporte a Container Queries não reconhece a unidade `cqw` e descarta
  a 2ª declaração inteira (valor inválido), mantendo o tamanho fixo de celular de antes. Nunca fica
  sem marca d'água nenhuma por falta de suporte.
- **Testado em 390/768/1366px** (`page.watermark.layout.test.ts`, Playwright com Tailwind
  compilado): ~93% da largura do bloco em 390px, ~85% em 768px, e em 1366px o `font-size`
  computado é exatamente 320px (e a largura real do texto, medida via `Range.getBoundingClientRect`,
  é a mesma de antes) — sem rolagem horizontal em nenhuma das 3 larguras. Confirmado também por
  captura de tela real nas 3 larguras.
  - **Antes/Depois — equilíbrio de altura no desktop**: o box "Antes" (chips) ficava bem mais baixo
    que o "Depois" (conversa de exemplo), com vazio embaixo. Correção meio a meio:
    - **Chips novos**: "Prospecção fria", "Leads desqualificados", "Agenda com buracos", "Pacientes
      que sumiram" — misturados entre os 7 originais (`BEFORE_PILLS`, `page.tsx`), não
      concentrados no fim, mesmo estilo (borda, inclinação alternada `rotate-N`/`-rotate-N`, texto)
      dos que já existiam. Só a dor, nunca a solução.
    - **Depois mais compacto** (só desktop, `@media (min-width: 900px)` em `globals.css`): mais um
      corte (~16% sobre o tamanho já reduzido da rodada anterior) em cima do padding do bloco
      (12→16px), do espaço antes do chat (10px), do espaço entre balões (5px), do padding vertical
      dos balões (4px) e do card (6px), e um novo corte no espaço até os chips finais
      (`.pub-after-tags`, 10px — não existia antes, essa margem nunca tinha sido tocada). Corte
      total em relação ao tamanho original (antes de qualquer rodada): ~16%, dentro da faixa
      pedida (15–20%).
    - **Altura igual garantida por CSS, não só visualmente parecida**: o grid pai (`page.tsx`)
      trocou `items-start` por `items-stretch` — os dois boxes sempre terminam exatamente na mesma
      altura, qualquer que seja o conteúdo de cada lado. O box "Antes" virou `flex flex-col`, com o
      `<ul>` dos chips em `flex-1 content-between` (não `content-start`): a folga que sobra quando o
      box estica pra bater com o "Depois" vira espaço extra DISTRIBUÍDO ENTRE as linhas de chips
      (nunca um vazio só embaixo, nem centralizado com vazio em cima e embaixo também) — `gap-2.5`
      continua sendo o mínimo entre linhas, `content-between` só soma o que sobra em cima disso.
    - **Pegadinha de especificidade CSS, achada só comparando o CSS compilado de verdade** (o
      código-fonte sozinho não mostra isso): o seletor `.pub-after` sozinho perdia pro `sm:p-7` do
      próprio elemento — Tailwind injeta o bloco de variantes `sm:` DEPOIS deste arquivo na folha
      final, e com a mesma especificidade (uma classe) o último no documento vence. Virou
      `.pub-after.pub-after` (mesma classe duas vezes, especificidade 0,2,0) pra não depender de
      onde cada bloco cai na folha compilada.
    - **Celular**: inalterado — uma coluna só (sem `items-stretch` fazendo efeito, já que cada box
      ocupa a linha inteira sozinho), chips novos aparecem com a mesma quebra de linha de sempre,
      sem rolagem horizontal (testado 390/360px).
  - **Depois — respiro interno (rodada seguinte à de cima)**: a rodada anterior tinha comprimido o
    espaçamento interno do box "Depois" pra bater a altura com o "Antes" — ficou com aparência
    sufocada. Correção: inverte a lógica, abrindo mais espaço (não menos) e compensando com um
    corte de texto em vez de um corte de espaçamento.
    - **Texto ~8–12% menor** (só a partir de 900px, `globals.css`): título (`.pub-after-title`,
      18→16px), balões do chat e título do cartão "Avaliação agendada" (`.pub-after-chat`,
      14→12.5px, herdado pelos filhos sem classe de tamanho própria), subtítulo do cartão
      (`.pub-after-card-sub`, 12→11px), chips finais (`.pub-after-tag`, 12→11px) e "Exemplo
      ilustrativo" (`.pub-after-example`, 11→10px) — cada um com `line-height` reduzido junto
      (Tailwind `text-sm`/`text-xs`/`text-lg` fixam `line-height` em par com o `font-size`; só
      trocar o `font-size` no override não encolhe a caixa da linha, teria de reduzir os dois).
    - **Mais respiro** (mesmas classes `.pub-after*` de antes, valores maiores, não menores):
      padding do bloco 16px/24px → 17px/25px, espaço antes do chat 10→12px, espaço entre balões
      5→6px, padding vertical dos balões 4→5px, do cartão 6→7px, espaço até os chips finais
      10→12px.
    - **Altura final idêntica à rodada anterior (304.5px nas três larguras testadas), não por
      coincidência**: o corte de texto (que reduz a altura) e o aumento de espaçamento (que
      aumenta) foram ajustados em conjunto, medindo a cada tentativa com Playwright
      (`getBoundingClientRect`) até os dois lados baterem de novo — o cálculo manual por si só
      errou por ~20% na primeira tentativa (face ao `line-height` fixo do Tailwind, que não muda
      só com o `font-size`), só a medição real pegou isso.
    - **`.pub-after` ganhou `flex flex-col justify-between`** (no JSX, não só no CSS — vale em
      qualquer largura, mas só tem efeito visível a partir de 900px, quando `items-stretch` pode
      esticar o box): qualquer folga entre a altura calculada do conteúdo e a altura do box
      "Antes" ao lado vira espaço extra DISTRIBUÍDO ENTRE os 3 blocos (cabeçalho, chat, chips) em
      vez de sobrar como vazio só embaixo — mesmo princípio do `content-between` do box "Antes",
      e a rede de segurança que evita depender de acertar o pixel exato na mão.
    - **Bolha azul (IA) sem canto pontiagudo**: tinha `rounded-br-[6px]` (canto inferior direito
      pequeno, estilo "rabinho" de chat) — removido, ficou só `rounded-[18px]` nos quatro cantos,
      em qualquer largura de tela (defeito visual, não ajuste de desktop). As bolhas da esquerda
      mantêm o `rounded-bl-[6px]` (não reclamado, deixado como estava). Confirmado sem corte por
      `overflow-hidden` de nenhum ancestral, e com a margem até a borda direita do box igual à
      margem das bolhas da esquerda até a borda esquerda (ambas vêm do mesmo padding simétrico do
      `.pub-after`).

## Conexões (`/crm/clinicas/[id]/conexoes`) — tela limpa pro vídeo de revisão da Meta

- **Só 3 cards (Instagram, Google Calendar, WhatsApp), sempre lado a lado, inclusive no celular**:
  `grid grid-cols-3 gap-2` sem nenhum breakpoint que empilhe — decisão deliberada, não um
  descuido de responsividade. No celular (~358px úteis depois do `px-4` do `AppShell`) cada card
  fica com ~114px: só cabe com tipografia e espaçamento compactos (ver abaixo), então o card
  nunca tenta imitar o layout largo de desktop.
- **Tokens, nunca valor cru**: tamanho de fonte do corpo do card é `text-card` (11px, definido em
  `tailwind.config.ts`), nunca `text-[11px]` escrito direto na tela — mesmo texto pequeno, mas
  pelo token nomeado, pra continuar valendo a regra do topo deste arquivo.
- **Reconectar substitui o botão normal, nunca aparece junto com "Desconectar"**: sessão
  expirada (`needsReconnectAt`) é tratada como estado exclusivo do card — ou mostra
  "Reconectar" (novo OAuth), ou mostra o botão padrão do estado conectado/não-conectado, nunca os
  dois ao mesmo tempo.
- **Excluído da tela** (e do código que só existia pra isso, ver commit desta rodada): a conexão
  OPCIONAL de Business Discovery (foto de perfil do lead — superada desde antes por
  `getInstagramProfilePicture`, que já é o mecanismo automático ativo), a correção manual do ID
  do webhook do Instagram, os botões de diagnóstico "Ver campos inscritos"/"Reativar webhook", o
  link "Ver status" no topo, e a descrição longa do cabeçalho (ficou só o título "Conexões"). O
  que o fluxo automático usa (inscrição do webhook ao conectar, identificação da clínica pelo
  `igUserId` do evento, `needsReconnect`) continua intacto — só a interface manual de apoio saiu.
- **Mantido fora da lista dos 3 cards**: o bloco "Onboarding remoto do cliente" (gera link pro
  cliente conectar Instagram+Google Calendar sem acesso ao CRM) — é uma ferramenta diferente,
  não um 4º card de canal, e não estava na lista do que devia sair da tela.

### Conexões — rodada 2 (botão no canto direito, acabamento do Painel, WhatsApp no mesmo padrão)

- **Botão no canto direito, na MESMA linha do indicador de status** (indicador à esquerda, botão
  à direita) — substituiu a versão anterior (botão centralizado embaixo, "chapada"). Linha
  `flex flex-wrap items-center gap-x-1.5 gap-y-1` + `ml-auto` no botão: nos 2 canais com texto
  curto (ex: "Conectado" + "Desconectar") sempre cabe tudo numa linha só; só no combo mais largo
  ("Não conectado"/"Reconexão necessária" + botão, no celular) o botão desce pra uma 2ª linha,
  ainda encostado na direita — nunca corta nem esconde o texto do status. Decisão importante aqui:
  o rótulo de status NUNCA leva `truncate` — a 1ª tentativa usava `truncate` e ele encolhia até
  sumir (texto invisível) quando não sobrava espaço nenhum pro botão ao lado; a correção foi tirar
  o `truncate` e deixar o rótulo quebrar linha normalmente quando precisar (`min-w-0` no
  container, sem forçar uma única linha) — testado e fixado em
  `page.layout.test.ts` (describe "rótulo de status mais longo").
- **Acabamento igual aos cards do Painel do cliente**: `rounded-control` (8px — mesmo token usado
  em `PanelAppointmentsColumn.tsx`/`ReactivationRail.tsx`), borda `border-vexo-border` bem sutil,
  fundo `bg-vexo-surface` — troca do antigo `rounded-xl` (block, 12px, "cartão" de conteúdo maior)
  por `rounded-control` (control, 8px — papel de item/linha compacta, que é o que estes 3 cards
  são). Botões internos (`Conectar`/`Desconectar`/`Cancelar`/`Reconectar`, incluindo
  `ConnectOAuthButton`/`ConnectionLinkButton`) seguem o mesmo `rounded-control`, com padding
  reduzido (`px-1.5` em vez de `px-2.5`) pra caber ao lado do status na mesma linha.
- **WhatsApp entra no MESMO padrão de desconexão que Instagram e Google Calendar** — antes era o
  único canal fora do padrão ("Gerenciar" sempre, navegando pra tela do QR code mesmo já
  conectado). Agora: conectado → "Desconectar" (mesma aparência e ação real de desconectar já
  usada em `/whatsapp`, só chamada também daqui); não conectado → "Conectar", leva direto pra
  `/whatsapp` (onde fica o QR code). O botão "Gerenciar" não existe mais em lugar nenhum da tela —
  como os 3 canais passaram a desconectar sempre pelo VEXO, a ramificação de código que só existia
  pra exibir "Gerenciar" (conectado sem `disconnectAction`) virou código morto e foi removida
  junto (prop `openInNewTab` do `ConnectionCard` também saiu, sem mais nenhum uso).

## Conversa (`/crm/conversas/[id]`) — atualização automática, sem gatilho visível

- **Mensagens novas entram sozinhas, a cada ~3.5s, sem recarregar a página**: a lista de
  mensagens é um Client Component (`ConversationMessages`) que faz polling leve — busca só o que
  é mais novo que a última mensagem já exibida (nunca a conversa inteira), via
  `/api/conversas/[id]/mensagens?afterVisibleAt=...&afterId=...`. Visual idêntico ao de antes
  (mesma marcação dos balões) — só a origem dos dados virou dinâmica.
- **Nunca pula a rolagem de quem está lendo mensagens antigas**: só rola pro fim quando o
  operador já estava a ≤64px do fim da página no momento em que a mensagem nova chega
  (`isNearBottom`, ver `src/lib/conversation-polling.ts`); lendo mais acima, a tela não se move.
- **Pausa com a aba escondida, retoma ao voltar** (com uma busca imediata, sem esperar o próximo
  tick) — nunca gasta uma chamada de rede com o operador numa aba diferente.
- **Nunca duas buscas em paralelo**: uma trava simples (`isFetchingRef`) ignora o tick do
  `setInterval` se a busca anterior ainda não voltou.
- **A lógica de decisão (quando buscar, qual cursor usar, o que já é conhecido, se está perto do
  fim) é pura e vive separada do componente**, em `src/lib/conversation-polling.ts` — testada
  direto por unidade (`conversation-polling.test.ts`), sem precisar de DOM/jsdom (este repo só
  tem infra de teste em Node puro).

### Conversa — rodada 2 (escala compacta, mesma densidade do Painel do cliente)

- **Toda a tela ficou um degrau menor**, igualando a densidade já usada no Painel do cliente —
  comportamento (atualização automática a cada ~3.5s, sem piscar/recarregar/pular rolagem) e
  cores continuam exatamente como estavam, só a escala visual mudou:
  - Balão de mensagem: `rounded-block` (12px, era `rounded-2xl`/16px) + `px-2.5 py-1.5` (era
    `px-3 py-2`) + `text-xs` (era `text-sm`) + `max-w-[65%]` (era `max-w-[80%]` — balão nunca
    ocupa quase a tela inteira).
  - Container da conversa: `rounded-block` + `p-2.5` (era `rounded-2xl p-4`); espaço entre
    balões `space-y-1.5` (era `space-y-3`).
  - Título (nome do lead): `text-sm` (era `text-lg`); badge "Em conversa" (`StatusBadge`) não
    mudou — já era compacto.
  - Cartões do aside (Lead, Agendamento): `rounded-block p-2.5 text-xs` (era `rounded-2xl p-4
    text-sm`); coluna do aside em si mais estreita, `220px` (era `280px`).
  - Botões e campo de resposta manual: `rounded-control`, `text-card`, padding reduzido
    (`px-2.5 py-1.5`/`px-3 py-1.5`, eram `px-3 py-2`/`px-4 py-2`).
  - Margens da página: `gap-3` entre coluna principal e aside (era `gap-6`), `mb-2`/`mt-2` entre
    blocos (eram `mb-4`/`mt-3`) — menos espaço vazio em volta, sem cortar nada.
- **Nada de `rounded-2xl`/`rounded-xl` crus**: todos os raios da tela agora vêm de
  `rounded-control`/`rounded-block` (os 2 tokens de raio já existentes em `tailwind.config.ts`),
  nunca um valor do Tailwind puro escrito direto.
- **Responsivo**: validado em 390px e 1366px via Playwright (Tailwind compilado) em
  `page.layout.test.ts` — sem rolagem horizontal, nenhum balão estourando a própria caixa, balão
  nunca passando de ~70% da largura útil da conversa, aside ≤240px no notebook.

### Conversa — rodada 3 (a resposta da IA só aparece depois de enviada de verdade)

Problema real: a resposta da IA é gravada como PENDING (esperando o atraso adaptativo, 5-60s) e
JÁ aparecia na conversa na hora, com a marca "· agendada" — só saindo de fato pro Instagram minutos
depois, quando o cron de despacho roda. No vídeo de revisão da Meta isso parece dessincronizado
(a mensagem "chega" no VEXO antes de chegar no Instagram do lead). O atraso em si não mudou — só
quando a mensagem passa a APARECER.

- **A marca "· agendada" foi removida de verdade** (não escondida por CSS) — junto de todo campo/
  tipo que só existia por causa dela (`MessageDTO.status` não inclui mais `"PENDING"`/`"SENDING"`,
  `MessageDTO.sentAt`/`createdAt` separados viraram um único `visibleAt`).
- **PENDING e SENDING nunca aparecem** — nem na carga inicial (`conversas/[id]/page.tsx`), nem no
  polling (`/api/conversas/[id]/mensagens`): os dois filtram `status IN (SENT, FAILED)` na própria
  query ao banco. SENT aparece normalmente; FAILED continua aparecendo, com "· falhou". Mensagens
  do lead (entrada) continuam aparecendo na hora, sem nenhuma mudança. Vale pra Admin, Equipe e
  Revisor — sem regra especial por papel.
- **O cursor do polling e a ordem da conversa usam `visibleAt`, não `createdAt`** (ver
  `src/lib/message-visibility.ts`, `messageVisibleAt`): entrada usa `createdAt` (sempre visível
  desde que chega); saída usa `sentAt` (o instante em que `dispatchOneMessage`, `dispatch.ts`,
  marca SENT) — ou `updatedAt` pra uma que FALHOU (nunca chega a ter `sentAt`; `updatedAt` é o
  instante exato da própria falha, a única escrita que muda o status pra FAILED). Isto resolve o
  bug de cursor que esconder PENDING/SENDING introduziria sem essa mudança: uma resposta criada em
  T0 (escondida), com o lead mandando outra mensagem em T0+2s (o cursor avança) e a resposta só
  saindo em T0+10s (createdAt=T0, ANTES do cursor) — sem usar `visibleAt`, o polling nunca traria
  essa mensagem (só apareceria num F5). Com `sentAt` (T0+10s, DEPOIS do cursor) como `visibleAt`,
  ela aparece no próximo polling, na hora certa.
- **Nenhuma mudança em `dispatch.ts`/`conversation-pipeline.ts`/migration**: toda mensagem de saída
  SENT já preenche `sentAt` no mesmo instante da transição (auditado em `dispatch.ts`,
  `reminders.ts` e no backfill de histórico, `conversation-pipeline.ts`) — a correção é só nos 2
  pontos de LEITURA (página + polling), nunca em quem grava.
- **Pipeline já estava alinhado, sem precisar de nenhuma mudança**: `Conversation.lastMessageAt`
  (usado pra ordenar/exibir o card no board) só é atualizado na transição SENT (`dispatch.ts`),
  nunca na criação PENDING — confirmado por auditoria, não corrigido, porque já estava certo.

### Conversa — rodada 4 (a confirmação de agendamento por WhatsApp nunca aparece como bolha)

Problema real: a confirmação imediata de agendamento (`formatAppointmentConfirmationMessage`,
`Message.channel = "WHATSAPP"`, ver `maybeSendWhatsappConfirmation`) aparecia na conversa do
Instagram como se fosse uma bolha dela — colada na pergunta de presença da IA, inclusive
mostrando "· falhou" quando o envio por WhatsApp falhava. O lead não precisa ver por onde a
confirmação foi mandada.

- **`channel = "WHATSAPP"` nunca aparece na conversa** — mesmos dois pontos de leitura de sempre
  (`conversas/[id]/page.tsx` e `/api/conversas/[id]/mensagens`), mesma técnica da rodada 3: filtra
  `channel IN (INSTAGRAM)` na própria query ao banco, nunca em memória. Vale pra Admin, Equipe e
  Revisor — sem regra especial por papel. Mensagem de WhatsApp escondida nunca é candidata, então
  nunca pode mover o cursor do polling.
- **Status/Nenhuma mudança em `dispatch.ts`**: a Message em si (envio, status, falha) continua
  gravada exatamente como hoje — a tela Status da clínica (`crm/clinicas/[id]/status/page.tsx`)
  lê `Message` sem filtrar por canal de propósito, pra continuar mostrando falhas de WhatsApp.
- **`VISIBLE_MESSAGE_STATUSES`/`VISIBLE_MESSAGE_CHANNELS` (`message-visibility.ts`)**: os dois
  arrays que os dois pontos de leitura usam agora pro `where` do Prisma — nunca mais um literal
  `["SENT", "FAILED"]`/`["INSTAGRAM"]` duplicado em cada arquivo, pra nunca divergirem.
- **Lembretes de véspera (`reminders.ts`) continuam de fora desta regra, sem precisar de nenhuma
  mudança**: já são sempre `channel = "INSTAGRAM"` hoje (regra de produto: "o WhatsApp da clínica
  serve só pra confirmação de agendamento, nunca pra lembrete") — confirmado por auditoria, nunca
  ficam escondidos.

## Login "Revisor" (App Review da Meta) — somente leitura, lista fixa de telas

Papel novo de usuário (`UserRole.REVIEWER`) pensado só pra entregar um acesso de demonstração
pra equipe de revisão do App Review da Meta — sem reaproveitar o login de nenhum cliente/clínica
real, e sem dar acesso a nada que não seja a Clínica Demo VEXO.

- **Regra "negar por padrão"**: o Revisor só enxerga 4 rotas, numa lista fixa no código
  (`src/lib/reviewer-access.ts`, função `isReviewerAllowedPath`) — Conexões, Painel e Pipeline da
  Clínica Demo, e a tela/API de uma conversa (só se ela for da própria clínica). Qualquer outra
  rota de `/crm` ou `/api` responde como se nunca tivesse existido (`notFound()` nas páginas,
  JSON 404 nas rotas de API) — nunca um redirect, que revelaria que a rota existe. Uma rota nova
  que ninguém adicione à lista fica automaticamente bloqueada (coberto por teste que varre todo
  `src/app/crm` e `src/app/api`, ver `reviewer-access.test.ts`).
- **2 camadas de bloqueio, sem espalhar `if (role === "REVIEWER")` pelo código**: `middleware.ts`
  (edge, só lê o JWT) nega por caminho/URL antes de qualquer página renderizar — cobre inclusive
  páginas que não têm checagem de sessão própria (herdam do layout). `requireInternalSession()`
  (`src/lib/session.ts`) passou a responder 404 pro Revisor em qualquer lugar que ainda a chame
  direto — ou seja, toda ação de escrita existente (`clinicas/actions.ts`) já fica bloqueada sem
  precisar de nenhuma exceção nova. Só as 4 telas liberadas usam a função nova
  `requireInternalOrReviewerSession(clinicId)`, que deixa passar Admin/Equipe (qualquer clínica,
  como sempre) ou o Revisor (só se for a clínica dele).
- **Somente leitura em todo canto**: nas 4 telas liberadas, todo botão que muda algum dado
  (Desconectar/Conectar, Retorno, Não compareceu, mandar mensagem, marcar como perdido, devolver
  pra IA, "Criar painel"/acesso do cliente) fica escondido via uma prop `readOnly` passada a
  partir da própria página — nunca omitindo a prop da action (vários componentes têm uma action
  padrão de fallback que aponta pra uma ação de cliente real; só esconder o botão de verdade
  evita cair nesse fallback por engano). No servidor, a mesma ação, chamada direto por fora da
  tela, já rejeita (404) porque usa `requireInternalSession`, que bloqueia o Revisor — a interface
  escondendo o botão é reforço visual, não o bloqueio real.
- **Menu e identidade**: a barra lateral do Revisor mostra só Conexões/Painel/Pipeline (sem
  "Contas", sem seletor de clínica — `buildReviewerNavGroups`, `clinic-nav.tsx`), e o rodapé
  mostra "Revisor" em vez de "Admin"/"Equipe". Depois do login, vai direto pras Conexões da
  Clínica Demo (`/entrar`).
- **Ativar/desativar sem prazo automático**: `User.active` (booleano, default `true` — sem
  mudança nenhuma pro comportamento de Admin/Equipe/Cliente já existentes) é checado em toda
  requisição (`requireSession`), não só no login — desativar o Revisor tira o acesso dele na
  próxima ação, mesmo que já estivesse logado.
- **Seção "Login de revisão" em Contas (só Admin)**: bloco compacto no fim da página `/crm`
  (`ReviewerLoginSection.tsx`), mesmos tokens das outras seções da página (`rounded-block`,
  `p-block`, `text-card`/`text-caption`, `bg-vexo-surface`). Mostra e-mail + estado
  (Ativo/Desativado), botão Ativar/Desativar, e "Gerar nova senha" (cria o login na primeira vez,
  se ainda não existir) — a senha em texto aparece só uma vez, na própria tela, nunca gravada
  (nem em log, nem em teste).

## Pipeline (`/crm/clinicas/[id]`) — atualização automática, mesma técnica da conversa

Mesmo problema que a tela de conversa já tinha resolvido antes (ver seção "Conversa" acima):
card novo ou card que muda de coluna só aparecia depois de um F5, o que entrega visivelmente que
a página foi recarregada — crítico pro vídeo do App Review da Meta, que mostra o Pipeline
recebendo uma mensagem nova em tempo real.

- **Mesma técnica da conversa, reaproveitada, não reinventada**: o board inteiro (faixa de
  métricas + colunas) virou um Client Component (`PipelineBoard.tsx`) que busca um retrato novo a
  cada ~3.5s enquanto a aba estiver visível — `shouldPoll` é literalmente **reexportado e
  reaproveitado** de `conversation-polling.ts` (nunca duplicado): nunca dispara com a aba
  escondida, nunca duas buscas em paralelo (`isFetchingRef`), pausa e retoma (com uma busca
  imediata) no `visibilitychange`. A diferença pro polling da conversa é só o FORMATO do dado: lá
  é incremental (só mensagens novas); aqui é um retrato inteiro do board por vez, porque qualquer
  card pode ter mudado de coluna, não só "ter mais itens".
- **Sem re-renderizar à toa**: o retrato buscado é comparado campo a campo com o que já está na
  tela (`snapshotsEqual`, `pipeline-polling.ts`) — sem nenhuma mudança real (card novo/mudou de
  coluna/contador/horário), o estado do React nem troca, então nada pisca e nada tremula. Card
  novo ou que mudou de coluna entra direto no lugar certo (chave estável `key={conv.id}`, sem
  nenhuma classe de animação/transição nova) — sem recarregar a página, a rolagem vertical da
  página e a rolagem horizontal própria do board (`overflow-x-auto`) nunca são tocadas.
- **Nunca interrompe uma interação em andamento**: enquanto o botão do mouse estiver apertado
  (ex: arrastando a rolagem horizontal das colunas) ou houver texto selecionado na tela (ex:
  copiando o nome de um lead), uma atualização pendente é guardada (`resolvePipelineUpdate`) e só
  aplicada quando a interação termina — nunca desfaz o que o operador está fazendo. (O Pipeline
  não tem arrastar-card-entre-colunas/drag-and-drop hoje — é só links somente leitura — mas a
  mesma guarda já cobre esse caso se um dia existir.)
- **Busca leve, fonte única**: a consulta ao banco (`getPipelineSnapshot`, `pipeline-data.ts`) usa
  `select` (só os campos que o card realmente mostra — nome, @, foto, status, última mensagem,
  data do agendamento — nunca o objeto inteiro) e é a MESMA função chamada tanto na primeira
  carga da página quanto em cada busca do polling, pela nova rota `GET
  /api/clinicas/[id]/pipeline` — nunca duas versões divergentes da mesma lógica.
- **Vale pra Admin, Equipe e Revisor, sem dar nenhuma ação nova a ele**: a nova rota de API exige
  login (401 sem sessão) e, pro Revisor, só devolve dados da PRÓPRIA clínica (404 de qualquer
  outra, nunca revela nada) — é GET, somente leitura, igual a `/api/conversas/[id]/mensagens`.
  Adicionada explicitamente à lista fixa do Revisor (`reviewer-access.ts`,
  `/api/clinicas/<clinicId>/pipeline`) mantendo a regra "negar por padrão" — o Pipeline já não
  tinha nenhum botão de ação (só links), então a atualização automática não abre nenhuma porta de
  escrita pra ele.
- **Responsivo**: validado em 390px e 1366px via Playwright (Tailwind compilado) em
  `clinicas/[id]/page.layout.test.ts` — sem rolagem horizontal da página (a rolagem horizontal
  PRÓPRIA do board, pra ver as 6 colunas num celular, é esperada e já existia antes desta
  mudança).

## Agente de IA — sequência de confirmação de presença: caixinha "Enviar" por item

Problema real: a sequência inteira (apresentação, vídeo, cafezinho, mensagem final) dependia só
de `Clinic.confirmationVideoUrl` existir — sem vídeo cadastrado, nada saía, nem a mensagem final
(que confirma a presença e não tem relação nenhuma com o vídeo). Agora cada um dos 4 itens tem
sua própria caixinha "Enviar", na aba "Prompt de conversação da IA" > "Configurações auxiliares"
(`/crm/clinicas/[id]/agente-ia`).

- **4 colunas booleanas novas em `Clinic`** (`confirmationVideoCaptionEnabled`,
  `confirmationVideoEnabled`, `attendanceTipEnabled`, `attendanceFinalEnabled`), cada uma ao lado
  do rótulo do item que ela controla, usando o mesmo `<label className="flex items-center gap-1
  text-card text-vexo-muted">` já usado pela caixinha "Remover" do vídeo — nenhum componente novo
  pros 2 itens sem dependência (cafezinho, final); só o vídeo + a frase que o acompanha
  precisaram de um Client Component (`AttendanceVideoSettings.tsx`) pela interatividade abaixo.
- **Ordem inalterada, item desmarcado é pulado**: apresentação -> vídeo -> cafezinho -> final,
  sempre nessa ordem relativa — só os itens marcados entram na sequência de verdade (ver
  `buildAttendanceSequenceItems`, `conversation-pipeline.ts`). Os 10s entre itens continuam
  ancorados no envio real (`sentAt`) do item anterior que de fato saiu, nunca mudando por causa
  de um item pulado no meio (`ATTENDANCE_ITEM_DELAY_MS`, fixo por item, não por par).
- **2 regras de dependência, impostas na tela E no servidor** (nunca só uma das duas):
  - A frase que acompanha o vídeo só pode ficar marcada se o vídeo também estiver — a caixinha
    dela vem desabilitada (`disabled`) sempre que a do vídeo estiver desmarcada.
  - O vídeo só pode ficar marcado se houver arquivo de verdade — a caixinha dele vem desabilitada
    sem nenhum arquivo (nem salvo, nem escolhido agora no input). Escolher um arquivo habilita a
    caixinha; marcar "Remover" (apaga o arquivo, ação separada que continua existindo) desabilita
    e desmarca as duas (vídeo e frase) na hora, sem precisar recarregar a página.
  - A validação do servidor (`updateAiAgentSettings`, `clinicas/actions.ts`) repete as 2 regras
    sempre, nunca confiando só na tela.
- **Com tudo desmarcado, a sequência não dispara** (`fireAttendanceConfirmationSequence` devolve
  `false` antes de reivindicar qualquer coisa) — mesmo texto de ajuda de cada item já avisa isso
  (curto, em português simples, sem jargão).
- **Despedida da IA condicionada só à mensagem final**: a instrução interna que impede a IA de se
  despedir sozinha (pra não duplicar a frase final do código) só é injetada quando a mensagem
  final está marcada E a sequência vai disparar neste turno (`shouldSuppressAiFarewell`,
  `conversation-pipeline.ts`) — nunca em `Clinic.aiSystemPrompt` nem no prompt padrão. Com a
  final desmarcada, a IA se despede normalmente, mesmo que vídeo/cafezinho ainda disparem.
- **Bug real corrigido (rodada 2)**: com a sequência inteira desligada (as 4 caixinhas
  desmarcadas, ou sem vídeo cadastrado), a IA simplesmente não ficava sabendo que o lead tinha
  acabado de confirmar presença — respondia qualquer coisa sem sentido a um "sim, claro."
  (ex.: "Por nada."). `buildAttendanceConfirmedContext` (`conversation-pipeline.ts`) agora SEMPRE
  injeta um aviso quando o lead confirma presença (mesma condição de sempre,
  `pendingAttendanceCheck?.decision === "NAO_REMARCA"`, nunca uma segunda detecção): o aviso sem
  despedida de cima quando `shouldSuppressAiFarewell` é `true`, ou um aviso novo permitindo a IA
  se despedir normalmente quando nada mais vai sair depois. Mesma regra de sempre: só instrução
  interna, nunca `Clinic.aiSystemPrompt` nem o prompt padrão.
- **Clínica já existente preserva o comportamento de hoje** (migration
  `20261120000000_attendance_sequence_item_toggles`): as 4 caixinhas nascem `true` (comportamento
  de sequência completa) pra quem JÁ TEM vídeo cadastrado; `false` nas 4 pra quem NÃO tem (hoje
  nada saía, e não viraria cafezinho/final saindo sozinhos sem ninguém decidir isso). Clínica
  nova nasce com as 4 `true`. Nenhuma coluna existente apagada.
- **Pipeline/conteúdo das mensagens, sem nenhuma relação com o vídeo**: `maybeSendWhatsappConfirmation`
  e `maybeSendInstagramConfirmationCard` (confirmação IMEDIATA do agendamento, por WhatsApp/
  Instagram) nunca dependeram de `confirmationVideoUrl` — continuam disparando exatamente como
  sempre, independente das 4 caixinhas novas (que só afetam a sequência de confirmação de
  PRESENÇA, bem mais tarde no fluxo).
- **Responsivo**: validado em 390/414px e 1366px via Playwright (Tailwind compilado) em
  `agente-ia/page.layout.test.ts` — sem rolagem horizontal em nenhuma das 4 abas.

## Menu global (`AppShell`) — item "Status" + badge de contagem

Problema real: `/crm/dispatch-status` (diagnóstico de mensagens presas/falhadas, ver seção
"Envio de mensagens" mais acima nesta investigação) só era alcançável digitando a URL direto —
sem link nenhum na sidebar do CRM. Agora tem um item "Status" no grupo "Operação"
(`crm/(global)/layout.tsx`), ao lado de "Contas" e "Abordagem", usando o ícone `Activity`
(lucide-react) pra diferenciar dos outros dois sem introduzir uma cor nova.

- **`NavItem` ganhou um campo opcional `badge?: number`** (`AppShell.tsx`) — contagem exibida ao
  lado do rótulo do item, SÓ quando `> 0` (`!!item.badge`, então `0`/`undefined` não mostram
  nada). Renderizado tanto na sidebar desktop (`NavLink`) quanto na barra de abas do celular, pelo
  mesmo componente `NavBadge` — um pill arredondado em `bg-vexo-error` com texto branco, 10px,
  semibold. Deliberadamente genérico (qualquer item de qualquer `AppGroup`, não só "Status") pra
  não precisar de um componente novo se outro item global precisar de badge no futuro.
- **Sempre a cor de erro já existente (`vexo-error`), nunca uma cor nova por item** — mesma
  semântica usada em toda a seção "Mensagens que falharam ao enviar" da própria página de Status
  (`border-vexo-error/30 bg-vexo-error/10 text-vexo-error`); aqui o fundo é sólido (não com
  opacidade) porque o texto por cima precisa de contraste garantido em ambos os temas, mas a cor
  em si é a mesma.
- **Mesma contagem que a própria página de Status já usa** — `prisma.message.count({ where:
  { status: "FAILED" } })`, direto no layout (`crm/(global)/layout.tsx`), não uma consulta nova
  nem uma regra própria: é só um atalho visual pra uma informação que a página de destino já
  calculava sozinha.
- **Nenhuma checagem de papel nova** — o grupo "Operação" já vive dentro de `CrmGlobalLayout`,
  que só é alcançado por quem passa primeiro por `requireCrmAreaSession` (bloqueia CLIENT) no
  layout pai (`crm/layout.tsx`); a própria página de Status usa `requireInternalSession`
  (bloqueia também REVIEWER). O link novo não muda esse alcance.

### Menu global — rodada 2 (removido o "Status" duplicado da sidebar de cada clínica)

Com o link acima existindo no menu global, o grupo "Status" que `buildClinicNavGroups`
(`clinic-nav.tsx`) colocava sozinho na sidebar de CADA clínica (apontando pra
`/crm/clinicas/[id]/status`) ficou redundante e poluiu a lista — dois links "Status" visíveis ao
mesmo tempo, um geral e um por clínica.

- **Grupo inteiro removido de `buildClinicNavGroups`**, não só o item — era o único item do
  grupo, então sobrar o cabeçalho "Status" sem nada dentro seria pior que não ter o grupo. O
  grupo "Operação" (Conexões, Painel, Pipeline, Briefing, Agente de IA, Automações, Follow-up,
  Bônus) não mudou nada.
- **A rota continua existindo e funcionando** — `/crm/clinicas/[id]/status/page.tsx` não foi
  tocada; só o item de menu que apontava pra ela saiu. Quem precisar do recorte por clínica ainda
  abre a URL direto; o caminho normal agora é pelo "Status" do menu global (com o badge de
  falhas).
- `buildReviewerNavGroups` nunca teve esse grupo (lista fixa, só 3 itens) — nada mudou ali.

### Menu global — rodada 3 (o "Status" por clínica voltou, com os dois links coexistindo)

Na prática, ter só o link global forçava sair da clínica (clicar "Contas") toda vez pra checar e
resolver uma falha dela — o custo de remover o duplicado (rodada 2) acabou maior que o ganho. O
grupo "Status" voltou pra `buildClinicNavGroups`, igual estava antes da rodada 2, com um badge
próprio — os dois links agora coexistem, cada um com sua contagem:

- **Mesmo item de sempre, mesma rota** — `{ href: "${base}/status", label: "Status", icon:
  Activity }`, igual ao que existia antes da rodada 2; `/crm/clinicas/[id]/status/page.tsx`
  nunca foi alterada em nenhuma dessas idas e vindas (botão "Reenviar" e tudo mais continuam
  exatamente como estavam).
- **Badge igual ao do menu global (rodada 1), mas com OUTRA contagem** — mesmo `NavItem.badge`/
  `NavBadge` (`AppShell.tsx`), sempre `vexo-error`, só quando `> 0`; aqui a contagem é SÓ desta
  clínica: `prisma.message.count({ where: { status: "FAILED", conversation: { clinicId } } })` —
  o mesmo `where` que `/crm/clinicas/[id]/status/page.tsx` já usa pra "Mensagens que falharam ao
  enviar" (`recentFailed`), não uma regra nova. Calculado no layout
  (`clinicas/[id]/layout.tsx`/`conversas/[id]/layout.tsx`, os dois pontos que montam a sidebar
  desta clínica) e passado como 2º parâmetro de `buildClinicNavGroups(clinicId,
  statusFailedCount)`.
- **O badge do menu global não mudou nada** — continua contando TODAS as clínicas
  (`crm/(global)/layout.tsx`, rodada 1), sem relação com este. Dois números podem aparecer ao
  mesmo tempo (o geral em "Contas" e o desta clínica aqui), e isso é esperado: um é a visão
  completa, o outro é o recorte de onde o usuário já está.

### Menu global — rodada 4 (removido de novo, definitivo: só um "Status", dentro da clínica)

Com o "Status" por clínica de volta (rodada 3) e funcionando bem, os dois links ao mesmo tempo
(geral em "Contas" + um por clínica) voltaram a ser redundantes na prática — pedido explícito
pra ter só UM lugar pra isso, nunca dois. O item "Status" (e o badge de todas as clínicas) saiu
de `crm/(global)/layout.tsx` de novo — o menu global volta a ter só "Contas" e "Abordagem",
exatamente como era antes da rodada 1 (PR #258).

- **`crm/(global)/layout.tsx` não calcula mais `prisma.message.count` nenhum** — a consulta
  inteira saiu, não só o item de menu; não tinha mais nada ali que precisasse dela.
- **`/crm/dispatch-status` (a visão de TODAS as clínicas) continua existindo e funcionando** —
  só sem link nenhum no menu, igual ficou `/crm/clinicas/[id]/status` entre as rodadas 2 e 3;
  quem precisar da visão geral agora abre a URL direto.
- **O "Status" por clínica (rodada 3) não muda em nada** — continua na sidebar de cada clínica,
  com seu próprio badge filtrado só pra ela; é o único lugar que resta pra essa funcionalidade.

## Status (`dispatch-status`) — botão "Descartar" pra falhas sem conserto

Problema real: uma mensagem FAILED sem conserto (fora da janela de 24h da Meta, token
permanentemente vencido) ficava contando pra sempre no badge vermelho de "Status" (global e por
clínica) e na lista de "Mensagens que falharam ao enviar" — sem nenhum jeito de tirá-la de lá
além de ir direto no banco. Agora cada mensagem da lista tem um botão "Descartar", ao lado de
"Reenviar".

- **`Message.dismissedAt` (novo, nullable, sem default)** — campo puramente aditivo
  (`20261121000000_message_dismissed_at`). Descartar NUNCA muda `status` nem `failReason`: a
  Message continua FAILED de verdade, com o erro visível no histórico da conversa (nenhuma
  consulta de conversa/mensagens filtra por `dismissedAt` — só as duas telas de Status) — é
  puramente um "sair da contagem/listagem", nunca um apagar ou mascarar.
- **Sempre visível, não só quando "fora da janela"** — pedido explícito: serve tanto pra erro
  sem conserto quanto pra quando o usuário simplesmente decide não reenviar mais aquele envio.
  Aparece ao lado de "Reenviar" (quando reenviável) ou do aviso "Fora da janela..." (quando não).
- **Duas actions, mesmo padrão de sempre** (`dispatch-status/actions.ts`, igual
  `resendFailedMessageAction`/`closeStuckFollowUpLogForClinicAction`): `dismissFailedMessageAction`
  (página global, sem `clinicId`) e `dismissFailedMessageForClinicAction` (aba por clínica, confere
  `conversation.clinicId` antes de marcar — nunca descarta mensagem de outra clínica a partir
  desta tela). As duas usam `updateMany` com `status: "FAILED"` na condição — nunca marca
  `dismissedAt` numa mensagem que não é (ou já deixou de ser) uma falha.
- **Botão neutro, nunca uma cor nova** — mesmo padrão visual das outras ações secundárias desta
  tela (`border-vexo-border`/`text-vexo-muted`, acende levemente no hover), distinto do contorno
  azul (`vexo-accent`) de "Reenviar" — "Descartar" não é a ação principal do card.
- **As 3 queries de falhas filtram `dismissedAt: null`** — `dispatch-status/page.tsx`
  (`recentFailed`, global), `clinicas/[id]/status/page.tsx` (`recentFailed`, por clínica) e os
  dois badges da sidebar (`clinicas/[id]/layout.tsx`/`conversas/[id]/layout.tsx`,
  `prisma.message.count`) — as quatro contagens/listagens do sistema que mostram "falhas"
  agora concordam entre si sobre o que já foi descartado.
