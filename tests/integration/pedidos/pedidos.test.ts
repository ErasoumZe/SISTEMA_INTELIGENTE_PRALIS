import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("pedidos integration (compra/reposicao de estoque)", () => {
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

  it("cria pedido MANUAL, detalha e aprova; nao deixa editar apos aprovado", async () => {
    const criar = await post("/api/pedidos", {
      empresaId: idsTeste.empresaA,
      recorrencia: "nenhuma",
      itens: [{ produtoId: idsTeste.produto, quantidade: 12 }]
    });
    expect(criar.statusCode, criar.body).toBe(201);
    const pedidoId = json<{ data: { id: string } }>(criar).data.id;

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/pedidos/${pedidoId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(detalhe);
    const dto = json<{
      data: { tipo: string; status: string; itens: Array<{ produtoId: string; quantidade: string }> };
    }>(detalhe).data;
    expect(dto).toMatchObject({ tipo: "manual", status: "rascunho" });
    expect(dto.itens[0]).toMatchObject({ produtoId: idsTeste.produto, quantidade: "12.000" });

    const aprovar = await post(`/api/pedidos/${pedidoId}/aprovar`, {});
    expect(aprovar.statusCode, aprovar.body).toBe(204);
    const cab = await consultarUm<{ status: string }>("select status from pedidos where id = $1", [pedidoId]);
    expect(cab?.status).toBe("aprovado");

    const editar = await contexto.app.inject({
      method: "PUT",
      url: `/api/pedidos/${pedidoId}`,
      headers: { cookie: cookieAdmin },
      payload: { itens: [{ produtoId: idsTeste.produto, quantidade: 5 }] }
    });
    assertProblem(editar, 400);
  });

  it("gera pedido AUTOMATICO com a quantidade que enche ate o maximo (max - atual)", async () => {
    // Produto no minimo: estoque 5, min 10, max 100 -> deve sugerir 95.
    await executarSql(
      "update produtos set quantidade_estoque = '5', estoque_min = '10', estoque_max = '100' where id = $1",
      [idsTeste.produto]
    );

    const gerar = await post("/api/pedidos/gerar-automatico", { empresaId: idsTeste.empresaA });
    assertOk(gerar);
    const { id, totalItens } = json<{ data: { id: string; totalItens: number } }>(gerar).data;
    expect(totalItens).toBeGreaterThanOrEqual(1);

    const item = await consultarUm<{ quantidade: string }>(
      "select quantidade from pedidos_itens where pedido_id = $1 and produto_id = $2",
      [id, idsTeste.produto]
    );
    expect(item?.quantidade).toBe("95.000");

    const cab = await consultarUm<{ tipo: string; status: string }>("select tipo, status from pedidos where id = $1", [
      id
    ]);
    expect(cab).toMatchObject({ tipo: "automatico", status: "rascunho" });
  });

  it("gerar-automatico sem produto no minimo retorna 400", async () => {
    await executarSql("update produtos set estoque_min = null, estoque_max = null where empresa_id = $1", [
      idsTeste.empresaA
    ]);
    const gerar = await post("/api/pedidos/gerar-automatico", { empresaId: idsTeste.empresaA });
    assertProblem(gerar, 400);
  });
});
