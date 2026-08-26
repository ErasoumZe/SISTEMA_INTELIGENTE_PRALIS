// #152 — o endpoint de pendencias (quem ve o que) e a R-177 pelo fio HTTP.
//
// As duas metades da pendencia moram no MESMO endereco de proposito: e a mesma pergunta ("o que esta
// pendente no roteamento?") feita por dois publicos. O que muda e a permissao de cada metade —
// configurador ve o que falta configurar, financeiro ve quanto esta parado. Faturamento agregado
// NUNCA chega a quem so tem permissao cadastral.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

type Pendencias = {
  formasSemRoteamento: Array<{ id: string; nome: string }> | null;
  vendasPendentes: {
    totalPagamentos: number;
    totalVendas: number;
    valorTotal: number;
    listaTruncada: boolean;
    itens: Array<{ vendaId: string; valor: number; formaPagamento: string | null }>;
  } | null;
};

describe("#152 — pendencias por permissao e PUT da venda integrada (R-177)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieGerente: string;
  let cookieCaixa: string;
  const carimbo = Date.now();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function pendencias(cookie: string) {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/roteamento/pendencias?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });
    return resposta;
  }

  // -------------------------------------------------------------------------------------------
  // Pendencias — cada metade atras da sua permissao
  // -------------------------------------------------------------------------------------------

  it("o Admin ve as duas metades: o que falta configurar e quanto esta parado", async () => {
    const resposta = await pendencias(cookieAdmin);
    assertOk(resposta);
    const dados = json<{ data: Pendencias }>(resposta).data;
    expect(dados.formasSemRoteamento, "o admin configura, entao ve a lista").not.toBeNull();
    expect(dados.vendasPendentes, "o admin tambem ve dinheiro").not.toBeNull();
    expect(typeof dados.vendasPendentes?.valorTotal).toBe("number");
  });

  it("quem so configura NAO recebe faturamento agregado", async () => {
    // O gerente do seed tem cadastro de formas, e nao tem `entradas_visualizar` nem a permissao
    // dedicada de roteamento: para ele as duas metades sao invisiveis, e a rota nem abre.
    const resposta = await pendencias(cookieGerente);
    expect(resposta.statusCode, resposta.body).toBe(403);
    expect(json<{ code?: string }>(resposta).code).toBe("INSUFFICIENT_PERMISSION");
  });

  // O operador de CAIXA nao entra. `entradas_visualizar` vem com `somente_caixa_aberto`, e em
  // `GET /api/vendas` o servidor o prende ao dia do caixa dele. Esta rota nao tem esse recorte, entao
  // liberar por `entradas_visualizar` entregaria a ele o faturamento pendente da empresa inteira, de
  // todos os PDVs e de todos os dias.
  it("o operador de caixa NAO ve o faturamento pendente da empresa", async () => {
    const resposta = await pendencias(cookieCaixa);
    expect(resposta.statusCode, resposta.body).toBe(403);
    expect(json<{ code?: string }>(resposta).code).toBe("INSUFFICIENT_PERMISSION");
  });

  it("a pendencia aparece de verdade quando uma venda fica sem roteamento", async () => {
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `Conta pend ${carimbo}`, saldoInicial: 0 }
    });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `PDV pend ${carimbo}`, contaId, ativo: true }
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    const identificadorExterno = `PDV-PEND-${carimbo}`;
    await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno,
        descricaoExterna: "PDV pend",
        registroSistemaId: pdvId
      }
    });

    const antes = json<{ data: Pendencias }>(await pendencias(cookieAdmin)).data;
    const idVenda = `PEND-${carimbo}`;
    const nomeForma = `Forma pendente ${carimbo}`;
    await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: {
        DadosIntegracao: { origem: "vitest-pendencias" },
        Venda: {
          idVenda,
          idCaixa: identificadorExterno,
          nomeCaixa: "PDV pend",
          idCliente: null,
          nomeCliente: null,
          documentoCliente: null,
          dataHoraVenda: "2026-08-12T12:00:00.000Z",
          valorOriginal: 77,
          desconto: 0,
          acrescimo: 0,
          valorTotal: 77,
          statusVenda: "aprovado",
          numeroNotaFiscal: null
        },
        ItensVenda: [],
        PagamentosVenda: [
          { idVenda, idFormaPagamento: `PEN-${carimbo}`, descricaoFormaPagamento: nomeForma, valor: 77 }
        ]
      }
    });

    const depois = json<{ data: Pendencias }>(await pendencias(cookieAdmin)).data;
    expect(depois.vendasPendentes?.totalPagamentos ?? 0).toBe((antes.vendasPendentes?.totalPagamentos ?? 0) + 1);
    expect(depois.vendasPendentes?.valorTotal ?? 0).toBeCloseTo((antes.vendasPendentes?.valorTotal ?? 0) + 77, 2);
    // A forma que o CREARE acabou de criar entra na lista de "falta configurar".
    expect(depois.formasSemRoteamento?.some((forma) => forma.nome === nomeForma)).toBe(true);
    // E a venda aparece na lista, com a forma que ficou sem destino.
    expect(depois.vendasPendentes?.itens.some((item) => item.formaPagamento === nomeForma)).toBe(true);
  });

  // -------------------------------------------------------------------------------------------
  // R-177 — a retaguarda nao edita pagamento nem conta de origem de venda integrada
  // -------------------------------------------------------------------------------------------

  it("PUT em venda integrada recusa mudar os pagamentos e a conta de origem", async () => {
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `Conta R177 ${carimbo}`, saldoInicial: 0 }
    });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `PDV R177 ${carimbo}`, contaId, ativo: true }
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    const identificadorExterno = `PDV-R177-${carimbo}`;
    await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno,
        descricaoExterna: "PDV R177",
        registroSistemaId: pdvId
      }
    });

    const idVenda = `R177-${carimbo}`;
    const nomeForma = `Forma R177 ${carimbo}`;
    const ingestao = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: {
        DadosIntegracao: { origem: "vitest-r177" },
        Venda: {
          idVenda,
          idCaixa: identificadorExterno,
          nomeCaixa: "PDV R177",
          idCliente: null,
          nomeCliente: null,
          documentoCliente: null,
          dataHoraVenda: "2026-08-12T12:00:00.000Z",
          valorOriginal: 120,
          desconto: 0,
          acrescimo: 0,
          valorTotal: 120,
          statusVenda: "aprovado",
          numeroNotaFiscal: null
        },
        ItensVenda: [],
        PagamentosVenda: [
          { idVenda, idFormaPagamento: `R177-${carimbo}`, descricaoFormaPagamento: nomeForma, valor: 120 }
        ]
      }
    });
    expect(ingestao.statusCode, ingestao.body).toBe(200);

    const venda = await consultarUm<{ id: string }>("select id from vendas where identificador_externo = $1", [
      idVenda
    ]);
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas/${venda?.id}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(detalhe);
    const atual = json<{
      data: {
        empresaId: string;
        dataReferencia: string;
        descricao: string;
        valorOriginal: number;
        valorDesconto: number;
        valorAcrescimo: number;
        observacao: string | null;
        contaOrigemId: string | null;
        pdvId: string | null;
        computar: boolean;
        tiposPagamento: Array<{ formaPagamentoId: string | null; totalPago: number }>;
      };
    }>(detalhe).data;

    const base = {
      empresaId: atual.empresaId,
      dataReferencia: atual.dataReferencia,
      descricao: atual.descricao,
      valorOriginal: atual.valorOriginal,
      valorDesconto: atual.valorDesconto,
      valorAcrescimo: atual.valorAcrescimo,
      pdvId: atual.pdvId,
      computar: atual.computar,
      contaOrigemId: atual.contaOrigemId,
      tiposPagamento: atual.tiposPagamento
    };

    // 1) Mexer nos PAGAMENTOS: recusado, com mensagem que diz o porque.
    //
    // A tentativa PRESERVA a soma (120 = 60 + 60) de proposito. Um valor que nao fecha morreria
    // antes, na regra de soma da venda, e o teste passaria pelo motivo errado — provaria que a
    // validacao antiga funciona, nao que a R-177 existe. O ataque real e re-dividir o pagamento
    // entre formas, que e justamente o que reescreveria o roteamento.
    const mudarPagamentos = await contexto.app.inject({
      method: "PUT",
      url: `/api/vendas/${venda?.id}`,
      headers: { cookie: cookieAdmin },
      payload: {
        ...base,
        tiposPagamento: [
          { formaPagamentoId: null, totalPago: 60 },
          { formaPagamentoId: null, totalPago: 60 }
        ]
      }
    });
    expect(mudarPagamentos.statusCode, mudarPagamentos.body).toBe(403);
    expect(json<{ code?: string }>(mudarPagamentos).code).toBe("VENDA_INTEGRADA_PAGAMENTOS");
    expect(json<{ title?: string }>(mudarPagamentos).title).toContain("reenvio");

    // 2) Mexer na CONTA DE ORIGEM: recusado. Com roteamento, isso apagaria o credito em silencio.
    const mudarConta = await contexto.app.inject({
      method: "PUT",
      url: `/api/vendas/${venda?.id}`,
      headers: { cookie: cookieAdmin },
      payload: { ...base, contaOrigemId: contaId }
    });
    expect(mudarConta.statusCode, mudarConta.body).toBe(403);
    expect(json<{ code?: string }>(mudarConta).code).toBe("VENDA_INTEGRADA_CONTA_ORIGEM");

    // 2b) E um payload que tambem quebra a soma continua recusado — por qualquer porta, nunca passa.
    const somaQuebrada = await contexto.app.inject({
      method: "PUT",
      url: `/api/vendas/${venda?.id}`,
      headers: { cookie: cookieAdmin },
      payload: { ...base, tiposPagamento: [{ formaPagamentoId: null, totalPago: 999 }] }
    });
    expect(somaQuebrada.statusCode, somaQuebrada.body).toBeGreaterThanOrEqual(400);
    expect(somaQuebrada.statusCode).toBeLessThan(500);

    // 3) A R-177 nao bloqueia DEMAIS: mexer so num campo permitido nao dispara a recusa dela.
    //
    // A afirmacao e sobre o CODIGO, e nao sobre 200, de proposito. A venda integrada nasce vinculada
    // ao caixa do turno, e editar lancamento de caixa que nao e o seu ja era recusado antes da #152
    // (regra de caixa aberto). Exigir 200 aqui faria o teste depender do estado de caixa da fixture e
    // provaria outra coisa. O que precisa ser verdade e: se recusar, NAO e por causa da R-177.
    const mudarObservacao = await contexto.app.inject({
      method: "PUT",
      url: `/api/vendas/${venda?.id}`,
      headers: { cookie: cookieAdmin },
      payload: { ...base, observacao: `revisado ${carimbo}` }
    });
    const codigoObservacao = json<{ code?: string }>(mudarObservacao).code;
    expect(
      ["VENDA_INTEGRADA_PAGAMENTOS", "VENDA_INTEGRADA_CONTA_ORIGEM"],
      `editar campo permitido nao pode cair na R-177. Resposta: ${mudarObservacao.body}`
    ).not.toContain(codigoObservacao);

    // E os dois campos protegidos seguem como a integracao os deixou.
    const depois = await consultarUm<{ conta_origem_id: string | null }>(
      "select conta_origem_id from vendas where id = $1",
      [venda?.id]
    );
    expect(depois?.conta_origem_id, "venda integrada segue sem conta de origem").toBeNull();
    const pagamentosDepois = await consultarUm<{ total: string }>(
      "select coalesce(sum(total_pago), 0)::text as total from vendas_pagamentos where venda_id = $1",
      [venda?.id]
    );
    expect(Number(pagamentosDepois?.total), "os pagamentos nao foram reescritos").toBe(120);
  });
});
