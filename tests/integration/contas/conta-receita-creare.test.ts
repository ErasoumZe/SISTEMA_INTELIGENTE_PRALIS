// PROVA do estado ATUAL: a receita da venda vinda do CREARE nao credita conta nenhuma no saldo.
//
// Este arquivo NAO propoe correcao — ele PRENDE o comportamento medido, porque a correcao depende
// de decisao de negocio do Jose (qual conta recebe cada forma de pagamento, e quando o valor fica
// disponivel). Sem essa decisao, qualquer "conserto" aqui seria regra financeira inventada.
//
// Por que isso importa para a porta de saldo (R-143/R-165): a porta recusa saida sem fundo. Se a
// receita real do PDV nao entra em nenhuma conta que o saldo enxerga, a porta passa a recusar
// despesa/mercadoria/retirada/transferencia LEGITIMAS da conta do PDV — e o operador de caixa e o
// mais exposto, porque a R-121 o prende a conta do PDV e ele nao tem outra para escolher.
//
// Mecanismo, verificado no codigo:
//   - `criarOuAtualizarVendaIntegradaRepository` monta `valoresVenda` SEM `contaOrigemId`
//     (api/src/integracoes/integracoes.repository.ts) -> a venda nasce com `conta_origem_id = NULL`;
//   - `saldosDasContasRepository` soma vendas com `inArray(vendas.contaOrigemId, contaIds)`
//     (api/src/contas/contas.repository.ts) -> linha com NULL nunca entra em conta alguma.
//
// Se algum dia a venda integrada passar a gravar a conta, ESTE arquivo fica vermelho — de
// proposito: e o sinal de que a decisao do Jose foi implementada e precisa ser revista aqui.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

type ContaComSaldo = { id: string; saldoAtual: number };

describe("receita do CREARE x saldo das contas (prova do estado atual, R-165)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  const carimbo = Date.now();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  function payloadVendaIntegrada(idVenda: string, idCaixaExterno: string, valor: number) {
    return {
      DadosIntegracao: { origem: "vitest-prova-receita" },
      Venda: {
        idVenda,
        idCaixa: idCaixaExterno,
        nomeCaixa: "PDV prova receita",
        idCliente: null,
        nomeCliente: null,
        documentoCliente: null,
        dataHoraVenda: "2026-08-12T12:00:00.000Z",
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
          idProduto: "PROD-EXT",
          descricaoProduto: "Pao frances (integracao)",
          dataHoraItem: "2026-08-12T12:00:00.000Z",
          quantidade: 1,
          valorUnitario: valor,
          total: valor,
          itemCancelado: false
        }
      ],
      PagamentosVenda: [{ idVenda, idFormaPagamento: "DIN", descricaoFormaPagamento: "Dinheiro", valor }]
    };
  }

  it("venda do CREARE nasce SEM conta de origem e nao entra no saldo de nenhuma conta", async () => {
    // Conta + PDV proprios, para que a prova nao dependa do estado das contas do seed.
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `Prova receita ${carimbo}`, saldoInicial: 0 }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `PDV prova receita ${carimbo}`, contaId, ativo: true }
    });
    expect(pdv.statusCode, pdv.body).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const identificadorExterno = `PDV-PROVA-${carimbo}`;
    const vinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno,
        descricaoExterna: "PDV prova receita",
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);

    // Venda de R$ 500 pela ROTA REAL da integracao (sem tocar no CREARE de verdade).
    const idVenda = `PROVA-RECEITA-${carimbo}`;
    const ingestao = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payloadVendaIntegrada(idVenda, identificadorExterno, 500)
    });
    expect(ingestao.statusCode, ingestao.body).toBe(200);

    // 1) A venda existe, aprovada e computavel...
    const venda = await consultarUm<{ conta_origem_id: string | null; valor_original: string; computar: boolean }>(
      "select conta_origem_id, valor_original, computar from vendas where identificador_externo = $1",
      [idVenda]
    );
    expect(venda, "a venda integrada deveria existir").toBeTruthy();
    expect(venda?.computar).toBe(true);
    // 2) ...e MESMO ASSIM nasce sem conta de origem.
    expect(venda?.conta_origem_id, "hoje a venda do CREARE nao carrega conta de credito").toBeNull();

    // 3) Consequencia direta: o saldo da conta do PDV segue ZERO, apesar dos R$ 500 de receita.
    const saldos = await contexto.app.inject({
      method: "GET",
      url: `/api/contas/saldos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(saldos);
    const linha = json<{ data: ContaComSaldo[] }>(saldos).data.find((c) => c.id === contaId);
    expect(linha?.saldoAtual, "a receita de 500 nao creditou a conta do PDV").toBe(0);
  });

  it("por isso a porta recusa uma saida LEGITIMA da conta que acabou de vender R$ 500", async () => {
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `Prova recusa ${carimbo}`, saldoInicial: 0 }
    });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `PDV prova recusa ${carimbo}`, contaId, ativo: true }
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    const identificadorExterno = `PDV-RECUSA-${carimbo}`;
    await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno,
        descricaoExterna: "PDV prova recusa",
        registroSistemaId: pdvId
      }
    });
    const ingestao = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payloadVendaIntegrada(`PROVA-RECUSA-${carimbo}`, identificadorExterno, 500)
    });
    expect(ingestao.statusCode, ingestao.body).toBe(200);

    // Despesa de R$ 100 contra uma conta que faturou R$ 500 no mesmo dia: hoje e RECUSADA.
    const despesa = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-08-12",
        dataVencimento: "2026-08-12",
        observacao: "prova receita CREARE",
        valorOriginal: 100,
        contaOrigemId: contaId,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        computar: true
      }
    });

    expect(despesa.statusCode, despesa.body).toBe(409);
    expect(json<{ code?: string }>(despesa).code).toBe("SALDO_INSUFICIENTE");
  });
});
