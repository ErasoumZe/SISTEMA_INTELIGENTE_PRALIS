import { expect, test } from "@playwright/test";
import { entrar, escolherNoSelect, escolherPrimeiraOpcao, observarConsole, USUARIOS } from "./apoio.js";
import { escolherNoFiltro, irParaTela } from "./apoio-compras.js";

test.setTimeout(180_000);

test("produto de Compras persiste parametros e aparece nos cinco filtros de estoque", async ({ page }) => {
  const problemas = observarConsole(page);
  const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const nome = `E2E Estoque ${sufixo}`;
  const area = `Area E2E ${sufixo}`;
  const localVenda1 = `Balcao E2E ${sufixo}`;
  const localVenda2 = `Vitrine E2E ${sufixo}`;
  const localEstoque = `Deposito E2E ${sufixo}`;

  await entrar(page, USUARIOS.compras);
  await irParaTela(page, "/produtos/novo", "Novo produto");
  await page.locator('[data-campo="descricao"] input').fill(nome);
  await page.locator('[data-campo="quantidadeIndividual"] input').fill("1");
  await escolherPrimeiraOpcao(page, '[data-campo="unidadeIndividualId"]');
  await escolherNoSelect(page, "Grupo de mercadoria", "Farinhas");
  await page.getByLabel("Estoque mínimo").fill("10");
  await page.getByLabel("Estoque máximo").fill("40");
  await page.getByLabel("Área", { exact: true }).fill(area);
  await page.getByLabel("Local de estoque", { exact: true }).fill(localEstoque);
  await page.getByLabel("Local de estoque", { exact: true }).press("Enter");
  await escolherNoSelect(page, "Curva ABC", "B");
  await page.getByLabel("Local de venda 1").fill(localVenda1);
  await page.getByLabel("Local de venda 2").fill(localVenda2);
  await page.getByRole("button", { name: "Salvar produto" }).click();

  await page.waitForURL("**/produtos");
  await page.getByPlaceholder(/Buscar por nome/).fill(nome);
  const cartao = page.locator(".produto-card").filter({ hasText: nome });
  await expect(cartao).toBeVisible();
  await cartao.getByRole("link", { name: "Ver" }).click();
  await expect(page.getByLabel("Estoque mínimo")).toHaveValue("10.000");
  await expect(page.getByLabel("Estoque máximo")).toHaveValue("40.000");
  await expect(page.getByLabel("Área", { exact: true })).toHaveValue(area);
  await expect(page.getByLabel("Local de estoque", { exact: true })).toHaveValue(localEstoque);
  await expect(page.getByLabel("Curva ABC")).toHaveValue("B");
  await expect(page.getByLabel("Local de venda 1")).toHaveValue(localVenda1);
  await expect(page.getByLabel("Local de venda 2")).toHaveValue(localVenda2);
  await expect(page.getByLabel("Estoque atual")).toHaveValue("0.000");

  await irParaTela(page, "/estoque_produtos", "Estoque");
  await page.getByRole("textbox", { name: "Buscar produto ou grupo" }).fill(nome);
  const linha = page.locator("tbody tr").filter({ hasText: nome });
  await expect(linha).toContainText(area);
  await expect(linha).toContainText(localEstoque);
  await expect(linha).toContainText(localVenda1);
  await expect(linha).toContainText(/10(?:\.000)?\s*\/\s*40(?:\.000)?/);

  await escolherNoFiltro(page, "Grupo", "Farinhas");
  await escolherNoFiltro(page, "Área", area);
  await escolherNoFiltro(page, "Local de venda", localVenda1);
  await escolherNoFiltro(page, "Local de estoque", localEstoque);
  await escolherNoFiltro(page, "Curva ABC", "B");
  await expect(linha).toBeVisible();
  expect(problemas).toEqual([]);
});
