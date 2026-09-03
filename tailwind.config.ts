import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Cinza-escuro AZULADO (slate), não preto neutro — a referência é
        // explícita sobre isso: fundo com leve matiz azul, não um preto puro.
        vexo: {
          bg: "#0b0f17",
          surface: "#141a24",
          surface2: "#1b222e",
          border: "#232c3a",
          borderStrong: "#33404f",
          muted: "#8b96a8",
          fg: "#f1f4f8",
          accent: "#3b82f6",
          accentFg: "#ffffff",
          // Azul petróleo — só pro fundo dos cards de agendamento na Agenda,
          // pra diferenciar visualmente do resto da UI (que usa surface/
          // surface2 neutros). Precisa ser visivelmente azul e mais claro
          // que o resto da paleta (que é toda cinza-escuro) — não pode ficar
          // perto demais de vexo-surface2/border em luminosidade, senão o
          // card se mistura com o fundo em vez de se destacar (era o
          // problema da tentativa anterior, #1c3a4a — muito escuro/dessaturado).
          petrol: "#2c5a86",
          petrolBorder: "#3d76ab",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
