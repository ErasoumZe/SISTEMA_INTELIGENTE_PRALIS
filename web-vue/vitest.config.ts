import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Harness de teste do web-vue. Resolve os aliases do Nuxt (~ e @) e o shared pela RAIZ
// (mesma regra do nuxt.config: front so importa @padaria/shared pela raiz). happy-dom da
// um DOM leve para testes de componente futuros; utils puros nem precisam dele.
export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".nuxt/**", ".output/**"]
  },
  resolve: {
    alias: {
      "@padaria/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
      "~": fileURLToPath(new URL(".", import.meta.url)),
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  }
});
