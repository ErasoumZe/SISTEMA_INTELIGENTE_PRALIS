import { expect, test, type Page } from "@playwright/test";
import { entrar, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import {
  abrirContextoCompras,
  codigoDeTeste,
  criarFornecedor,
  criarProdutoDeEstoque,
  dialogoAberto,
  escolherNoSelectDe,
  escolherProduto,
  esperarOverlayFechar,
  irParaTela,
  saldoDoProduto,
  type ContextoCompras
} from "./apoio-compras.js";

/**
 * Prova ponta a ponta do ciclo de compra do doc 58 (Rodrigo, 23/10/2026), no navegador real:
 *
 * Pedido urgente -> o link sai (WhatsApp desconectado em dev: plano B "Copiar link") -> o fornecedor salva sem
 * enviar (COTADO) e depois envia (produto novo nao tem referencia: COM AUMENTO) -> o comprador abre a cotacao do
 * produto e contrapropoe -> o fornecedor aceita -> o comprador aceita e reajusta a referencia com a cotacao ainda
 * aberta (COMPRADO) -> o fornecedor ajusta a quantidade ao estoque dele, dentro da margem -> Pedidos finalizados:
 * recebimento parcial e depois recebimento com devolucao, que fecha o item. Comprar nao move estoque (R-213).
 */
const celula = (page: Page, produto: string, coluna: string) =>
  page.locator(`tr[data-produto="${produto}"] [data-celula="${coluna}"]`);

test.describe("ciclo de compra pela cotacao", () => {
  test.setTimeout(300_000);

  let contexto: ContextoCompras;

  test.beforeAll(async () => {
    contexto = await abrirContextoCompras();
  });

  test.afterAll(async () => {
    await contexto.api.dispose();
  });

  test("do pedido urgente ao estoque: cotado, com aumento, contraproposta, aceite, ajuste, recebimento e devolucao", async ({
    page,
    browser
  }) => {
    const problemas = observarConsole(page);
    const sufixo = codigoDeTeste();
    const nomeProduto = `Abacaxi pérola (teste ${sufixo})`;
    const fornecedorNome = `Hortifruti Bahamas (teste ${sufixo})`;

    const produtoId = await criarProdutoDeEstoque(contexto, {
      descricao: nomeProduto,
      estoqueMin: 5,
      estoqueMax: 40,
      setorEstoque: `Deposito Rodada ${sufixo}`,
      areaEstoque: `Area Rodada ${sufixo}`,
      curvaAbc: "A"
    });
    await criarFornecedor(contexto, fornecedorNome, "11988887777");
    expect(await saldoDoProduto(contexto, produtoId), "produto novo nasce com saldo zero").toBe(0);

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await entrar(page, USUARIOS.compras);
    await irParaTela(page, "/pedidos", "Cotação por fornecedor");

    // 1) Pedido urgente: UM fornecedor, que vira uma cotacao de um convite, com a margem padrao (10%).
    await page.getByRole("button", { name: "Pedido urgente" }).click();
    const formulario = dialogoAberto(page);
    await escolherNoSelectDe(formulario, page, "Fornecedor", fornecedorNome);
    await escolherProduto(formulario, page, nomeProduto);
    await formulario.getByLabel("Quantidade", { exact: true }).fill("10");
    await expect(
      formulario.getByRole("radiogroup", { name: "Variação aceita na quantidade" }).getByRole("radio", { name: "10%" })
    ).toHaveAttribute("aria-checked", "true");
    await formulario.getByRole("button", { name: "Enviar pedido" }).click();

    // 2) Sem o WhatsApp conectado, a tela avisa e oferece o link (plano B). Com a conexao, sai sozinho.
    const convites = dialogoAberto(page);
    await expect(convites.getByText(fornecedorNome)).toBeVisible();
    await expect(convites).toContainText("WhatsApp da empresa ainda não está conectado");
    await convites.getByRole("button", { name: "Copiar link" }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/rodada#t=[0-9a-f]{64}$/u);
    await convites.getByRole("button", { name: "Fechar" }).click();
    await esperarOverlayFechar(page);
    await page.reload();
    await expect(celula(page, nomeProduto, "enviado")).toHaveText("1");

    // 3) O fornecedor, num navegador SEM sessao, salva sem enviar (Cotado) e depois envia.
    const navegadorFornecedor = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    const fornecedor = await navegadorFornecedor.newPage();
    const problemasFornecedor = observarConsole(fornecedor);
    await fornecedor.goto(link);
    await expect(fornecedor.getByText(fornecedorNome)).toBeVisible({ timeout: 120_000 });
    expect(new URL(fornecedor.url()).hash, "o token sai da barra de enderecos").toBe("");
    const cartao = fornecedor.locator(`[data-item="${nomeProduto}"]`);
    await expect(cartao).toContainText("Sem histórico");
    await cartao.getByLabel("Valor unitário *").fill("12.5");
    await semRolagemHorizontal(fornecedor);
    await fornecedor.getByRole("button", { name: "Salvar sem enviar" }).click();
    await expect(fornecedor.getByText(/Salvo às/u)).toBeVisible();
    await page.reload();
    await expect(celula(page, nomeProduto, "cotado")).toHaveText("1");
    await fornecedor.getByRole("button", { name: "Enviar resposta" }).click();
    await expect(fornecedor.locator('[data-estado="enviada"]')).toContainText("Resposta enviada");
    expect(problemasFornecedor, problemasFornecedor.join("\n")).toEqual([]);

    // 4) Sem referencia, a resposta e Com aumento. O comprador abre a cotacao do produto e contrapropoe.
    const abrirCotacao = async () => {
      await page.reload();
      await celula(page, nomeProduto, "com_aumento").click();
      return page.locator('[data-dialogo="cotacao-produto"]');
    };
    let cotacao = await abrirCotacao();
    await expect(cotacao.locator('[data-campo="referencia"]')).toContainText("Sem referência");
    const oferta = cotacao.locator(`[data-fornecedor="${fornecedorNome}"][data-situacao="com_aumento"]`);
    await expect(oferta).toContainText(/R\$\s*12,50/u);
    await oferta.getByRole("button", { name: "Contrapropor" }).click();
    await oferta.getByLabel(/Seu valor/u).fill("11");
    await oferta.getByRole("button", { name: "Enviar contraproposta" }).click();
    await expect(cotacao.locator('[data-estado="aceite-feito"]')).toContainText("Contraproposta enviada");
    await expect(oferta).toContainText(/contrapropôs\s+R\$\s*11,00/u);

    // 5) O fornecedor ve a contraproposta no MESMO link e aceita.
    const reaberta = await navegadorFornecedor.newPage();
    await reaberta.goto(link);
    await expect(reaberta.locator('[data-estado="contraproposta"]')).toContainText(/11,00/u, { timeout: 60_000 });
    await reaberta.getByRole("button", { name: "Aceitar contraproposta" }).click();
    await expect(reaberta.locator('[data-estado="enviada"]')).toContainText("Resposta enviada");
    await reaberta.close();

    // 6) Com a cotacao ABERTA, o comprador aceita e reajusta a referencia: vira Comprado na hora.
    cotacao = await abrirCotacao();
    const aceitar = cotacao.locator(`[data-fornecedor="${fornecedorNome}"][data-situacao="com_aumento"]`);
    await expect(aceitar).toContainText(/R\$\s*11,00/u);
    await aceitar.getByRole("button", { name: "Aceitar" }).click();
    await aceitar.getByRole("radio", { name: /Reajustar a referência/u }).check();
    await aceitar.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(cotacao.locator('[data-estado="aceite-feito"]')).toContainText("A referência foi reajustada");
    await expect(cotacao).toContainText(/Referência\s+R\$\s*11,00/u);
    await expect(cotacao.locator(`[data-fornecedor="${fornecedorNome}"][data-situacao="comprado"]`)).toBeVisible();
    expect(await saldoDoProduto(contexto, produtoId), "comprar nao move estoque (R-213)").toBe(0);
    await page.keyboard.press("Escape");

    // 7) Depois de comprado, o fornecedor ajusta a quantidade ao estoque dele, dentro dos 10%.
    const ajustar = await navegadorFornecedor.newPage();
    await ajustar.goto(link);
    const separacao = ajustar.locator('[data-secao="separacao"]');
    await expect(separacao).toContainText("Compramos estes produtos", { timeout: 60_000 });
    await separacao.getByLabel("Quantidade que vou entregar").fill("11.5");
    await expect(separacao.getByRole("button", { name: "Salvar ajuste" })).toBeDisabled();
    await separacao.getByLabel("Quantidade que vou entregar").fill("10.5");
    await separacao.getByRole("button", { name: "Salvar ajuste" }).click();
    await expect(separacao.locator('[data-estado="ajuste-salvo"]')).toBeVisible();
    await navegadorFornecedor.close();

    // 8) Pedidos finalizados: o pedido esta A caminho com a quantidade ajustada.
    await irParaTela(page, "/pedidos_finalizados", "Pedidos finalizados");
    await page.locator(`[data-pedido="${fornecedorNome}"]`).click();
    const detalhe = page.locator(".pedido-detalhe");
    await expect(detalhe.locator(".v-card-title .v-chip")).toContainText("Comprado");
    await expect(detalhe.locator(".pedido-detalhe__tabela tbody tr").filter({ hasText: nomeProduto })).toContainText(
      "10,5"
    );

    // 9) Recebimento parcial: entra SO o recebido (6 de 10,5); o resto continua pendente.
    await detalhe.getByRole("button", { name: "Conferir recebimento" }).click();
    let conferencia = dialogoAberto(page);
    await conferencia.getByLabel("Recebido", { exact: true }).fill("6");
    await conferencia.getByRole("button", { name: "Confirmar recebimento" }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText(/parcial/iu);
    expect(await saldoDoProduto(contexto, produtoId), "saldo sobe pelo recebido").toBe(6);
    await expect(page.locator('[data-secao="historico-pedido"]')).toContainText("Recebido parcialmente");

    // 10) Chegou o resto com 1 kg estragado: recebe 3,5, devolve 1 com motivo. O item fecha.
    await detalhe.getByRole("button", { name: "Conferir recebimento" }).click();
    conferencia = dialogoAberto(page);
    await conferencia.getByLabel("Recebido", { exact: true }).fill("3.5");
    await conferencia.getByLabel("Devolvido", { exact: true }).fill("1");
    await expect(conferencia.getByRole("button", { name: "Confirmar recebimento" })).toBeDisabled();
    await conferencia.getByLabel("Motivo da devolução").fill("estragado");
    await conferencia.getByRole("button", { name: "Confirmar recebimento" }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText(/concluido/iu);
    expect(await saldoDoProduto(contexto, produtoId), "devolvido nao entra no estoque").toBe(9.5);
    await expect(detalhe.locator(".v-card-title .v-chip")).toContainText("Recebido");
    await semRolagemHorizontal(page);

    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  test("pedido do fluxo antigo continua acessivel em Pedidos finalizados e so pode ser cancelado", async ({ page }) => {
    // O seed de desenvolvimento traz pedidos legados (A fazer / Enviado): leitura preservada.
    await entrar(page, USUARIOS.compras);
    await irParaTela(page, "/pedidos_finalizados", "Pedidos finalizados");
    await page
      .locator('[data-secao="pedidos-finalizados"] .finalizados__linha', { hasText: "(legado)" })
      .first()
      .click();
    const detalhe = page.locator(".pedido-detalhe");
    await expect(detalhe.locator('[data-legado="pedido"]')).toBeVisible();
    await expect(detalhe.getByRole("button", { name: "Confirmar compra" })).toHaveCount(0);
    await expect(detalhe.getByRole("button", { name: "Cancelar" })).toBeVisible();
  });
});
