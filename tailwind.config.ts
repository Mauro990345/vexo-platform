import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        vexo: {
          bg: "#0b0b0c",
          surface: "#141416",
          border: "#26262a",
          muted: "#8a8a92",
          fg: "#f4f4f5",
          accent: "#5b5bff",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
