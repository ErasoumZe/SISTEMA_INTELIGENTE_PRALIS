import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

/**
 * R-216 — cotacao respondida pelo fornecedor por link assinado.
 *
 * O que so a integracao prova: o token que sai da geracao abre o formulario SEM sessao, o envio
 * recalcula o total no servidor, o pedido vira Retornado com o fornecedor como autor, e todo link
 * que deveria estar morto (respondido, revogado, vencido, pedido cancelado) esta morto.
 */

type ItemCotacao = { pedidoItemId: string; descricao: string; quantidade: string; ultimoValor: string | null };
type CotacaoPublica = {
  situacao: string;
  fornecedorNome: string;
  empresaNome: string;
  itens: ItemCotacao[];
  observacao: string | null;
};

describe("cotacao de fornecedor (R-216)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const comSessao = (method: "GET" | "POST", url: string, payload?: object) =>
    contexto.app.inject({ method, url, headers: { cookie: cookieAdmin }, ...(payload ? { payload } : {}) });

  // Sem cookie de proposito: o fornecedor nao tem conta, e passar sessao aqui mascararia falha de token.
  const publico = (method: "GET" | "PUT" | "POST", url: string, token: string | null, payload?: object) =>
    contexto.app.inject({
      method,
      url,
      headers: token === null ? {} : { "x-cotacao-token": token },
      ...(payload ? { payload } : {})
    });

  async function criarPedido(quantidade = 4): Promise<string> {
    const criar = await comSessao("POST", "/api/pedidos", {
      empresaId: idsTeste.empresaA,
      fornecedorId: idsTeste.fornecedor,
      recorrencia: "nenhuma",
      itens: [{ produtoId: idsTeste.produto, quantidade }]
    });
    expect(criar.statusCode, criar.body).toBe(201);
    return json<{ data: { id: string } }>(criar).data.id;
  }

  async function gerarLink(pedidoId: string): Promise<string> {
    const resposta = await comSessao("POST", `/api/pedidos/${pedidoId}/cotacoes`);
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { token: string; expiraEm: string } }>(resposta).data.token;
  }

  async function abrir(token: string): Promise<CotacaoPublica> {
    const resposta = await publico("GET", "/api/cotacao", token);
    assertOk(resposta);
    return json<{ data: CotacaoPublica }>(resposta).data;
  }

  const situacaoDoPedido = async (pedidoId: string) =>
    (await consultarUm<{ status: string }>("select status from pedidos where id = $1", [pedidoId]))?.status;

  const saldo = async () =>
    (
      await consultarUm<{ quantidade_estoque: string }>("select quantidade_estoque from produtos where id = $1", [
        idsTeste.produto
      ])
    )?.quantidade_estoque;

  it("o fornecedor abre sem login, salva rascunho, envia e o pedido vira Retornado sem tocar estoque", async () => {
    const saldoAntes = await saldo();
    const pedidoId = await criarPedido(4);
    const token = await gerarLink(pedidoId);
    expect(await situacaoDoPedido(pedidoId)).toBe("enviado");

    const aberta = await abrir(token);
    expect(aberta.situacao).toBe("aberta");
    expect(aberta.itens).toHaveLength(1);
    expect(aberta.fornecedorNome.length).toBeGreaterThan(0);
    const itemId = aberta.itens[0]!.pedidoItemId;

    // Rascunho incompleto e aceito: o fornecedor pode parar e voltar no mesmo link.
    const rascunho = await publico("PUT", "/api/cotacao", token, {
      itens: [{ pedidoItemId: itemId, valorUnitario: "12,50" }],
      observacao: "Volto amanha"
    });
    expect(rascunho.statusCode, rascunho.body).toBe(204);
    const reaberta = await abrir(token);
    expect(reaberta.observacao).toBe("Volto amanha");
    expect(reaberta.itens[0]).toMatchObject({ valorUnitario: "12.50" });

    // 4 x 12,50 = 50,00; desconto de R$ 0,50 por unidade = 4 x 12,00 = 48,00; menos 10% = 43,20.
    const envio = await publico("POST", "/api/cotacao/enviar", token, {
      itens: [{ pedidoItemId: itemId, valorUnitario: "12.50", descontoTipo: "valor", descontoValor: "0.50" }],
      descontoGeralTipo: "percentual",
      descontoGeralValor: "10",
      prazoEntrega: "2026-10-30",
      condicaoPagamento: "28 dias"
    });
    expect(envio.statusCode, envio.body).toBe(204);

    expect(await situacaoDoPedido(pedidoId)).toBe("retornado");
    expect(await saldo(), "responder cotacao nao mexe em estoque (R-208)").toBe(saldoAntes);
    expect(
      await consultarUm<{ total_bruto: string; total_final: string; status: string }>(
        "select total_bruto, total_final, status from pedidos_cotacoes where pedido_id = $1",
        [pedidoId]
      )
    ).toEqual({ total_bruto: "50.00", total_final: "43.20", status: "respondida" });
    // 43,20 / 4 = 10,80 por unidade efetiva.
    expect(
      (
        await consultarUm<{ valor_unitario_final: string }>(
          "select valor_unitario_final from pedidos_cotacoes_itens where pedido_item_id = $1",
          [itemId]
        )
      )?.valor_unitario_final
    ).toBe("10.8000");

    // O Comprador ve a cotacao no detalhe e o Retornado assinado pelo fornecedor, nao por ele.
    const detalhe = await comSessao("GET", `/api/pedidos/${pedidoId}`);
    assertOk(detalhe);
    const pedido = json<{
      data: {
        cotacao: { situacao: string; condicaoPagamento: string; itens: unknown[] } | null;
        eventos: Array<{ status: string; criadoPor: string | null; criadoPorNome: string }>;
      };
    }>(detalhe).data;
    expect(pedido.cotacao).toMatchObject({ situacao: "respondida", condicaoPagamento: "28 dias" });
    expect(pedido.cotacao?.itens).toHaveLength(1);
    const retornado = pedido.eventos.find((evento) => evento.status === "retornado");
    expect(retornado?.criadoPor).toBeNull();
    expect(retornado?.criadoPorNome).toContain("pelo link");

    // Depois de enviado, o link nao abre mais o formulario nem aceita nova resposta.
    const depois = await abrir(token);
    expect(depois).toMatchObject({ situacao: "respondida", itens: [] });
    assertProblem(await publico("PUT", "/api/cotacao", token, { itens: [] }), 410, "COTACAO_ENCERRADA");
    assertProblem(await publico("POST", "/api/cotacao/enviar", token, { itens: [] }), 410, "COTACAO_ENCERRADA");
  });

  it("recusa envio incompleto dizendo qual produto falta, mas guarda o resto", async () => {
    const pedidoId = await criarPedido();
    const token = await gerarLink(pedidoId);
    const item = (await abrir(token)).itens[0]!;
    const envio = await publico("POST", "/api/cotacao/enviar", token, { itens: [{ pedidoItemId: item.pedidoItemId }] });
    assertProblem(envio, 400, "COTACAO_INCOMPLETA");
    expect(envio.body).toContain(item.descricao);
    expect(await situacaoDoPedido(pedidoId)).toBe("enviado");
  });

  it("recusa desconto maior que o valor", async () => {
    const pedidoId = await criarPedido();
    const token = await gerarLink(pedidoId);
    const item = (await abrir(token)).itens[0]!;
    const envio = await publico("POST", "/api/cotacao/enviar", token, {
      itens: [{ pedidoItemId: item.pedidoItemId, valorUnitario: "5", descontoTipo: "valor", descontoValor: "6" }]
    });
    assertProblem(envio, 400, "COTACAO_INCOMPLETA");
  });

  it("sem token e 401, token desconhecido e 404, e a sessao do Comprador nao substitui o token", async () => {
    assertProblem(await publico("GET", "/api/cotacao", null), 401, "COTACAO_TOKEN_AUSENTE");
    assertProblem(await publico("GET", "/api/cotacao", "f".repeat(64)), 404, "COTACAO_INVALIDA");
    assertProblem(await comSessao("GET", "/api/cotacao"), 401, "COTACAO_TOKEN_AUSENTE");
  });

  it("gerar novo link revoga o anterior", async () => {
    const pedidoId = await criarPedido();
    const antigo = await gerarLink(pedidoId);
    const novo = await gerarLink(pedidoId);
    expect((await abrir(antigo)).situacao).toBe("revogada");
    expect((await abrir(novo)).situacao).toBe("aberta");
    assertProblem(await publico("PUT", "/api/cotacao", antigo, { itens: [] }), 410, "COTACAO_ENCERRADA");
    expect(
      (
        await consultarUm<{ abertas: string }>(
          "select count(*)::text as abertas from pedidos_cotacoes where pedido_id = $1 and status = 'aberta'",
          [pedidoId]
        )
      )?.abertas
    ).toBe("1");
  });

  it("link vencido nao aceita resposta", async () => {
    const pedidoId = await criarPedido();
    const token = await gerarLink(pedidoId);
    await executarSql("update pedidos_cotacoes set expira_em = now() - interval '1 minute' where pedido_id = $1", [
      pedidoId
    ]);
    expect((await abrir(token)).situacao).toBe("expirada");
    assertProblem(await publico("PUT", "/api/cotacao", token, { itens: [] }), 410, "COTACAO_EXPIRADA");
  });

  it("cancelar o pedido mata o link aberto", async () => {
    const pedidoId = await criarPedido();
    const token = await gerarLink(pedidoId);
    expect((await comSessao("POST", `/api/pedidos/${pedidoId}/situacao`, { status: "cancelado" })).statusCode).toBe(
      204
    );
    expect((await abrir(token)).situacao).toBe("revogada");
  });

  it("Enviado e Retornado nao sao mais marcados a mao", async () => {
    const pedidoId = await criarPedido();
    for (const status of ["enviado", "retornado"]) {
      assertProblem(await comSessao("POST", `/api/pedidos/${pedidoId}/situacao`, { status }), 400, "VALIDATION_ERROR");
    }
    expect(await situacaoDoPedido(pedidoId)).toBe("a_fazer");
  });

  it("o preco efetivo de uma cotacao CONFIRMADA vira o ultimo valor da proxima", async () => {
    const primeiro = await criarPedido(2);
    const tokenPrimeiro = await gerarLink(primeiro);
    const itemPrimeiro = (await abrir(tokenPrimeiro)).itens[0]!;
    // 2 x 9,90 menos R$ 0,40 no pedido = 19,40 -> 9,70 por unidade.
    const envio = await publico("POST", "/api/cotacao/enviar", tokenPrimeiro, {
      itens: [{ pedidoItemId: itemPrimeiro.pedidoItemId, valorUnitario: "9.90" }],
      descontoGeralTipo: "valor",
      descontoGeralValor: "0.40"
    });
    expect(envio.statusCode, envio.body).toBe(204);

    // Respondida mas NAO confirmada ainda e proposta: nao vira referencia.
    const segundo = await criarPedido(1);
    const tokenSegundo = await gerarLink(segundo);
    const antesDeConfirmar = (await abrir(tokenSegundo)).itens[0]!.ultimoValor;

    expect((await comSessao("POST", `/api/pedidos/${primeiro}/situacao`, { status: "confirmado" })).statusCode).toBe(
      204
    );
    expect((await abrir(tokenSegundo)).itens[0]!.ultimoValor).toBe("9.7000");
    expect(antesDeConfirmar).not.toBe("9.7000");
  });
});
