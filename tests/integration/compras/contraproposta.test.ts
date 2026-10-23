import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fecharRodadaPorPrazo } from "../../../api/src/compras/compras-fechamento.service.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";
import { restaurarBaseImportada } from "../../setup/compras.js";

const FORN_A = "11111111-1111-4111-8111-11111111d001";
const FORN_B = "11111111-1111-4111-8111-11111111d002";
const IMPORTACAO = "11111111-1111-4111-8111-11111111d003";
const IMPORTACAO_ITEM = "11111111-1111-4111-8111-11111111d004";
const PRECO_BASE = "11111111-1111-4111-8111-11111111d005";

type Convite = { id: string; fornecedorId: string; token: string };
type RodadaAberta = { id: string; itens: Array<{ id: string }>; convites: Convite[] };
type PublicoDto = {
  itens: Array<{ conviteItemId: string; situacao: string }>;
  contraproposta: { versao: number; itens: Array<{ conviteItemId: string; valorUnitario: string }> } | null;
  ultimaProposta: { versao: number; itens: Array<{ valorUnitario: string | null }> } | null;
};

const HORA = 3_600_000;

describe("contraproposta versionada integration (E7)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieSemPermissao: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1,$2,'Contra A','11999995501','ativo'),($3,$2,'Contra B','11999995502','ativo') on conflict (id) do nothing",
      [FORN_A, idsTeste.empresaA, FORN_B]
    );
    // Base vigente 10,0000 para o produto compartilhado.
    await executarSql(
      "insert into compras_importacoes_preco_base (id, empresa_id, nome_arquivo, hash_arquivo, status, total_linhas, criado_por) values ($1,$2,'base.xlsx',$3,'aplicada',1,(select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [IMPORTACAO, idsTeste.empresaA, "f".repeat(64)]
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
    await executarSql("delete from fornecedores where id = any($1)", [[FORN_A, FORN_B]]);
    await contexto.fechar();
  });

  function admin(method: "GET" | "POST", url: string, payload?: object, cookie = cookieAdmin) {
    return contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }
  function publico(method: "GET" | "POST", url: string, token: string, payload?: object) {
    return contexto.app.inject({ method, url, headers: { "x-rodada-token": token }, ...(payload ? { payload } : {}) });
  }

  /** Solicitacao de um item (o produto com base 10) e rodada de 1h para os fornecedores dados. */
  async function abrir(fornecedores: string[]): Promise<{ rodada: RodadaAberta; solicitacaoId: string }> {
    const criar = await admin("POST", "/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [{ produtoId: idsTeste.produto, quantidade: 2 }]
    });
    const solicitacaoId = json<{ data: { id: string } }>(criar).data.id;
    const solicitacao = json<{ data: { itens: Array<{ id: string }> } }>(
      await admin("GET", `/api/compras/solicitacoes/${solicitacaoId}`)
    ).data;
    const solicitacaoItemIds = solicitacao.itens.map((item) => item.id);
    const resposta = await admin("POST", "/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId,
      prazoRespostaHoras: 1,
      convites: fornecedores.map((fornecedorId) => ({ fornecedorId, solicitacaoItemIds }))
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return { rodada: json<{ data: RodadaAberta }>(resposta).data, solicitacaoId };
  }

  async function dto(token: string): Promise<PublicoDto> {
    const resposta = await publico("GET", "/api/rodada", token);
    expect(resposta.statusCode, resposta.body).toBe(200);
    return json<{ data: PublicoDto }>(resposta).data;
  }

  async function responder(token: string, valorUnitario: number) {
    const conviteItemId = (await dto(token)).itens[0]!.conviteItemId;
    const resposta = await publico("POST", "/api/rodada/responder", token, {
      itens: [{ conviteItemId, indisponivel: false, valorUnitario }]
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    return json<{ data: { versao: number } }>(resposta).data.versao;
  }

  const contrapropor = (rodada: RodadaAberta, convite: Convite, valorUnitario: number, cookie = cookieAdmin) =>
    admin(
      "POST",
      `/api/compras/rodadas/${rodada.id}/convites/${convite.id}/contraproposta`,
      { empresaId: idsTeste.empresaA, itens: [{ rodadaItemId: rodada.itens[0]!.id, valorUnitario }] },
      cookie
    );

  const statusDoConvite = async (conviteId: string) =>
    (await consultarUm<{ status: string }>("select status from compras_rodadas_convites where id = $1", [conviteId]))
      ?.status;

  it("fluxo completo: responde acima da base, contrapropoe, o fornecedor aceita e a compra automatica fecha", async () => {
    const { rodada } = await abrir([FORN_A]);
    const convite = rodada.convites[0]!;
    expect(await responder(convite.token, 12)).toBe(1);

    // Respondeu acima da base e nada comprou: o comprador e quem tem a vez.
    expect(await statusDoConvite(convite.id)).toBe("aguardando_comprador");
    const antes = await dto(convite.token);
    expect(antes.itens[0]?.situacao).toBe("em_analise");
    expect(antes.contraproposta).toBeNull();

    const contra = await contrapropor(rodada, convite, 9);
    expect(contra.statusCode, contra.body).toBe(200);
    expect(json<{ data: { versao: number } }>(contra).data.versao).toBe(2);
    // O convite volta a aberto com o MESMO token.
    expect(await statusDoConvite(convite.id)).toBe("aberto");

    const comContra = await dto(convite.token);
    expect(comContra.contraproposta).toMatchObject({ versao: 2 });
    expect(Number(comContra.contraproposta?.itens[0]?.valorUnitario)).toBe(9);
    // A "ultima proposta" continua sendo a DELE (v1 = 12), nunca a contraproposta do comprador.
    expect(comContra.ultimaProposta?.versao).toBe(1);
    expect(Number(comContra.ultimaProposta?.itens[0]?.valorUnitario)).toBe(12);

    // O comprador ve a contraproposta pendente na propria fila.
    const fila = json<{ data: { itens: Array<{ propostas: Array<{ contrapropostaUnitario: string | null }> }> } }>(
      await admin("GET", `/api/compras/rodadas/${rodada.id}/decisoes?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(Number(fila.itens[0]?.propostas[0]?.contrapropostaUnitario)).toBe(9);

    // O fornecedor aceita: versao 3 DELE, que atravessa o mesmo portao da compra automatica (9 <= 10).
    const aceite = await publico("POST", "/api/rodada/aceitar", convite.token);
    expect(aceite.statusCode, aceite.body).toBe(200);
    expect(json<{ data: { versao: number } }>(aceite).data.versao).toBe(3);

    const livro = await consultarUm<{ autores: string }>(
      "select string_agg(autor_tipo || ':' || versao, ',' order by versao) as autores from compras_propostas where convite_id = $1",
      [convite.id]
    );
    expect(livro?.autores).toBe("fornecedor:1,comprador:2,fornecedor:3");
    const adjudicacao = await consultarUm<{ modo: string; custo: string }>(
      "select a.modo, a.custo_final_unitario as custo from compras_adjudicacoes a join compras_rodadas_itens ri on ri.id = a.rodada_item_id where ri.rodada_id = $1",
      [rodada.id]
    );
    expect(adjudicacao?.modo).toBe("automatica");
    expect(Number(adjudicacao?.custo)).toBe(9);

    const depois = await dto(convite.token);
    expect(depois.itens[0]?.situacao).toBe("comprado");
    expect(depois.contraproposta).toBeNull();
  });

  it("resposta nova do fornecedor SUPERA a contraproposta: aceitar depois dela e 409", async () => {
    const { rodada } = await abrir([FORN_A]);
    const convite = rodada.convites[0]!;
    await responder(convite.token, 12);
    expect((await contrapropor(rodada, convite, 9)).statusCode).toBe(200);
    expect(await responder(convite.token, 11)).toBe(3);

    expect((await dto(convite.token)).contraproposta).toBeNull();
    const aceite = await publico("POST", "/api/rodada/aceitar", convite.token);
    expect(aceite.statusCode).toBe(409);
    expect(json<{ code?: string }>(aceite).code).toBe("SEM_CONTRAPROPOSTA");
  });

  it("isolamento: a contraproposta de A nao aparece para B, e B so sabe que o item foi comprado", async () => {
    const { rodada } = await abrir([FORN_A, FORN_B]);
    const [conviteA, conviteB] = [
      rodada.convites.find((convite) => convite.fornecedorId === FORN_A)!,
      rodada.convites.find((convite) => convite.fornecedorId === FORN_B)!
    ];
    await responder(conviteA.token, 12);
    await responder(conviteB.token, 13);
    expect((await contrapropor(rodada, conviteA, 9)).statusCode).toBe(200);

    const paraB = await publico("GET", "/api/rodada", conviteB.token);
    expect(json<{ data: PublicoDto }>(paraB).data.contraproposta).toBeNull();
    expect(paraB.body).not.toContain("Contra A");
    expect(paraB.body).not.toContain("9.00");

    // A aceita e compra; B passa a ver "comprado", sem quem nem quanto.
    expect((await publico("POST", "/api/rodada/aceitar", conviteA.token)).statusCode).toBe(200);
    const depoisB = await publico("GET", "/api/rodada", conviteB.token);
    expect(json<{ data: PublicoDto }>(depoisB).data.itens[0]?.situacao).toBe("comprado");
    expect(depoisB.body).not.toContain("Contra A");
    expect(depoisB.body).not.toContain("9.00");
    expect(depoisB.body.toLowerCase()).not.toContain("precobase");
    // O comprador nao pode mais contrapropor a B para o item que ja foi vendido.
    const tardia = await contrapropor(rodada, conviteB, 8);
    expect(tardia.statusCode).toBe(409);
    expect(json<{ code?: string }>(tardia).code).toBe("ITEM_JA_ADJUDICADO");
  });

  it("recusa: sem permissao, sem resposta do fornecedor, valor invalido e item de outro convite", async () => {
    const { rodada } = await abrir([FORN_A]);
    const convite = rodada.convites[0]!;
    expect((await contrapropor(rodada, convite, 9, cookieSemPermissao)).statusCode).toBe(403);

    // O fornecedor ainda nao respondeu: nao ha o que contrapor.
    const semResposta = await contrapropor(rodada, convite, 9);
    expect(semResposta.statusCode).toBe(422);
    expect(json<{ code?: string }>(semResposta).code).toBe("SEM_RESPOSTA_DO_FORNECEDOR");

    await responder(convite.token, 12);
    expect((await contrapropor(rodada, convite, 0)).statusCode).toBe(400);
    expect((await contrapropor(rodada, convite, -3)).statusCode).toBe(400);
    const foraDoConvite = await admin(
      "POST",
      `/api/compras/rodadas/${rodada.id}/convites/${convite.id}/contraproposta`,
      {
        empresaId: idsTeste.empresaA,
        itens: [{ rodadaItemId: idsTeste.empresaA, valorUnitario: 9 }]
      }
    );
    expect(foraDoConvite.statusCode).toBe(400);
    expect(json<{ code?: string }>(foraDoConvite).code).toBe("ITEM_FORA_DO_CONVITE");
  });

  it("empresa errada nao acha a rodada nem o convite", async () => {
    const { rodada } = await abrir([FORN_A]);
    const convite = rodada.convites[0]!;
    await responder(convite.token, 12);
    const resposta = await admin("POST", `/api/compras/rodadas/${rodada.id}/convites/${convite.id}/contraproposta`, {
      empresaId: idsTeste.empresaB,
      itens: [{ rodadaItemId: rodada.itens[0]!.id, valorUnitario: 9 }]
    });
    expect([403, 404]).toContain(resposta.statusCode);
    const total = await consultarUm<{ total: number }>(
      "select count(*)::int as total from compras_propostas where convite_id = $1 and autor_tipo = 'comprador'",
      [convite.id]
    );
    expect(total?.total).toBe(0);
  });

  it("depois do fechamento nao se contrapropoe (422) nem se aceita (410)", async () => {
    const { rodada, solicitacaoId } = await abrir([FORN_A]);
    const convite = rodada.convites[0]!;
    await responder(convite.token, 12);
    expect((await contrapropor(rodada, convite, 9)).statusCode).toBe(200);
    await fecharRodadaPorPrazo(
      { id: rodada.id, empresaId: idsTeste.empresaA, solicitacaoId },
      new Date(Date.now() + 2 * HORA)
    );

    const contra = await contrapropor(rodada, convite, 8);
    expect(contra.statusCode).toBe(422);
    expect(json<{ code?: string }>(contra).code).toBe("RODADA_NAO_ABERTA");
    const aceite = await publico("POST", "/api/rodada/aceitar", convite.token);
    expect(aceite.statusCode).toBe(410);
    // O fornecedor nao ve contraproposta de rodada encerrada.
    expect((await dto(convite.token)).contraproposta).toBeNull();
  });

  it("varias contrapropostas seguidas: o fornecedor ve a soma por item e aceitar leva a mais recente", async () => {
    const { rodada } = await abrir([FORN_A]);
    const convite = rodada.convites[0]!;
    await responder(convite.token, 12);
    expect((await contrapropor(rodada, convite, 11)).statusCode).toBe(200);
    expect((await contrapropor(rodada, convite, 9.5)).statusCode).toBe(200);
    const visto = await dto(convite.token);
    expect(visto.contraproposta?.versao).toBe(3);
    expect(Number(visto.contraproposta?.itens[0]?.valorUnitario)).toBe(9.5);
    expect((await publico("POST", "/api/rodada/aceitar", convite.token)).statusCode).toBe(200);
    const custo = await consultarUm<{ custo: string }>(
      "select a.custo_final_unitario as custo from compras_adjudicacoes a join compras_rodadas_itens ri on ri.id = a.rodada_item_id where ri.rodada_id = $1",
      [rodada.id]
    );
    expect(Number(custo?.custo)).toBe(9.5);
  });
});
