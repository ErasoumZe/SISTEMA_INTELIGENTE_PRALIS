import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
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

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_RetornarStatusDoCaixaAberto_Quando_UsuarioTemCaixa", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    expect(resposta.json()).toMatchObject({ data: { caixaAberto: { id: idsTeste.caixaAberto, status: "aberto" } } });
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

  it("Deve_Retornar403NoHistoricoEDetalhe_Quando_UsuarioSoOperaCaixa", async () => {
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
    assertProblem(detalhe, 403);
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
        dataHoraAbertura: "2026-07-02T08:00",
        observacao: "Caixa proibido"
      }
    });
    assertProblem(status, 403);
    assertProblem(abrir, 403);
  });

  it("Deve_AbrirEEditarCaixa_Quando_PdvDisponivel", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
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

    const abrir = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-01-15T10:43",
        observacao: "Caixa aberto por teste"
      }
    });
    expect(abrir.statusCode).toBe(201);
    const caixaId = json<{ data: { id: string } }>(abrir).data.id;
    const statusAposAbertura = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(statusAposAbertura);
    expect(statusAposAbertura.json()).toMatchObject({
      data: { caixaAberto: { id: caixaId, dataHoraAbertura: "2026-01-15T10:43:00.000Z" } }
    });
    const token = await consultarUm<{ token_edicao: string; data_hora_abertura: Date }>(
      "select token_edicao, data_hora_abertura from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(token?.token_edicao).toBeTruthy();
    expect(new Date(token?.data_hora_abertura ?? 0).toISOString()).toBe("2026-01-15T10:43:00.000Z");

    const editar = await contexto.app.inject({
      method: "PUT",
      url: `/api/caixa/${caixaId}/abertura`,
      headers: { cookie: cookieAdmin },
      payload: {
        tokenEdicao: token?.token_edicao,
        pdvId,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-01-15T11:00",
        observacao: "Caixa editado por teste"
      }
    });
    expect(editar.statusCode).toBe(204);

    const linha = await consultarUm<{ observacao: string }>("select observacao from fechamentos_caixa where id = $1", [
      caixaId
    ]);
    expect(linha?.observacao).toBe("Caixa editado por teste");

    const fechar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: { observacao: "Caixa fechado por teste" }
    });
    expect(fechar.statusCode).toBe(204);
    await expect(
      consultarUm("select id from fechamentos_caixa where id = $1 and status = 'fechado'", [caixaId])
    ).resolves.toBeTruthy();
  });

  it("Deve_Retornar400_Quando_EditarAberturaComTokenInvalido", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/caixa/${idsTeste.caixaAberto}/abertura`,
      headers: { cookie: cookieAdmin },
      payload: {
        tokenEdicao: "TOKEN-INVALIDO",
        pdvId: idsTeste.pdvA,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-06-30T08:00",
        observacao: "Token invalido"
      }
    });

    assertProblem(resposta, 400);
  });

  it("Deve_RetornarErro_Quando_CaixaForInexistenteOuFechado", async () => {
    const inexistente = "99999999-9999-4999-8999-999999999999";
    const fecharInexistente = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${inexistente}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });
    const fecharFechado = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaFechado}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });

    assertProblem(fecharInexistente, 404);
    assertProblem(fecharFechado, 400);
  });

  it("Deve_Retornar400_Quando_AbrirCaixaComPdvInvalidoOuPeriodoIndisponivel", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
    const pdvInvalido = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: "99999999-9999-4999-8999-999999999999",
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-07-03T08:00"
      }
    });
    const pdvJaAberto = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: idsTeste.pdvA,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-07-03T08:00"
      }
    });
    const periodoSobreposto = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: idsTeste.pdvLivre,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-06-29T10:00"
      }
    });

    assertProblem(pdvInvalido, 400);
    assertProblem(pdvJaAberto, 400);
    assertProblem(periodoSobreposto, 400);
  });

  it("Deve_AbrirApenasUmCaixa_Quando_AberturasConcorremNoMesmoPdv", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
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

    const abertura = (observacao: string) =>
      contexto.app.inject({
        method: "POST",
        url: "/api/caixa/abrir",
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          pdvId,
          usuarioCaixaId: usuarioAdminId,
          dataHoraAbertura: "2026-02-10T08:00",
          observacao
        }
      });

    const [primeira, segunda] = await Promise.all([abertura("Abertura A"), abertura("Abertura B")]);

    const statuses = [primeira.statusCode, segunda.statusCode].sort();
    expect(statuses).toEqual([201, 400]);
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
  });

  it("Deve_Retornar400_Quando_FecharCaixaComSaldoPositivoSemAcerto", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaAberto}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: { observacao: "Tentativa sem acerto" }
    });

    assertProblem(resposta, 400);
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

    const abrir = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-03-01T08:00",
        observacao: "Ciclo operacional"
      }
    });
    expect(abrir.statusCode).toBe(201);
    const caixaId = json<{ data: { id: string } }>(abrir).data.id;

    const dataRef = "2026-03-01";
    const lancamentos = [
      {
        url: "/api/vendas",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          dataPagamento: dataRef,
          descricao: "Venda ciclo",
          valorOriginal: 100,
          contaOrigemId: contaPdvId,
          pdvId,
          colaboradorId: idsTeste.colaboradorAdmin,
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
          dataPagamento: dataRef,
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
          dataPagamento: dataRef,
          descricao: "Retirada ciclo",
          valorOriginal: 10,
          contaOrigemId: contaPdvId,
          colaboradorId: idsTeste.colaboradorAdmin,
          grupoRetiradaId: idsTeste.grupoRetiradaSangria
        }
      },
      {
        url: "/api/mercadorias",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          dataVencimento: dataRef,
          dataPagamento: dataRef,
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
        headers: { cookie: cookieAdmin },
        payload: lancamento.payload
      });
      expect(resposta.statusCode, `${lancamento.url}: ${resposta.body}`).toBe(201);
    }
    await confirmarTransferenciaPorLacreDireto("CAIXA-CICLO-ENTRADA", usuarioAdminId);
    await confirmarTransferenciaPorLacreDireto("CAIXA-CICLO-SAIDA", usuarioAdminId);

    // Formula oficial: entradas + transf entrada - transf saida - despesas - retiradas - mercadorias
    // 100 + 50 - 30 - 20 - 10 - 15 = 75
    const statusAntes = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(statusAntes);
    expect(statusAntes.json()).toMatchObject({
      data: {
        caixaAberto: { id: caixaId },
        resumo: {
          totalEntradas: 100,
          totalTransferenciasEntrada: 50,
          totalTransferenciasSaida: 30,
          totalDespesas: 20,
          totalRetiradas: 10,
          totalMercadorias: 15,
          saldo: 75
        }
      }
    });

    const retorno = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/transferencia-cofre`,
      headers: { cookie: cookieAdmin },
      payload: { tipo: "retorno", valor: 75, observacao: "Retorno ciclo" }
    });
    expect(retorno.statusCode, retorno.body).toBe(200);

    // O retorno e transferencia caixa -> cofre e zera o saldo sem criar despesa/debito artificial.
    const statusDepois = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(statusDepois);
    expect(statusDepois.json()).toMatchObject({
      data: { caixaAberto: { id: caixaId }, resumo: { totalTransferenciasSaida: 105, totalDespesas: 20, saldo: 0 } }
    });

    const fechar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: { observacao: "Fechado apos retorno" }
    });
    expect(fechar.statusCode, fechar.body).toBe(204);
    const fechado = await consultarUm<{ status: string; saldo: string }>(
      "select status, saldo from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(fechado?.status).toBe("fechado");
    expect(fechado?.saldo).toBe("0.00");
  });
});
