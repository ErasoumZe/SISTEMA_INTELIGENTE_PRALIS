import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

const FORN_A = "11111111-1111-4111-8111-1111111119a1";
const FORN_B = "11111111-1111-4111-8111-1111111119a2";
const PRODUTO_2 = "11111111-1111-4111-8111-1111111119b1";

type SolicitacaoDetalhe = { id: string; itens: Array<{ id: string; produtoId: string; descricaoProduto: string }> };
type ConviteAberto = { fornecedorId: string; token: string };
type RodadaAberta = { id: string; convites: ConviteAberto[] };

describe("rodada publica integration (E4 — isolamento)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1,$2,'Fornecedor A','11999990101','ativo'),($3,$2,'Fornecedor B','11999990102','ativo') on conflict (id) do nothing",
      [FORN_A, idsTeste.empresaA, FORN_B]
    );
    await executarSql(
      "insert into produtos (id, empresa_id, grupo_mercadoria_id, unidade_medida_id, codigo, descricao, liberado_compra) values ($1,$2,$3,$4,'PROD-RP-2','Produto dois', true) on conflict (id) do nothing",
      [PRODUTO_2, idsTeste.empresaA, idsTeste.grupoMercadoriaInsumos, idsTeste.unidade]
    );
  }, 120_000);

  afterAll(async () => {
    // propostas_itens -> convites_itens e restrict, entao as propostas saem antes das rodadas.
    await executarSql("delete from compras_propostas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_rodadas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_solicitacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from produtos where id = $1", [PRODUTO_2]);
    await executarSql("delete from fornecedores where id = any($1)", [[FORN_A, FORN_B]]);
    await contexto.fechar();
  });

  function post(url: string, payload: object, cookie = cookieAdmin) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
  }
  function getPublico(url: string, token: string) {
    return contexto.app.inject({ method: "GET", url, headers: { "x-rodada-token": token } });
  }
  function postPublico(url: string, token: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { "x-rodada-token": token }, payload });
  }

  // Solicitacao com DOIS itens, rodada com A em um item e B no outro — para provar o isolamento.
  async function abrirRodadaDoisFornecedores(): Promise<{
    rodada: RodadaAberta;
    solicitacao: SolicitacaoDetalhe;
  }> {
    const criar = await post("/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [
        { produtoId: idsTeste.produto, quantidade: 3 },
        { produtoId: PRODUTO_2, quantidade: 5 }
      ]
    });
    expect(criar.statusCode, criar.body).toBe(201);
    const solicitacaoId = json<{ data: { id: string } }>(criar).data.id;
    const solicitacao = json<{ data: SolicitacaoDetalhe }>(
      await contexto.app.inject({
        method: "GET",
        url: `/api/compras/solicitacoes/${solicitacaoId}`,
        headers: { cookie: cookieAdmin }
      })
    ).data;
    const item1 = solicitacao.itens.find((item) => item.produtoId === idsTeste.produto)!;
    const item2 = solicitacao.itens.find((item) => item.produtoId === PRODUTO_2)!;
    const abrir = await post("/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId,
      convites: [
        { fornecedorId: FORN_A, solicitacaoItemIds: [item1.id] },
        { fornecedorId: FORN_B, solicitacaoItemIds: [item2.id] }
      ]
    });
    expect(abrir.statusCode, abrir.body).toBe(201);
    return { rodada: json<{ data: RodadaAberta }>(abrir).data, solicitacao };
  }

  it("o fornecedor ve so os itens do SEU convite, sem preco-base nem concorrente", async () => {
    const { rodada, solicitacao } = await abrirRodadaDoisFornecedores();
    const tokenA = rodada.convites.find((convite) => convite.fornecedorId === FORN_A)!.token;
    const descItem1 = solicitacao.itens.find((item) => item.produtoId === idsTeste.produto)!.descricaoProduto;
    const descItem2 = solicitacao.itens.find((item) => item.produtoId === PRODUTO_2)!.descricaoProduto;

    const resposta = await getPublico("/api/rodada", tokenA);
    expect(resposta.statusCode, resposta.body).toBe(200);
    const dto = json<{ data: { itens: Array<{ descricaoProduto: string }>; fornecedorNome: string } }>(resposta).data;
    expect(dto.fornecedorNome).toBe("Fornecedor A");
    expect(dto.itens).toHaveLength(1);
    expect(dto.itens[0]?.descricaoProduto).toBe(descItem1);
    // Nunca o item do concorrente, nunca preco-base.
    expect(resposta.body).not.toContain(descItem2);
    expect(resposta.body.toLowerCase()).not.toContain("precobase");
    expect(resposta.body.toLowerCase()).not.toContain("preco_base");
  });

  it("grava a resposta versionada; nova resposta e nova versao (nada sobrescreve)", async () => {
    const { rodada } = await abrirRodadaDoisFornecedores();
    const convite = rodada.convites.find((item) => item.fornecedorId === FORN_A)!;
    const tokenA = convite.token;
    const dto = json<{ data: { itens: Array<{ conviteItemId: string }> } }>(
      await getPublico("/api/rodada", tokenA)
    ).data;
    const conviteItemId = dto.itens[0]!.conviteItemId;

    const v1 = await postPublico("/api/rodada/responder", tokenA, {
      frete: 10,
      itens: [{ conviteItemId, indisponivel: false, valorUnitario: 4.5 }]
    });
    expect(v1.statusCode, v1.body).toBe(200);
    expect(json<{ data: { versao: number } }>(v1).data.versao).toBe(1);

    const v2 = await postPublico("/api/rodada/responder", tokenA, {
      itens: [{ conviteItemId, indisponivel: false, valorUnitario: 4.25 }]
    });
    expect(json<{ data: { versao: number } }>(v2).data.versao).toBe(2);

    // Duas versoes gravadas para o mesmo convite.
    const totais = await consultarUm<{ total: string }>(
      "select count(*)::int as total from compras_propostas where convite_id = (select id from compras_rodadas_convites where fornecedor_id = $1 and rodada_id = $2)",
      [FORN_A, rodada.id]
    );
    expect(Number(totais?.total)).toBe(2);

    // O fornecedor ve o ULTIMO valor dele.
    const dto2 = json<{ data: { ultimaProposta: { versao: number; itens: Array<{ valorUnitario: string }> } } }>(
      await getPublico("/api/rodada", tokenA)
    ).data;
    expect(dto2.ultimaProposta.versao).toBe(2);
    expect(Number(dto2.ultimaProposta.itens[0]?.valorUnitario)).toBe(4.25);
  });

  it("recusa token invalido (404) e item fora do convite (400)", async () => {
    const semToken = await getPublico("/api/rodada", "token-que-nao-existe");
    expect(semToken.statusCode).toBe(404);

    const { rodada } = await abrirRodadaDoisFornecedores();
    const tokenA = rodada.convites.find((item) => item.fornecedorId === FORN_A)!.token;
    const foraDoConvite = await postPublico("/api/rodada/responder", tokenA, {
      itens: [{ conviteItemId: idsTeste.empresaA, indisponivel: false, valorUnitario: 1 }]
    });
    expect(foraDoConvite.statusCode).toBe(400);
    expect(json<{ code?: string }>(foraDoConvite).code).toBe("ITEM_FORA_DO_CONVITE");
  });

  it("recusa resposta depois do prazo (410)", async () => {
    const { rodada } = await abrirRodadaDoisFornecedores();
    const convite = rodada.convites.find((item) => item.fornecedorId === FORN_A)!;
    const dto = json<{ data: { itens: Array<{ conviteItemId: string }> } }>(
      await getPublico("/api/rodada", convite.token)
    ).data;
    // Vence a rodada na marra (aberta_em tambem recua para nao violar o check expira_em > aberta_em).
    await executarSql(
      "update compras_rodadas set aberta_em = now() - interval '2 hour', expira_em = now() - interval '1 hour' where id = $1",
      [rodada.id]
    );
    const resposta = await postPublico("/api/rodada/responder", convite.token, {
      itens: [{ conviteItemId: dto.itens[0]!.conviteItemId, indisponivel: false, valorUnitario: 2 }]
    });
    expect(resposta.statusCode).toBe(410);
    expect(json<{ code?: string }>(resposta).code).toBe("RODADA_ENCERRADA");
  });
});
