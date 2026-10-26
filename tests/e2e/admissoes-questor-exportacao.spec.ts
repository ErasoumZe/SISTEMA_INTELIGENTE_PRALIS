import { expect, test, type Page } from "@playwright/test";
import { entrar, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";

/**
 * Exportações Questor e Configuração Questor no navegador real: fluxo do DP (prévia do CSV, TXT
 * técnico, histórico com novo download) e as larguras do Definition of Done sem rolagem horizontal.
 *
 * Roda contra um banco ISOLADO com dados fictícios: função, turno, uma admissão aprovada, três
 * vínculos (dois com contrato Questor) e lançamentos da competência 10/2026. Quando o Nuxt de
 * desenvolvimento aponta para outra API, `E2E_API_REDIRECIONAR` desvia as chamadas do navegador para
 * a API isolada — o dev e o banco de dev não recebem nada.
 */
const LARGURAS = [
  { nome: "1440", largura: 1440, altura: 900 },
  { nome: "1024", largura: 1024, altura: 768 },
  { nome: "768", largura: 768, altura: 1024 },
  { nome: "390", largura: 390, altura: 844 }
] as const;
const CAPTURAS = process.env["E2E_CAPTURAS"];

async function desviarApi(page: Page) {
  const destino = process.env["E2E_API_REDIRECIONAR"];
  if (!destino) return;
  await page.route("http://localhost:4100/**", (rota) =>
    rota.continue({ url: rota.request().url().replace("http://localhost:4100", destino) })
  );
}

/**
 * A página pode não rolar na horizontal e mesmo assim cortar conteúdo (card mais largo que a tela com
 * overflow escondido). Botões visíveis precisam caber inteiros na janela.
 */
async function semConteudoCortado(page: Page, nome: string) {
  const cortados = await page.evaluate(() => {
    // Mede contra a área de conteúdo da página. A casca do app tem rolagem própria, então só valem como
    // "rolagem legítima" os contêineres DENTRO do conteúdo (tabela, arquivo em <pre>).
    const raiz = document.querySelector("main.questor-exportacao, main.questor-page");
    if (!raiz) return ["área de conteúdo não encontrada"];
    const limite = raiz.getBoundingClientRect().right;
    const fora: string[] = [];
    for (const el of raiz.querySelectorAll("*")) {
      const caixa = el.getBoundingClientRect();
      if (caixa.width === 0 || caixa.right <= limite + 1) continue;
      // Barra de progresso (inclusive o loader oculto de cada campo do Vuetify): a faixa animada passa
      // da borda e é cortada pela própria barra, por desenho. Não é conteúdo.
      if (el.closest(".v-progress-linear")) continue;
      let rolagemPropria = false;
      for (let pai = el.parentElement; pai && pai !== raiz; pai = pai.parentElement) {
        if (/(auto|scroll)/u.test(getComputedStyle(pai).overflowX)) {
          rolagemPropria = true;
          break;
        }
      }
      if (!rolagemPropria) fora.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")}`);
    }
    return fora.slice(0, 10);
  });
  expect(cortados, `conteúdo além da tela em ${nome}px`).toEqual([]);
}

async function capturar(page: Page, nome: string) {
  if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/${nome}.png`, fullPage: true });
}

test.describe("exportações Questor", () => {
  test.setTimeout(300_000);

  test("DP confere o CSV, baixa o TXT técnico e o histórico permite baixar de novo", async ({ page }) => {
    const problemas = observarConsole(page);
    await desviarApi(page);
    await entrar(page, USUARIOS.dp);
    await page.goto("/conplus/exportar");
    await expect(page.getByRole("heading", { name: "Exportações Questor", exact: true })).toBeVisible();

    // Eventos: competência 10/2026 já tem três lançamentos selecionados por padrão. Layout oficial da
    // Conplus (EventoVariavel.nli): uma linha por evento, 13 colunas.
    await page.getByLabel("Competência").fill("2026-10");
    await expect(page.getByRole("cell", { name: "Bruno Ficticio", exact: true })).toBeVisible();
    await page.getByLabel("Período de cálculo no Questor").fill("2610");
    await page.getByLabel("Sequência inicial").fill("99");
    await page.getByRole("button", { name: "Conferir arquivo" }).click();
    const arquivo = page.locator("pre.arquivo__conteudo");
    await expect(arquivo).toContainText("E;510;2610;99;45;35;2,00;0,00;;;;;0;");
    await expect(arquivo).toContainText("E;510;2610;100;120;708;0,00;150,50;;;;;0;");
    await expect(
      page.getByText("Arquivo oficial bloqueado até a homologação da Conplus.", { exact: false })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Oficial bloqueado (homologação)", exact: true })).toBeDisabled();
    // Técnico: só baixa depois da confirmação explícita no diálogo (o servidor também exige).
    await expect(page.getByText("Oficial bloqueado", { exact: true })).toBeVisible();
    await page.locator(".arquivo").getByRole("button", { name: "Técnico — não importar" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByRole("button", { name: "Baixar arquivo técnico" })).toBeDisabled();
    await dialogo.getByLabel("Entendi: este arquivo NÃO será importado no Questor").check();
    const tecnico = page.waitForEvent("download");
    await dialogo.getByRole("button", { name: "Baixar arquivo técnico" }).click();
    expect((await tecnico).suggestedFilename()).toMatch(/^TECNICO-NAO-IMPORTAR-Eventos 510 - 10-2026\.csv$/u);

    // TXT técnico da admissão aprovada.
    await page.getByLabel("Joana Ficticia Admissao").check();
    await page.locator(".acoes").getByRole("button", { name: "Técnico — não importar" }).click();
    await page.getByRole("dialog").getByLabel("Entendi: este arquivo NÃO será importado no Questor").check();
    const download = page.waitForEvent("download");
    await page.getByRole("dialog").getByRole("button", { name: "Baixar arquivo técnico" }).click();
    expect((await download).suggestedFilename()).toMatch(/^TECNICO-NAO-IMPORTAR-admissao-questor-[0-9a-f]{12}\.txt$/u);
    await expect(
      page.getByText(/admissao-questor-[0-9a-f]{12}\.txt( gerado e registrado no histórico|: mesmo conteúdo)/u)
    ).toBeVisible();

    // Histórico: o técnico aparece e só baixa de novo depois da mesma confirmação da geração.
    const item = page.locator(".historico__item").filter({ hasText: "Técnico (não importar)" }).first();
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Baixar técnico", exact: true }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao.getByRole("button", { name: "Baixar arquivo técnico" })).toBeDisabled();
    await confirmacao.getByLabel("Entendi: este arquivo NÃO será importado no Questor").check();
    const deNovo = page.waitForEvent("download");
    await confirmacao.getByRole("button", { name: "Baixar arquivo técnico" }).click();
    expect((await deNovo).suggestedFilename()).toContain("TECNICO-NAO-IMPORTAR-");

    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  test("Exportações e Configuração Questor sem rolagem horizontal em 1440/1024/768/390", async ({ page }) => {
    const problemas = observarConsole(page);
    await desviarApi(page);
    await entrar(page, USUARIOS.dp);
    for (const { nome, largura, altura } of LARGURAS) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto("/conplus/exportar");
      await expect(page.getByRole("heading", { name: "Exportações Questor", exact: true }), nome).toBeVisible();
      await page.getByLabel("Competência").fill("2026-10");
      await expect(page.getByRole("cell", { name: "Ana Ficticia", exact: true }).first()).toBeVisible();
      await page.getByLabel("Período de cálculo no Questor").fill("2610");
      await page.getByLabel("Sequência inicial").fill("99");
      await page.getByRole("button", { name: "Conferir arquivo" }).click();
      await expect(page.locator("pre.arquivo__conteudo")).toBeVisible();
      await semRolagemHorizontal(page);
      await semConteudoCortado(page, nome);
      await capturar(page, `exportar-${nome}`);

      await page.goto("/questor");
      await expect(page.getByRole("heading", { name: "Contratos no Questor" }), nome).toBeVisible();
      await expect(page.getByText("1 sem código")).toBeVisible();
      await semRolagemHorizontal(page);
      await semConteudoCortado(page, nome);
      await capturar(page, `questor-${nome}`);
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
