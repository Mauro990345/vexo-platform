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
          // Azul petróleo — só pro fundo dos cards de agendamento na Agenda.
          // #081B2A veio direto do usuário (cor exata pedida); petrolBorder
          // é um tom mais claro derivado dela só pra dar contorno visível
          // ao card, já que a cor pedida é bem próxima da luminosidade do
          // resto da paleta escura.
          petrol: "#081B2A",
          petrolBorder: "#1c3e56",
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
