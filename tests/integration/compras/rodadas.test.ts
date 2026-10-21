import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

const FORN_OK_A = "11111111-1111-4111-8111-1111111118a1";
const FORN_OK_B = "11111111-1111-4111-8111-1111111118a2";
const FORN_INATIVO = "11111111-1111-4111-8111-1111111118a3";
const FORN_SEM_ZAP = "11111111-1111-4111-8111-1111111118a4";
const PRECO_BASE = "11111111-1111-4111-8111-1111111118b1";
const IMPORTACAO = "11111111-1111-4111-8111-1111111118c1";
const IMPORTACAO_ITEM = "11111111-1111-4111-8111-1111111118c2";

type SolicitacaoDetalhe = { id: string; itens: Array<{ id: string; produtoId: string }> };

describe("compras rodadas integration (E3)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");

    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1,$2,$3,$4,'ativo'),($5,$2,$6,$7,'ativo'),($8,$2,$9,$10,'inativo'),($11,$2,$12,null,'ativo') on conflict (id) do nothing",
      [
        FORN_OK_A,
        idsTeste.empresaA,
        "Fornecedor rodada A",
        "11999990001",
        FORN_OK_B,
        "Fornecedor rodada B",
        "11999990002",
        FORN_INATIVO,
        "Fornecedor inativo",
        "11999990003",
        FORN_SEM_ZAP,
        "Fornecedor sem whatsapp"
      ]
    );
    // Cadeia minima de importacao -> preco-base vigente do produto, para provar o snapshot do envelope.
    await executarSql(
      "insert into compras_importacoes_preco_base (id, empresa_id, nome_arquivo, hash_arquivo, status, total_linhas, criado_por) values ($1,$2,'base.xlsx',$3,'aplicada',1,(select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [IMPORTACAO, idsTeste.empresaA, "b".repeat(64)]
    );
    await executarSql(
      "insert into compras_importacoes_preco_base_itens (id, importacao_id, numero_linha, descricao_informada, descricao_normalizada, valor_informado, produto_id, resultado) values ($1,$2,1,'Produto','produto','7.5000',$3,'correspondencia') on conflict (id) do nothing",
      [IMPORTACAO_ITEM, IMPORTACAO, idsTeste.produto]
    );
    await executarSql(
      "insert into produtos_precos_base (id, empresa_id, produto_id, valor, origem, importacao_item_id, valido_desde, criado_por) values ($1,$2,$3,'7.5000','importacao',$4, now(), (select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [PRECO_BASE, idsTeste.empresaA, idsTeste.produto, IMPORTACAO_ITEM]
    );
  }, 120_000);

  afterAll(async () => {
    // Ordem ditada pelas FKs restrict: rodada (cascata para itens/convites) antes da solicitacao e
    // antes do preco-base; importacao por ultimo.
    await executarSql("delete from compras_rodadas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_solicitacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from produtos_precos_base where id = $1", [PRECO_BASE]);
    await executarSql("delete from compras_importacoes_preco_base_itens where id = $1", [IMPORTACAO_ITEM]);
    await executarSql("delete from compras_importacoes_preco_base where id = $1", [IMPORTACAO]);
    await executarSql("delete from fornecedores where id = any($1)", [
      [FORN_OK_A, FORN_OK_B, FORN_INATIVO, FORN_SEM_ZAP]
    ]);
    await contexto.fechar();
  });

  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }
  function get(url: string) {
    return contexto.app.inject({ method: "GET", url, headers: { cookie: cookieAdmin } });
  }

  async function criarSolicitacao(): Promise<SolicitacaoDetalhe> {
    const criar = await post("/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [{ produtoId: idsTeste.produto, quantidade: 4 }]
    });
    expect(criar.statusCode, criar.body).toBe(201);
    const id = json<{ data: { id: string } }>(criar).data.id;
    return json<{ data: SolicitacaoDetalhe }>(await get(`/api/compras/solicitacoes/${id}`)).data;
  }

  it("abre rodada com dois fornecedores, congela base e manda solicitacao para em_cotacao", async () => {
    const solicitacao = await criarSolicitacao();
    const itemId = solicitacao.itens[0]!.id;

    const abrir = await post("/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId: solicitacao.id,
      convites: [
        { fornecedorId: FORN_OK_A, solicitacaoItemIds: [itemId] },
        { fornecedorId: FORN_OK_B, solicitacaoItemIds: [itemId] }
      ]
    });
    expect(abrir.statusCode, abrir.body).toBe(201);
    const rodada = json<{
      data: {
        id: string;
        status: string;
        itens: Array<{ precoBaseValor: string | null; quantidade: string }>;
        convites: Array<{ fornecedorId: string; token?: string; status: string }>;
      };
    }>(abrir).data;
    expect(rodada.status).toBe("aberta");
    expect(rodada.itens[0]?.quantidade).toBe("4.000");
    expect(rodada.itens[0]?.precoBaseValor).toBe("7.5000");
    expect(rodada.convites).toHaveLength(2);
    // Token em claro sai uma unica vez, na abertura.
    expect(rodada.convites.every((convite) => typeof convite.token === "string" && convite.token.length === 64)).toBe(
      true
    );

    // Solicitacao foi para em_cotacao.
    await expect(
      consultarUm("select id from compras_solicitacoes where id = $1 and status = 'em_cotacao'", [solicitacao.id])
    ).resolves.toBeTruthy();
    // So o hash vive no banco (nunca o token em claro).
    const convite = await consultarUm<{ token_hash: string }>(
      "select token_hash from compras_rodadas_convites where rodada_id = $1 limit 1",
      [rodada.id]
    );
    expect(convite?.token_hash).toMatch(/^[0-9a-f]{64}$/);

    // Segunda rodada da mesma solicitacao e barrada (nao esta mais em rascunho).
    const segunda = await post("/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId: solicitacao.id,
      convites: [{ fornecedorId: FORN_OK_A, solicitacaoItemIds: [itemId] }]
    });
    expect(segunda.statusCode).toBe(400);
    expect(json<{ code?: string }>(segunda).code).toBe("SOLICITACAO_NAO_ABRIVEL");
  });

  it("bloqueia convite de fornecedor inativo ou sem whatsapp (422 nomeando o motivo)", async () => {
    const solicitacao = await criarSolicitacao();
    const itemId = solicitacao.itens[0]!.id;

    const inativo = await post("/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId: solicitacao.id,
      convites: [{ fornecedorId: FORN_INATIVO, solicitacaoItemIds: [itemId] }]
    });
    expect(inativo.statusCode, inativo.body).toBe(422);
    expect(json<{ code?: string }>(inativo).code).toBe("FORNECEDOR_NAO_CONVIDAVEL");

    const semZap = await post("/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId: solicitacao.id,
      convites: [{ fornecedorId: FORN_SEM_ZAP, solicitacaoItemIds: [itemId] }]
    });
    expect(semZap.statusCode, semZap.body).toBe(422);
    expect(json<{ title?: string }>(semZap).title).toContain("WhatsApp");

    // Nenhuma rodada foi aberta.
    await expect(
      consultarUm("select id from compras_rodadas where solicitacao_id = $1", [solicitacao.id])
    ).resolves.toBeNull();
  });

  it("recusa item que nao pertence a solicitacao", async () => {
    const solicitacao = await criarSolicitacao();
    const resposta = await post("/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId: solicitacao.id,
      convites: [{ fornecedorId: FORN_OK_A, solicitacaoItemIds: [idsTeste.empresaA] }]
    });
    expect(resposta.statusCode).toBe(400);
    expect(json<{ code?: string }>(resposta).code).toBe("ITEM_FORA_DA_SOLICITACAO");
  });

  it("detalha a rodada e registra o envio do convite", async () => {
    const solicitacao = await criarSolicitacao();
    const itemId = solicitacao.itens[0]!.id;
    const abrir = await post("/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId: solicitacao.id,
      convites: [{ fornecedorId: FORN_OK_A, solicitacaoItemIds: [itemId] }]
    });
    const rodada = json<{ data: { id: string; convites: Array<{ id: string }> } }>(abrir).data;
    const conviteId = rodada.convites[0]!.id;

    const detalhe = json<{ data: { itens: unknown[]; convites: Array<{ id: string; rodadaItemIds: string[] }> } }>(
      await get(`/api/compras/rodadas/${rodada.id}?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(detalhe.itens).toHaveLength(1);
    expect(detalhe.convites[0]?.rodadaItemIds).toHaveLength(1);

    const enviar = await post(`/api/compras/rodadas/${rodada.id}/convites/${conviteId}/enviar`, {
      empresaId: idsTeste.empresaA,
      canal: "whatsapp"
    });
    expect(enviar.statusCode, enviar.body).toBe(204);
    await expect(
      consultarUm("select id from compras_rodadas_convites where id = $1 and enviado_em is not null", [conviteId])
    ).resolves.toBeTruthy();
  });
});
