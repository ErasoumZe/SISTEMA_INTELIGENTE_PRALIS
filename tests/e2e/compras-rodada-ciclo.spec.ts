import { expect, test } from "@playwright/test";
import { entrar, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import {
  abrirContextoCompras,
  campoDeTexto,
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
 * Prova ponta a ponta do ciclo de compra DEPOIS do E8 (R-221), no navegador real: o pedido nasce da
 * rodada de cotacao, nao de um formulario de pedido.
 *
 * Pedido rapido -> o fornecedor responde pelo link (sem login) -> o comprador contrapropoe -> o
 * fornecedor aceita -> o comprador encerra a rodada e aprova a excecao (o produto novo nao tem
 * preco-base, entao nada compra sozinho) -> o pedido confirmado aparece na fila -> recebimento
 * parcial. Comprar nao move estoque; so o recebimento conferido (R-213).
 */
test.describe("ciclo de compra pela rodada", () => {
  test.setTimeout(300_000);

  let contexto: ContextoCompras;

  test.beforeAll(async () => {
    contexto = await abrirContextoCompras();
  });

  test.afterAll(async () => {
    await contexto.api.dispose();
  });

  test("do pedido rapido ao estoque: resposta, contraproposta, aceite, excecao e recebimento", async ({
    page,
    browser
  }) => {
    const problemas = observarConsole(page);
    const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const nomeProduto = `E2E Rodada ${sufixo}`;
    const fornecedorNome = `E2E Fornecedor ${sufixo}`;
    const observacao = `E2E pedido rapido ${sufixo}`;

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

    await entrar(page, USUARIOS.compras);
    await irParaTela(page, "/pedidos", "Pedidos");

    // 1) Pedido rapido: UM fornecedor, que vira uma rodada de um convite (R-221 decisao 2).
    await page.getByRole("button", { name: "Pedido rápido" }).click();
    const formulario = dialogoAberto(page);
    await escolherNoSelectDe(formulario, page, "Fornecedor", fornecedorNome);
    await escolherProduto(formulario, page, nomeProduto);
    await formulario.getByLabel("Quantidade", { exact: true }).fill("10");
    await formulario.getByLabel("Observação", { exact: true }).fill(observacao);
    await expect(formulario.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
    await formulario.getByRole("button", { name: "Enviar pedido" }).click();

    // 2) Os convites aparecem com o link: o WhatsApp abre com o numero do fornecedor e o LINK da rodada.
    const convites = dialogoAberto(page);
    await expect(convites.getByText(fornecedorNome)).toBeVisible();
    const [janela] = await Promise.all([
      page.waitForEvent("popup"),
      convites.getByRole("button", { name: "WhatsApp" }).click()
    ]);
    await expect.poll(() => janela.url(), { timeout: 20_000 }).toMatch(/wa\.me|api\.whatsapp\.com/u);
    const mensagem = decodeURIComponent(janela.url()).replaceAll("+", " ");
    expect(mensagem).toContain("5511988887777");
    const link = /https?:\/\/\S+?\/rodada#t=[0-9a-f]{64}/u.exec(mensagem)?.[0];
    expect(link, "a mensagem leva o link da rodada").toBeTruthy();
    await janela.close();
    await convites.getByRole("button", { name: "Fechar" }).click();
    await esperarOverlayFechar(page);

    // 3) O fornecedor responde pelo link, num navegador SEM sessao: prova que nao precisa de login.
    const navegadorFornecedor = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    const fornecedor = await navegadorFornecedor.newPage();
    const problemasFornecedor = observarConsole(fornecedor);
    await fornecedor.goto(link!);
    await expect(fornecedor.getByText(fornecedorNome)).toBeVisible({ timeout: 120_000 });
    expect(new URL(fornecedor.url()).hash, "o token sai da barra de enderecos").toBe("");
    const cartaoFornecedor = fornecedor.locator(".item").filter({ hasText: nomeProduto });
    await cartaoFornecedor.getByLabel("Valor unitário").fill("12.5");
    await semRolagemHorizontal(fornecedor);
    await fornecedor.getByRole("button", { name: "Enviar resposta" }).click();
    await expect(fornecedor.locator('[data-estado="encerrada"]')).toContainText("Resposta enviada");
    expect(problemasFornecedor, problemasFornecedor.join("\n")).toEqual([]);

    // 4) O comprador ve a proposta na fila de decisao e contrapropoe (a rodada esta ABERTA).
    await page.reload();
    await page.getByRole("tab", { name: "Solicitações" }).click();
    const linhaSolicitacao = page.locator("tbody tr").filter({ hasText: observacao });
    await expect(linhaSolicitacao).toContainText("Em cotação");
    await expect(linhaSolicitacao).toContainText("Rápida");
    await linhaSolicitacao.getByRole("button", { name: "Decisões" }).click();
    let decisoes = dialogoAberto(page);
    await expect(decisoes.getByText(nomeProduto)).toBeVisible();
    await expect(decisoes).toContainText("Sem preço-base");
    await expect(decisoes).toContainText(/custo\s+R\$\s*12,50/u);
    // Com a rodada aberta nao se aprova excecao (travaria o item contra uma oferta melhor).
    await expect(decisoes.getByRole("button", { name: "Aprovar compra" })).toHaveCount(0);
    await decisoes.getByLabel("Contraproposta (R$/un)").fill("11");
    await decisoes.getByRole("button", { name: "Contrapropor" }).click();
    await expect(decisoes).toContainText(/contraproposta\s+R\$\s*11,00\/un/u);
    await decisoes.getByRole("button", { name: "Fechar" }).click();
    await esperarOverlayFechar(page);

    // 5) O fornecedor ve a contraproposta no MESMO link e aceita.
    const reaberta = await navegadorFornecedor.newPage();
    await reaberta.goto(link!);
    const banner = reaberta.locator('[data-estado="contraproposta"]');
    await expect(banner).toContainText(/11,00/u, { timeout: 60_000 });
    await reaberta.getByRole("button", { name: "Aceitar contraproposta" }).click();
    await expect(reaberta.locator('[data-estado="encerrada"]')).toContainText("Resposta enviada");
    await navegadorFornecedor.close();

    // 6) O comprador reabre a fila: o aceite virou a versao nova do fornecedor (custo 11,00).
    await page.reload();
    await page.getByRole("tab", { name: "Solicitações" }).click();
    await page.locator("tbody tr").filter({ hasText: observacao }).getByRole("button", { name: "Decisões" }).click();
    decisoes = dialogoAberto(page);
    await expect(decisoes).toContainText(/custo\s+R\$\s*11,00/u);
    await expect(decisoes).not.toContainText("aguardando o fornecedor");

    // 7) Compra urgente: encerra a rodada agora e SO ENTAO aprova a excecao.
    await decisoes.getByRole("button", { name: "Encerrar rodada agora" }).click();
    await decisoes.getByRole("button", { name: "Encerrar rodada", exact: true }).click();
    await expect(decisoes).toContainText("Rodada fechada");
    await expect(decisoes.getByLabel("Contraproposta (R$/un)")).toHaveCount(0);
    await decisoes.getByRole("button", { name: "Aprovar compra" }).click();
    await decisoes.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(decisoes).toContainText("Nenhum item pendente");
    await decisoes.getByRole("button", { name: "Fechar" }).click();
    await esperarOverlayFechar(page);
    expect(await saldoDoProduto(contexto, produtoId), "comprar nao move estoque (R-213)").toBe(0);

    // 8) O pedido nasceu confirmado, da rodada, e aparece na fila.
    await page.reload();
    await page.getByRole("tab", { name: /^Confirmado \d+$/u }).click();
    await campoDeTexto(page, "Buscar fornecedor").fill(fornecedorNome);
    const linhaPedido = page.locator("tbody tr").filter({ hasText: fornecedorNome });
    await expect(linhaPedido).toContainText("Rodada de cotação");
    await expect(linhaPedido).toContainText("Confirmado");
    await linhaPedido.getByRole("button", { name: "Abrir" }).click();
    let detalhe = dialogoAberto(page);
    await expect(detalhe.locator(".pedido-detalhe__tabela tbody tr").filter({ hasText: nomeProduto })).toContainText(
      "10"
    );
    await expect(detalhe.locator('[data-secao="historico-pedido"]')).toContainText("Compra aprovada");
    // Nao ha mais editar, enviar cotacao nem confirmar na mao: so receber e cancelar.
    await expect(detalhe.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await expect(detalhe.getByRole("button", { name: "Enviar cotação" })).toHaveCount(0);

    // 9) Recebimento parcial: entra SO o conferido (6 de 10), e o historico diz quem agiu.
    await detalhe.getByRole("button", { name: "Conferir recebimento" }).click();
    const conferencia = dialogoAberto(page);
    await conferencia.getByLabel("Quantidade conferida").fill("6");
    await conferencia.getByRole("button", { name: "Confirmar recebimento" }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText(/parcial/iu);
    expect(await saldoDoProduto(contexto, produtoId), "saldo sobe pela quantidade conferida").toBe(6);
    detalhe = dialogoAberto(page);
    await expect(detalhe.locator('[data-secao="historico-pedido"]')).toContainText("Recebido parcialmente");
    await semRolagemHorizontal(page);

    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  test("pedido do fluxo antigo continua acessivel e so pode ser cancelado", async ({ page }) => {
    // O seed de desenvolvimento traz pedidos legados em A fazer / Enviado: leitura preservada.
    await entrar(page, USUARIOS.compras);
    await irParaTela(page, "/pedidos", "Pedidos");
    await page.getByRole("tab", { name: /^A fazer \d+$/u }).click();
    // A pagina tem outras tabelas (catalogo, vinculos): pega a primeira linha da fila que seja legado.
    const primeira = page.locator("tbody tr").filter({ hasText: "(legado)" }).first();
    await expect(primeira).toBeVisible();
    await primeira.getByRole("button", { name: "Abrir" }).click();
    const detalhe = dialogoAberto(page);
    await expect(detalhe.locator('[data-legado="pedido"]')).toBeVisible();
    await expect(detalhe.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await expect(detalhe.getByRole("button", { name: "Enviar cotação" })).toHaveCount(0);
    await expect(detalhe.getByRole("button", { name: "Confirmar negociação" })).toHaveCount(0);
    await expect(detalhe.getByRole("button", { name: "Cancelar" })).toBeVisible();
  });
});
