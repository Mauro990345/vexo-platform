# Auditoria de design (somente leitura)

Varredura do código em `src/` feita em 2026-11-07, sem nenhuma alteração de tela. Base: 31
páginas (`page.tsx`) e 45 arquivos de componente.

## 1. Cores escritas direto, fora dos tokens

**Hex/rgb literais (`"#rrggbb"`) fora de `theme.ts`/`page-style-overrides.ts`** (que são a própria
fonte dos tokens, não uma violação): **6 ocorrências**, todas em `src/components/BrandIcons.tsx`
— cores da marca do Instagram e do WhatsApp (gradiente/verde oficiais). Não são decorativas, são
identidade de terceiro — já alinhado com a regra do DESIGN.md ("o ícone do Instagram segue as
cores da marca dele").

**Classes Tailwind de cor nomeada (`bg-blue-500`, `text-red-500` etc.) fora de `vexo-*`: 18
ocorrências em 6 arquivos:**

| Arquivo | Cor | Contexto |
|---|---|---|
| `components/PanelCardBadge.tsx` | `blue-500/400`, `purple-500/400`, `orange-500/400`, `teal-500/400` (12 ocorrências) | Sistema de 4 cores fixas por TIPO de card da Reativação (Reativação/Faltou/Quente/Não agendou) — decisão deliberada, documentada no próprio arquivo, pra não se confundir com os tokens semânticos `vexo-*` já existentes |
| `components/ClientPanelView.tsx` | `bg-blue-500` | Ícone do Google Calendar (marca de terceiro) |
| `app/crm/clinicas/[id]/conexoes/page.tsx` | `bg-blue-500` | Mesmo ícone do Google Calendar, outra tela |
| `components/WhatsappConnectionPanel.tsx` | `bg-emerald-500` | Ícone de WhatsApp conectado (marca de terceiro) |
| `app/crm/clinicas/[id]/agente-ia/page.tsx` | `hover:text-red-500` | Botão "Remover" foto — **inconsistência real**: o resto do app usa `--vexo-error` pro mesmo propósito (14 arquivos, ex. `configuracoes/page.tsx` no mesmo botão "Restaurar padrão") |

**Resumo:** das 18 ocorrências, 17 são decisões já documentadas (marca de terceiro ou sistema de
cores por tipo). **1 é uma inconsistência real** (red-500 solto em vez de `vexo-error`) — candidata
óbvia a troca de 1 linha quando alguém tocar naquele arquivo.

Nenhum valor hex/rgb solto dentro de `className` ou `style` foi encontrado (nem em sintaxe
arbitrária `bg-[#...]`) — o uso de hex está contido nos dois arquivos de tokens + `BrandIcons.tsx`.

## 2. Tokens duplicados ou conflitantes

- **Nenhum resto de teste de paleta anterior** — `.vxa-preview` e `AutomacoesPalettePreview.tsx`
  (usados nas PRs #185-189) já foram completamente removidos; a varredura não encontrou nenhuma
  referência.
- **`MobileCardScale.ts` é um segundo sistema de tamanho**, paralelo ao `fontSize`/`spacing` do
  `tailwind.config.ts`: 85 valores em pixel nomeados como constantes (`MOBILE_SECTION_TITLE_TEXT`,
  `MOBILE_CHIP_SIZE` etc.), só pro recorte "celular" (abaixo de `sm`) de telas do Painel. É
  internamente consistente e documentado (não é bagunça), mas é uma FONTE separada de verdade —
  tecnicamente, dois lugares decidem tamanho de fonte/espaçamento hoje, não um só (viola a regra
  técnica do DESIGN.md, mesmo sendo bem-intencionado).
- Nenhum outro par de tokens com valores conflitantes (dois nomes pro mesmo hex, ou mesmo nome com
  valores diferentes) foi encontrado — `globals.css` continua sendo a única fonte pras cores.

## 3. Inconsistência de tamanho de fonte, espaçamento, raio e borda

- **Fonte:** `text-xs` (219x) e `text-card`/`text-caption` (84x/62x, ~10-11px) dominam, mas
  convivem sem regra clara de quando usar qual — telas recentes (Automações, Painel) tendem a
  `text-card`/`text-caption`; telas mais antigas usam `text-xs` pro mesmo tipo de texto de apoio.
- **Raio de borda:** 6 valores distintos em uso real — `rounded-lg` (182x), `rounded-xl` (51x),
  `rounded-full` (27x, badges/avatares — ok), `rounded` (19x), `rounded-md` (18x), `rounded-2xl`
  (17x) — e só 8 usos do token nomeado `rounded-card`. Não há critério documentado de quando um
  card é `-lg` e quando é `-xl`; parece ter variado por quem editou cada tela.
- **Espaçamento:** `padding`/`px`/`py` usam pelo menos 24 valores diferentes da escala padrão do
  Tailwind (`px-2.5`, `py-1.5`, `px-3`, `p-2`... até `p-8`), sem nenhuma lista curta "estes são os
  espaçamentos do VEXO" — qualquer valor da escala numérica do Tailwind é usado livremente.
- **Borda:** aqui a consistência É boa — `border-vexo-border` domina (187x) sobre qualquer cor de
  borda solta; não é um problema real.

## 4. Componentes repetidos em várias versões

- **Botão "outline" de ação** (borda + texto `vexo-accent`, fundo transparente): a MESMA string de
  classe (`rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent
  hover:bg-vexo-accent/10`) está copiada literalmente em pelo menos 3 arquivos (`agente-ia/page.tsx`,
  `automacoes/page.tsx`, `FollowUpView.tsx`); o botão preenchido (`bg-vexo-accent` +
  `text-vexo-accentFg`) aparece solto em 13 arquivos a mais, cada um com sua própria variação de
  padding/tamanho. Não existe um `<Button>` compartilhado — só componentes de botão com lógica de
  negócio própria (`ConfirmSubmitButton`, `ConnectionBundleButton`, `NoShowButton`...), nenhum
  puramente visual/genérico.
- **Card/bloco:** o padrão `rounded-xl border border-vexo-border bg-vexo-surface` (ou `surface2`)
  aparece solto em 21 arquivos — sem componente `<Card>`.
- **Badge/etiqueta de status: 3-4 implementações separadas** — `StatusBadge.tsx`,
  `AppointmentStatusBadge.tsx`, `PanelCardBadge.tsx`, e um pill inline dentro de
  `ReactivationConfigForms.tsx` — cada um com seu próprio mapa de cor→status e sua própria marcação
  (`rounded-full`, borda, bolinha), claramente a MESMA ideia visual reimplementada 3-4 vezes.
- **Card de métrica (número + rótulo):** `StatCard.tsx` e `PanelMetricCard.tsx` fazem
  essencialmente a mesma coisa (rótulo pequeno em cima, valor grande embaixo) com paddings/raios
  levemente diferentes; `ClinicMetricsCard.tsx` é um composto maior (várias métricas de uma
  clínica numa linha) que poderia ser montado a partir do mesmo primitivo.
- **Campo de cor:** `ColorField.tsx` e `PageStyleColorField.tsx` — dois componentes pro mesmo tipo
  de campo (seletor de cor da tela Configurações), com escopos ligeiramente diferentes
  (tema global vs. override por página) que provavelmente dá pra unificar.
- **Tabela:** nenhuma — o app não usa `<table>` em lugar nenhum (listas são sempre cards), então
  não há necessidade hoje de um componente de Tabela compartilhado.
- **Abas e Sidebar** já são bem resolvidos: `Tabs.tsx`/`ClientPanelTabs.tsx` e `AppShell.tsx`
  (sidebar única pros dois contextos, CRM e Painel do cliente) são cada um ponto único — sem
  duplicação.

## 5. Biblioteca de componentes — vale adotar?

Hoje: **nenhuma** (sem Radix, sem shadcn/ui, sem `class-variance-authority`, nem `clsx`/
`tailwind-merge` no `package.json` — classes são strings/template literals direto).

- **shadcn/ui (+ Radix por baixo):** prós — componentes acessíveis de graça (focus trap, aria,
  teclado), copiados pro repositório (não é dependência de pacote fechado, dá pra reestilizar
  livremente com os tokens do VEXO), curva de adoção baixa (copiar 1 componente por vez). Contras —
  o estilo "de fábrica" do shadcn é genérico/claro por padrão, exige reskinning pra bater com o
  visual escuro/compacto já definido no DESIGN.md; adiciona `class-variance-authority` +
  `tailwind-merge` como dependências novas; é mais peso que o necessário pros componentes simples
  que faltam aqui (Button/Badge/Card são triviais de fazer à mão).
- **Radix puro (sem shadcn), só pros primitivos que exigem acessibilidade de verdade** (Dialog,
  Select, Dropdown — o app hoje usa `<select>`/`<input type="file">` nativos e nenhum modal
  customizado complexo): prós — resolve só o que é difícil de acertar sozinho (foco, teclado,
  portal); contras — ainda é uma dependência nova, e hoje não há nenhum componente complexo o
  bastante (modal, combobox) que justifique isso.
- **Recomendação (não implementar ainda, só registrar):** não adotar uma biblioteca agora. Os
  componentes que faltam (Button, Card, Badge, Field) são simples o bastante pra construir à mão,
  direto com os tokens do VEXO, sem dependência nova — mais rápido e sem risco de visual genérico
  "de pacote". Vale reconsiderar Radix (não shadcn inteiro) SE o produto ganhar um modal/dropdown
  customizado complexo no futuro.

## 6. Proposta de tokens, componentes e plano de migração

### Tokens a centralizar (sem mudar nenhum valor visual)
- Promover a escala de espaçamento realmente usada (ex. `2 | 2.5 | 3 | 3.5 | 4 | 6 | 8`) pra uma
  lista curta documentada no `DESIGN.md`, sem remover o resto da escala padrão do Tailwind.
- Reduzir radius a 3 papéis nomeados (`rounded-card` pros blocos, `rounded-md` pros controles
  pequenos tipo chip/input compacto, `rounded-full` pros badges/avatares), mapeando os valores
  atuais sem trocar nenhum px.
- Decidir se `MobileCardScale.ts` vira parte formal do `tailwind.config.ts` (ex. um breakpoint
  `fontSize` por tamanho de tela) ou continua como está, mas documentado no `DESIGN.md` como a
  fonte oficial pro recorte mobile — qualquer uma das duas opções resolve o "duas fontes de
  verdade" do item 2.

### Componentes base a criar (visual IDÊNTICO ao de hoje — sem romper nenhuma tela)
`Button` (variants outline/filled, tamanhos existentes), `Card`, `Badge` (substituindo
gradualmente `StatusBadge`/`AppointmentStatusBadge`/`PanelCardBadge`), `MetricCard` (unificando
`StatCard`/`PanelMetricCard`), `Field` (label + input/textarea + texto de ajuda, o padrão que hoje
se repete inteiro em quase toda tela de formulário).

### Plano de migração, do menos ao mais arriscado
1. **Tokens de espaçamento/raio no `tailwind.config.ts` + `DESIGN.md`** — documentação e nomes
   novos, zero mudança visual (nenhum valor existente muda).
2. **Criar os componentes base acima, com a MESMA classe exata de hoje** — não são usados em
   nenhuma tela ainda; zero risco porque nada consome.
3. **Migrar UMA página piloto para os componentes novos: Automações**
   (`/crm/clinicas/[id]/automacoes`) — já é a tela mais testada/iterada visualmente nas últimas
   rodadas (PRs #185-189), tem exatamente os padrões (botão outline/filled, cards, abas) que os
   componentes novos cobrem, e seu uso real valida se o visual ficou de fato idêntico antes de
   tocar em mais alguma tela.
4. **Consolidar os badges e os cards de métrica** (`StatusBadge`+`AppointmentStatusBadge`+
   `PanelCardBadge` → `Badge`; `StatCard`+`PanelMetricCard` → `MetricCard`) começando pela própria
   página piloto, depois estendendo pro resto conforme cada tela for tocada por outro motivo —
   nunca uma rodada só pra trocar estética sem necessidade.
5. **Estender aos poucos** (Agente de IA, Follow-up, Pipeline, Painel) — uma tela por vez, sempre
   com typecheck/testes/build e checagem visual em 360/390/414/1366px antes do merge, igual ao
   padrão já usado nas últimas PRs.
6. **Travar a regra no fim, não no começo** — só depois que a maioria das telas já usar os tokens/
   componentes, adicionar uma checagem simples (grep em CI, ou regra de lint) que barra hex/classe
   de cor solta em `className` — travar cedo demais bloquearia o trabalho de migração em si.

A aba Automações deliberadamente é o ponto de partida recomendado em dois lugares — aqui e na
seção "Direção desejada" do `DESIGN.md` — pelos mesmos motivos: é a tela mais madura nesse
visual hoje.
