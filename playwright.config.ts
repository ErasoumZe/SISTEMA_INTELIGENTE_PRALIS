import { defineConfig, devices } from "@playwright/test";

/**
 * E2E do Cadastro de Produtos (P-04).
 *
 * Roda contra a stack de DESENVOLVIMENTO ja de pe (`npm run dev`), nao contra producao. Os testes
 * criam os proprios dados com prefixo proprio e nao dependem de estado anterior — o banco de dev e
 * descartavel, mas um teste que depende do que sobrou do anterior mente na primeira corrida limpa.
 *
 * Por que E2E alem dos 736 testes de integracao: a integracao prova que a API responde; ela nao
 * prova que o NAVEGADOR mostra. A foto do produto e o caso exemplar — o endpoint respondia 200 e a
 * imagem era bloqueada por `Cross-Origin-Resource-Policy`. So o navegador pega isso.
 */
const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://localhost:5174";

export default defineConfig({
  testDir: "./tests/e2e",
  // Sequencial: os testes compartilham o mesmo banco de dev e a mesma sessao gravada.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  },
  projects: [
    {
      name: "produtos",
      testMatch: /produtos-.*\.spec\.ts/u,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        // O scanner pede camera. Sem isto o dialogo cai na mensagem de permissao negada e o teste
        // de "abre o leitor" viraria teste de mensagem de erro.
        permissions: ["camera"],
        launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }
      }
    },
    {
      // ADM-003 V5: a revisao da ficha pelo DP. Sem camera, sem permissao extra — e so navegador.
      // Roda contra um banco ISOLADO com dados sinteticos (E2E_BASE_URL / E2E_API_URL), nunca em
      // producao: os testes criam processo, convite e ficha por API a cada rodada.
      name: "admissoes",
      // Duas familias no mesmo projeto: a admissao e o catalogo que ela consome. Sao a mesma stack,
      // o mesmo banco isolado e o mesmo navegador — separar em dois projetos so dobraria o setup.
      testMatch: /(admissoes|funcoes)-.*\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }
    },
    {
      // Preserva os E2E que ja existiam na main; o filtro de admissoes nao pode silencia-los.
      name: "sistema",
      testMatch: /(?:app-sidebar|caixa-.*|usuarios-acessos)\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }
    }
  ]
});
