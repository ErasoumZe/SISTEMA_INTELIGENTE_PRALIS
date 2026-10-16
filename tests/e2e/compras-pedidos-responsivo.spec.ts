import { expect, test, type Browser } from "@playwright/test";
import { entrar, LARGURAS, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import { abrirContextoCompras, dialogoAberto, irParaTela, prepararCotacao } from "./apoio-compras.js";

/**
 * Item 3 do Definition of Done para as telas de gerar pedido: 1440 / 1024 / 768 / 390 sem rolagem
 * horizontal. O compositor de pedido e o caso de risco — ele tem uma grade de duas colunas por
 * item (produto + quantidade) que, sem `min-width: 0`, estoura a largura no celular em silencio.
 */
test.describe("telas de pedido em todas as larguras", () => {
  test.setTimeout(240_000);

  test("Pedidos e o formulario nao rolam na horizontal", async ({ page }) => {
    const problemas = observarConsole(page);
    await entrar(page, USUARIOS.compras);

    for (const { nome, largura, altura } of LARGURAS) {
      await page.setViewportSize({ width: largura, height: altura });
      await irParaTela(page, "/pedidos", "Pedidos");
      await expect(page.getByRole("heading", { name: "Pedidos", exact: true }), nome).toBeVisible();
      await semRolagemHorizontal(page);

      // O formulario e o que mais aperta: cabecalho fixo, itens rolando e rodape fixo.
      await page.getByRole("button", { name: "Novo pedido manual" }).click();
      const formulario = dialogoAberto(page);
      await expect(formulario.getByText("Itens do pedido", { exact: false })).toBeVisible();
      await semRolagemHorizontal(page);
      await formulario.getByRole("button", { name: "Cancelar" }).click();
      await expect(formulario).toBeHidden();
    }

    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});

/**
 * R-216: a tela da cotacao e aberta pelo FORNECEDOR, quase sempre no celular, a partir do link do
 * WhatsApp. Ela tem barra fixa no rodape e campos lado a lado — exatamente o que estoura em 390 px.
 */
test.describe("cotacao do fornecedor", () => {
  test.setTimeout(240_000);

  // Contexto novo e sem sessao: e assim que o fornecedor chega. Ele nao herda a URL base do projeto.
  const navegadorDoFornecedor = (browser: Browser) =>
    browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });

  test("nao rola na horizontal e mantem o total visivel em todas as larguras", async ({ browser }) => {
    const contexto = await abrirContextoCompras();
    try {
      const { token } = await prepararCotacao(contexto, `${Date.now()}-${Math.floor(Math.random() * 1000)}`);
      const navegador = await navegadorDoFornecedor(browser);
      // Uma aba por largura, como o link chega pelo WhatsApp: reabrir na mesma aba mudaria so o
      // fragmento, e o Vue Router de desenvolvimento imprimiria o seletor com o token.
      const coletas: string[][] = [];
      for (const { nome, largura, altura } of LARGURAS) {
        const pagina = await navegador.newPage();
        await pagina.setViewportSize({ width: largura, height: altura });
        coletas.push(observarConsole(pagina));
        await pagina.goto(`/cotacao#t=${token}`);
        await expect(pagina.locator(".cotacao-item"), nome).toBeVisible({ timeout: 120_000 });
        await expect(pagina.locator('[data-campo="barra-total"]'), nome).toBeVisible();
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

  // O rascunho automatico espera 2,5 s. Quem digita e volta para o WhatsApp antes disso nao pode
  // perder o valor: a pagina salva quando sai de cena.
  test("nao perde o valor digitado quando o fornecedor sai logo em seguida", async ({ browser }) => {
    const contexto = await abrirContextoCompras();
    try {
      const { token } = await prepararCotacao(contexto, `${Date.now()}-${Math.floor(Math.random() * 1000)}`);
      const navegador = await navegadorDoFornecedor(browser);
      const primeira = await navegador.newPage();
      await primeira.goto(`/cotacao#t=${token}`);
      await primeira.locator(".cotacao-item").getByLabel("Valor atual").fill("7,35");
      await primeira.close({ runBeforeUnload: true });

      const segunda = await navegador.newPage();
      await segunda.goto(`/cotacao#t=${token}`);
      await expect(segunda.locator(".cotacao-item").getByLabel("Valor atual")).toHaveValue("7,35", { timeout: 60_000 });
      await navegador.close();
    } finally {
      await contexto.api.dispose();
    }
  });
});
