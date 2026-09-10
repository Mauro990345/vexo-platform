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
      },
      // Raio de canto nomeado por uso — os cards de agendamento na Agenda
      // usavam rounded-md (6px) direto; vira um token com o mesmo valor.
      borderRadius: {
        card: "0.375rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
