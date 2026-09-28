import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";

// Os testes de componentes ficam no mesmo projeto dos testes puros. Eles precisam
// do mesmo runtime do web-vue: aliases do Nuxt, SFC do Vue e um DOM leve.
process.env["TZ"] = "America/Sao_Paulo";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [vue()],
  resolve: {
    // @ e ~ sao aliases de arquivo do Nuxt, mas @padaria/* e pacote de
    // workspace. A forma anterior com chave "@" capturava tambem subpaths
    // de pacote e transformava o import em caminho inexistente do front.
    alias: [
      { find: /^~\//u, replacement: fileURLToPath(new URL("./web-vue/", import.meta.url)) },
      { find: /^@\//u, replacement: fileURLToPath(new URL("./web-vue/", import.meta.url)) }
    ]
  },
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
          environment: "happy-dom",
          // Testes puros (regras, dinheiro, etc.) — sem banco/Testcontainers.
          include: ["./tests/unit/**/*.test.ts", "./web-vue/**/*.test.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
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
