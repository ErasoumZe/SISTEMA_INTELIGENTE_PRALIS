import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, encerrarCaixaSeedAdminParaTeste, prepararPayloadFechamentoValido } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { confirmarTransferenciaPorLacreDireto, consultarUm, json } from "../../setup/integracao.js";

// DEMONSTRACAO: caixa aberto com despesa/retirada/transferencia/mercadoria (manuais) + uma ENTRADA
// vinda da INTEGRACAO de vendas (CREARE). Mostra a relacao venda integrada <-> resumo do caixa.
// A venda integrada e do MESMO PDV do caixa e DENTRO do periodo em que ele esta aberto.
describe("caixa + venda integrada (entrada por integracao)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let caixaDoCenarioCompleto: string | null = null;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function usuarioAdminId() {
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.admin.email
    ]);
    if (!usuario) throw new Error("Usuario admin nao encontrado");
    return usuario.id;
  }

  function post(url: string, payload: object, headers: Record<string, string> = { cookie: cookieAdmin }) {
    const corpo = url.endsWith("/fechar") ? { lacreFechamento: `FCH-VENDA-${url}`, ...payload } : payload;
    return contexto.app.inject({ method: "POST", url, headers, payload: corpo });
  }

  async function criar(url: string, payload: object) {
    const resposta = await post(url, payload);
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return resposta;
  }

  function payloadVendaIntegrada(idVenda: string, idCaixaExterno: string, valor: number, dataHoraVenda: string) {
    return {
      DadosIntegracao: { origem: "vitest-demo" },
      Venda: {
        idVenda,
        idCaixa: idCaixaExterno,
        nomeCaixa: "PDV Demo Integracao",
        idCliente: null,
        nomeCliente: null,
        documentoCliente: null,
        dataHoraVenda,
        valorOriginal: valor,
        desconto: 0,
        acrescimo: 0,
        valorTotal: valor,
        statusVenda: "aprovado",
        numeroNotaFiscal: null
      },
      ItensVenda: [
        {
          idRegistro: `${idVenda}-ITEM-1`,
          idProduto: "PROD-DEMO",
          descricaoProduto: "Pao frances (integracao)",
          dataHoraItem: dataHoraVenda,
          quantidade: 1,
          valorUnitario: valor,
          total: valor,
          itemCancelado: false
        }
      ],
      PagamentosVenda: [{ idVenda, idFormaPagamento: "CARTAO", descricaoFormaPagamento: "Cartao", valor }]
    };
  }

  async function resumoDoCaixa() {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    return json<{
      data: {
        caixaAberto: { id: string };
        resumo: Record<string, number> & {
          porFormaPagamento?: Array<{
            formaPagamento: string;
            total: number;
            quantidade: number;
          }>;
        };
      };
    }>(resposta).data;
  }

  it("cenario completo: 4 operacoes manuais + entrada por integracao", async () => {
    const usuarioAdmin = await usuarioAdminId();

    // Conta + PDV proprios, e vinculo do idCaixa externo -> este PDV (para a venda cair aqui).
    // R-165: a conta do PDV precisa de fundo para as 4 saidas manuais deste cenario.
    const conta = await criar("/api/contas", {
      empresaId: idsTeste.empresaA,
      nome: "Conta demo venda integrada",
      saldoInicial: 100_000
    });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await criar("/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: "PDV demo venda integrada",
      contaId,
      ativo: true
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const vinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno: "PDV-DEMO",
        descricaoExterna: "PDV Demo",
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);

    // A abertura usa o instante real do servidor (R-184). A venda abaixo tambem usa o relogio
    // real, para que a prova nao envelheca quando o calendario avancar.
    const abertura = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieAdmin,
      emailOperador: usuariosTeste.admin.email,
      nome: "venda integrada",
      dataHoraAbertura: "2026-06-29T08:00",
      contaId,
      pdvId,
      registrarLimpeza: false
    });
    const caixaId = abertura.caixaId;
    caixaDoCenarioCompleto = caixaId;

    const dataReferencia = "2026-06-30";
    // Operacoes MANUAIS (entram no caixa por caixa_id).
    await criar("/api/despesas", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataVencimento: dataReferencia,
      descricao: "Conta de luz",
      valorOriginal: 30,
      contaOrigemId: contaId,
      grupoDespesaId: idsTeste.grupoDespesaOperacional
    });
    await criar("/api/retiradas", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataVencimento: dataReferencia,
      descricao: "Vale funcionario",
      valorOriginal: 20,
      contaOrigemId: contaId,
      // R-128: retirada NOVA e de fornecedor ou socio/gestor.
      fornecedorId: idsTeste.fornecedor,
      grupoRetiradaId: idsTeste.grupoRetiradaSangria
    });
    await criar("/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      descricao: "Suprimento do caixa",
      valorOriginal: 50,
      contaOrigemId: idsTeste.contaBanco,
      contaDestinoId: contaId,
      nLacreDoc: "VENDA-SUPRIMENTO-001"
    });
    await confirmarTransferenciaPorLacreDireto("VENDA-SUPRIMENTO-001", await usuarioAdminId());
    await criar("/api/mercadorias", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataVencimento: dataReferencia,
      descricao: "Compra de farinha",
      valorOriginal: 15,
      contaOrigemId: contaId,
      fornecedorId: idsTeste.fornecedor,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      temNotaFiscal: false
    });

    // ENTRADA por INTEGRACAO: venda de 200 no mesmo PDV, dentro do periodo aberto.
    const venda = await post(
      "/api/integracoes",
      payloadVendaIntegrada("VENDA-DEMO-1", "PDV-DEMO", 200, new Date().toISOString()),
      { "x-api-key": idsTeste.integracaoCodigo }
    );
    assertOk(venda);
    expect(json<{ data: { status: string } }>(venda).data.status).toBe("criado");

    const linhaVenda = await consultarUm<{ caixa_id: string | null; pdv_id: string; valor_original: string }>(
      "select caixa_id, pdv_id, valor_original from vendas where identificador_externo = $1",
      ["VENDA-DEMO-1"]
    );
    console.log("[venda integrada gravada]", { ...linhaVenda, pdvDoCaixa: pdvId, caixaAberto: caixaId });

    const status = await resumoDoCaixa();
    console.log("[resumo do caixa]", status.resumo);

    expect(status.caixaAberto.id).toBe(caixaId);
    expect(status.resumo).toMatchObject({
      totalDespesas: 30,
      totalRetiradas: 20,
      totalTransferenciasEntrada: 150,
      totalMercadorias: 15
    });

    // >>> COM O VINCULO (fix): a venda integrada recebe o caixa_id do caixa do seu PDV/periodo e
    // ENTRA no ENTRADAS/saldo do caixa aberto, junto com as operacoes manuais.
    expect(linhaVenda?.caixa_id).toBe(caixaId);
    expect(status.resumo["totalEntradas"]).toBe(200);
    expect(status.resumo.porFormaPagamento).toEqual(
      expect.arrayContaining([expect.objectContaining({ formaPagamento: "Cartao", total: 200, quantidade: 1 })])
    );
    // O cartão integra a venda, mas não entra na gaveta; o físico parte do fundo lacrado de 100.
    expect(status.resumo["saldo"]).toBe(85);
  });

  it("venda integrada de OUTRO periodo/PDV NAO entra no caixa (so entra a do periodo certo)", async () => {
    // Venda cuja dataVenda e ANTES da abertura do caixa criado no teste anterior nao deve vincular.
    const antes = await post(
      "/api/integracoes",
      payloadVendaIntegrada("VENDA-DEMO-FORA", "PDV-DEMO", 999, new Date(Date.now() - 86_400_000).toISOString()),
      { "x-api-key": idsTeste.integracaoCodigo }
    );
    assertOk(antes);
    const linha = await consultarUm<{ caixa_id: string | null }>(
      "select caixa_id from vendas where identificador_externo = $1",
      ["VENDA-DEMO-FORA"]
    );
    expect(linha?.caixa_id).toBeNull();

    // R-186: o proximo caso usa o mesmo operador e precisa iniciar sem um segundo caixa aberto.
    if (!caixaDoCenarioCompleto) throw new Error("Caixa do cenario completo nao foi criado");
    const fechamento = await post(
      `/api/caixa/${caixaDoCenarioCompleto}/fechar`,
      await prepararPayloadFechamentoValido(contexto.app, { cookieOperador: cookieAdmin, caixaId: caixaDoCenarioCompleto })
    );
    expect(fechamento.statusCode, fechamento.body).toBe(204);
    caixaDoCenarioCompleto = null;
  });

  it("aceita venda tardia e marca qual venda alterou o caixa depois do fechamento (R-013)", async () => {
    const conta = await criar("/api/contas", {
      empresaId: idsTeste.empresaA,
      nome: "Conta venda tardia",
      saldoInicial: 100_000
    });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await criar("/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: "PDV venda tardia",
      contaId,
      ativo: true
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    const vinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno: "PDV-VENDA-TARDIA",
        descricaoExterna: "PDV venda tardia",
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);

    const abertura = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieAdmin,
      emailOperador: usuariosTeste.admin.email,
      nome: "venda tardia",
      contaId,
      pdvId,
      registrarLimpeza: false
    });
    const caixaId = abertura.caixaId;
    const caixa = await consultarUm<{ data_hora_abertura: Date }>(
      "select data_hora_abertura from fechamentos_caixa where id = $1",
      [caixaId]
    );
    if (!caixa?.data_hora_abertura) throw new Error("Caixa aberto sem horario de abertura");
    const fechamento = await post(
      `/api/caixa/${caixaId}/fechar`,
      await prepararPayloadFechamentoValido(contexto.app, { cookieOperador: cookieAdmin, caixaId })
    );
    expect(fechamento.statusCode, fechamento.body).toBe(204);

    const venda = await post(
      "/api/integracoes",
      payloadVendaIntegrada(
        "VENDA-TARDIA-R013",
        "PDV-VENDA-TARDIA",
        37.5,
        new Date(caixa.data_hora_abertura.getTime() + 1).toISOString()
      ),
      { "x-api-key": idsTeste.integracaoCodigo }
    );
    assertOk(venda);

    const auditoria = await consultarUm<{
      fechamento_caixa_id: string;
      venda_id: string;
      alterado_em: Date;
      identificador_externo: string;
    }>(
      `select a.fechamento_caixa_id, a.venda_id, a.alterado_em, v.identificador_externo
         from alteracoes_pos_fechamento_caixa a
         join vendas v on v.id = a.venda_id
        where a.fechamento_caixa_id = $1`,
      [caixaId]
    );
    expect(auditoria).toMatchObject({
      fechamento_caixa_id: caixaId,
      identificador_externo: "VENDA-TARDIA-R013"
    });
    expect(auditoria?.alterado_em).toBeInstanceOf(Date);

    const historico = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(historico);
    const linha = json<{ data: Array<{ id: string; alteradoAposFechamento: boolean }> }>(historico).data.find(
      (item) => item.id === caixaId
    );
    expect(linha?.alteradoAposFechamento).toBe(true);

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixaId}/detalhe`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(detalhe);
    expect(
      json<{ data: { alteracoesPosFechamento: Array<{ vendaId: string; identificadorExterno: string }> } }>(detalhe)
        .data.alteracoesPosFechamento
    ).toContainEqual(
      expect.objectContaining({ vendaId: auditoria?.venda_id, identificadorExterno: "VENDA-TARDIA-R013" })
    );
  });
});
