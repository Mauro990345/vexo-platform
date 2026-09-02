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
