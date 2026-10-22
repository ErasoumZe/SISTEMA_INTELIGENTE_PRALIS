import { expect, test, type Page } from "@playwright/test";
import { entrar, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import {
  abrirContextoCompras,
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
 * Prova ponta a ponta do ciclo de compra do doc 57 (José, 22/10/2026), no navegador real:
 *
 * Pedido rapido -> o link sai (WhatsApp desconectado em dev: plano B "Copiar link") -> o fornecedor responde
 * pelo formulario (sem login) -> o comprador abre as decisoes pela matriz e contrapropoe -> o fornecedor aceita
 * -> encerrar agora e aprovar a excecao (produto novo nao tem referencia) -> o pedido nasce COTADO -> o
 * fornecedor separa e devolve a quantidade real dentro da margem (RETORNADO) -> o comprador confirma (COMPRADO)
 * -> recebimento parcial. Comprar nao move estoque; so o recebimento conferido (R-213).
 */
const celula = (page: Page, fornecedor: string, coluna: string) =>
  page.locator(`tr[data-fornecedor="${fornecedor}"] [data-celula="${coluna}"]`);

test.describe("ciclo de compra pela cotacao", () => {
  test.setTimeout(300_000);

  let contexto: ContextoCompras;

  test.beforeAll(async () => {
    contexto = await abrirContextoCompras();
  });

  test.afterAll(async () => {
    await contexto.api.dispose();
  });

  test("do pedido rapido ao estoque: resposta, contraproposta, excecao, separacao, confirmacao e recebimento", async ({
    page,
    browser
  }) => {
    const problemas = observarConsole(page);
    const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const nomeProduto = `E2E Rodada ${sufixo}`;
    const fornecedorNome = `E2E Fornecedor ${sufixo}`;

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
    await irParaTela(page, "/pedidos", "Pedidos");

    // 1) Pedido rapido: UM fornecedor, que vira uma cotacao de um convite, com a margem padrao (10%).
    await page.getByRole("button", { name: "Pedido rápido" }).click();
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

    // 3) O fornecedor responde pelo formulario, num navegador SEM sessao.
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
    await fornecedor.getByRole("button", { name: "Enviar resposta" }).click();
    await expect(fornecedor.locator('[data-estado="enviada"]')).toContainText("Resposta enviada");
    expect(problemasFornecedor, problemasFornecedor.join("\n")).toEqual([]);

    // 4) O comprador acha a cotacao na matriz (Enviado) e abre as decisoes: contrapropoe com ela ABERTA.
    const abrirDecisoes = async () => {
      await page.reload();
      await celula(page, fornecedorNome, "enviado").click();
      await dialogoAberto(page).getByRole("button", { name: "Decisões" }).click();
      return page.locator(".v-overlay--active .v-card").filter({ hasText: nomeProduto }).last();
    };
    let decisoes = await abrirDecisoes();
    await expect(decisoes).toContainText("Sem preço-base");
    await expect(decisoes).toContainText(/custo\s+R\$\s*12,50/u);
    await expect(decisoes.getByRole("button", { name: "Aprovar compra" })).toHaveCount(0);
    await decisoes.getByLabel("Contraproposta (R$/un)").fill("11");
    await decisoes.getByRole("button", { name: "Contrapropor" }).click();
    await expect(decisoes).toContainText(/contraproposta\s+R\$\s*11,00\/un/u);

    // 5) O fornecedor ve a contraproposta no MESMO link e aceita.
    const reaberta = await navegadorFornecedor.newPage();
    await reaberta.goto(link);
    await expect(reaberta.locator('[data-estado="contraproposta"]')).toContainText(/11,00/u, { timeout: 60_000 });
    await reaberta.getByRole("button", { name: "Aceitar contraproposta" }).click();
    await expect(reaberta.locator('[data-estado="enviada"]')).toContainText("Resposta enviada");
    await reaberta.close();

    // 6) Compra urgente: encerra a cotacao agora e SO ENTAO aprova a excecao (custo 11,00).
    decisoes = await abrirDecisoes();
    await expect(decisoes).toContainText(/custo\s+R\$\s*11,00/u);
    await decisoes.getByRole("button", { name: "Encerrar rodada agora" }).click();
    await decisoes.getByRole("button", { name: "Encerrar rodada", exact: true }).click();
    await expect(decisoes).toContainText("Rodada fechada");
    await decisoes.getByRole("button", { name: "Aprovar compra" }).click();
    await decisoes.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(decisoes).toContainText("Nenhum item pendente");
    expect(await saldoDoProduto(contexto, produtoId), "comprar nao move estoque (R-213)").toBe(0);

    // 7) O pedido nasce COTADO; o fornecedor separa 10,5 (dentro dos 10%) e devolve.
    await page.reload();
    await expect(celula(page, fornecedorNome, "cotado")).toHaveText("1");
    const separar = await navegadorFornecedor.newPage();
    await separar.goto(link);
    const separacao = separar.locator('[data-secao="separacao"]');
    await expect(separacao).toContainText("Você ganhou", { timeout: 60_000 });
    await separacao.getByLabel("Quantidade separada").fill("11.5");
    await expect(separacao.getByRole("button", { name: "Enviar quantidades" })).toBeDisabled();
    await separacao.getByLabel("Quantidade separada").fill("10.5");
    await separacao.getByRole("button", { name: "Enviar quantidades" }).click();
    await expect(separacao).toContainText("Quantidades enviadas");
    await navegadorFornecedor.close();

    // 8) Retornado: o comprador confere e confirma (Comprado).
    await page.reload();
    await celula(page, fornecedorNome, "retornado").click();
    await dialogoAberto(page).locator('[data-bloco="pedido-celula"]').getByRole("button", { name: "Abrir" }).click();
    const detalhe = page.locator(".pedido-detalhe");
    await expect(detalhe).toContainText("devolveu as quantidades reais");
    await expect(detalhe.locator(".pedido-detalhe__tabela tbody tr").filter({ hasText: nomeProduto })).toContainText(
      "10,5"
    );
    await detalhe.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText("Compra confirmada");
    await expect(detalhe.locator(".v-card-title .v-chip")).toContainText("Comprado");

    // 9) Recebimento parcial: entra SO o conferido (6 de 10,5).
    await detalhe.getByRole("button", { name: "Conferir recebimento" }).click();
    const conferencia = dialogoAberto(page);
    await conferencia.getByLabel("Quantidade conferida").fill("6");
    await conferencia.getByRole("button", { name: "Confirmar recebimento" }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText(/parcial/iu);
    expect(await saldoDoProduto(contexto, produtoId), "saldo sobe pela quantidade conferida").toBe(6);
    await expect(page.locator('[data-secao="historico-pedido"]')).toContainText("Recebido parcialmente");
    await semRolagemHorizontal(page);

    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  test("pedido do fluxo antigo continua acessivel pela matriz e so pode ser cancelado", async ({ page }) => {
    // O seed de desenvolvimento traz pedidos legados (A fazer / Enviado): leitura preservada.
    await entrar(page, USUARIOS.compras);
    await irParaTela(page, "/pedidos", "Pedidos");
    const legados = page.locator('tr:not([data-fornecedor="Sem fornecedor"]) [data-celula="a_fazer"]');
    await legados.first().click();
    const pedidoLegado = dialogoAberto(page).locator('[data-bloco="pedido-celula"]').filter({ hasText: "(legado)" });
    await pedidoLegado.first().getByRole("button", { name: "Abrir" }).click();
    const detalhe = page.locator(".pedido-detalhe");
    await expect(detalhe.locator('[data-legado="pedido"]')).toBeVisible();
    await expect(detalhe.getByRole("button", { name: "Confirmar compra" })).toHaveCount(0);
    await expect(detalhe.getByRole("button", { name: "Cancelar" })).toBeVisible();
  });
});
