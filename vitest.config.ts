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
