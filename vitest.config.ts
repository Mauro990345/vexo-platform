import { defineConfig } from "vitest/config";
import path from "path";

// Config mínima — só o suficiente pra rodar testes unitários de lógica
// pura (ex: conversation-context.test.ts), sem tocar em banco/rede. Mesmo
// alias "@/*" do tsconfig.json, pros testes poderem importar módulos reais
// do jeito que o resto do app importa.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // jsx: "automatic" (2026-10-29, 4ª rodada) — necessário só pro teste de
  // layout (RetornoButton.layout.test.ts), que renderiza um componente
  // real via react-dom/server; tsconfig.json usa jsx:"preserve" (Next.js
  // cuida da transformação em build), então o esbuild do vitest precisa
  // da sua própria config de JSX pra conseguir importar .tsx direto.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
  },
});
