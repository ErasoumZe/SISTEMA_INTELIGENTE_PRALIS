import { expect, test } from "@playwright/test";
import { entrar, LARGURAS, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import { abrirContextoCompras, irParaTela } from "./apoio-compras.js";

// Doc 57 §1/§4: catalogo, historico e preco-base sairam da tela de Pedidos para o modulo "Cadastro de compras".
// Pedidos ficou com o Pedido rapido e a matriz; nenhum caminho antigo de compra sobrou.
test("Cadastro de compras tem catalogo, historico e preco-base; Pedidos ficou so com o Pedido rapido e a matriz", async ({
  page
}) => {
  const contexto = await abrirContextoCompras(USUARIOS.admin);
  try {
    const [catalogo, importacoes, precos] = await Promise.all([
      contexto.api.get(`/api/compras/catalogo-fornecedores?empresaId=${contexto.empresaId}`),
      contexto.api.get(`/api/compras/precos-base/importacoes?empresaId=${contexto.empresaId}`),
      contexto.api.get(`/api/compras/precos-base?empresaId=${contexto.empresaId}`)
    ]);
    expect(catalogo.status(), await catalogo.text()).toBe(200);
    expect(importacoes.status(), await importacoes.text()).toBe(200);
    expect(precos.status(), await precos.text()).toBe(200);

    await entrar(page, USUARIOS.admin);
    await irParaTela(page, "/pedidos", "Pedidos");
    await expect(page.getByRole("button", { name: "Pedido rápido" })).toBeVisible();
    await expect(page.locator('[data-secao="matriz-pedidos"]')).toBeVisible();
    // Regra-mae: nada de catalogo, abas de solicitacao, fila antiga nem pedido manual nesta tela.
    await expect(page.getByRole("tab", { name: "Catálogo fornecedor–produto" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Solicitações" })).toHaveCount(0);
    await expect(page.getByText("Fila de pedidos", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Novo pedido manual" })).toHaveCount(0);

    await irParaTela(page, "/cadastro_compras", "Cadastro de compras");
    await expect(page.getByRole("tab", { name: "Catálogo fornecedor–produto" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Histórico de compras" })).toBeVisible();
    // Conteudo de cada aba, e nao so o rotulo.
    await expect(page.getByRole("button", { name: "Vincular produto" })).toBeVisible();
    await page.getByRole("tab", { name: "Preço-base" }).click();
    await expect(page.getByRole("button", { name: "Analisar .xlsx" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Preços-base atuais" })).toBeVisible();
    for (const { largura, altura } of LARGURAS) {
      await page.setViewportSize({ width: largura, height: altura });
      await semRolagemHorizontal(page);
    }
  } finally {
    await contexto.api.dispose();
  }
});
