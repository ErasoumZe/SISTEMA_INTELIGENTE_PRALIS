import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fecharRodadaPorPrazo } from "../../../api/src/compras/compras-fechamento.service.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

const FORN_A = "11111111-1111-4111-8111-11111111c001";
const FORN_B = "11111111-1111-4111-8111-11111111c002";
const PRODUTO_2 = "11111111-1111-4111-8111-11111111c003";
const IMPORTACAO = "11111111-1111-4111-8111-11111111c004";
const IMPORTACAO_ITEM = "11111111-1111-4111-8111-11111111c005";
const PRECO_BASE = "11111111-1111-4111-8111-11111111c006";

type Convite = { fornecedorId: string; token: string };
type RodadaAberta = { id: string; convites: Convite[] };
type DecisaoItem = {
  rodadaItemId: string;
  produtoId: string;
  motivo: string;
  propostas: Array<{ propostaItemId: string; fornecedorId: string; custoFinalUnitario: string | null }>;
};
type Decisoes = { totalItens: number; itensComprados: number; itens: DecisaoItem[] };

const HORA = 3_600_000;

describe("fila de decisao e excecao integration (E6)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieSemPermissao: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1,$2,'Decisao A','11999994401','ativo'),($3,$2,'Decisao B','11999994402','ativo') on conflict (id) do nothing",
      [FORN_A, idsTeste.empresaA, FORN_B]
    );
    await executarSql(
      "insert into produtos (id, empresa_id, grupo_mercadoria_id, unidade_medida_id, codigo, descricao) values ($1,$2,$3,$4,'PROD-DEC-2','Produto sem base') on conflict (id) do nothing",
      [PRODUTO_2, idsTeste.empresaA, idsTeste.grupoMercadoriaInsumos, idsTeste.unidade]
    );
    await executarSql(
      "insert into compras_importacoes_preco_base (id, empresa_id, nome_arquivo, hash_arquivo, status, total_linhas, criado_por) values ($1,$2,'base.xlsx',$3,'aplicada',1,(select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [IMPORTACAO, idsTeste.empresaA, "e".repeat(64)]
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
    await executarSql("delete from produtos_precos_base where empresa_id = $1 and produto_id = any($2)", [
      idsTeste.empresaA,
      [idsTeste.produto, PRODUTO_2]
    ]);
    await executarSql("delete from compras_rodadas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_solicitacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_importacoes_preco_base_itens where id = $1", [IMPORTACAO_ITEM]);
    await executarSql("delete from compras_importacoes_preco_base where id = $1", [IMPORTACAO]);
    await executarSql("delete from produtos where id = $1", [PRODUTO_2]);
    await executarSql("delete from fornecedores where id = any($1)", [[FORN_A, FORN_B]]);
    await contexto.fechar();
  });

  function enviar(method: "GET" | "POST", url: string, cookie: string, payload?: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }
  function getPublico(token: string) {
    return contexto.app.inject({ method: "GET", url: "/api/rodada", headers: { "x-rodada-token": token } });
  }
  function responder(token: string, payload: object) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/rodada/responder",
      headers: { "x-rodada-token": token },
      payload
    });
  }

  async function abrir(fornecedores: string[]): Promise<{ rodada: RodadaAberta; solicitacaoId: string }> {
    const criar = await enviar("POST", "/api/compras/solicitacoes", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      itens: [
        { produtoId: idsTeste.produto, quantidade: 2 },
        { produtoId: PRODUTO_2, quantidade: 1 }
      ]
    });
    const solicitacaoId = json<{ data: { id: string } }>(criar).data.id;
    const solicitacao = json<{ data: { itens: Array<{ id: string }> } }>(
      await enviar("GET", `/api/compras/solicitacoes/${solicitacaoId}`, cookieAdmin)
    ).data;
    const solicitacaoItemIds = solicitacao.itens.map((item) => item.id);
    const resposta = await enviar("POST", "/api/compras/rodadas", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      solicitacaoId,
      prazoRespostaHoras: 1,
      convites: fornecedores.map((fornecedorId) => ({ fornecedorId, solicitacaoItemIds }))
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return { rodada: json<{ data: RodadaAberta }>(resposta).data, solicitacaoId };
  }

  /** Responde cada item do convite pelo nome do produto (o "sem base" e o segundo). */
  async function responderPrecos(
    token: string,
    valores: { primeiro: number | "indisponivel"; segundo: number | "indisponivel" }
  ) {
    const dto = json<{ data: { itens: Array<{ conviteItemId: string; descricaoProduto: string }> } }>(
      await getPublico(token)
    ).data;
    const itens = dto.itens.map((item) => {
      const valor = item.descricaoProduto === "Produto sem base" ? valores.segundo : valores.primeiro;
      return valor === "indisponivel"
        ? { conviteItemId: item.conviteItemId, indisponivel: true }
        : { conviteItemId: item.conviteItemId, indisponivel: false, valorUnitario: valor };
    });
    const resposta = await responder(token, { itens });
    expect(resposta.statusCode, resposta.body).toBe(200);
  }

  async function fila(rodadaId: string): Promise<Decisoes> {
    const resposta = await enviar(
      "GET",
      `/api/compras/rodadas/${rodadaId}/decisoes?empresaId=${idsTeste.empresaA}`,
      cookieAdmin
    );
    expect(resposta.statusCode, resposta.body).toBe(200);
    return json<{ data: Decisoes }>(resposta).data;
  }

  function aprovar(rodadaId: string, propostaItemId: string, cookie = cookieAdmin) {
    return enviar("POST", `/api/compras/rodadas/${rodadaId}/decisoes/aprovar`, cookie, {
      empresaId: idsTeste.empresaA,
      propostaItemId
    });
  }

  const doProduto = (decisoes: Decisoes, produtoId: string) =>
    decisoes.itens.find((item) => item.produtoId === produtoId)!;

  it("a fila lista o que ficou sem vencedor, com o motivo e o que cada fornecedor ofereceu", async () => {
    const { rodada } = await abrir([FORN_A]);
    await responderPrecos(rodada.convites[0]!.token, { primeiro: 12, segundo: 5 });
    const decisoes = await fila(rodada.id);
    expect(decisoes).toMatchObject({ totalItens: 2, itensComprados: 0 });
    const acima = doProduto(decisoes, idsTeste.produto);
    expect(acima.motivo).toBe("acima_da_base");
    expect(Number(acima.propostas[0]?.custoFinalUnitario)).toBe(12);
    expect(doProduto(decisoes, PRODUTO_2).motivo).toBe("sem_base");
  });

  it("aprovar excecao exige a permissao propria (403 sem ela)", async () => {
    const { rodada } = await abrir([FORN_A]);
    await responderPrecos(rodada.convites[0]!.token, { primeiro: 12, segundo: 5 });
    const item = doProduto(await fila(rodada.id), idsTeste.produto);
    const resposta = await aprovar(rodada.id, item.propostas[0]!.propostaItemId, cookieSemPermissao);
    expect(resposta.statusCode).toBe(403);
  });

  it("aprova a excecao: pedido confirmado, adjudicacao do comprador, base intacta; o mesmo item nao vende duas vezes", async () => {
    const { rodada } = await abrir([FORN_A]);
    await responderPrecos(rodada.convites[0]!.token, { primeiro: 12, segundo: 5 });
    const item = doProduto(await fila(rodada.id), idsTeste.produto);
    const propostaItemId = item.propostas[0]!.propostaItemId;

    const resposta = await aprovar(rodada.id, propostaItemId);
    expect(resposta.statusCode, resposta.body).toBe(200);
    const { pedidoId } = json<{ data: { pedidoId: string } }>(resposta).data;

    const pedido = await consultarUm<{ status: string; tipo: string }>(
      "select status, tipo from pedidos where id = $1",
      [pedidoId]
    );
    expect(pedido).toMatchObject({ status: "confirmado", tipo: "rodada" });
    const adjudicacao = await consultarUm<{ modo: string; aprovado_por: string | null; custo: string }>(
      "select modo, aprovado_por, custo_final_unitario as custo from compras_adjudicacoes where rodada_item_id = $1",
      [item.rodadaItemId]
    );
    expect(adjudicacao?.modo).toBe("comprador");
    expect(adjudicacao?.aprovado_por).toBeTruthy();
    expect(Number(adjudicacao?.custo)).toBe(12);
    // O evento da confirmacao tem o aprovador como autor.
    const evento = await consultarUm<{ criado_por: string | null }>(
      "select criado_por from pedidos_eventos where pedido_id = $1 and status = 'confirmado'",
      [pedidoId]
    );
    expect(evento?.criado_por).toBeTruthy();
    // Excecao nao vira base: a vigente continua a importada (10).
    const base = await consultarUm<{ valor: string; origem: string }>(
      "select valor, origem from produtos_precos_base where empresa_id = $1 and produto_id = $2 and valido_ate is null",
      [idsTeste.empresaA, idsTeste.produto]
    );
    expect(Number(base?.valor)).toBe(10);
    expect(base?.origem).toBe("importacao");

    const segunda = await aprovar(rodada.id, propostaItemId);
    expect(segunda.statusCode).toBe(409);
    expect(json<{ code?: string }>(segunda).code).toBe("ITEM_JA_ADJUDICADO");
    const depois = await fila(rodada.id);
    expect(depois.itensComprados).toBe(1);
    expect(depois.itens.some((linha) => linha.produtoId === idsTeste.produto)).toBe(false);
  });

  it("recusa item que o fornecedor disse nao ter (422)", async () => {
    const { rodada } = await abrir([FORN_A]);
    await responderPrecos(rodada.convites[0]!.token, { primeiro: "indisponivel", segundo: 5 });
    const item = doProduto(await fila(rodada.id), idsTeste.produto);
    expect(item.motivo).toBe("indisponivel");
    const resposta = await aprovar(rodada.id, item.propostas[0]!.propostaItemId);
    expect(resposta.statusCode).toBe(422);
    expect(json<{ code?: string }>(resposta).code).toBe("ITEM_INDISPONIVEL");
  });

  it("recusa proposta superada por uma resposta mais nova do fornecedor (409)", async () => {
    const { rodada } = await abrir([FORN_A]);
    const token = rodada.convites[0]!.token;
    await responderPrecos(token, { primeiro: 12, segundo: 5 });
    const velha = doProduto(await fila(rodada.id), idsTeste.produto).propostas[0]!.propostaItemId;
    await responderPrecos(token, { primeiro: 11, segundo: 5 });
    const resposta = await aprovar(rodada.id, velha);
    expect(resposta.statusCode).toBe(409);
    expect(json<{ code?: string }>(resposta).code).toBe("PROPOSTA_SUPERADA");
    // A fila mostra so a versao nova.
    const atual = doProduto(await fila(rodada.id), idsTeste.produto);
    expect(atual.propostas).toHaveLength(1);
    expect(Number(atual.propostas[0]?.custoFinalUnitario)).toBe(11);
  });

  it("duas aprovacoes simultaneas de fornecedores diferentes para o MESMO item: so uma vence", async () => {
    const { rodada } = await abrir([FORN_A, FORN_B]);
    for (const convite of rodada.convites) await responderPrecos(convite.token, { primeiro: 12, segundo: 5 });
    const item = doProduto(await fila(rodada.id), idsTeste.produto);
    expect(item.propostas).toHaveLength(2);

    const respostas = await Promise.all(item.propostas.map((proposta) => aprovar(rodada.id, proposta.propostaItemId)));
    expect(respostas.map((resposta) => resposta.statusCode).sort()).toEqual([200, 409]);
    const total = await consultarUm<{ total: number }>(
      "select count(*)::int as total from compras_adjudicacoes where rodada_item_id = $1",
      [item.rodadaItemId]
    );
    expect(total?.total).toBe(1);
  });

  it("depois do fechamento, aprovar o ultimo item que faltava leva a solicitacao a comprada", async () => {
    const { rodada, solicitacaoId } = await abrir([FORN_A]);
    await responderPrecos(rodada.convites[0]!.token, { primeiro: 12, segundo: 5 });
    await fecharRodadaPorPrazo(
      { id: rodada.id, empresaId: idsTeste.empresaA, solicitacaoId },
      new Date(Date.now() + 2 * HORA)
    );
    const situacao = () =>
      consultarUm<{ status: string; encerrada_em: string | null }>(
        "select status, encerrada_em from compras_solicitacoes where id = $1",
        [solicitacaoId]
      );
    expect((await situacao())?.status).toBe("parcialmente_comprada");

    const itens = (await fila(rodada.id)).itens;
    expect(itens).toHaveLength(2);
    expect((await aprovar(rodada.id, itens[0]!.propostas[0]!.propostaItemId)).statusCode).toBe(200);
    expect((await situacao())?.status).toBe("parcialmente_comprada");
    expect((await aprovar(rodada.id, itens[1]!.propostas[0]!.propostaItemId)).statusCode).toBe(200);
    const final = await situacao();
    expect(final?.status).toBe("comprada");
    expect(final?.encerrada_em).not.toBeNull();
  });

  it("encerrar solicitacao: so depois do fechamento; depois disso nao se aprova mais nada", async () => {
    const { rodada, solicitacaoId } = await abrir([FORN_A]);
    await responderPrecos(rodada.convites[0]!.token, { primeiro: 12, segundo: 5 });
    const encerrar = () =>
      enviar("POST", `/api/compras/solicitacoes/${solicitacaoId}/encerrar`, cookieAdmin, {
        empresaId: idsTeste.empresaA
      });

    // Rodada ainda aberta: ainda ha resposta por vir.
    const cedo = await encerrar();
    expect(cedo.statusCode).toBe(422);
    expect(json<{ code?: string }>(cedo).code).toBe("SOLICITACAO_NAO_ENCERRAVEL");

    const propostaItemId = doProduto(await fila(rodada.id), idsTeste.produto).propostas[0]!.propostaItemId;
    await fecharRodadaPorPrazo(
      { id: rodada.id, empresaId: idsTeste.empresaA, solicitacaoId },
      new Date(Date.now() + 2 * HORA)
    );
    expect((await encerrar()).statusCode).toBe(204);
    const solicitacao = await consultarUm<{ status: string; encerrada_em: string | null }>(
      "select status, encerrada_em from compras_solicitacoes where id = $1",
      [solicitacaoId]
    );
    expect(solicitacao?.status).toBe("encerrada");
    expect(solicitacao?.encerrada_em).not.toBeNull();

    // Encerrada: nem encerrar de novo, nem aprovar o que sobrou.
    expect((await encerrar()).statusCode).toBe(422);
    const tardia = await aprovar(rodada.id, propostaItemId);
    expect(tardia.statusCode).toBe(422);
    expect(json<{ code?: string }>(tardia).code).toBe("SOLICITACAO_ENCERRADA");
  });
});
