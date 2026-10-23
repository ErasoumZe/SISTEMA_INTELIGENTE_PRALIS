import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";
import { restaurarBaseImportada } from "../../setup/compras.js";

const FORN_OK = "11111111-1111-4111-8111-11111111e001";
const FORN_SEM_ZAP = "11111111-1111-4111-8111-11111111e002";
const FORN_INATIVO = "11111111-1111-4111-8111-11111111e003";
const IMPORTACAO = "11111111-1111-4111-8111-11111111e004";
const IMPORTACAO_ITEM = "11111111-1111-4111-8111-11111111e005";
const PRECO_BASE = "11111111-1111-4111-8111-11111111e006";

type RodadaDto = { id: string; solicitacaoId: string; convites: Array<{ fornecedorId: string; token: string }> };

describe("pedido rapido integration (E8 — fornecedor unico vira rodada)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieSemPermissao: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1,$2,'Rapido OK','11999996601','ativo'),($3,$2,'Rapido sem zap',null,'ativo'),($4,$2,'Rapido inativo','11999996603','inativo') on conflict (id) do nothing",
      [FORN_OK, idsTeste.empresaA, FORN_SEM_ZAP, FORN_INATIVO]
    );
    await executarSql(
      "insert into compras_importacoes_preco_base (id, empresa_id, nome_arquivo, hash_arquivo, status, total_linhas, criado_por) values ($1,$2,'base.xlsx',$3,'aplicada',1,(select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [IMPORTACAO, idsTeste.empresaA, "9".repeat(64)]
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

  // Doc 57 §5: o fechamento grava a menor oferta como base; cada caso comeca da base importada.
  beforeEach(() => restaurarBaseImportada(idsTeste.empresaA, [idsTeste.produto], PRECO_BASE));

  afterAll(async () => {
    await executarSql("delete from compras_adjudicacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql(
      "delete from pedidos_eventos where pedido_id in (select id from pedidos where empresa_id = $1 and tipo = 'rodada')",
      [idsTeste.empresaA]
    );
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
    await executarSql("delete from fornecedores where id = any($1)", [[FORN_OK, FORN_SEM_ZAP, FORN_INATIVO]]);
    await contexto.fechar();
  });

  function rapido(fornecedorId: string, extra: object = {}, cookie = cookieAdmin) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/compras/pedido-rapido",
      headers: { cookie },
      payload: {
        empresaId: idsTeste.empresaA,
        fornecedorId,
        itens: [{ produtoId: idsTeste.produto, quantidade: 2 }],
        ...extra
      }
    });
  }
  const totalSolicitacoes = async () =>
    (
      await consultarUm<{ total: number }>(
        "select count(*)::int as total from compras_solicitacoes where empresa_id = $1",
        [idsTeste.empresaA]
      )
    )?.total ?? 0;

  it("cria a solicitacao (origem rapida) e abre a rodada de UM fornecedor, ja com o link", async () => {
    const resposta = await rapido(FORN_OK, { observacao: "Pao do dia" });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const rodada = json<{ data: RodadaDto }>(resposta).data;
    expect(rodada.convites).toHaveLength(1);
    expect(rodada.convites[0]?.fornecedorId).toBe(FORN_OK);
    expect(rodada.convites[0]?.token).toBeTruthy();

    const solicitacao = await consultarUm<{ origem: string; status: string; observacao: string | null }>(
      "select origem, status, observacao from compras_solicitacoes where id = $1",
      [rodada.solicitacaoId]
    );
    expect(solicitacao).toMatchObject({ origem: "rapida", status: "em_cotacao", observacao: "Pao do dia" });
  });

  it("e o MESMO portao: o fornecedor responde dentro da base e a compra sai sozinha, sem segundo caminho", async () => {
    const rodada = json<{ data: RodadaDto }>(await rapido(FORN_OK)).data;
    const token = rodada.convites[0]!.token;
    const dto = json<{ data: { itens: Array<{ conviteItemId: string }> } }>(
      await contexto.app.inject({ method: "GET", url: "/api/rodada", headers: { "x-rodada-token": token } })
    ).data;
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/rodada/responder",
      headers: { "x-rodada-token": token },
      payload: { itens: [{ conviteItemId: dto.itens[0]!.conviteItemId, indisponivel: false, valorUnitario: 8 }] }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const pedido = await consultarUm<{ status: string; tipo: string }>(
      "select status, tipo from pedidos where rodada_id = $1",
      [rodada.id]
    );
    expect(pedido).toMatchObject({ status: "confirmado", tipo: "rodada" });
  });

  it("fornecedor sem WhatsApp ou inativo e recusado ANTES de criar a solicitacao (nada fica para tras)", async () => {
    const antes = await totalSolicitacoes();
    const semZap = await rapido(FORN_SEM_ZAP);
    expect(semZap.statusCode).toBe(422);
    expect(json<{ code?: string }>(semZap).code).toBe("FORNECEDOR_NAO_CONVIDAVEL");
    const inativo = await rapido(FORN_INATIVO);
    expect(inativo.statusCode).toBe(422);
    expect(await totalSolicitacoes()).toBe(antes);
  });

  it("recusa fornecedor de outra empresa, item invalido e quem nao tem permissao", async () => {
    const antes = await totalSolicitacoes();
    const outraEmpresa = await rapido("11111111-1111-4111-8111-11111111e0ff");
    expect(outraEmpresa.statusCode).toBe(400);
    expect(json<{ code?: string }>(outraEmpresa).code).toBe("INVALID_SUPPLIER");
    expect((await rapido(FORN_OK, { itens: [] })).statusCode).toBe(400);
    expect((await rapido(FORN_OK, {}, cookieSemPermissao)).statusCode).toBe(403);
    expect(await totalSolicitacoes()).toBe(antes);
  });
});
