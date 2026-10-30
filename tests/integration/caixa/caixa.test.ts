import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diaNegocio } from "@padaria/shared/datas";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import {
  abrirCaixaDoOperador,
  criarRetornoValido,
  prepararPayloadFechamentoValido,
  registrarEncerramentoCaixaParaTeste,
  vincularOperadorAoPdvETurno
} from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { confirmarTransferenciaPorLacreDireto, consultarUm, executarSql, json } from "../../setup/integracao.js";

type LinhaHistorico = { id: string; tokenEdicao?: string };
type HistoricoJson = {
  data: LinhaHistorico[];
  meta: { totais: { totalEntradas: number; saldo: number; caixas: number } };
};
type GrupoLancamentos = { categoria: string; total: number; itens: { id: string }[] };
type DetalheJson = { data: { lancamentos: GrupoLancamentos[]; edicoes: unknown[]; ajuste: unknown } };

function idsDoHistorico(resposta: Parameters<typeof json>[0]) {
  return json<HistoricoJson>(resposta).data.map((linha) => linha.id);
}

async function usuarioIdPorEmail(email: string) {
  const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [email]);
  if (!usuario) throw new Error(`Usuario nao encontrado para ${email}`);
  return usuario.id;
}

describe("caixa integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let cookieGerente: string;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function prepararAberturaFisica(pdvId: string, contaId: string, usuarioCaixaId: string, nome: string) {
    const sufixo = randomUUID();
    const maquininha = await contexto.app.inject({
      method: "POST",
      url: "/api/maquininhas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        numeroSerie: `CONCORRENCIA-${sufixo}`,
        apelido: `Maquininha ${nome}`,
        ativo: true
      }
    });
    expect(maquininha.statusCode, maquininha.body).toBe(201);
    const lacreAbertura = `ABERTURA-${sufixo}`;
    const lacreFechamento = `FECHAMENTO-${sufixo}`;
    const malote = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: await cookieSessao(contexto.app, "tesouraria") },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-31",
        descricao: `Fundo de abertura ${nome}`,
        valorOriginal: 100,
        valorEspecieDeclarado: 100,
        valorMoedasDeclarado: 0,
        contaOrigemId: idsTeste.contaCofre,
        contaDestinoId: contaId,
        nLacreDoc: lacreAbertura,
        lacresRetorno: [`RETORNO-${sufixo}`],
        lacreFechamentoPlanejado: lacreFechamento
      }
    });
    expect(malote.statusCode, malote.body).toBe(201);
    return {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId,
      maquininhaId: json<{ data: { id: string } }>(maquininha).data.id,
      lacreAbertura,
      caixaResponsavelNome: nome,
      supervisorResponsavelNome: "Supervisor de teste",
      lacreFechamento
    };
  }

  it("Deve_RetornarStatusDoCaixaAberto_Quando_UsuarioTemCaixa", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    expect(resposta.json()).toMatchObject({ data: { caixaAberto: { id: idsTeste.caixaAberto, status: "aberto" } } });
  });

  it("Deve_RecusarSegundoCaixaAberto_Quando_OperadorJaTemCaixaNoMesmoPdv", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
    await vincularOperadorAoPdvETurno(contexto.app, {
      cookieAdmin,
      usuarioId: usuarioAdminId,
      pdvId: idsTeste.pdvA,
      nome: "Administrador com caixa aberto"
    });
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: idsTeste.pdvA,
        usuarioCaixaId: usuarioAdminId,
        maquininhaId: randomUUID(),
        lacreAbertura: "TESTE-SEGUNDO-CAIXA",
        caixaResponsavelNome: "Administrador de teste",
        supervisorResponsavelNome: "Supervisor de teste",
        observacao: "Segundo caixa do mesmo operador"
      }
    });

    assertProblem(resposta, 400);
    expect(resposta.json()).toMatchObject({ title: "Usuário do caixa ja possui um caixa aberto" });

    const violacao = await executarSql(
      `insert into fechamentos_caixa
         (id, empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id, data_movimento, status)
       values ($1, $2, $3, $4, $4, $5, '2026-09-11', 'aberto')`,
      [randomUUID(), idsTeste.empresaA, idsTeste.pdvLivre, usuarioAdminId, idsTeste.colaboradorAdmin]
    )
      .then(() => null)
      .catch((error: Error & { code?: string; constraint?: string }) => error);

    expect(violacao?.code).toBe("23505");
    expect(violacao?.constraint).toBe("fechamentos_caixa_operador_aberto_unico_idx");
  });

  it("Deve_ListarHistoricoEFechamentoSeedado_Quando_UsuarioPodeGerenciar", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain(idsTeste.caixaFechado);
  });

  it("Deve_RestringirHistoricoMasPermitirDetalheDoProprioCaixa_Quando_UsuarioSoOperaCaixa", async () => {
    const cookieCaixa = await cookieSessao(contexto.app, "caixa");
    const historico = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieCaixa }
    });
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${idsTeste.caixaFechado}/detalhe`,
      headers: { cookie: cookieCaixa }
    });

    assertProblem(historico, 403);
    assertOk(detalhe);
  });

  it("Deve_OmitirTokenEdicao_Quando_ListarHistorico", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    // O seed grava TOKEN-ABERTO/TOKEN-FECHADO: o token do fluxo legado nao pode vazar na listagem.
    expect(JSON.stringify(resposta.json())).not.toContain("TOKEN-");
    expect(json<HistoricoJson>(resposta).data[0]).not.toHaveProperty("tokenEdicao");
  });

  it("Deve_FiltrarPorStatusPeriodoEPdv_Quando_HistoricoRecebeFiltros", async () => {
    const fechados = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}&status=fechado`,
      headers: { cookie: cookieAdmin }
    });
    const doDiaDoAberto = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}&dataInicio=2026-06-30&dataFim=2026-06-30`,
      headers: { cookie: cookieAdmin }
    });
    const porPdv = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}&pdvId=${idsTeste.pdvLivre}`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(fechados);
    assertOk(doDiaDoAberto);
    assertOk(porPdv);
    expect(idsDoHistorico(fechados)).toEqual([idsTeste.caixaFechado]);
    expect(idsDoHistorico(doDiaDoAberto)).toEqual([idsTeste.caixaAberto]);
    expect(idsDoHistorico(porPdv)).toEqual([idsTeste.caixaFechado]);
  });

  it("Deve_SomarTotaisDoFiltroEnaoDaPagina_Quando_HistoricoPaginado", async () => {
    // pageSize=1 devolve 1 item, mas os totais tem de continuar sendo os do filtro inteiro.
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}&status=fechado&pageSize=1`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    const corpo = json<HistoricoJson>(resposta);
    expect(corpo.data).toHaveLength(1);
    // Unico caixa fechado do seed: entradas 42.00 e saldo 42.00.
    expect(corpo.meta.totais).toMatchObject({ totalEntradas: 42, saldo: 42, caixas: 1 });
  });

  it("Deve_RejeitarPeriodoInvertido_Quando_DataInicioMaiorQueDataFim", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}&dataInicio=2026-06-30&dataFim=2026-06-01`,
      headers: { cookie: cookieAdmin }
    });

    assertProblem(resposta, 400);
  });

  it("Deve_TrazerEdicoesEAjuste_Quando_ConsultarDetalheDoCaixa", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${idsTeste.caixaFechado}/detalhe`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    // Caixa do seed nao teve alteracao de horario nem acerto: contrato presente, conteudo vazio.
    expect(json<DetalheJson>(resposta).data).toMatchObject({ edicoes: [], ajuste: null });
  });

  it("Deve_TrazerLancamentosDoCaixaPedido_Quando_ConsultarDetalheDeOutroCaixa", async () => {
    // O detalhe nao pode reusar /api/vendas: aquela rota aplica o escopo operacional "somente caixa
    // aberto" e, para um perfil com essa flag, trocaria o caixaId pedido pelo caixa aberto dele.
    // Aqui o caixa consultado (caixaAberto) tem a venda do seed.
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${idsTeste.caixaAberto}/detalhe`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(detalhe);
    const entradas = json<DetalheJson>(detalhe).data.lancamentos.find((grupo) => grupo.categoria === "entradas");
    expect(entradas?.itens.map((item) => item.id)).toContain(idsTeste.vendaSeed);
    expect(entradas?.total).toBe(42);
  });

  it("Deve_ClassificarSentidoDaTransferenciaPelaContaDoPdv_Quando_MontarDetalhe", async () => {
    // pdvA usa contaCaixa. As tres situacoes possiveis, com a mesma regra dos totais:
    // destino = conta do PDV -> entrada; origem = conta do PDV -> saida; nenhuma das duas -> null
    // (nao entra em nenhum total, entao nao pode aparecer como "saida" no detalhe).
    await executarSql(
      `insert into transferencias (id, empresa_id, caixa_id, data_referencia, descricao, valor_original,
         conta_origem_id, conta_destino_id, computar, status)
       values ($1,$2,$3,$4,'Entrada no PDV',$5,$6,$7,true,'pendente'),
              ($8,$2,$3,$4,'Saida do PDV',$5,$7,$6,true,'pendente'),
              ($9,$2,$3,$4,'Fora do PDV',$5,$6,$10,true,'pendente')`,
      [
        "22222222-2222-4222-8222-222222220001",
        idsTeste.empresaA,
        idsTeste.caixaAberto,
        "2026-06-30",
        "10.00",
        idsTeste.contaBanco,
        idsTeste.contaCaixa,
        "22222222-2222-4222-8222-222222220002",
        "22222222-2222-4222-8222-222222220003",
        idsTeste.contaLivre
      ]
    );

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${idsTeste.caixaAberto}/detalhe`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(detalhe);
    const grupo = json<DetalheJson>(detalhe).data.lancamentos.find((atual) => atual.categoria === "transferencias");
    const porDescricao = new Map(
      (grupo?.itens as unknown as { descricao: string; sentido: string | null }[]).map((item) => [
        item.descricao,
        item.sentido
      ])
    );
    expect(porDescricao.get("Entrada no PDV")).toBe("entrada");
    expect(porDescricao.get("Saida do PDV")).toBe("saida");
    // Nao toca a conta do PDV: nem entrada nem saida — como nos totais.
    expect(porDescricao.get("Fora do PDV")).toBeNull();
    // Total da categoria e o LIQUIDO (10 de entrada - 10 de saida), igual ao total_transferencias.
    expect(grupo?.total).toBe(0);

    await executarSql("delete from transferencias where id in ($1,$2,$3)", [
      "22222222-2222-4222-8222-222222220001",
      "22222222-2222-4222-8222-222222220002",
      "22222222-2222-4222-8222-222222220003"
    ]);
  });

  it("Deve_SomarLiquidoNasEntradas_Quando_VendaTemDescontoOuAcrescimo", async () => {
    // BUG A: valor_original e o SUBTOTAL. O resumo do caixa somava ele puro, entao venda com
    // desconto entrava a mais e venda com acrescimo a menos — e o caixa nao batia com o CREARE.
    const ids = ["33333333-3333-4333-8333-333333330001", "33333333-3333-4333-8333-333333330002"];
    await executarSql(
      `insert into vendas (id, empresa_id, caixa_id, pdv_id, data_referencia, descricao, valor_original,
         valor_desconto, valor_acrescimo, status, computar)
       values ($1,$2,$3,$4,$5,'Venda com desconto','100.00','10.00','0','aprovado',true),
              ($6,$2,$3,$4,$5,'Venda com acrescimo','50.00','0','5.00','aprovado',true)`,
      [ids[0], idsTeste.empresaA, idsTeste.caixaAberto, idsTeste.pdvA, "2026-06-30", ids[1]]
    );

    const status = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${idsTeste.caixaAberto}/detalhe`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(status);
    assertOk(detalhe);
    // Venda do seed (42) + 90 (100-10) + 55 (50+5) = 187. Somando subtotal puro daria 192.
    const resumo = json<{ data: { resumo: { totalEntradas: number } } }>(status).data.resumo;
    expect(resumo.totalEntradas).toBe(187);

    // O detalhe tem de contar a MESMA historia que o resumo.
    const entradas = json<DetalheJson>(detalhe).data.lancamentos.find((grupo) => grupo.categoria === "entradas");
    expect(entradas?.total).toBe(187);

    await executarSql("delete from vendas where id in ($1,$2)", [ids[0], ids[1]]);
  });

  it("Deve_AuditarVendaCanceladaComProdutosSemDevolveLaAosTotais", async () => {
    const vendaId = randomUUID();
    const produtoId = randomUUID();
    const pagamentoId = randomUUID();
    await executarSql(
      `insert into vendas (id, empresa_id, caixa_id, pdv_id, data_referencia, data_venda, descricao, valor_original,
         valor_desconto, valor_acrescimo, identificador_externo, status, computar)
       values ($1,$2,$3,$4,$5,$6,'Venda cancelada no CREARE','125.00','5.00','0','CREARE:CANCELADA-CAIXA', 'cancelado',true)`,
      [vendaId, idsTeste.empresaA, idsTeste.caixaAberto, idsTeste.pdvA, "2026-06-30", "2026-06-30T15:45:00.000Z"]
    );
    await executarSql(
      `insert into vendas_produtos (id, venda_id, descricao_produto, quantidade, valor_unitario, valor_total, cancelado)
       values ($1,$2,'Produto cancelado de teste','2','62.50','125.00',true)`,
      [produtoId, vendaId]
    );
    await executarSql(
      `insert into vendas_pagamentos (id, venda_id, tipo_pagamento_automacao, total_pago)
       values ($1,$2,'Cartão de débito','120.00')`,
      [pagamentoId, vendaId]
    );

    const [status, detalhe, canceladasOperacionais] = await Promise.all([
      contexto.app.inject({
        method: "GET",
        url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
        headers: { cookie: cookieAdmin }
      }),
      contexto.app.inject({
        method: "GET",
        url: `/api/caixa/${idsTeste.caixaAberto}/detalhe`,
        headers: { cookie: cookieAdmin }
      }),
      contexto.app.inject({
        method: "GET",
        url: `/api/caixa/${idsTeste.caixaAberto}/vendas-canceladas`,
        headers: { cookie: cookieAdmin }
      })
    ]);

    assertOk(status);
    assertOk(detalhe);
    assertOk(canceladasOperacionais);
    // A venda era R$ 120 liquidos, mas permanece fora do saldo e das entradas do caixa.
    expect(json<{ data: { resumo: { totalEntradas: number } } }>(status).data.resumo.totalEntradas).toBe(42);
    const corpo = json<{
      data: {
        lancamentos: GrupoLancamentos[];
        vendasCanceladas: Array<{
          id: string;
          identificadorExterno: string | null;
          dataHora: string | null;
          valor: number;
          pagamentos: Array<{ id: string; formaPagamento: string; valor: number }>;
          produtos: Array<{
            id: string;
            descricao: string;
            quantidade: number;
            valorTotal: number;
            cancelado: boolean;
          }>;
        }>;
      };
    }>(detalhe).data;
    expect(corpo.lancamentos.find((grupo) => grupo.categoria === "entradas")?.total).toBe(42);
    const canceladaNoDetalhe = corpo.vendasCanceladas.find((venda) => venda.id === vendaId);
    expect(canceladaNoDetalhe).toMatchObject({
      identificadorExterno: "CREARE:CANCELADA-CAIXA",
      valor: 120
    });
    expect(canceladaNoDetalhe?.pagamentos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: pagamentoId, formaPagamento: "Cartão de débito", valor: 120 })
      ])
    );
    expect(canceladaNoDetalhe?.produtos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: produtoId,
          descricao: "Produto cancelado de teste",
          quantidade: 2,
          valorTotal: 125,
          cancelado: true
        })
      ])
    );
    expect(json<{ data: Array<{ id: string }> }>(canceladasOperacionais).data.map((venda) => venda.id)).toContain(
      vendaId
    );
    const canceladaOperacional = json<{
      data: Array<{ id: string; pagamentos: Array<{ formaPagamento: string; valor: number }> }>;
    }>(canceladasOperacionais).data.find((venda) => venda.id === vendaId);
    expect(canceladaOperacional?.pagamentos).toEqual(
      expect.arrayContaining([expect.objectContaining({ formaPagamento: "Cartão de débito", valor: 120 })])
    );

    await executarSql("delete from vendas where id = $1", [vendaId]);
  });

  it("Deve_TrazerLancamentosVaziosSemCruzarCaixas_Quando_CaixaNaoTemMovimento", async () => {
    // O caixa fechado do seed nao tem lancamento: as categorias vem todas zeradas — e nao podem
    // pescar a venda do OUTRO caixa (regressao do escopo por caixa).
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${idsTeste.caixaFechado}/detalhe`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(detalhe);
    const grupos = json<DetalheJson>(detalhe).data.lancamentos;
    expect(grupos.map((grupo) => grupo.categoria)).toEqual([
      "entradas",
      "transferencias",
      "despesas",
      "retiradas",
      "mercadorias"
    ]);
    expect(grupos.every((grupo) => !grupo.itens.length && grupo.total === 0)).toBe(true);
  });

  it("Deve_Retornar403_Quando_AcessarOuOperarCaixaDeEmpresaNaoPermitida", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
    const status = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });
    const abrir = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaB,
        pdvId: idsTeste.pdvA,
        usuarioCaixaId: usuarioAdminId,
        maquininhaId: randomUUID(),
        lacreAbertura: "TESTE-EMPRESA-PROIBIDA",
        caixaResponsavelNome: "Administrador de teste",
        supervisorResponsavelNome: "Supervisor de teste",
        dataHoraAbertura: "2026-07-02T08:00",
        observacao: "Caixa proibido"
      }
    });
    assertProblem(status, 403);
    assertProblem(abrir, 403);
  });

  it("Deve_AbrirComHorarioDoServidorERecusarRotaLegada_Quando_PdvDisponivel", async () => {
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta caixa isolado" }
    });
    expect(conta.statusCode).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV caixa isolado", contaId, ativo: true }
    });
    expect(pdv.statusCode).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const antesDaAbertura = new Date();
    const abertura = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Caixa aberto por teste",
      contaId,
      pdvId,
      // R-184: tentativa deliberada de forjar uma abertura antiga. O schema descarta este campo
      // legado e o servico precisa persistir o instante atual do servidor.
      dataHoraAbertura: "2026-01-15T10:43"
    });
    const depoisDaAbertura = new Date();
    const { caixaId } = abertura;
    const statusAposAbertura = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieCaixa }
    });
    assertOk(statusAposAbertura);
    expect(statusAposAbertura.json()).toMatchObject({ data: { caixaAberto: { id: caixaId } } });
    const token = await consultarUm<{ token_edicao: string; data_hora_abertura: Date; aberto_em: Date }>(
      "select token_edicao, data_hora_abertura, aberto_em from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(token?.token_edicao).toBeTruthy();
    const instantePersistido = new Date(token?.data_hora_abertura ?? 0);
    expect(instantePersistido.getTime()).toBeGreaterThanOrEqual(antesDaAbertura.getTime());
    expect(instantePersistido.getTime()).toBeLessThanOrEqual(depoisDaAbertura.getTime());
    expect(new Date(token?.aberto_em ?? 0).getTime()).toBe(instantePersistido.getTime());

    const rotaLegada = await contexto.app.inject({
      method: "PUT",
      url: `/api/caixa/${caixaId}/abertura`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });
    expect(rotaLegada.statusCode).toBe(404);

    const semLacre = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: { observacao: "Tentativa sem lacre" }
    });
    assertProblem(semLacre, 400);

    const fechamentoFisico = await prepararPayloadFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId
    });
    const fechar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie: cookieCaixa },
      payload: { ...fechamentoFisico, observacao: "Caixa fechado por teste" }
    });
    expect(fechar.statusCode).toBe(204);
    await expect(
      consultarUm<{ lacre_fechamento: string }>(
        "select lacre_fechamento from fechamentos_caixa where id = $1 and status = 'fechado'",
        [caixaId]
      )
    ).resolves.toMatchObject({ lacre_fechamento: abertura.lacreFechamento });

    const historico = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}&pdvId=${pdvId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(historico);
    expect(json<{ data: Array<{ id: string; lacreFechamento: string | null }> }>(historico).data).toContainEqual(
      expect.objectContaining({ id: caixaId, lacreFechamento: abertura.lacreFechamento })
    );
  });

  it("Deve_Retornar404_Quando_UsarRotaLegadaDeEdicaoDaAbertura", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/caixa/${idsTeste.caixaAberto}/abertura`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });

    expect(resposta.statusCode).toBe(404);
  });

  it("Deve_RetornarErro_Quando_CaixaForInexistenteOuFechado", async () => {
    const inexistente = "99999999-9999-4999-8999-999999999999";
    const fecharInexistente = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${inexistente}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: {
        lacreFechamento: "FCH-INEXISTENTE",
        caixaResponsavelNome: "Administrador de teste",
        supervisorResponsavelNome: "Supervisor de teste"
      }
    });
    const fecharFechado = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaFechado}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: {
        lacreFechamento: "FCH-JA-FECHADO",
        caixaResponsavelNome: "Administrador de teste",
        supervisorResponsavelNome: "Supervisor de teste"
      }
    });

    assertProblem(fecharInexistente, 404);
    assertProblem(fecharFechado, 409);
  });

  it("Deve_Retornar400_Quando_AbrirCaixaComPdvInvalidoOuOcupado", async () => {
    const usuarioCaixaId = await usuarioIdPorEmail(usuariosTeste.caixa.email);
    await vincularOperadorAoPdvETurno(contexto.app, {
      cookieAdmin,
      usuarioId: usuarioCaixaId,
      pdvId: idsTeste.pdvA,
      nome: "PDV ocupado"
    });
    const pdvInvalido = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: "99999999-9999-4999-8999-999999999999",
        usuarioCaixaId,
        maquininhaId: randomUUID(),
        lacreAbertura: "TESTE-PDV-INVALIDO",
        caixaResponsavelNome: "Caixa de teste",
        supervisorResponsavelNome: "Supervisor de teste",
        dataHoraAbertura: "2026-07-03T08:00"
      }
    });
    const pdvJaAberto = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: idsTeste.pdvA,
        usuarioCaixaId,
        maquininhaId: randomUUID(),
        lacreAbertura: "TESTE-PDV-OCUPADO",
        caixaResponsavelNome: "Caixa de teste",
        supervisorResponsavelNome: "Supervisor de teste",
        dataHoraAbertura: "2026-07-03T08:00"
      }
    });

    assertProblem(pdvInvalido, 400);
    // R-229 · PDV com caixa ainda aberto (ex.: a manhã): 409 dizendo que o caixa anterior precisa fechar.
    assertProblem(pdvJaAberto, 409);
    expect(json<{ title: string }>(pdvInvalido).title).toMatch(/PDV.*encontrado/i);
    expect(json<{ title: string }>(pdvJaAberto).title).toMatch(/caixa anterior deste PDV/i);
  });

  it("Deve_AbrirApenasUmCaixa_Quando_AberturasConcorremNoMesmoPdv", async () => {
    const usuarioCaixaId = await usuarioIdPorEmail(usuariosTeste.caixa.email);
    const usuarioGerenteId = await usuarioIdPorEmail(usuariosTeste.gerente.email);
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta concorrencia" }
    });
    expect(conta.statusCode).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV concorrencia", contaId, ativo: true }
    });
    expect(pdv.statusCode).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    await vincularOperadorAoPdvETurno(contexto.app, {
      cookieAdmin,
      usuarioId: usuarioCaixaId,
      pdvId,
      nome: "Concorrencia caixa"
    });
    // R-229 · um posto por login: o gerente fica com a tarde do mesmo PDV.
    await vincularOperadorAoPdvETurno(contexto.app, {
      cookieAdmin,
      usuarioId: usuarioGerenteId,
      pdvId,
      nome: "Concorrencia gerente",
      turnoCaixa: "tarde"
    });

    const payloadCaixa = await prepararAberturaFisica(pdvId, contaId, usuarioCaixaId, "Abertura A");
    const payloadGerente = await prepararAberturaFisica(pdvId, contaId, usuarioGerenteId, "Abertura B");
    const abertura = (payload: Record<string, unknown>, cookie: string) =>
      contexto.app.inject({
        method: "POST",
        url: "/api/caixa/abrir",
        headers: { cookie },
        payload
      });

    const [primeira, segunda] = await Promise.all([
      abertura(payloadCaixa, cookieCaixa),
      abertura(payloadGerente, cookieGerente)
    ]);

    // Quem chega depois encontra o caixa do PDV aberto: 409 "caixa anterior deste PDV" (R-229).
    const statuses = [primeira.statusCode, segunda.statusCode].sort();
    expect(statuses).toEqual([201, 409]);
    const abertos = await consultarUm<{ total: number }>(
      "select count(*)::int as total from fechamentos_caixa where pdv_id = $1 and status = 'aberto'",
      [pdvId]
    );
    expect(abertos?.total).toBe(1);

    // Prova deterministica do indice: mesmo por fora da API, o banco rejeita o segundo caixa aberto.
    const violacao = await executarSql(
      `insert into fechamentos_caixa (empresa_id, pdv_id, colaborador_id, data_movimento, status)
       values ($1, $2, $3, '2026-02-10', 'aberto')`,
      [idsTeste.empresaA, pdvId, idsTeste.colaboradorAdmin]
    )
      .then(() => null)
      .catch((error: Error & { code?: string; constraint?: string }) => error);
    expect(violacao?.code).toBe("23505");
    expect(violacao?.constraint).toBe("fechamentos_caixa_pdv_aberto_unico_idx");

    const caixaAberto = await consultarUm<{ id: string }>(
      "select id from fechamentos_caixa where pdv_id = $1 and status = 'aberto'",
      [pdvId]
    );
    if (!caixaAberto?.id) throw new Error("Corrida por PDV terminou sem caixa aberto");
    registrarEncerramentoCaixaParaTeste(caixaAberto.id);
  });

  it("Deve_AbrirApenasUmCaixa_Quando_MesmoOperadorTentaPdvsDiferentes", async () => {
    const usuarioGerenteId = await usuarioIdPorEmail(usuariosTeste.gerente.email);

    const criarPdv = async (sufixo: string) => {
      const conta = await contexto.app.inject({
        method: "POST",
        url: "/api/contas",
        headers: { cookie: cookieAdmin },
        payload: { empresaId: idsTeste.empresaA, nome: `Conta operador concorrente ${sufixo}` }
      });
      expect(conta.statusCode, conta.body).toBe(201);
      const contaId = json<{ data: { id: string } }>(conta).data.id;
      const pdv = await contexto.app.inject({
        method: "POST",
        url: "/api/pdvs",
        headers: { cookie: cookieAdmin },
        payload: { empresaId: idsTeste.empresaA, nome: `PDV operador concorrente ${sufixo}`, contaId, ativo: true }
      });
      expect(pdv.statusCode, pdv.body).toBe(201);
      return { contaId, pdvId: json<{ data: { id: string } }>(pdv).data.id };
    };

    const [pdvA, pdvB] = await Promise.all([criarPdv("A"), criarPdv("B")]);
    await vincularOperadorAoPdvETurno(contexto.app, {
      cookieAdmin,
      usuarioId: usuarioGerenteId,
      pdvId: pdvA.pdvId,
      nome: "Operador concorrente A"
    });
    const [payloadA, payloadB] = await Promise.all([
      prepararAberturaFisica(pdvA.pdvId, pdvA.contaId, usuarioGerenteId, "Operador concorrente A"),
      prepararAberturaFisica(pdvB.pdvId, pdvB.contaId, usuarioGerenteId, "Operador concorrente B")
    ]);
    const abrir = (payload: Record<string, unknown>) =>
      contexto.app.inject({
        method: "POST",
        url: "/api/caixa/abrir",
        headers: { cookie: cookieGerente },
        payload
      });

    const respostas = await Promise.all([abrir(payloadA), abrir(payloadB)]);
    expect(respostas.map((resposta) => resposta.statusCode).sort()).toEqual([201, 400]);
    const perdedor = respostas.find((resposta) => resposta.statusCode === 400);
    expect(perdedor?.json()).toMatchObject({ title: "Usuário do caixa so pode abrir o PDV vinculado ao seu cadastro" });

    const aberto = await consultarUm<{ id: string; total: number }>(
      `select min(id::text) as id, count(*)::int as total
       from fechamentos_caixa
       where empresa_id = $1 and usuario_caixa_id = $2 and status = 'aberto'`,
      [idsTeste.empresaA, usuarioGerenteId]
    );
    expect(aberto?.total).toBe(1);
    if (!aberto?.id) throw new Error("Corrida por operador terminou sem caixa aberto");
    registrarEncerramentoCaixaParaTeste(aberto.id);
  });

  // D6 substituiu a regra antiga ("fechar com saldo positivo e barrado, 400"): hoje o fechamento
  // devolve a sobra no mesmo ato. O que continua sendo recusado, e e o que este teste prova, e a
  // ENTREGA acima do que existe em especie (D1) — sem esse teto o excedente virava saldo negativo
  // e o fechamento gravava quebra falsa no nome do operador.
  // Nao fecha o caixa do seed de proposito: ele e compartilhado com os demais testes do arquivo.
  it("Deve_Retornar400_Quando_RetornoMaiorQueOSaldoDoCaixa", async () => {
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Teto físico do retorno"
    });
    const antes = await consultarUm<{ total: string }>(
      "select count(*) as total from transferencias where caixa_id = $1 and tipo = 'retorno'",
      [caixa.caixaId]
    );

    const lacres = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixa.caixaId}/lacres-retorno`,
      headers: { cookie: cookieCaixa }
    });
    assertOk(lacres);
    const lacre = json<{ data: Array<{ id: string }> }>(lacres).data[0];
    if (!lacre) throw new Error("Caixa seed sem lacre retornável para provar o teto físico");
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/transferencia-cofre`,
      headers: { cookie: cookieCaixa },
      payload: {
        valor: 999999,
        valorEspecie: 999999,
        valorMoedas: 0,
        lacreId: lacre.id,
        responsavelNome: "Administrador de teste",
        idempotenciaChave: randomUUID()
      }
    });

    assertProblem(resposta, 400);
    // R-232 · para o operador a mensagem nao revela o disponivel; para a gerencia, revela.
    expect(resposta.body).toMatch(/acima do (saldo|dinheiro)/i);

    const depois = await consultarUm<{ total: string }>(
      "select count(*) as total from transferencias where caixa_id = $1 and tipo = 'retorno'",
      [caixa.caixaId]
    );
    expect(depois?.total).toBe(antes?.total);
  });

  it("Deve_Retornar404_ParaCaminhoAntigoDeAcertoRemovido", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaAberto}/acertar-saldo`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });

    expect(resposta.statusCode).toBe(404);
  });

  it("Deve_CalcularSaldoRetornarAoCofreEFechar_Quando_CicloOperacionalCompleto", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);

    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta ciclo operacional" }
    });
    expect(conta.statusCode).toBe(201);
    const contaPdvId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV ciclo operacional", contaId: contaPdvId, ativo: true }
    });
    expect(pdv.statusCode).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const abertura = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieMultiempresa,
      emailOperador: usuariosTeste.multiempresa.email,
      nome: "Ciclo operacional",
      contaId: contaPdvId,
      pdvId,
      dataHoraAbertura: "2026-03-01T08:00"
    });
    const { caixaId } = abertura;

    const dataRef = "2026-03-01";
    // R-129: data de pagamento nao pode ser retroativa. Este teste e sobre o CICLO do caixa, nao
    // sobre datas — a data de referencia continua fixa (o caixa se fecha por caixa_id, nao por dia)
    // e so o pagamento anda para hoje, que e o unico valor que a regra aceita.
    const pagoEm = diaNegocio(new Date());
    const lancamentos = [
      {
        url: "/api/vendas",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          dataPagamento: pagoEm,
          descricao: "Venda ciclo",
          valorOriginal: 100,
          contaOrigemId: contaPdvId,
          pdvId,
          colaboradorId: idsTeste.colaboradorMultiempresa,
          itensVenda: [
            {
              produtoId: idsTeste.produto,
              descricaoProduto: "Produto ciclo",
              quantidade: 1,
              valorUnitario: 100,
              valorTotal: 100
            }
          ],
          tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 100 }]
        }
      },
      {
        url: "/api/transferencias",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          descricao: "Transferencia entrada ciclo",
          valorOriginal: 50,
          contaOrigemId: idsTeste.contaBanco,
          contaDestinoId: contaPdvId,
          nLacreDoc: "CAIXA-CICLO-ENTRADA"
        }
      },
      {
        url: "/api/transferencias",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          descricao: "Transferencia saida ciclo",
          valorOriginal: 30,
          contaOrigemId: contaPdvId,
          contaDestinoId: idsTeste.contaBanco,
          nLacreDoc: "CAIXA-CICLO-SAIDA"
        }
      },
      {
        url: "/api/despesas",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          dataVencimento: dataRef,
          dataPagamento: pagoEm,
          descricao: "Despesa ciclo",
          valorOriginal: 20,
          contaOrigemId: contaPdvId,
          grupoDespesaId: idsTeste.grupoDespesaOperacional
        }
      },
      {
        url: "/api/retiradas",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          dataVencimento: dataRef,
          dataPagamento: pagoEm,
          descricao: "Retirada ciclo",
          valorOriginal: 10,
          contaOrigemId: contaPdvId,
          // R-128: retirada NOVA e de fornecedor ou socio/gestor.
          fornecedorId: idsTeste.fornecedor,
          grupoRetiradaId: idsTeste.grupoRetiradaSangria
        }
      },
      {
        url: "/api/mercadorias",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          dataVencimento: dataRef,
          dataPagamento: pagoEm,
          descricao: "Mercadoria ciclo",
          valorOriginal: 15,
          contaOrigemId: contaPdvId,
          fornecedorId: idsTeste.fornecedor,
          grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
          temNotaFiscal: false
        }
      }
    ];
    for (const lancamento of lancamentos) {
      const resposta = await contexto.app.inject({
        method: "POST",
        url: lancamento.url,
        headers: { cookie: cookieMultiempresa },
        payload: lancamento.payload
      });
      expect(resposta.statusCode, `${lancamento.url}: ${resposta.body}`).toBe(201);
    }
    await confirmarTransferenciaPorLacreDireto("CAIXA-CICLO-ENTRADA", usuarioAdminId);
    await confirmarTransferenciaPorLacreDireto("CAIXA-CICLO-SAIDA", usuarioAdminId);

    // Formula oficial: entradas + transf entrada - transf saida - despesas - retiradas - mercadorias
    // Fundo físico 100 + venda 100 + entrada 50 - saída 30 - despesas 20 - retirada 10 - mercadoria 15 = 175.
    const statusAntes = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieMultiempresa }
    });
    assertOk(statusAntes);
    expect(statusAntes.json()).toMatchObject({
      data: {
        caixaAberto: { id: caixaId },
        resumo: {
          totalEntradas: 100,
          totalTransferenciasEntrada: 150,
          totalTransferenciasSaida: 30,
          totalDespesas: 20,
          totalRetiradas: 10,
          totalMercadorias: 15,
          saldo: 175
        }
      }
    });

    // A retaguarda nao pode esperar o fechamento para enxergar o dinheiro que esta no caixa.
    // O historico devolve o retrato operacional do aberto, enquanto os fechados seguem snapshot.
    const historicoAoVivo = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}&pdvId=${pdvId}&status=aberto`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(historicoAoVivo);
    expect(historicoAoVivo.json()).toMatchObject({
      data: [
        {
          id: caixaId,
          totalEntradas: 100,
          totalTransferenciasEntrada: 150,
          totalTransferenciasSaida: 30,
          totalDespesas: 20,
          totalRetiradas: 10,
          totalMercadorias: 15,
          saldo: 175
        }
      ],
      meta: {
        totais: {
          totalEntradas: 100,
          totalTransferenciasEntrada: 150,
          totalTransferenciasSaida: 30,
          totalDespesas: 20,
          totalRetiradas: 10,
          totalMercadorias: 15,
          saldo: 175,
          caixas: 1
        }
      }
    });

    await criarRetornoValido(contexto.app, {
      cookieOperador: cookieMultiempresa,
      caixaId,
      valor: 175,
      responsavelNome: "Ciclo operacional"
    });

    // O retorno e transferencia caixa -> cofre e zera o saldo sem criar despesa/debito artificial.
    const statusDepois = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieMultiempresa }
    });
    assertOk(statusDepois);
    expect(statusDepois.json()).toMatchObject({
      data: { caixaAberto: { id: caixaId }, resumo: { totalTransferenciasSaida: 205, totalDespesas: 20, saldo: 0 } }
    });

    // O retorno pendente continua auditável; a contagem e o dossiê são a porta de fechamento.
    const fechamentoFisico = await prepararPayloadFechamentoValido(contexto.app, {
      cookieOperador: cookieMultiempresa,
      caixaId
    });
    const fechar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie: cookieMultiempresa },
      payload: { ...fechamentoFisico, observacao: "Fechado apos retorno" }
    });
    expect(fechar.statusCode, fechar.body).toBe(204);
    const fechado = await consultarUm<{ status: string; saldo: string }>(
      "select status, saldo from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(fechado?.status).toBe("fechado");
    expect(fechado?.saldo).toBe("0.00");
  });

  it("Deve_ConsultarSomenteAsVendasDoCaixaAbertoDoOperador", async () => {
    const cookieOperadorEntradas = await cookieSessao(contexto.app, "operadorEntradas");
    const vendaDoCaixa = randomUUID();
    const vendaDeOutroCaixa = randomUUID();
    const produtoVinculado = randomUUID();
    const pagamentoVinculado = randomUUID();
    const agora = new Date();
    const inicio = new Date(agora.getTime() - 60_000).toISOString();
    const fim = new Date(agora.getTime() + 60_000).toISOString();

    await executarSql(
      `insert into vendas (id, empresa_id, caixa_id, pdv_id, data_referencia, data_venda, descricao, valor_original, status, computar)
       values ($1,$2,$3,$4,$5,$6,'Venda do turno consultado','37.00','aprovado',true),
              ($7,$2,$8,$9,$5,$6,'Venda de outro caixa','91.00','aprovado',true)`,
      [
        vendaDoCaixa,
        idsTeste.empresaA,
        idsTeste.caixaAbertoEntradas,
        idsTeste.pdvEntradas,
        "2026-07-01",
        agora.toISOString(),
        vendaDeOutroCaixa,
        idsTeste.caixaAberto,
        idsTeste.pdvA
      ]
    );
    await executarSql(
      `insert into vendas_produtos (id, venda_id, descricao_produto, quantidade, valor_unitario, valor_total)
       values ($1,$2,'Pao frances do turno','2','18.50','37.00')`,
      [produtoVinculado, vendaDoCaixa]
    );
    await executarSql(
      `insert into vendas_pagamentos (id, venda_id, forma_pagamento_id, total_pago)
       values ($1,$2,$3,'37.00')`,
      [pagamentoVinculado, vendaDoCaixa, idsTeste.formaPagamentoDinheiro]
    );

    const propria = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${idsTeste.caixaAbertoEntradas}/vendas?produto=Pao%20frances&formaPagamentoId=${idsTeste.formaPagamentoDinheiro}&dataHoraInicio=${encodeURIComponent(inicio)}&dataHoraFim=${encodeURIComponent(fim)}&pdvId=${idsTeste.pdvA}&status=cancelado`,
      headers: { cookie: cookieOperadorEntradas }
    });
    assertOk(propria);
    const corpo = json<{
      data: Array<{ id: string; descricao: string }>;
      meta: { totais: { totalGeral: number; quantidade: number }; manuaisSemHorarioForaDoFiltro: boolean };
    }>(propria);
    expect(corpo.data).toEqual([expect.objectContaining({ id: vendaDoCaixa, descricao: "Venda do turno consultado" })]);
    expect(corpo.meta.totais).toMatchObject({ totalGeral: 37, quantidade: 1 });
    expect(corpo.meta.manuaisSemHorarioForaDoFiltro).toBe(true);

    // Ter caixa_operar nao torna o operador leitor do caixa de outra pessoa/PDV.
    const alheia = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${idsTeste.caixaAberto}/vendas`,
      headers: { cookie: cookieOperadorEntradas }
    });
    assertProblem(alheia, 403);

    await executarSql("delete from vendas where id in ($1,$2)", [vendaDoCaixa, vendaDeOutroCaixa]);
  });

  it("Deve_ConsultarRelatorioDoCaixaEmFechamentoComOCorteDoServidor", async () => {
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Corte de relatório"
    });
    const inicio = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/iniciar-fechamento`,
      headers: { cookie: cookieCaixa },
      payload: {}
    });

    assertOk(inicio);
    const corte = json<{ data: { dataHoraCorte: string } }>(inicio).data.dataHoraCorte;

    const relatorio = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixa.caixaId}/vendas`,
      headers: { cookie: cookieCaixa }
    });

    assertOk(relatorio);
    const corpo = json<{ data: unknown[]; meta: { abertura: string; limiteSuperior: string } }>(relatorio);
    expect(corpo.meta.abertura).toBeTruthy();
    expect(new Date(corpo.meta.limiteSuperior).getTime()).toBe(new Date(corte).getTime());
  });
});
