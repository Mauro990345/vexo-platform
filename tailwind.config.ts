import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        vexo: {
          bg: "#0a0a0c",
          surface: "#131316",
          surface2: "#1a1a1f",
          border: "#232327",
          borderStrong: "#333338",
          muted: "#94949e",
          fg: "#f5f5f7",
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
