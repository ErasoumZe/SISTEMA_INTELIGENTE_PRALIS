import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.nuxt/**", "**/.output/**"],
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          // Testes puros (regras, dinheiro, etc.) — sem banco/Testcontainers.
          include: ["./tests/unit/**/*.test.ts"]
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
          // Threads evitam duplicar processos Node durante o setup do Testcontainers. Em Windows,
          // o pool de forks excede a memória disponível e deixa a suíte sem iniciar os testes.
          // Um Ãºnico processo filho evita a violaÃ§Ã£o de acesso observada no encerramento do pool
          // de threads no Windows e limita o pico de memÃ³ria do Testcontainers.
          pool: "forks",
          maxWorkers: 1
        }
      }
    ]
  }
});
