import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Cinza-escuro AZULADO (slate), não preto neutro — a referência é
        // explícita sobre isso: fundo com leve matiz azul, não um preto puro.
        //
        // Cada cor referencia uma variável CSS definida em src/app/globals.css
        // (fonte única — trocar uma cor do sistema é mexer só lá). O formato
        // rgb(var(--x) / <alpha-value>) é o que permite continuar usando
        // opacidade normalmente (ex: bg-vexo-accent/10, border-vexo-success/30).
        vexo: {
          bg: "rgb(var(--vexo-bg) / <alpha-value>)",
          surface: "rgb(var(--vexo-surface) / <alpha-value>)",
          surface2: "rgb(var(--vexo-surface2) / <alpha-value>)",
          border: "rgb(var(--vexo-border) / <alpha-value>)",
          borderStrong: "rgb(var(--vexo-border-strong) / <alpha-value>)",
          muted: "rgb(var(--vexo-muted) / <alpha-value>)",
          fg: "rgb(var(--vexo-fg) / <alpha-value>)",
          tabFg: "rgb(var(--vexo-tab-fg) / <alpha-value>)",
          // Cor do ícone de cada aba, fixa por posição — ver Tabs.tsx e o
          // comentário grande em globals.css.
          tabIcon1: "rgb(var(--tab-icon-1) / <alpha-value>)",
          reportCaption: "rgb(var(--vexo-report-caption) / <alpha-value>)",
          reportDeltaUp: "rgb(var(--vexo-report-delta-up) / <alpha-value>)",
          reportDeltaDown: "rgb(var(--vexo-report-delta-down) / <alpha-value>)",
          // Página pública (ver DESIGN.md, "Página pública").
          pubBg: "rgb(var(--pub-bg) / <alpha-value>)",
          pubFg: "rgb(var(--pub-fg) / <alpha-value>)",
          pubFg2: "rgb(var(--pub-fg-2) / <alpha-value>)",
          pubMuted: "rgb(var(--pub-muted) / <alpha-value>)",
          pubAccent: "rgb(var(--pub-accent) / <alpha-value>)",
          pubBrand: "rgb(var(--pub-brand) / <alpha-value>)",
          pubButton: "rgb(var(--pub-button) / <alpha-value>)",
          pubGreen: "rgb(var(--pub-green) / <alpha-value>)",
          pubEdge: "rgb(var(--pub-edge) / <alpha-value>)",
          pubHeader: "rgb(var(--pub-header-bg) / <alpha-value>)",
          reportColA: "rgb(var(--vexo-report-col-a) / <alpha-value>)",
          reportColAMuted: "rgb(var(--vexo-report-col-a-muted) / <alpha-value>)",
          reportColB: "rgb(var(--vexo-report-col-b) / <alpha-value>)",
          reportColBMuted: "rgb(var(--vexo-report-col-b-muted) / <alpha-value>)",
          // Linhas de grade (8%) e linha de base (16%, um pouco mais clara).
          reportGrid: "rgb(var(--vexo-report-edge) / 0.08)",
          reportBaseline: "rgb(var(--vexo-report-edge) / 0.16)",
          reportInset: "rgb(var(--vexo-report-inset) / <alpha-value>)",
          // Bordas/separadores finos do Relatório: branco a 7%, opacidade fixa.
          reportLine: "rgb(var(--vexo-report-edge) / 0.07)",
          tabIcon2: "rgb(var(--tab-icon-2) / <alpha-value>)",
          tabIcon3: "rgb(var(--tab-icon-3) / <alpha-value>)",
          tabIcon4: "rgb(var(--tab-icon-4) / <alpha-value>)",
          accent: "rgb(var(--vexo-accent) / <alpha-value>)",
          accentFg: "rgb(var(--vexo-accent-fg) / <alpha-value>)",
          petrol: "rgb(var(--vexo-petrol) / <alpha-value>)",
          petrolBorder: "rgb(var(--vexo-petrol-border) / <alpha-value>)",
          // Semânticas de status/badge — ver comentário em globals.css.
          success: "rgb(var(--vexo-success) / <alpha-value>)",
          error: "rgb(var(--vexo-error) / <alpha-value>)",
          warning: "rgb(var(--vexo-warning) / <alpha-value>)",
          // Tokens por página (ver src/lib/page-style-overrides.ts) — cada
          // variável, por padrão, referencia (via var() aninhado) a cor
          // global equivalente; só passa a ter valor próprio quando
          // personalizada na tela de Configurações.
          pipelineHeaderFont: "rgb(var(--vexo-pipeline-header-font) / <alpha-value>)",
          // Fundo do card de lead nas 2 colunas sem tom próprio (Precisa de
          // humano / Perdido) — as outras 4 usam os pares col*Bg/col*Pill
          // logo abaixo, um por coluna (ver page-style-overrides.ts).
          pipelineColOtherBg: "rgb(var(--vexo-pipeline-col-other-bg) / <alpha-value>)",
          pipelineColNewBg: "rgb(var(--vexo-pipeline-col-new-bg) / <alpha-value>)",
          pipelineColNewPill: "rgb(var(--vexo-pipeline-col-new-pill) / <alpha-value>)",
          pipelineColConversationBg: "rgb(var(--vexo-pipeline-col-conversation-bg) / <alpha-value>)",
          pipelineColConversationPill: "rgb(var(--vexo-pipeline-col-conversation-pill) / <alpha-value>)",
          pipelineColScheduledBg: "rgb(var(--vexo-pipeline-col-scheduled-bg) / <alpha-value>)",
          pipelineColScheduledPill: "rgb(var(--vexo-pipeline-col-scheduled-pill) / <alpha-value>)",
          pipelineColFollowupBg: "rgb(var(--vexo-pipeline-col-followup-bg) / <alpha-value>)",
          pipelineColFollowupPill: "rgb(var(--vexo-pipeline-col-followup-pill) / <alpha-value>)",
          // Destaque do Painel do cliente — só no valor de "Agendaram"
          // (ver PanelMetricCard). Ver page-style-overrides.ts.
          panelHighlight: "rgb(var(--vexo-painel-highlight) / <alpha-value>)",
          // Fundo tingido dos badges de status na lista de Agendamentos do
          // Painel (ver statusTint em AppointmentStatusBadge.tsx e
          // NoShowButton.tsx) — mesmo padrão do Pipeline: tom já escuro/
          // dessaturado, aplicado a baixa opacidade (ver uso com /45).
          panelStatusScheduledBg: "rgb(var(--vexo-painel-status-scheduled-bg) / <alpha-value>)",
          panelStatusCompletedBg: "rgb(var(--vexo-painel-status-completed-bg) / <alpha-value>)",
          panelStatusNegativeBg: "rgb(var(--vexo-painel-status-negative-bg) / <alpha-value>)",
          // Token fixo e independente do badge "Compareceu" acima — usado só
          // pelo botão WhatsApp da Reativação, ver globals.css.
          whatsappActionBorder: "rgb(var(--vexo-whatsapp-action-border) / <alpha-value>)",
          // Cor por tipo de card na lista "Para fazer hoje" do Painel — ver
          // comentário grande em globals.css.
          cardTypeReativacao: "rgb(var(--vexo-card-type-reativacao) / <alpha-value>)",
          cardTypeReativacaoText: "rgb(var(--vexo-card-type-reativacao-text) / <alpha-value>)",
          cardTypeFollowup: "rgb(var(--vexo-card-type-followup) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      // Tamanhos de fonte fora da escala padrão do Tailwind, nomeados por
      // onde são usados (em vez de text-[11px] solto nos componentes).
      fontSize: {
        "sidebar-group": "9px",
        "sidebar-item": "13px",
        card: "11px",
        caption: "10px",
        // Página pública: título do hero (38px celular / 68px desktop) e
        // títulos de seção (28px / 40px), com o letter-spacing pedido.
        "pub-hero": ["2.375rem", { lineHeight: "1.06", letterSpacing: "-0.038em", fontWeight: "600" }],
        "pub-hero-lg": ["4.25rem", { lineHeight: "1.02", letterSpacing: "-0.038em", fontWeight: "600" }],
        "pub-h2": ["1.75rem", { lineHeight: "1.12", letterSpacing: "-0.03em", fontWeight: "600" }],
        "pub-h2-lg": ["2.5rem", { lineHeight: "1.08", letterSpacing: "-0.034em", fontWeight: "600" }],
        // Relatório (ver DESIGN.md): número dos boxes e frase de abertura.
        "report-value": ["1.5rem", { lineHeight: "1" }], // 24px
        "report-value-lg": ["1.625rem", { lineHeight: "1" }], // 26px (a partir de sm)
        "report-lead": ["1.125rem", { lineHeight: "1.4" }], // 18px
      },
      // Raio de canto nomeado por uso — os cards de agendamento na Agenda
      // usavam rounded-md (6px) direto; vira um token com o mesmo valor.
      // "card" aqui é só do Pipeline (ver clinicas/[id]/page.tsx) — nome
      // antigo, mantido como está pra não mexer em outra página (pedido
      // explícito desta rodada). "control"/"block" são os 2 papéis novos
      // (ver DESIGN.md), com os MESMOS valores de rounded-lg/rounded-xl já
      // usados hoje — nenhum componente existente muda de aparência; são
      // só os nomes que os componentes base da Etapa 2 vão consumir.
      borderRadius: {
        card: "0.375rem",
        control: "0.5rem", // = rounded-lg (botões, campos, chips pequenos)
        block: "0.75rem", // = rounded-xl (cards/blocos de conteúdo)
        report: "0.875rem", // 14px = block + 2px, só nos painéis do Relatório
        // Página pública: blocos bem arredondados (32–44px).
        "pub-sm": "2rem", // 32px
        pub: "2.25rem", // 36px
        "pub-lg": "2.75rem", // 44px
      },
      // Espaçamento nomeado pros componentes base da Etapa 2 — mesmos
      // valores dos paddings mais usados hoje em botões/campos (px-2.5/
      // py-1.5) e em blocos/cards (p-3.5), só documentados com nome em vez
      // de reaproveitados "de olho" tela por tela (ver auditoria,
      // docs/design-audit.md). Aditivo: a escala numérica padrão do
      // Tailwind continua disponível, nada existente muda.
      spacing: {
        "control-x": "0.625rem", // 10px = px-2.5
        "control-y": "0.375rem", // 6px = py-1.5
        block: "0.875rem", // 14px = p-3.5
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.4)",
      },
      // Animação de entrada do gráfico "Abordagens por dia" (ver
      // ApproachChart) — cresce da esquerda pra direita ao montar, em vez
      // de aparecer com a largura final já pronta. scaleX (não width) de
      // propósito: funciona pra qualquer largura final sem precisar saber
      // o valor-alvo em CSS estático, só a barra precisa de
      // transform-origin: left (ver className no componente).
      keyframes: {
        "bar-grow": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
      },
      animation: {
        "bar-grow": "bar-grow 700ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
