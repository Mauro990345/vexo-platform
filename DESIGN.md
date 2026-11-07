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
  usadas (`accent`/`success`/`error`/`warning`/`muted`). Primeiro consumidor: faixa "Para fazer
  hoje" do Painel (Etapa 4, ver seção abaixo) — `PanelCardBadge.tsx` (chip de tipo antigo) foi
  removido, substituído por este componente.
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
(`PanelAppointmentsColumn.tsx` — Próximos, depois Aguardando resposta, com o Histórico atrás de um
link). Celular: mesma estrutura numa coluna só, métricas em 2x2. Linhas sem caixa individual
(bloco único com `Card`, dividido por `divide-y`); status em ponto colorido + texto, não selo
sólido (`AppointmentStatusBadge`, modo compact); ação secundária (ex.: "Não compareceu", quando
"Retorno" também se aplica) num menu "⋯" (`OverflowMenu.tsx`). Componentes removidos, substituídos
pelos de cima: `PanelActivityColumn.tsx`, `ApproachMetricsToggle.tsx`, `PanelMetricCard.tsx`,
`PanelCardBadge.tsx`.
