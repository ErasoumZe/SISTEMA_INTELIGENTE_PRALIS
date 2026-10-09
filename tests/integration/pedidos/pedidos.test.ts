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

    for (const status of ["enviado", "retornado", "confirmado"] as const) {
      const situacao = await post(`/api/pedidos/${pedidoId}/situacao`, { status });
      expect(situacao.statusCode, situacao.body).toBe(204);
    }

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
});
