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
import { encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
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

async function usuarioAdminId() {
  const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
    usuariosTeste.admin.email
  ]);
  if (!usuario) throw new Error("Usuario admin nao encontrado");
  return usuario.id;
}

describe("#152 — pendencias por permissao e PUT da venda integrada (R-177)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieGerente: string;
  let cookieCaixa: string;
  const carimbo = Date.now();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
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

  // O CONFIGURADOR PURO: tem a permissao dedicada da R-176 e nenhuma permissao financeira. E o unico
  // ator que exercita o ramo das duas metades decididas em separado — 403 aqui seria falso-verde,
  // porque provaria que a rota fechou, nao que o agregado foi retido.
  it("quem so CONFIGURA ve o que falta configurar e recebe o financeiro como null", async () => {
    const cookieConfigurador = await cookieSessao(contexto.app, "configuradorRoteamento");
    const resposta = await pendencias(cookieConfigurador);
    assertOk(resposta);
    const dados = json<{ data: Pendencias }>(resposta).data;

    // Ve a lista de trabalho dele...
    expect(dados.formasSemRoteamento, "o configurador precisa ver o que falta configurar").not.toBeNull();
    // ...e NAO ve dinheiro. `null` e o contrato: "voce nao ve isto", diferente de lista vazia.
    expect(dados.vendasPendentes, "faturamento agregado nao chega a quem so configura").toBeNull();
    // Prova pelo corpo cru: nenhum numero de faturamento atravessa.
    expect(resposta.body).not.toContain("valorTotal");
    expect(resposta.body).not.toContain("totalPagamentos");
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
          dataHoraVenda: new Date().toISOString(),
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

    // Sem o caixa aberto do admin, o PUT morre na regra de caixa antes de chegar na R-177 — e o
    // teste provaria a regra errada.
    const abrirCaixa = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId,
        usuarioCaixaId: await usuarioAdminId(),
        observacao: "Caixa R177"
      }
    });
    expect(abrirCaixa.statusCode, abrirCaixa.body).toBe(201);

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
          dataHoraVenda: new Date().toISOString(),
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
    // Status EXATO. `validarVenda` roda antes da transacao e recusa primeiro, porque 999 nao bate com
    // o valor final cobrado do cliente — a MESMA base da R-173, desde que a formula foi unificada
    // (confirmacao de Marco, 26/08). Antes existiam duas bases e a mensagem apontava para o subtotal.
    expect(somaQuebrada.statusCode, somaQuebrada.body).toBe(400);
    expect(somaQuebrada.body).toContain("valor final cobrado do cliente");

    // E o que realmente conta: nada foi reescrito no banco por essa tentativa.
    const aposTentativa = await consultarUm<{ total: string; linhas: string }>(
      `select coalesce(sum(total_pago), 0)::text as total, count(*)::text as linhas
         from vendas_pagamentos where venda_id = $1`,
      [venda?.id]
    );
    expect(Number(aposTentativa?.total)).toBe(120);
    expect(Number(aposTentativa?.linhas)).toBe(1);

    // 3) A R-177 nao bloqueia DEMAIS: editar so um campo permitido PASSA, com status exato.
    //
    // O teste anterior aceitava qualquer resposta que nao fosse codigo da R-177 — asserção que nao
    // conseguia falhar, e que por isso serviu de cobertura para o P0 do PUT destrutivo.
    const mudarObservacao = await contexto.app.inject({
      method: "PUT",
      url: `/api/vendas/${venda?.id}`,
      headers: { cookie: cookieAdmin },
      payload: { ...base, observacao: `revisado ${carimbo}` }
    });
    expect(mudarObservacao.statusCode, mudarObservacao.body).toBe(200);

    // O campo permitido mudou, e os dois campos protegidos seguem como a integracao os deixou.
    const depois = await consultarUm<{ conta_origem_id: string | null; observacao: string | null }>(
      "select conta_origem_id, observacao from vendas where id = $1",
      [venda?.id]
    );
    expect(depois?.observacao).toBe(`revisado ${carimbo}`);
    expect(depois?.conta_origem_id, "venda integrada segue sem conta de origem").toBeNull();
    const pagamentosDepois = await consultarUm<{ total: string; linhas: string }>(
      `select coalesce(sum(total_pago), 0)::text as total, count(*)::text as linhas
         from vendas_pagamentos where venda_id = $1`,
      [venda?.id]
    );
    expect(Number(pagamentosDepois?.total), "os pagamentos nao foram reescritos").toBe(120);
    expect(Number(pagamentosDepois?.linhas), "nem duplicados").toBe(1);
  });
});
