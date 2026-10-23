import { expect, test, type Browser } from "@playwright/test";
import { entrar, LARGURAS, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import { abrirContextoCompras, codigoDeTeste, dialogoAberto, irParaTela, prepararRodada } from "./apoio-compras.js";

/**
 * Item 3 do Definition of Done para as telas de compra: 1440 / 1024 / 768 / 390 sem rolagem
 * horizontal. O compositor do pedido rapido e o caso de risco — ele tem uma grade de duas colunas por
 * item (produto + quantidade) que, sem `min-width: 0`, estoura a largura no celular em silencio.
 */
test.describe("telas de compra em todas as larguras", () => {
  test.setTimeout(240_000);

  test("Cotacao, Pedido urgente e Pedidos finalizados nao rolam na horizontal", async ({ page }) => {
    const problemas = observarConsole(page);
    await entrar(page, USUARIOS.compras);

    for (const { nome, largura, altura } of LARGURAS) {
      await page.setViewportSize({ width: largura, height: altura });
      await irParaTela(page, "/pedidos", "Cotação por fornecedor");
      await expect(page.getByRole("heading", { name: "Cotação por fornecedor", exact: true }), nome).toBeVisible();
      await semRolagemHorizontal(page);

      // O formulario e o que mais aperta: cabecalho fixo, itens rolando e rodape fixo.
      await page.getByRole("button", { name: "Pedido urgente" }).click();
      const formulario = dialogoAberto(page);
      await expect(formulario.getByText("Itens da solicitação", { exact: false })).toBeVisible();
      await semRolagemHorizontal(page);
      await formulario.getByRole("button", { name: "Cancelar" }).click();
      await expect(formulario).toBeHidden();

      await irParaTela(page, "/pedidos_finalizados", "Pedidos finalizados");
      await expect(page.getByRole("heading", { name: "Pedidos finalizados", exact: true }), nome).toBeVisible();
      await semRolagemHorizontal(page);
    }

    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});

/**
 * R-221: a tela da rodada e aberta pelo FORNECEDOR, quase sempre no celular, a partir do link do
 * WhatsApp. Ela tem barra fixa no rodape e campos lado a lado — exatamente o que estoura em 390 px.
 */
test.describe("rodada do fornecedor", () => {
  test.setTimeout(240_000);

  // Contexto novo e sem sessao: e assim que o fornecedor chega. Ele nao herda a URL base do projeto.
  const navegadorDoFornecedor = (browser: Browser) => {
    const baseURL = test.info().project.use.baseURL;
    return browser.newContext({ ...(baseURL ? { baseURL } : {}), locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  };

  test("nao rola na horizontal e mantem a barra de envio visivel em todas as larguras", async ({ browser }) => {
    const contexto = await abrirContextoCompras();
    try {
      const { token } = await prepararRodada(contexto, codigoDeTeste());
      const navegador = await navegadorDoFornecedor(browser);
      // Uma aba por largura, como o link chega pelo WhatsApp: reabrir na mesma aba mudaria so o
      // fragmento, e o Vue Router de desenvolvimento imprimiria o seletor com o token.
      const coletas: string[][] = [];
      for (const { nome, largura, altura } of LARGURAS) {
        const pagina = await navegador.newPage();
        await pagina.setViewportSize({ width: largura, height: altura });
        coletas.push(observarConsole(pagina));
        await pagina.goto(`/rodada#t=${token}`);
        await expect(pagina.locator(".rodada .item"), nome).toBeVisible({ timeout: 120_000 });
        await expect(pagina.getByRole("button", { name: "Enviar resposta" }), nome).toBeVisible();
        await semRolagemHorizontal(pagina);
        await pagina.close();
      }
      const problemas = coletas.flat();
      expect(problemas, problemas.join("\n")).toEqual([]);
      await navegador.close();
    } finally {
      await contexto.api.dispose();
    }
  });
});
