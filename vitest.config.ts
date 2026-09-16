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
  test: {
    environment: "node",
  },
});
