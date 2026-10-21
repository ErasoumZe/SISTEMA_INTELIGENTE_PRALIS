import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fecharRodadaPorPrazo, fecharRodadasVencidas } from "../../../api/src/compras/compras-fechamento.service.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

const FORN = "11111111-1111-4111-8111-11111111b001";
const PRODUTO_2 = "11111111-1111-4111-8111-11111111b002";
const IMPORTACAO = "11111111-1111-4111-8111-11111111b003";
const IMPORTACAO_ITEM = "11111111-1111-4111-8111-11111111b004";
const PRECO_BASE = "11111111-1111-4111-8111-11111111b005";

type SolicitacaoDetalhe = { id: string; itens: Array<{ id: string; produtoId: string }> };
type RodadaAberta = { id: string; convites: Array<{ token: string }> };

const HORA = 3_600_000;

describe("fechamento da rodada por prazo integration (E6)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1,$2,'Fechamento A','11999993301','ativo') on conflict (id) do nothing",
      [FORN, idsTeste.empresaA]
    );
    await executarSql(
      "insert into produtos (id, empresa_id, grupo_mercadoria_id, unidade_medida_id, codigo, descricao) values ($1,$2,$3,$4,'PROD-FECH-2','Produto sem base') on conflict (id) do nothing",
      [PRODUTO_2, idsTeste.empresaA, idsTeste.grupoMercadoriaInsumos, idsTeste.unidade]
    );
    // Base vigente 10,0000 so para o produto compartilhado; o PRODUTO_2 nao tem base.
    await executarSql(
      "insert into compras_importacoes_preco_base (id, empresa_id, nome_arquivo, hash_arquivo, status, total_linhas, criado_por) values ($1,$2,'base.xlsx',$3,'aplicada',1,(select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [IMPORTACAO, idsTeste.empresaA, "d".repeat(64)]
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
    // A base de origem 'rodada' aponta para a rodada (restrict): sai antes dela.
    await executarSql("delete from produtos_precos_base where empresa_id = $1 and produto_id = any($2)", [
      idsTeste.empresaA,
      [idsTeste.produto, PRODUTO_2]
    ]);
    await executarSql("delete from compras_rodadas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_solicitacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_importacoes_preco_base_itens where id = $1", [IMPORTACAO_ITEM]);
    await executarSql("delete from compras_importacoes_preco_base where id = $1", [IMPORTACAO]);
    await executarSql("delete from produtos where id = $1", [PRODUTO_2]);
    await executarSql("delete from fornecedores where id = $1", [FORN]);
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

  /** Rodada de 1h com os dois produtos para o mesmo fornecedor. */
  async function abrir(): Promise<{ rodada: RodadaAberta; solicitacaoId: string; solicitacaoItemIds: string[] }> {
    const criar = await post("/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [
        { produtoId: idsTeste.produto, quantidade: 2 },
        { produtoId: PRODUTO_2, quantidade: 1 }
      ]
    });
    const solicitacaoId = json<{ data: { id: string } }>(criar).data.id;
    const solicitacao = json<{ data: SolicitacaoDetalhe }>(
      await contexto.app.inject({
        method: "GET",
        url: `/api/compras/solicitacoes/${solicitacaoId}`,
        headers: { cookie: cookieAdmin }
      })
    ).data;
    const solicitacaoItemIds = solicitacao.itens.map((item) => item.id);
    const abrirResposta = await post("/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId,
      prazoRespostaHoras: 1,
      convites: [{ fornecedorId: FORN, solicitacaoItemIds }]
    });
    expect(abrirResposta.statusCode, abrirResposta.body).toBe(201);
    return { rodada: json<{ data: RodadaAberta }>(abrirResposta).data, solicitacaoId, solicitacaoItemIds };
  }

  async function responderPrecos(token: string, valores: { primeiro: number; segundo: number }) {
    const dto = json<{ data: { itens: Array<{ conviteItemId: string; descricaoProduto: string }> } }>(
      await getPublico("/api/rodada", token)
    ).data;
    const itens = dto.itens.map((item) => ({
      conviteItemId: item.conviteItemId,
      indisponivel: false,
      valorUnitario: item.descricaoProduto === "Produto sem base" ? valores.segundo : valores.primeiro
    }));
    const resposta = await responder(token, { itens });
    expect(resposta.statusCode, resposta.body).toBe(200);
  }

  async function rodadaDe(rodadaId: string) {
    return consultarUm<{
      status: string;
      motivo_fechamento: string | null;
      fechada_por: string | null;
      fechada_em: string | null;
    }>("select status, motivo_fechamento, fechada_por, fechada_em from compras_rodadas where id = $1", [rodadaId]);
  }

  it("nao fecha antes do prazo", async () => {
    const { rodada } = await abrir();
    const resultado = await fecharRodadaPorPrazo(
      { id: rodada.id, empresaId: idsTeste.empresaA, solicitacaoId: await solicitacaoDa(rodada.id) },
      new Date()
    );
    expect(resultado.fechada).toBe(false);
    expect((await rodadaDe(rodada.id))?.status).toBe("aberta");
  });

  async function solicitacaoDa(rodadaId: string): Promise<string> {
    const linha = await consultarUm<{ solicitacao_id: string }>(
      "select solicitacao_id from compras_rodadas where id = $1",
      [rodadaId]
    );
    return linha!.solicitacao_id;
  }

  it("fecha no prazo: comprado fica comprado, sem-base cai na fila, solicitacao parcial, base so do que foi comprado", async () => {
    const { rodada, solicitacaoId } = await abrir();
    const token = rodada.convites[0]!.token;
    // 8 <= base 10 -> compra sozinha; o segundo produto nao tem base -> vai para decisao.
    await responderPrecos(token, { primeiro: 8, segundo: 5 });

    const depois = new Date(Date.now() + 2 * HORA);
    const resultado = await fecharRodadaPorPrazo(
      { id: rodada.id, empresaId: idsTeste.empresaA, solicitacaoId },
      depois
    );
    expect(resultado).toMatchObject({ fechada: true, comprados: 1, pendentes: 1, basesAtualizadas: 1 });

    const fechada = await rodadaDe(rodada.id);
    expect(fechada?.status).toBe("fechada");
    expect(fechada?.motivo_fechamento).toBe("prazo");
    expect(fechada?.fechada_por).toBeNull();

    const convite = await consultarUm<{ status: string }>(
      "select status from compras_rodadas_convites where rodada_id = $1",
      [rodada.id]
    );
    expect(convite?.status).toBe("encerrado");

    const solicitacao = await consultarUm<{ status: string; encerrada_em: string | null }>(
      "select status, encerrada_em from compras_solicitacoes where id = $1",
      [solicitacaoId]
    );
    expect(solicitacao?.status).toBe("parcialmente_comprada");
    expect(solicitacao?.encerrada_em).toBeNull();

    // O comprado permanece comprado: pedido confirmado e adjudicacao intactos.
    const pedido = await consultarUm<{ status: string }>("select status from pedidos where rodada_id = $1", [
      rodada.id
    ]);
    expect(pedido?.status).toBe("confirmado");

    // Decisao 12: a base vigente agora e o custo pago (8), e a anterior (10) ficou no historico.
    const vigente = await consultarUm<{ valor: string; origem: string; rodada_id: string | null }>(
      "select valor, origem, rodada_id from produtos_precos_base where empresa_id = $1 and produto_id = $2 and valido_ate is null",
      [idsTeste.empresaA, idsTeste.produto]
    );
    expect(Number(vigente?.valor)).toBe(8);
    expect(vigente?.origem).toBe("rodada");
    expect(vigente?.rodada_id).toBe(rodada.id);
    const anterior = await consultarUm<{ valido_ate: string | null }>(
      "select valido_ate from produtos_precos_base where id = $1",
      [PRECO_BASE]
    );
    expect(anterior?.valido_ate).not.toBeNull();
    // O produto sem compra nao ganha base: oferta nao comprada nao aperta a rodada seguinte.
    await expect(
      consultarUm("select id from produtos_precos_base where empresa_id = $1 and produto_id = $2", [
        idsTeste.empresaA,
        PRODUTO_2
      ])
    ).resolves.toBeNull();

    // Decisao 14: o que sobrou cai no sino do Comprador.
    await expect(
      consultarUm("select id from notificacoes where tipo = 'compras_decisao_pendente' and referencia_id = $1", [
        rodada.id
      ])
    ).resolves.toBeTruthy();
  });

  it("e idempotente: um segundo tick nao fecha de novo nem troca a base outra vez", async () => {
    const { rodada, solicitacaoId } = await abrir();
    await responderPrecos(rodada.convites[0]!.token, { primeiro: 7, segundo: 5 });
    const depois = new Date(Date.now() + 2 * HORA);
    const alvo = { id: rodada.id, empresaId: idsTeste.empresaA, solicitacaoId };
    expect((await fecharRodadaPorPrazo(alvo, depois)).fechada).toBe(true);
    const bases = await consultarUm<{ total: string }>(
      "select count(*)::int as total from produtos_precos_base where empresa_id = $1 and produto_id = $2",
      [idsTeste.empresaA, idsTeste.produto]
    );

    expect((await fecharRodadaPorPrazo(alvo, depois)).fechada).toBe(false);
    const basesDepois = await consultarUm<{ total: string }>(
      "select count(*)::int as total from produtos_precos_base where empresa_id = $1 and produto_id = $2",
      [idsTeste.empresaA, idsTeste.produto]
    );
    expect(Number(basesDepois?.total)).toBe(Number(bases?.total));
  });

  it("proposta acima da base nao compra e nao vira base; a solicitacao fica parcial", async () => {
    const { rodada, solicitacaoId } = await abrir();
    await responderPrecos(rodada.convites[0]!.token, { primeiro: 12, segundo: 5 });
    const antes = await consultarUm<{ id: string }>(
      "select id from produtos_precos_base where empresa_id = $1 and produto_id = $2 and valido_ate is null",
      [idsTeste.empresaA, idsTeste.produto]
    );
    const resultado = await fecharRodadaPorPrazo(
      { id: rodada.id, empresaId: idsTeste.empresaA, solicitacaoId },
      new Date(Date.now() + 2 * HORA)
    );
    expect(resultado).toMatchObject({ fechada: true, comprados: 0, pendentes: 2, basesAtualizadas: 0 });
    const depois = await consultarUm<{ id: string }>(
      "select id from produtos_precos_base where empresa_id = $1 and produto_id = $2 and valido_ate is null",
      [idsTeste.empresaA, idsTeste.produto]
    );
    expect(depois?.id).toBe(antes?.id);
    const solicitacao = await consultarUm<{ status: string }>("select status from compras_solicitacoes where id = $1", [
      solicitacaoId
    ]);
    expect(solicitacao?.status).toBe("parcialmente_comprada");
  });

  it("resposta tardia depois do fechamento e recusada (410)", async () => {
    const { rodada, solicitacaoId } = await abrir();
    const token = rodada.convites[0]!.token;
    await fecharRodadaPorPrazo(
      { id: rodada.id, empresaId: idsTeste.empresaA, solicitacaoId },
      new Date(Date.now() + 2 * HORA)
    );
    const dto = json<{ data: { itens: Array<{ conviteItemId: string }> } }>(
      await getPublico("/api/rodada", token)
    ).data;
    const resposta = await responder(token, {
      itens: [{ conviteItemId: dto.itens[0]!.conviteItemId, indisponivel: false, valorUnitario: 1 }]
    });
    expect(resposta.statusCode).toBe(410);
    expect(json<{ code?: string }>(resposta).code).toBe("RODADA_ENCERRADA");
  });

  it("o tick do agendador fecha so as rodadas vencidas e entrega a falha de uma sem parar as outras", async () => {
    const vencida = await abrir();
    const emAndamento = await abrir();
    // So a `vencida` passa do prazo de 1h; a outra segue aberta (agora = daqui a 90 min nao a alcanca
    // se ela tiver prazo maior). Alarga o prazo da segunda para provar a seletividade.
    await executarSql("update compras_rodadas set expira_em = now() + interval '3 hour' where id = $1", [
      emAndamento.rodada.id
    ]);
    const falhas: string[] = [];
    const resultados = await fecharRodadasVencidas(new Date(Date.now() + 90 * 60_000), (rodadaId) =>
      falhas.push(rodadaId)
    );
    expect(falhas).toEqual([]);
    expect(resultados.find((resultado) => resultado.rodadaId === vencida.rodada.id)?.fechada).toBe(true);
    expect(resultados.some((resultado) => resultado.rodadaId === emAndamento.rodada.id)).toBe(false);
    expect((await rodadaDe(emAndamento.rodada.id))?.status).toBe("aberta");
    expect((await rodadaDe(vencida.rodada.id))?.status).toBe("fechada");
  });
});
