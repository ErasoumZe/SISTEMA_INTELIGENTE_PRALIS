import { expect, test } from "@playwright/test";
import { entrar, USUARIOS } from "./apoio.js";
import { abrirContextoCompras } from "./apoio-compras.js";

test("Compras mostra catalogo, preco-base e solicitacoes, e o caminho legado de compra nao existe mais", async ({
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
    await page.goto("/pedidos");
    await expect(page.getByText("Catálogo, histórico, preço-base e solicitações", { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Catálogo fornecedor–produto" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Preço-base" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Solicitações" })).toBeVisible();
    // Regra-mae (E8): o pedido de fornecedor unico e o Pedido rapido (uma rodada de um convite). O
    // "Novo pedido manual" e a "Sugestao de reposicao" foram removidos: nao pode haver segundo caminho.
    await expect(page.getByRole("button", { name: "Pedido rápido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo pedido manual" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sugestão de reposição" })).toHaveCount(0);

    // Conteudo de cada aba, e nao so o rotulo. As abas viraram componentes proprios
    // (ComprasCatalogoAba / ComprasPrecoBaseAba): sem estas assercoes, uma falha de resolucao dos
    // componentes renderizaria vazio e o teste continuaria verde, porque titulo e abas vivem na casca.
    await expect(page.getByRole("button", { name: "Vincular produto" })).toBeVisible();
    await page.getByRole("tab", { name: "Preço-base" }).click();
    await expect(page.getByRole("button", { name: "Analisar .xlsx" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Preços-base atuais" })).toBeVisible();
  } finally {
    await contexto.api.dispose();
  }
});
