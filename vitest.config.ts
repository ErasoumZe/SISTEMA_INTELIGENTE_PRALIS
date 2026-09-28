import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    // Componentes Vuetify importam CSS ao serem executados. Se o pacote fica externo ao Vite,
    // o Node tenta carregar `.css` diretamente e nenhuma suíte de interface chega a iniciar.
    server: { deps: { inline: ["vuetify"] } },
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.nuxt/**", "**/.output/**"],
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          // Testes puros (regras, dinheiro, etc.) — sem banco/Testcontainers.
          include: ["./tests/unit/**/*.test.ts", "./web-vue/**/*.test.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["./tests/integration/**/*.test.ts"],
          globalSetup: ["./tests/setup/testcontainers.ts"],
          setupFiles: ["./tests/setup/ambiente.ts"],
          testTimeout: 60_000,
          hookTimeout: 180_000,
          fileParallelism: false,
          pool: "forks"
        }
      }
    ]
  }
});
