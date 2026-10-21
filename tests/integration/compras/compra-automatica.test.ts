import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

const FORN_A = "11111111-1111-4111-8111-11111111aa01";
const FORN_B = "11111111-1111-4111-8111-11111111aa02";
const IMPORTACAO = "11111111-1111-4111-8111-11111111ab01";
const IMPORTACAO_ITEM = "11111111-1111-4111-8111-11111111ab02";
const PRECO_BASE = "11111111-1111-4111-8111-11111111ab03";

type SolicitacaoDetalhe = { id: string; itens: Array<{ id: string; produtoId: string }> };
type RodadaAberta = { id: string; convites: Array<{ fornecedorId: string; token: string }> };

describe("compra automatica integration (E5)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1,$2,'Auto A','11999992201','ativo'),($3,$2,'Auto B','11999992202','ativo') on conflict (id) do nothing",
      [FORN_A, idsTeste.empresaA, FORN_B]
    );
    // Preco-base vigente 10,0000 para o produto compartilhado (via cadeia de importacao).
    await executarSql(
      "insert into compras_importacoes_preco_base (id, empresa_id, nome_arquivo, hash_arquivo, status, total_linhas, criado_por) values ($1,$2,'base.xlsx',$3,'aplicada',1,(select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [IMPORTACAO, idsTeste.empresaA, "c".repeat(64)]
    );
    await executarSql(
      "insert into compras_importacoes_preco_base_itens (id, importacao_id, numero_linha, descricao_informada, descricao_normalizada, valor_informado, produto_id, resultado) values ($1,$2,1,'Produto','produto','10.0000',$3,'correspondencia') on conflict (id) do nothing",
      [IMPORTACAO_ITEM, IMPORTACAO, idsTeste.produto]
    );
    await executarSql(
      "insert into produtos_precos_base (id, empresa_id, produto_id, valor, origem, importacao_item_id, valido_desde, criado_por) values ($1,$2,$3,'10.0000','importacao',$4, now(), (select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [PRECO_BASE, idsTeste.empresaA, idsTeste.produto, IMPORTACAO_ITEM]
    );
  }, 120_000);

  afterAll(async () => {
    await executarSql("delete from compras_adjudicacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql(
      "delete from pedidos_eventos where pedido_id in (select id from pedidos where empresa_id = $1 and tipo = 'rodada')",
      [idsTeste.empresaA]
    );
    await executarSql("delete from pedidos where empresa_id = $1 and tipo = 'rodada'", [idsTeste.empresaA]);
    await executarSql("delete from notificacoes where tipo = 'compras_decisao_pendente'", []);
    await executarSql("delete from compras_propostas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_rodadas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_solicitacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from produtos_precos_base where id = $1", [PRECO_BASE]);
    await executarSql("delete from compras_importacoes_preco_base_itens where id = $1", [IMPORTACAO_ITEM]);
    await executarSql("delete from compras_importacoes_preco_base where id = $1", [IMPORTACAO]);
    await executarSql("delete from fornecedores where id = any($1)", [[FORN_A, FORN_B]]);
    await contexto.fechar();
  });

  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }
  function getPublico(url: string, token: string) {
    return contexto.app.inject({ method: "GET", url, headers: { "x-rodada-token": token } });
  }
  function responder(token: string, payload: object) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/rodada/responder",
      headers: { "x-rodada-token": token },
      payload
    });
  }

  async function abrir(opts: { fornecedores: string[]; teto?: number }): Promise<RodadaAberta> {
    const criar = await post("/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [{ produtoId: idsTeste.produto, quantidade: 2 }]
    });
    const solicitacaoId = json<{ data: { id: string } }>(criar).data.id;
    const solicitacao = json<{ data: SolicitacaoDetalhe }>(
      await contexto.app.inject({
        method: "GET",
        url: `/api/compras/solicitacoes/${solicitacaoId}`,
        headers: { cookie: cookieAdmin }
      })
    ).data;
    const itemId = solicitacao.itens[0]!.id;
    const abrir = await post("/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId,
      ...(opts.teto !== undefined ? { tetoValor: opts.teto } : {}),
      convites: opts.fornecedores.map((fornecedorId) => ({ fornecedorId, solicitacaoItemIds: [itemId] }))
    });
    expect(abrir.statusCode, abrir.body).toBe(201);
    return json<{ data: RodadaAberta }>(abrir).data;
  }

  async function conviteItemId(token: string): Promise<string> {
    const dto = json<{ data: { itens: Array<{ conviteItemId: string }> } }>(
      await getPublico("/api/rodada", token)
    ).data;
    return dto.itens[0]!.conviteItemId;
  }

  it("item com custo final <= base nasce comprado e confirmado, com adjudicacao e custo gravado", async () => {
    const rodada = await abrir({ fornecedores: [FORN_A] });
    const token = rodada.convites[0]!.token;
    const item = await conviteItemId(token);
    const resp = await responder(token, { itens: [{ conviteItemId: item, indisponivel: false, valorUnitario: 8 }] });
    expect(resp.statusCode, resp.body).toBe(200);

    // Pedido confirmado tipo rodada para o fornecedor A.
    const pedido = await consultarUm<{ id: string; status: string }>(
      "select id, status from pedidos where rodada_id = $1 and fornecedor_id = $2",
      [rodada.id, FORN_A]
    );
    expect(pedido?.status).toBe("confirmado");
    // Adjudicacao automatica do item.
    const adj = await consultarUm<{ modo: string; custo_final_unitario: string }>(
      "select a.modo, a.custo_final_unitario from compras_adjudicacoes a join compras_rodadas_itens ri on ri.id = a.rodada_item_id where ri.rodada_id = $1",
      [rodada.id]
    );
    expect(adj?.modo).toBe("automatica");
    expect(Number(adj?.custo_final_unitario)).toBe(8);
    // Custo gravado na proposta_item.
    const propostaItem = await consultarUm<{ custo_final_unitario: string }>(
      "select pi.custo_final_unitario from compras_propostas_itens pi join compras_propostas p on p.id = pi.proposta_id join compras_rodadas_convites c on c.id = p.convite_id where c.rodada_id = $1",
      [rodada.id]
    );
    expect(Number(propostaItem?.custo_final_unitario)).toBe(8);
    // Decisao 14: TODA compra automatica avisa o comprador na hora, nao so o que sobrou.
    const aviso = await consultarUm<{ titulo: string }>(
      "select titulo from notificacoes where tipo = 'compras_decisao_pendente' and referencia_id = $1",
      [rodada.id]
    );
    expect(aviso?.titulo).toContain("Compra automática");
  });

  it("item acima da base NAO compra e cai no sino do comprador", async () => {
    const rodada = await abrir({ fornecedores: [FORN_A] });
    const token = rodada.convites[0]!.token;
    const item = await conviteItemId(token);
    await responder(token, { itens: [{ conviteItemId: item, indisponivel: false, valorUnitario: 12 }] });

    await expect(
      consultarUm(
        "select a.id from compras_adjudicacoes a join compras_rodadas_itens ri on ri.id = a.rodada_item_id where ri.rodada_id = $1",
        [rodada.id]
      )
    ).resolves.toBeNull();
    await expect(
      consultarUm("select id from notificacoes where tipo = 'compras_decisao_pendente' and referencia_id = $1", [
        rodada.id
      ])
    ).resolves.toBeTruthy();
  });

  it("dois fornecedores no mesmo item: so UM vence (resposta tardia nunca substitui)", async () => {
    const rodada = await abrir({ fornecedores: [FORN_A, FORN_B] });
    const tokenA = rodada.convites.find((c) => c.fornecedorId === FORN_A)!.token;
    const tokenB = rodada.convites.find((c) => c.fornecedorId === FORN_B)!.token;
    const itemA = await conviteItemId(tokenA);
    const itemB = await conviteItemId(tokenB);
    // A responde primeiro (8), depois B (7, mais barato, mas tarde demais).
    await responder(tokenA, { itens: [{ conviteItemId: itemA, indisponivel: false, valorUnitario: 8 }] });
    await responder(tokenB, { itens: [{ conviteItemId: itemB, indisponivel: false, valorUnitario: 7 }] });

    const total = await consultarUm<{ total: string }>(
      "select count(*)::int as total from compras_adjudicacoes a join compras_rodadas_itens ri on ri.id = a.rodada_item_id where ri.rodada_id = $1",
      [rodada.id]
    );
    expect(Number(total?.total)).toBe(1);
    const vencedor = await consultarUm<{ fornecedor_id: string }>(
      "select a.fornecedor_id from compras_adjudicacoes a join compras_rodadas_itens ri on ri.id = a.rodada_item_id where ri.rodada_id = $1",
      [rodada.id]
    );
    expect(vencedor?.fornecedor_id).toBe(FORN_A);
  });

  it("teto da rodada barra a compra automatica e manda para o comprador", async () => {
    // Item custa 8 x 2 = 16; teto de 5 nao cabe.
    const rodada = await abrir({ fornecedores: [FORN_A], teto: 5 });
    const token = rodada.convites[0]!.token;
    const item = await conviteItemId(token);
    await responder(token, { itens: [{ conviteItemId: item, indisponivel: false, valorUnitario: 8 }] });
    await expect(
      consultarUm(
        "select a.id from compras_adjudicacoes a join compras_rodadas_itens ri on ri.id = a.rodada_item_id where ri.rodada_id = $1",
        [rodada.id]
      )
    ).resolves.toBeNull();
    await expect(
      consultarUm("select id from notificacoes where tipo = 'compras_decisao_pendente' and referencia_id = $1", [
        rodada.id
      ])
    ).resolves.toBeTruthy();
  });
});
