import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("pedidos integration (Compras)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });
  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }

  /** Leva o pedido a Retornado pelo unico caminho que existe: link gerado e resposta do fornecedor. */
  async function responderCotacao(pedidoId: string, valorUnitario: string) {
    const gerado = await post(`/api/pedidos/${pedidoId}/cotacoes`, {});
    expect(gerado.statusCode, gerado.body).toBe(201);
    const token = json<{ data: { token: string } }>(gerado).data.token;
    const cabecalho = { "x-cotacao-token": token };
    const aberta = await contexto.app.inject({ method: "GET", url: "/api/cotacao", headers: cabecalho });
    const itens = json<{ data: { itens: Array<{ pedidoItemId: string }> } }>(aberta).data.itens;
    const envio = await contexto.app.inject({
      method: "POST",
      url: "/api/cotacao/enviar",
      headers: cabecalho,
      payload: { itens: itens.map((item) => ({ pedidoItemId: item.pedidoItemId, valorUnitario })) }
    });
    expect(envio.statusCode, envio.body).toBe(204);
  }

  it("recebe parcialmente uma compra, soma so a conferencia e e idempotente", async () => {
    const criar = await post("/api/pedidos", {
      empresaId: idsTeste.empresaA,
      fornecedorId: idsTeste.fornecedor,
      recorrencia: "nenhuma",
      itens: [{ produtoId: idsTeste.produto, quantidade: 5 }]
    });
    expect(criar.statusCode, criar.body).toBe(201);
    const pedidoId = json<{ data: { id: string } }>(criar).data.id;

    const detalheInicial = await contexto.app.inject({
      method: "GET",
      url: `/api/pedidos/${pedidoId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(detalheInicial);
    const inicial = json<{
      data: { status: string; fornecedorId: string; itens: Array<{ id: string; quantidadeRecebida: string }> };
    }>(detalheInicial).data;
    expect(inicial).toMatchObject({ status: "a_fazer", fornecedorId: idsTeste.fornecedor });
    expect(inicial.itens[0]?.quantidadeRecebida).toBe("0");
    expect(
      (
        await consultarUm<{ quantidade_estoque: string }>("select quantidade_estoque from produtos where id = $1", [
          idsTeste.produto
        ])
      )?.quantidade_estoque
    ).toBe("0.000");

    // R-216: Enviado nasce do link de cotacao e Retornado da resposta do fornecedor.
    await responderCotacao(pedidoId, "10.00");
    const confirmacao = await post(`/api/pedidos/${pedidoId}/situacao`, { status: "confirmado" });
    expect(confirmacao.statusCode, confirmacao.body).toBe(204);

    const pedidoConfirmado = json<{ data: { itens: Array<{ id: string }> } }>(
      await contexto.app.inject({ method: "GET", url: `/api/pedidos/${pedidoId}`, headers: { cookie: cookieAdmin } })
    ).data;
    const itemId = pedidoConfirmado.itens[0]!.id;
    const primeiroRecebimento = {
      idempotenciaChave: "00000000-0000-4000-8000-000000000901",
      itens: [{ pedidoItemId: itemId, quantidadeConferida: 3 }]
    };
    const receber = await post(`/api/pedidos/${pedidoId}/recebimentos`, primeiroRecebimento);
    assertOk(receber);
    expect(json<{ data: { status: string; duplicado: boolean } }>(receber).data).toMatchObject({
      status: "recebido_parcial",
      duplicado: false
    });
    expect(
      (
        await consultarUm<{ quantidade_estoque: string }>("select quantidade_estoque from produtos where id = $1", [
          idsTeste.produto
        ])
      )?.quantidade_estoque
    ).toBe("3.000");

    const retry = await post(`/api/pedidos/${pedidoId}/recebimentos`, primeiroRecebimento);
    assertOk(retry);
    expect(json<{ data: { duplicado: boolean } }>(retry).data.duplicado).toBe(true);
    expect(
      (
        await consultarUm<{ quantidade_estoque: string }>("select quantidade_estoque from produtos where id = $1", [
          idsTeste.produto
        ])
      )?.quantidade_estoque
    ).toBe("3.000");
    const aposPrimeiro = json<{ data: { itens: Array<{ quantidadeRecebida: string; quantidadePendente: string }> } }>(
      await contexto.app.inject({ method: "GET", url: `/api/pedidos/${pedidoId}`, headers: { cookie: cookieAdmin } })
    ).data;
    expect(aposPrimeiro.itens[0]).toMatchObject({ quantidadeRecebida: "3", quantidadePendente: "2" });
    const extrato = await contexto.app.inject({
      method: "GET",
      url: `/api/compras/estoque/movimentos?empresaId=${idsTeste.empresaA}&produtoId=${idsTeste.produto}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(extrato);
    const movimento = json<{
      data: Array<{
        pedidoId: string;
        produtoId: string;
        quantidade: string;
        saldoAnterior: string;
        saldoPosterior: string;
        recebidoPorNome: string;
        recebidoEm: string;
      }>;
    }>(extrato).data[0];
    expect(movimento).toMatchObject({
      pedidoId,
      produtoId: idsTeste.produto,
      quantidade: "3.000",
      saldoAnterior: "0.000",
      saldoPosterior: "3.000"
    });
    expect(movimento?.recebidoPorNome).toBeTruthy();
    expect(Number.isNaN(Date.parse(movimento?.recebidoEm ?? ""))).toBe(false);

    const chaveComOutraIntencao = await post(`/api/pedidos/${pedidoId}/recebimentos`, {
      ...primeiroRecebimento,
      itens: [{ pedidoItemId: itemId, quantidadeConferida: 1 }]
    });
    assertProblem(chaveComOutraIntencao, 400, "IDEMPOTENCIA_CONFLITO");
    expect(
      (
        await consultarUm<{ quantidade_estoque: string }>("select quantidade_estoque from produtos where id = $1", [
          idsTeste.produto
        ])
      )?.quantidade_estoque
    ).toBe("3.000");

    const finalizar = await post(`/api/pedidos/${pedidoId}/recebimentos`, {
      idempotenciaChave: "00000000-0000-4000-8000-000000000902",
      itens: [{ pedidoItemId: itemId, quantidadeConferida: 2 }]
    });
    assertOk(finalizar);
    expect(json<{ data: { status: string; duplicado: boolean } }>(finalizar).data).toMatchObject({
      status: "recebido",
      duplicado: false
    });
    expect(
      (
        await consultarUm<{ quantidade_estoque: string }>("select quantidade_estoque from produtos where id = $1", [
          idsTeste.produto
        ])
      )?.quantidade_estoque
    ).toBe("5.000");
    expect(
      (
        await consultarUm<{ total: string }>(
          "select count(*)::text as total from estoque_movimentos where pedido_item_id = $1",
          [itemId]
        )
      )?.total
    ).toBe("2");
  });

  it("pedido manual respeita o maximo e sugestao cria A fazer", async () => {
    await executarSql(
      "update produtos set quantidade_estoque = '5', estoque_min = '10', estoque_max = '100' where id = $1",
      [idsTeste.produto]
    );
    const gerar = await post("/api/pedidos/gerar-sugestao", {
      empresaId: idsTeste.empresaA,
      fornecedorId: idsTeste.fornecedor
    });
    assertOk(gerar);
    const { id, totalItens } = json<{ data: { id: string; totalItens: number } }>(gerar).data;
    expect(totalItens).toBeGreaterThanOrEqual(1);
    expect(
      await consultarUm<{ status: string; tipo: string }>("select status, tipo from pedidos where id = $1", [id])
    ).toMatchObject({
      status: "a_fazer",
      tipo: "automatico"
    });
  });

  it("recusa pedido manual que ultrapassa estoque maximo", async () => {
    const criar = await post("/api/pedidos", {
      empresaId: idsTeste.empresaA,
      fornecedorId: idsTeste.fornecedor,
      itens: [{ produtoId: idsTeste.produto, quantidade: 96 }]
    });
    assertProblem(criar, 400);
  });

  it("recusa saltar Enviado para Confirmado e receber antes da confirmacao", async () => {
    const criar = await post("/api/pedidos", {
      empresaId: idsTeste.empresaA,
      fornecedorId: idsTeste.fornecedor,
      itens: [{ produtoId: idsTeste.produto, quantidade: 1 }]
    });
    expect(criar.statusCode, criar.body).toBe(201);
    const pedidoId = json<{ data: { id: string } }>(criar).data.id;
    const itemId = json<{ data: { itens: Array<{ id: string }> } }>(
      await contexto.app.inject({ method: "GET", url: `/api/pedidos/${pedidoId}`, headers: { cookie: cookieAdmin } })
    ).data.itens[0]!.id;

    const antes = await post(`/api/pedidos/${pedidoId}/recebimentos`, {
      idempotenciaChave: "00000000-0000-4000-8000-000000000903",
      itens: [{ pedidoItemId: itemId, quantidadeConferida: 1 }]
    });
    assertProblem(antes, 400, "PEDIDO_NAO_RECEBIVEL");

    expect((await post(`/api/pedidos/${pedidoId}/cotacoes`, {})).statusCode).toBe(201);
    const salto = await post(`/api/pedidos/${pedidoId}/situacao`, { status: "confirmado" });
    assertProblem(salto, 400, "TRANSICAO_PEDIDO_INVALIDA");
  });

  it("recusa a mesma chave concorrente em pedidos diferentes sem duplicar estoque", async () => {
    async function criarPedidoConfirmado() {
      const criar = await post("/api/pedidos", {
        empresaId: idsTeste.empresaA,
        fornecedorId: idsTeste.fornecedor,
        recorrencia: "nenhuma",
        itens: [{ produtoId: idsTeste.produto, quantidade: 1 }]
      });
      expect(criar.statusCode, criar.body).toBe(201);
      const pedidoId = json<{ data: { id: string } }>(criar).data.id;
      await responderCotacao(pedidoId, "10.00");
      const confirmacao = await post(`/api/pedidos/${pedidoId}/situacao`, { status: "confirmado" });
      expect(confirmacao.statusCode, confirmacao.body).toBe(204);
      const detalhe = await contexto.app.inject({
        method: "GET",
        url: `/api/pedidos/${pedidoId}`,
        headers: { cookie: cookieAdmin }
      });
      assertOk(detalhe);
      const itemId = json<{ data: { itens: Array<{ id: string }> } }>(detalhe).data.itens[0]!.id;
      return { pedidoId, itemId };
    }

    const [primeiro, segundo] = await Promise.all([criarPedidoConfirmado(), criarPedidoConfirmado()]);
    const saldoAntes = Number(
      (
        await consultarUm<{ quantidade_estoque: string }>("select quantidade_estoque from produtos where id = $1", [
          idsTeste.produto
        ])
      )?.quantidade_estoque
    );
    const chave = "00000000-0000-4000-8000-000000000904";
    const respostas = await Promise.all([
      post(`/api/pedidos/${primeiro.pedidoId}/recebimentos`, {
        idempotenciaChave: chave,
        itens: [{ pedidoItemId: primeiro.itemId, quantidadeConferida: 1 }]
      }),
      post(`/api/pedidos/${segundo.pedidoId}/recebimentos`, {
        idempotenciaChave: chave,
        itens: [{ pedidoItemId: segundo.itemId, quantidadeConferida: 1 }]
      })
    ]);

    expect(respostas.map((resposta) => resposta.statusCode).sort()).toEqual([200, 400]);
    const conflito = respostas.find((resposta) => resposta.statusCode === 400)!;
    assertProblem(conflito, 400, "IDEMPOTENCIA_CONFLITO");
    const saldoDepois = Number(
      (
        await consultarUm<{ quantidade_estoque: string }>("select quantidade_estoque from produtos where id = $1", [
          idsTeste.produto
        ])
      )?.quantidade_estoque
    );
    expect(saldoDepois).toBe(saldoAntes + 1);
    expect(
      (
        await consultarUm<{ total: string }>(
          "select count(*)::text as total from pedidos_recebimentos where empresa_id = $1 and idempotencia_chave = $2",
          [idsTeste.empresaA, chave]
        )
      )?.total
    ).toBe("1");
  });
});
