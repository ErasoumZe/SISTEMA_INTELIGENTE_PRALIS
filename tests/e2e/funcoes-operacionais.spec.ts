import { expect, test, type Page } from "@playwright/test";
import { entrar, LARGURAS, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";

/**
 * Catalogo de FUNCOES OPERACIONAIS, visto do NAVEGADOR.
 *
 * O que so o navegador prova: que a tela existe no menu de Configuracao para quem pode, que criar e
 * renomear funcionam de ponta a ponta, que desativar e reativar sao um clique, que **nao ha botao
 * de excluir em lugar nenhum**, e que a Gerencia ve a lista sem poder mexer.
 *
 * Banco ISOLADO, dados sinteticos com prefixo proprio a cada execucao.
 */

const ROTA = "/funcoes_operacionais";

/** Nome unico por execucao: o catalogo tem unique por (empresa, nome), e a segunda rodada colidiria. */
function nomeSintetico(rotulo: string) {
  return `E2E ${rotulo} ${Date.now()}`;
}

async function abrirCatalogo(page: Page) {
  await page.goto(ROTA);
  await expect(page.getByRole("heading", { name: "Funções operacionais" })).toBeVisible();
}

/** A linha da tabela que contem este nome. */
function linhaDe(page: Page, nome: string) {
  return page.locator("tbody tr").filter({ hasText: nome }).first();
}

async function preencherDialogo(page: Page, nome: string, cbo?: string) {
  const dialogo = page.locator(".v-dialog.v-overlay--active");
  await dialogo.locator('[data-campo="nome"] input').fill(nome);
  if (cbo !== undefined) await dialogo.locator('[data-campo="cbo"] input').fill(cbo);
  await dialogo.getByRole("button", { name: "Salvar" }).click();
}

test.describe("o DP administra o catalogo", () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, USUARIOS.dp);
  });

  test("cria, renomeia, desativa e reativa — e nunca exclui", async ({ page }) => {
    const problemas = observarConsole(page);
    const nome = nomeSintetico("Padeiro");
    await abrirCatalogo(page);

    // --- criar, com CBO
    await page.getByRole("button", { name: "+ Nova função" }).click();
    await preencherDialogo(page, nome, "848505");
    await expect(linhaDe(page, nome)).toBeVisible();
    await expect(linhaDe(page, nome)).toContainText("848505");
    await expect(linhaDe(page, nome)).toContainText("Ativa");

    // --- renomear
    const renomeada = `${nome} II`;
    await linhaDe(page, nome).getByRole("button", { name: /^Editar/ }).click();
    await preencherDialogo(page, renomeada);
    await expect(linhaDe(page, renomeada)).toBeVisible();

    // --- desativar e reativar: um clique cada, e o rotulo do botao troca junto
    await linhaDe(page, renomeada).getByRole("button", { name: /^Desativar/ }).click();
    await expect(linhaDe(page, renomeada)).toContainText("Inativa");
    await linhaDe(page, renomeada).getByRole("button", { name: /^Reativar/ }).click();
    await expect(linhaDe(page, renomeada)).toContainText("Ativa");

    // --- e em lugar nenhum ha exclusao
    await expect(page.getByRole("button", { name: /Excluir|Apagar|Remover/ })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Excluir");
    expect(problemas).toEqual([]);
  });

  test("nome repetido e recusado, e o dialogo continua aberto com o que foi digitado", async ({ page }) => {
    const nome = nomeSintetico("Balconista");
    await abrirCatalogo(page);

    await page.getByRole("button", { name: "+ Nova função" }).click();
    await preencherDialogo(page, nome);
    await expect(linhaDe(page, nome)).toBeVisible();

    await page.getByRole("button", { name: "+ Nova função" }).click();
    await preencherDialogo(page, nome);

    const dialogo = page.locator(".v-dialog.v-overlay--active");
    await expect(dialogo).toContainText("Já existe uma função com este nome nesta empresa.");
    // O que foi digitado continua la: fechar faria a pessoa redigitar por causa de uma palavra.
    await expect(dialogo.locator('[data-campo="nome"] input')).toHaveValue(nome);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
  });

  test("CBO fora de seis digitos e barrado na tela, e vazio e aceito", async ({ page }) => {
    await abrirCatalogo(page);
    await page.getByRole("button", { name: "+ Nova função" }).click();

    const dialogo = page.locator(".v-dialog.v-overlay--active");
    await dialogo.locator('[data-campo="nome"] input').fill(nomeSintetico("Com CBO ruim"));
    await dialogo.locator('[data-campo="cbo"] input').fill("12345");
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect(dialogo).toContainText("O CBO tem 6 dígitos.");

    // Vazio nao prende ninguem: quem nao sabe o codigo cadastra do mesmo jeito.
    const semCbo = nomeSintetico("Sem CBO");
    await dialogo.locator('[data-campo="nome"] input').fill(semCbo);
    await dialogo.locator('[data-campo="cbo"] input').fill("");
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect(linhaDe(page, semCbo)).toBeVisible();
    await expect(linhaDe(page, semCbo)).toContainText("—");
  });

  test("a busca filtra a lista", async ({ page }) => {
    const nome = nomeSintetico("Faxineiro");
    await abrirCatalogo(page);
    await page.getByRole("button", { name: "+ Nova função" }).click();
    await preencherDialogo(page, nome);
    await expect(linhaDe(page, nome)).toBeVisible();

    await page.getByRole("textbox", { name: "Buscar por nome ou CBO" }).fill(nome);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(linhaDe(page, nome)).toBeVisible();

    await page.getByRole("textbox", { name: "Buscar por nome ou CBO" }).fill("zzz-nao-existe-zzz");
    await expect(page.locator("tbody tr")).toHaveCount(0);
    await expect(page.getByText("Nenhuma função encontrada para esta busca.")).toBeVisible();
  });

  test("a tela cabe em 1440, 1024, 768 e 390 sem rolagem horizontal", async ({ page }) => {
    const nome = nomeSintetico("Responsiva");
    await abrirCatalogo(page);
    await page.getByRole("button", { name: "+ Nova função" }).click();
    await preencherDialogo(page, nome, "999999");

    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura.largura, height: largura.altura });
      await page.goto(ROTA);
      await expect(page.getByRole("heading", { name: "Funções operacionais" })).toBeVisible();
      await page.getByRole("textbox", { name: "Buscar por nome ou CBO" }).fill(nome);
      const linha = linhaDe(page, nome);
      await expect(linha, largura.nome).toBeVisible();
      await semRolagemHorizontal(page);

      // As acoes continuam alcancaveis, com alvo de toque (`67` §13.4).
      const editar = linha.getByRole("button", { name: /^Editar/ });
      await editar.scrollIntoViewIfNeeded();
      const caixa = await editar.boundingBox();
      expect(caixa, `${largura.nome}: botao sem caixa`).not.toBeNull();
      expect(caixa?.height ?? 0, `${largura.nome}: alvo de toque`).toBeGreaterThanOrEqual(
        largura.largura <= 768 ? 44 : 40
      );
      expect((caixa?.x ?? 0) + (caixa?.width ?? 0), `${largura.nome}: fora da tela`).toBeLessThanOrEqual(
        largura.largura
      );
    }
  });
});

test.describe("quem nao administra", () => {
  test("a Gerencia ve o catalogo e nao mexe nele", async ({ page }) => {
    await entrar(page, USUARIOS.gerencia);
    await abrirCatalogo(page);

    // Ve a lista — o catalogo nao e segredo.
    await expect(page.locator("tbody tr").first()).toBeVisible();

    // E nao tem por onde mexer: nem criar, nem editar, nem desativar.
    await expect(page.getByRole("button", { name: "+ Nova função" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Editar/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Desativar|^Reativar/ })).toHaveCount(0);
  });

  test("quem so opera caixa nao entra na tela", async ({ page }) => {
    await entrar(page, USUARIOS.semProdutos);
    await page.goto(ROTA);
    await expect(page.getByText("Sem permissão para acessar esta página.")).toBeVisible();
  });

  test("sem sessao a tela manda para o login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(ROTA);
    await page.waitForURL("**/login", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });
});
