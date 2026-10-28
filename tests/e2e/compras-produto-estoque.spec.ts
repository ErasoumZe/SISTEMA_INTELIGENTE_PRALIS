import { expect, test } from "@playwright/test";
import { entrar, observarConsole, USUARIOS } from "./apoio.js";
import {
  abrirContextoCompras,
  codigoDeTeste,
  criarProdutoPelaBase,
  escolherNoFiltro,
  irParaTela
} from "./apoio-compras.js";

test.setTimeout(180_000);

/**
 * Oficial (R-222): o produto nasce na BASE pelo administrador e a loja recebe a copia, completada
 * com o que e dela (estoque, locais, curva). O comprador CONFERE o cadastro e usa os filtros.
 */
test("produto de Compras persiste parametros e aparece nos cinco filtros de estoque", async ({ page }) => {
  const problemas = observarConsole(page);
  const sufixo = codigoDeTeste();
  const nome = `Leite integral 1 L (teste ${sufixo})`;
  const area = `Area E2E ${sufixo}`;
  // Setor de estoque e locais de venda sao gravados em MAIUSCULAS (regra do app oficial).
  const localVenda1 = `BALCAO E2E ${sufixo}`;
  const localVenda2 = `VITRINE E2E ${sufixo}`;
  const localEstoque = `DEPOSITO E2E ${sufixo}`;

  const compras = await abrirContextoCompras();
  await compras.api.dispose();
  await criarProdutoPelaBase(
    { descricao: nome, grupoNome: "Farinhas" },
    {
      estoqueMin: 10,
      estoqueMax: 40,
      areaEstoque: area,
      setorEstoque: localEstoque,
      curvaAbc: "B",
      localVenda1,
      localVenda2
    },
    compras.empresaId
  );

  await entrar(page, USUARIOS.compras);
  await irParaTela(page, "/produtos", "Produtos");
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
