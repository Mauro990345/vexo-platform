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
