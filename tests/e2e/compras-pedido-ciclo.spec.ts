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
  idDoPedidoPorFornecedor,
  irParaTela,
  itensPendentes,
  saldoDoProduto,
  type ContextoCompras
} from "./apoio-compras.js";

/**
 * Prova funcional ponta a ponta do ciclo de compra, no navegador real.
 *
 * Cobre os itens da auditoria que nenhum teste de integracao prova: sugestao de reposicao, bloqueio
 * do maximo visto pelo operador, envio por WhatsApp, as quatro transicoes de situacao, recebimento
 * parcial e final somando SO o conferido, reenvio que nao duplica saldo, e o historico dizendo quem
 * recebeu, quando e qual saldo mudou.
 */

test.describe("ciclo de compra", () => {
  test.setTimeout(300_000);

  let contexto: ContextoCompras;

  test.beforeAll(async () => {
    contexto = await abrirContextoCompras();
  });

  test.afterAll(async () => {
    await contexto.api.dispose();
  });

  test("do pedido ao estoque: sugestao, envio, negociacao, recebimento parcial e extrato", async ({ page }) => {
    const problemas = observarConsole(page);
    const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const nomeProduto = `E2E Ciclo ${sufixo}`;
    const local = `Deposito Ciclo ${sufixo}`;
    const fornecedorManual = `E2E Manual ${sufixo}`;
    const fornecedorSugestao = `E2E Sugestao ${sufixo}`;
    const whatsapp = "11988887777";

    const produtoId = await criarProdutoDeEstoque(contexto, {
      descricao: nomeProduto,
      estoqueMin: 5,
      estoqueMax: 40,
      setorEstoque: local,
      areaEstoque: `Area Ciclo ${sufixo}`,
      curvaAbc: "A"
    });
    await criarFornecedor(contexto, fornecedorManual, whatsapp);
    await criarFornecedor(contexto, fornecedorSugestao, whatsapp);
    expect(await saldoDoProduto(contexto, produtoId), "produto novo nasce com saldo zero").toBe(0);

    await entrar(page, USUARIOS.compras);
    await irParaTela(page, "/pedidos", "Pedidos");

    // 1) Sugestao de reposicao: produto no minimo e sugerido ate o maximo (40 - 0).
    // `.last()`: cartoes aninhados tambem casam o texto, e o mais interno e o cartao da sugestao.
    const cartaoSugestao = page.locator(".v-card", { hasText: "Gerar sugestão de reposição" }).last();
    await escolherNoSelectDe(cartaoSugestao, page, "Fornecedor", fornecedorSugestao);
    await cartaoSugestao.getByRole("button", { name: "Gerar sugestão" }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText(/[Ss]ugest/u);

    await campoDeTexto(page, "Buscar fornecedor").fill(fornecedorSugestao);
    const linhaSugestao = page.locator("tbody tr").filter({ hasText: fornecedorSugestao });
    await expect(linhaSugestao).toContainText("Sugestão");
    await linhaSugestao.getByRole("button", { name: "Abrir" }).click();
    let detalhe = dialogoAberto(page);
    await expect(detalhe.locator("tbody tr").filter({ hasText: nomeProduto })).toContainText("40");
    await detalhe.getByRole("button", { name: "Fechar" }).click();

    // 2) Pedido manual: o maximo e bloqueado na cara do operador, com o motivo.
    await page.getByRole("button", { name: "Novo pedido manual" }).click();
    let formulario = dialogoAberto(page);
    await escolherNoSelectDe(formulario, page, "Fornecedor", fornecedorManual);
    await escolherProduto(formulario, page, nomeProduto);
    await formulario.getByLabel("Quantidade").fill("50");
    await formulario.getByRole("button", { name: "Salvar pedido" }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText(/estoque m[áa]ximo/iu);

    // Mesma tela, quantidade dentro do teto: salva.
    await formulario.getByLabel("Quantidade").fill("10");
    await formulario.getByRole("button", { name: "Salvar pedido" }).click();
    await expect(formulario).toBeHidden();

    await campoDeTexto(page, "Buscar fornecedor").fill(fornecedorManual);
    const linhaManual = page.locator("tbody tr").filter({ hasText: fornecedorManual });
    await expect(linhaManual).toContainText("Manual");
    await expect(linhaManual).toContainText("A fazer");

    // 3) Edicao do pedido em A fazer: 10 -> 12.
    await linhaManual.getByRole("button", { name: "Abrir" }).click();
    detalhe = dialogoAberto(page);
    await detalhe.getByRole("button", { name: "Editar" }).click();
    formulario = dialogoAberto(page);
    await formulario.getByLabel("Quantidade").fill("12");
    await formulario.getByRole("button", { name: "Salvar pedido" }).click();
    await expect(formulario).toBeHidden();

    await linhaManual.getByRole("button", { name: "Abrir" }).click();
    detalhe = dialogoAberto(page);
    await expect(detalhe.locator("tbody tr").filter({ hasText: nomeProduto })).toContainText("12");

    // 4) Envio por WhatsApp: abre com o numero do fornecedor e os itens, e muda a situacao.
    const [janela] = await Promise.all([
      page.waitForEvent("popup"),
      detalhe.getByRole("button", { name: "Enviar WhatsApp" }).click()
    ]);
    await expect.poll(() => janela.url(), { timeout: 20_000 }).toContain("wa.me");
    const enderecoWhatsapp = decodeURIComponent(janela.url());
    expect(enderecoWhatsapp).toContain("5511988887777");
    expect(enderecoWhatsapp).toContain(nomeProduto);
    await janela.close();
    // A etapa "Enviado" aparece sempre na trilha de chips; quem prova a transicao e a acao que so
    // existe nesse estado.
    await expect(detalhe.getByRole("button", { name: "Marcar retornado" })).toBeVisible();

    // 5) Negociacao: Enviado -> Retornado -> Confirmado.
    await detalhe.getByRole("button", { name: "Marcar retornado" }).click();
    await expect(detalhe.getByRole("button", { name: "Marcar retornado" })).toBeHidden();
    await detalhe.getByRole("button", { name: "Confirmar negociação" }).click();
    await expect(detalhe.getByRole("button", { name: "Conferir recebimento" })).toBeVisible();

    // 6) Recebimento parcial: entra SO o conferido (5 de 12).
    await detalhe.getByRole("button", { name: "Conferir recebimento" }).click();
    const conferencia = dialogoAberto(page);
    await conferencia.getByLabel("Quantidade conferida").fill("5");
    await conferencia.getByRole("button", { name: "Confirmar recebimento" }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText(/parcial/iu);
    expect(await saldoDoProduto(contexto, produtoId), "saldo sobe pela quantidade conferida").toBe(5);

    // 7) Historico: quem agiu, quando, e cada etapa registrada.
    detalhe = dialogoAberto(page);
    const historico = detalhe.locator('[data-secao="historico-pedido"]');
    await expect(historico).toContainText("Compras");
    await expect(historico).toContainText("Enviado");
    await expect(historico).toContainText("Confirmado");
    await expect(historico).toContainText("Recebido parcialmente");
    await semRolagemHorizontal(page);
    await detalhe.getByRole("button", { name: "Fechar" }).click();

    // 8) Reenvio do MESMO recebimento nao duplica saldo. A chave de idempotencia e do cliente, entao
    // a prova honesta e repetir a requisicao que a tela faz, com a mesma chave, e conferir o saldo.
    const pedidoId = await idDoPedidoPorFornecedor(contexto, fornecedorManual);
    const pendentes = await itensPendentes(contexto, pedidoId);
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0]!.quantidadePendente).toBe(7);

    const chave = crypto.randomUUID();
    const corpo = {
      idempotenciaChave: chave,
      observacao: "Conferencia final do E2E",
      itens: [{ pedidoItemId: pendentes[0]!.id, quantidadeConferida: 7 }]
    };
    const primeira = await contexto.api.post(`/api/pedidos/${pedidoId}/recebimentos`, { data: corpo });
    expect(primeira.status(), await primeira.text()).toBe(201);
    expect(await saldoDoProduto(contexto, produtoId)).toBe(12);

    const reenvio = await contexto.api.post(`/api/pedidos/${pedidoId}/recebimentos`, { data: corpo });
    expect(reenvio.status(), await reenvio.text()).toBe(201);
    expect(await saldoDoProduto(contexto, produtoId), "reenvio nao pode somar de novo").toBe(12);

    // 9) A tela reflete o recebimento concluido.
    await page.reload();
    await campoDeTexto(page, "Buscar fornecedor").fill(fornecedorManual);
    const linhaFinal = page.locator("tbody tr").filter({ hasText: fornecedorManual });
    await expect(linhaFinal).toContainText("Recebido");
    await linhaFinal.getByRole("button", { name: "Abrir" }).click();
    detalhe = dialogoAberto(page);
    await expect(detalhe.locator("tbody tr").filter({ hasText: nomeProduto })).toContainText("12");
    await detalhe.getByRole("button", { name: "Fechar" }).click();

    // 10) Extrato auditavel: conferente, entrada e saldo anterior/posterior de cada movimento.
    await irParaTela(page, "/estoque_produtos", "Estoque");
    await page.getByRole("button", { name: "Extrato completo" }).click();
    const extrato = dialogoAberto(page);
    await escolherNoSelectDe(extrato, page, "Produto", nomeProduto);
    await extrato.getByRole("button", { name: "Filtrar" }).click();
    const linhasExtrato = extrato.locator("tbody tr");
    await expect(linhasExtrato).toHaveCount(2);
    await expect(extrato.locator("tbody")).toContainText("Compras");
    await expect(linhasExtrato.filter({ hasText: "+7" })).toContainText("12");
    await expect(linhasExtrato.filter({ hasText: "+5" })).toContainText("5");
    await semRolagemHorizontal(page);

    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
