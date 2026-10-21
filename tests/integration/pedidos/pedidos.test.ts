import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

const FORN = "11111111-1111-4111-8111-11111111f001";
const IMPORTACAO = "11111111-1111-4111-8111-11111111f002";
const IMPORTACAO_ITEM = "11111111-1111-4111-8111-11111111f003";
const PRECO_BASE = "11111111-1111-4111-8111-11111111f004";

/**
 * Pedidos depois do E8 (R-221): o pedido NASCE da rodada de cotacao, ja confirmado (compra automatica
 * ou excecao do comprador); sobram so ler, cancelar e RECEBER. Aqui o pedido vem do caminho real —
 * solicitacao, rodada, resposta do fornecedor dentro da base — nao de SQL semeado.
 */
describe("pedidos integration (Compras, pos-E8)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await executarSql(
      "update produtos set quantidade_estoque = '0', estoque_min = null, estoque_max = null where id = $1",
      [idsTeste.produto]
    );
    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1,$2,'Pedidos Forn','11999997701','ativo') on conflict (id) do nothing",
      [FORN, idsTeste.empresaA]
    );
    await executarSql(
      "insert into compras_importacoes_preco_base (id, empresa_id, nome_arquivo, hash_arquivo, status, total_linhas, criado_por) values ($1,$2,'base.xlsx',$3,'aplicada',1,(select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [IMPORTACAO, idsTeste.empresaA, "8".repeat(64)]
    );
    await executarSql(
      "insert into compras_importacoes_preco_base_itens (id, importacao_id, numero_linha, descricao_informada, descricao_normalizada, valor_informado, produto_id, resultado) values ($1,$2,1,'Produto','produto','10.0000',$3,'correspondencia') on conflict (id) do nothing",
      [IMPORTACAO_ITEM, IMPORTACAO, idsTeste.produto]
    );
    await executarSql(
      "insert into produtos_precos_base (id, empresa_id, produto_id, valor, origem, importacao_item_id, valido_desde, criado_por) values ($1,$2,$3,'10.0000','importacao',$4, now() - interval '1 day', (select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [PRECO_BASE, idsTeste.empresaA, idsTeste.produto, IMPORTACAO_ITEM]
    );
  }, 120_000);

  afterAll(async () => {
    const pedidosDaRodada = "select id from pedidos where empresa_id = $1 and tipo = 'rodada'";
    await executarSql("delete from compras_adjudicacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql(
      `delete from estoque_movimentos where pedido_item_id in (select id from pedidos_itens where pedido_id in (${pedidosDaRodada}))`,
      [idsTeste.empresaA]
    );
    await executarSql(`delete from pedidos_recebimentos where pedido_id in (${pedidosDaRodada})`, [idsTeste.empresaA]);
    await executarSql(`delete from pedidos_eventos where pedido_id in (${pedidosDaRodada})`, [idsTeste.empresaA]);
    await executarSql("delete from pedidos where empresa_id = $1 and tipo = 'rodada'", [idsTeste.empresaA]);
    await executarSql("delete from notificacoes where tipo = 'compras_decisao_pendente'", []);
    await executarSql("delete from compras_propostas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_rodadas_convites where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_rodadas_itens where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from produtos_precos_base where empresa_id = $1 and produto_id = $2", [
      idsTeste.empresaA,
      idsTeste.produto
    ]);
    await executarSql("delete from compras_rodadas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_solicitacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_importacoes_preco_base_itens where id = $1", [IMPORTACAO_ITEM]);
    await executarSql("delete from compras_importacoes_preco_base where id = $1", [IMPORTACAO]);
    await executarSql("delete from fornecedores where id = $1", [FORN]);
    await executarSql("update produtos set quantidade_estoque = '0' where id = $1", [idsTeste.produto]);
    await contexto.fechar();
  });

  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }
  function get(url: string) {
    return contexto.app.inject({ method: "GET", url, headers: { cookie: cookieAdmin } });
  }
  const estoque = async () =>
    (await consultarUm<{ quantidade_estoque: string }>("select quantidade_estoque from produtos where id = $1", [
      idsTeste.produto
    ]))!.quantidade_estoque;

  /** O pedido NASCE da rodada: solicitacao -> rodada -> resposta dentro da base -> compra automatica. */
  async function criarPedidoDaRodada(quantidade: number): Promise<{ pedidoId: string; itemId: string }> {
    const criar = await post("/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [{ produtoId: idsTeste.produto, quantidade }]
    });
    expect(criar.statusCode, criar.body).toBe(201);
    const solicitacaoId = json<{ data: { id: string } }>(criar).data.id;
    const solicitacao = json<{ data: { itens: Array<{ id: string }> } }>(
      await get(`/api/compras/solicitacoes/${solicitacaoId}`)
    ).data;
    const rodada = await post("/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId,
      convites: [{ fornecedorId: FORN, solicitacaoItemIds: solicitacao.itens.map((item) => item.id) }]
    });
    expect(rodada.statusCode, rodada.body).toBe(201);
    const token = json<{ data: { convites: Array<{ token: string }> } }>(rodada).data.convites[0]!.token;
    const publico = json<{ data: { itens: Array<{ conviteItemId: string }> } }>(
      await contexto.app.inject({ method: "GET", url: "/api/rodada", headers: { "x-rodada-token": token } })
    ).data;
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/rodada/responder",
      headers: { "x-rodada-token": token },
      payload: { itens: [{ conviteItemId: publico.itens[0]!.conviteItemId, indisponivel: false, valorUnitario: 8 }] }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const pedido = await consultarUm<{ id: string }>("select id from pedidos where solicitacao_id = $1", [
      solicitacaoId
    ]);
    const item = await consultarUm<{ id: string }>("select id from pedidos_itens where pedido_id = $1", [pedido!.id]);
    return { pedidoId: pedido!.id, itemId: item!.id };
  }

  it("a compra NAO move estoque: so o recebimento, parcial e idempotente, soma so a conferencia", async () => {
    const { pedidoId, itemId } = await criarPedidoDaRodada(5);

    const detalhe = await get(`/api/pedidos/${pedidoId}`);
    assertOk(detalhe);
    const inicial = json<{
      data: {
        status: string;
        tipo: string;
        fornecedorId: string;
        itens: Array<{ id: string; quantidadeRecebida: string }>;
        eventos: Array<{ status: string; criadoPorNome: string }>;
      };
    }>(detalhe).data;
    expect(inicial).toMatchObject({ status: "confirmado", tipo: "rodada", fornecedorId: FORN });
    expect(inicial.itens[0]?.quantidadeRecebida).toBe("0");
    // R-213: comprar nao move estoque. O evento de confirmacao e do fornecedor, pelo link (nao "Sistema").
    expect(await estoque()).toBe("0.000");
    expect(inicial.eventos.find((evento) => evento.status === "confirmado")?.criadoPorNome).toBe(
      "Pedidos Forn (pelo link)"
    );

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
    expect(await estoque()).toBe("3.000");

    const retry = await post(`/api/pedidos/${pedidoId}/recebimentos`, primeiroRecebimento);
    assertOk(retry);
    expect(json<{ data: { duplicado: boolean } }>(retry).data.duplicado).toBe(true);
    expect(await estoque()).toBe("3.000");
    const aposPrimeiro = json<{ data: { itens: Array<{ quantidadeRecebida: string; quantidadePendente: string }> } }>(
      await get(`/api/pedidos/${pedidoId}`)
    ).data;
    expect(aposPrimeiro.itens[0]).toMatchObject({ quantidadeRecebida: "3", quantidadePendente: "2" });

    const extrato = await get(
      `/api/compras/estoque/movimentos?empresaId=${idsTeste.empresaA}&produtoId=${idsTeste.produto}`
    );
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
    }>(extrato).data.find((linha) => linha.pedidoId === pedidoId);
    expect(movimento).toMatchObject({
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
    expect(await estoque()).toBe("3.000");

    const finalizar = await post(`/api/pedidos/${pedidoId}/recebimentos`, {
      idempotenciaChave: "00000000-0000-4000-8000-000000000902",
      itens: [{ pedidoItemId: itemId, quantidadeConferida: 2 }]
    });
    assertOk(finalizar);
    expect(json<{ data: { status: string; duplicado: boolean } }>(finalizar).data).toMatchObject({
      status: "recebido",
      duplicado: false
    });
    expect(await estoque()).toBe("5.000");
    expect(
      (
        await consultarUm<{ total: string }>(
          "select count(*)::text as total from estoque_movimentos where pedido_item_id = $1",
          [itemId]
        )
      )?.total
    ).toBe("2");
  });

  it("pedido legado (a fazer, enviado, retornado) so pode ser cancelado: nao recebe e nao confirma na mao", async () => {
    for (const status of ["a_fazer", "enviado", "retornado"]) {
      const legado = await consultarUm<{ id: string }>(
        `insert into pedidos (empresa_id, fornecedor_id, tipo, status, recorrencia, criado_por)
         values ($1, $2, 'manual', $3, 'nenhuma', (select usuario_id from perfis_usuarios limit 1)) returning id`,
        [idsTeste.empresaA, FORN, status]
      );
      const pedidoId = legado!.id;
      // Confirmar na mao deixou de existir: o contrato so aceita cancelar.
      const confirmar = await post(`/api/pedidos/${pedidoId}/situacao`, { status: "confirmado" });
      expect(confirmar.statusCode, status).toBe(400);
      const receber = await post(`/api/pedidos/${pedidoId}/recebimentos`, {
        idempotenciaChave: crypto.randomUUID(),
        itens: [{ pedidoItemId: idsTeste.empresaA, quantidadeConferida: 1 }]
      });
      expect(receber.statusCode, status).toBe(400);
      const cancelar = await post(`/api/pedidos/${pedidoId}/situacao`, { status: "cancelado" });
      expect(cancelar.statusCode, `${status}: ${cancelar.body}`).toBe(204);
      expect(
        (await consultarUm<{ status: string }>("select status from pedidos where id = $1", [pedidoId]))?.status
      ).toBe("cancelado");
      await executarSql("delete from pedidos_eventos where pedido_id = $1", [pedidoId]);
      await executarSql("delete from pedidos where id = $1", [pedidoId]);
    }
  });

  it("cancelar pedido confirmado vale, e depois de cancelado nao recebe", async () => {
    const { pedidoId, itemId } = await criarPedidoDaRodada(1);
    expect((await post(`/api/pedidos/${pedidoId}/situacao`, { status: "cancelado" })).statusCode).toBe(204);
    const receber = await post(`/api/pedidos/${pedidoId}/recebimentos`, {
      idempotenciaChave: "00000000-0000-4000-8000-000000000903",
      itens: [{ pedidoItemId: itemId, quantidadeConferida: 1 }]
    });
    assertProblem(receber, 400, "PEDIDO_NAO_RECEBIVEL");
  });

  it("os caminhos de compra legados deixaram de existir (nao ha segundo caminho)", async () => {
    const empresaId = idsTeste.empresaA;
    const alvos: Array<{ method: "POST" | "PUT" | "GET"; url: string; payload?: object }> = [
      { method: "POST", url: "/api/pedidos", payload: { empresaId, fornecedorId: FORN, itens: [] } },
      { method: "POST", url: "/api/pedidos/gerar-sugestao", payload: { empresaId, fornecedorId: FORN } },
      { method: "PUT", url: `/api/pedidos/${empresaId}`, payload: { itens: [] } },
      { method: "POST", url: `/api/pedidos/${empresaId}/cotacoes`, payload: {} },
      { method: "GET", url: "/api/cotacao" },
      { method: "POST", url: "/api/cotacao/enviar", payload: {} }
    ];
    for (const alvo of alvos) {
      const resposta = await contexto.app.inject({
        method: alvo.method,
        url: alvo.url,
        headers: { cookie: cookieAdmin, "x-cotacao-token": "qualquer" },
        ...(alvo.payload ? { payload: alvo.payload } : {})
      });
      expect(resposta.statusCode, `${alvo.method} ${alvo.url}`).toBe(404);
    }
  });

  it("recusa a mesma chave concorrente em pedidos diferentes sem duplicar estoque", async () => {
    const primeiro = await criarPedidoDaRodada(1);
    const segundo = await criarPedidoDaRodada(1);
    const saldoAntes = Number(await estoque());
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
    expect(Number(await estoque())).toBe(saldoAntes + 1);
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
