// A receita do CREARE e o saldo das contas — o antes e o depois da #152, pelo fio real.
//
// Este arquivo NASCEU prendendo o estado anterior: "venda do CREARE nao credita conta nenhuma, e por
// isso a porta de saldo recusa saida legitima do PDV". Ele avisava, no proprio cabecalho, que ficaria
// vermelho no dia em que a decisao de negocio chegasse. Chegou (R-167 a R-177), e agora ele prova a
// regra nova — inclusive a metade que NAO mudou.
//
// O que continua igual, e e o ponto mais importante da R-168: sem roteamento configurado, NADA muda.
// A forma que o CREARE cria sozinha nasce sem destino, o pagamento fica PENDENTE e o saldo segue
// zero. Nao existe fallback para Dinheiro, para Outro ou para a conta do PDV "por omissao".
//
// O que muda: com o roteamento configurado pelo Admin, a venda credita — pelo PAGAMENTO, nunca pela
// venda, porque `vendas.conta_origem_id` continua NULL na venda integrada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, json } from "../../setup/integracao.js";

type ContaComSaldo = { id: string; saldoAtual: number };
type PagamentoIntegrado = {
  idFormaPagamento: string;
  descricaoFormaPagamento: string;
  valor: number;
};

describe("receita do CREARE x saldo das contas (#152, R-167 a R-173)", () => {
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

  function payloadVendaIntegrada(
    idVenda: string,
    idCaixaExterno: string,
    valor: number,
    pagamentos?: PagamentoIntegrado[]
  ) {
    const lista: PagamentoIntegrado[] = pagamentos ?? [
      { idFormaPagamento: "DIN", descricaoFormaPagamento: "Dinheiro", valor }
    ];
    return {
      DadosIntegracao: { origem: "vitest-roteamento" },
      Venda: {
        idVenda,
        idCaixa: idCaixaExterno,
        nomeCaixa: "PDV roteamento",
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
      PagamentosVenda: lista.map((pagamento) => ({ idVenda, ...pagamento }))
    };
  }

  // Conta + PDV + vinculo do PDV, para a prova nao depender do estado do seed.
  async function montarPdv(sufixo: string) {
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `Conta ${sufixo} ${carimbo}`, saldoInicial: 0 }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `PDV ${sufixo} ${carimbo}`, contaId, ativo: true }
    });
    expect(pdv.statusCode, pdv.body).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const identificadorExterno = `PDV-${sufixo.toUpperCase()}-${carimbo}`;
    const vinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno,
        descricaoExterna: `PDV ${sufixo}`,
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);
    return { contaId, pdvId, identificadorExterno };
  }

  async function ingerir(payload: ReturnType<typeof payloadVendaIntegrada>) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload
    });
  }

  async function saldoDaConta(contaId: string) {
    const saldos = await contexto.app.inject({
      method: "GET",
      url: `/api/contas/saldos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(saldos);
    return json<{ data: ContaComSaldo[] }>(saldos).data.find((conta) => conta.id === contaId)?.saldoAtual ?? null;
  }

  async function criarConta(nome: string) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `${nome} ${carimbo}`, saldoInicial: 0 }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  // Roteia, pelo cadastro real (Admin + permissao dedicada), a forma que o CREARE criou sozinha.
  async function rotearFormaComoDinheiro(nomeDaForma: string) {
    const forma = await consultarUm<{ id: string; nome: string }>(
      "select id, nome from formas_pagamento where empresa_id = $1 and nome = $2",
      [idsTeste.empresaA, nomeDaForma]
    );
    expect(forma, `a forma ${nomeDaForma} deveria ter sido criada pela ingestao`).toBeTruthy();
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${forma?.id}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: forma?.nome,
        disponibilidade: "imediata",
        usaContaDoPdv: true
      }
    });
    expect(resposta.statusCode, resposta.body).toBe(204);
    return forma?.id ?? "";
  }

  async function pagamentosDaVenda(idVenda: string) {
    const venda = await consultarUm<{ id: string; conta_origem_id: string | null; computar: boolean }>(
      "select id, conta_origem_id, computar from vendas where identificador_externo = $1",
      [idVenda]
    );
    const pagamentos = await consultarTodos<{
      roteamento_status: string;
      conta_recebivel_id: string | null;
      conta_final_id: string | null;
      disponivel_em: string | null;
      adquirente: string | null;
      total_pago: string;
    }>(
      `select roteamento_status, conta_recebivel_id, conta_final_id, disponivel_em, adquirente, total_pago
         from vendas_pagamentos where venda_id = $1 order by total_pago`,
      [venda?.id]
    );
    return { venda, pagamentos };
  }

  // -------------------------------------------------------------------------------------------
  // R-168 — sem roteamento, nada muda. E a metade do arquivo antigo que CONTINUA valendo.
  // -------------------------------------------------------------------------------------------

  it("forma sem roteamento: venda existe, pagamento fica PENDENTE e o saldo segue zero", async () => {
    const { contaId, identificadorExterno } = await montarPdv("sem-roteamento");
    const idVenda = `SEM-ROT-${carimbo}`;
    const ingestao = await ingerir(
      payloadVendaIntegrada(idVenda, identificadorExterno, 500, [
        { idFormaPagamento: `DIN-SR-${carimbo}`, descricaoFormaPagamento: `Dinheiro SR ${carimbo}`, valor: 500 }
      ])
    );
    expect(ingestao.statusCode, ingestao.body).toBe(200);

    const { venda, pagamentos } = await pagamentosDaVenda(idVenda);
    expect(venda, "a venda integrada deveria existir").toBeTruthy();
    expect(venda?.computar).toBe(true);
    // A venda integrada NUNCA carrega conta de origem: ela credita pelo pagamento.
    expect(venda?.conta_origem_id, "venda integrada nasce sem conta de origem").toBeNull();

    expect(pagamentos.length).toBe(1);
    expect(pagamentos[0]?.roteamento_status, "sem cadastro de roteamento o pagamento fica pendente").toBe("pendente");
    // O coracao da R-168: nenhum destino inventado.
    expect(pagamentos[0]?.conta_final_id, "nada de cair na conta do PDV por omissao").toBeNull();
    expect(pagamentos[0]?.disponivel_em).toBeNull();

    expect(await saldoDaConta(contaId), "a receita de 500 nao credita nada sem roteamento").toBe(0);
  });

  it("e a porta de saldo continua recusando saida da conta que vendeu, como antes da #152", async () => {
    const { contaId, identificadorExterno } = await montarPdv("recusa");
    await ingerir(
      payloadVendaIntegrada(`RECUSA-${carimbo}`, identificadorExterno, 500, [
        { idFormaPagamento: `DIN-RE-${carimbo}`, descricaoFormaPagamento: `Dinheiro RE ${carimbo}`, valor: 500 }
      ])
    );

    const despesa = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-08-12",
        dataVencimento: "2026-08-12",
        observacao: "prova receita CREARE sem roteamento",
        valorOriginal: 100,
        contaOrigemId: contaId,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        computar: true
      }
    });
    expect(despesa.statusCode, despesa.body).toBe(409);
    expect(json<{ code?: string }>(despesa).code).toBe("SALDO_INSUFICIENTE");
  });

  // -------------------------------------------------------------------------------------------
  // R-167/R-169 — com roteamento, o dinheiro chega. E so o que ja esta disponivel.
  // -------------------------------------------------------------------------------------------

  it("dinheiro roteado para a conta do PDV credita o saldo e libera a saida", async () => {
    const { contaId, identificadorExterno } = await montarPdv("com-roteamento");
    const nomeForma = `Dinheiro CR ${carimbo}`;
    const idForma = `DIN-CR-${carimbo}`;

    // 1a ingestao: a forma nasce sem roteamento, o pagamento fica pendente e nada credita.
    await ingerir(
      payloadVendaIntegrada(`COM-ROT-A-${carimbo}`, identificadorExterno, 500, [
        { idFormaPagamento: idForma, descricaoFormaPagamento: nomeForma, valor: 500 }
      ])
    );
    expect(await saldoDaConta(contaId), "antes de rotear, zero").toBe(0);

    await rotearFormaComoDinheiro(nomeForma);

    // 2a ingestao, venda NOVA: nasce roteada e disponivel.
    const idVenda = `COM-ROT-B-${carimbo}`;
    const ingestao = await ingerir(
      payloadVendaIntegrada(idVenda, identificadorExterno, 300, [
        { idFormaPagamento: idForma, descricaoFormaPagamento: nomeForma, valor: 300 }
      ])
    );
    expect(ingestao.statusCode, ingestao.body).toBe(200);

    const { venda, pagamentos } = await pagamentosDaVenda(idVenda);
    // Continua sem conta de origem: o credito vem do PAGAMENTO. E o que impede dupla contagem.
    expect(venda?.conta_origem_id).toBeNull();
    expect(pagamentos[0]?.roteamento_status).toBe("roteado");
    expect(pagamentos[0]?.conta_recebivel_id, "dinheiro fisico: recebivel e final sao a conta do PDV").toBe(contaId);
    expect(pagamentos[0]?.conta_final_id).toBe(contaId);
    expect(pagamentos[0]?.disponivel_em, "dinheiro fisico ja e saldo").not.toBeNull();

    // 300 da venda nova. A venda de 500 anterior ao roteamento continua pendente e NAO entra.
    expect(await saldoDaConta(contaId), "credita so a venda que nasceu roteada").toBe(300);

    const despesa = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-08-12",
        dataVencimento: "2026-08-12",
        observacao: "saida legitima com roteamento",
        valorOriginal: 100,
        contaOrigemId: contaId,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        computar: true
      }
    });
    expect(despesa.statusCode, despesa.body).toBe(201);
    expect(await saldoDaConta(contaId)).toBe(200);
  });

  it("cartao roteado vira RECEBIVEL: existe no roteamento e NAO entra no saldo", async () => {
    const { contaId, identificadorExterno } = await montarPdv("cartao");
    const nomeForma = `Cartao ${carimbo}`;
    const idForma = `CAR-${carimbo}`;
    const contaRecebivelId = await criarConta("Recebivel cartao");
    const contaFinalId = await criarConta("Banco cartao");

    await ingerir(
      payloadVendaIntegrada(`CARTAO-A-${carimbo}`, identificadorExterno, 100, [
        { idFormaPagamento: idForma, descricaoFormaPagamento: nomeForma, valor: 100 }
      ])
    );
    const forma = await consultarUm<{ id: string }>(
      "select id from formas_pagamento where empresa_id = $1 and nome = $2",
      [idsTeste.empresaA, nomeForma]
    );
    const configurar = await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${forma?.id}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: nomeForma,
        adquirente: "Cielo",
        disponibilidade: "por_evento",
        contaRecebivelId,
        contaFinalId
      }
    });
    expect(configurar.statusCode, configurar.body).toBe(204);

    const idVenda = `CARTAO-B-${carimbo}`;
    await ingerir(
      payloadVendaIntegrada(idVenda, identificadorExterno, 400, [
        { idFormaPagamento: idForma, descricaoFormaPagamento: nomeForma, valor: 400 }
      ])
    );
    const { pagamentos } = await pagamentosDaVenda(idVenda);
    expect(pagamentos[0]?.roteamento_status).toBe("roteado");
    expect(pagamentos[0]?.conta_recebivel_id).toBe(contaRecebivelId);
    expect(pagamentos[0]?.conta_final_id).toBe(contaFinalId);
    expect(pagamentos[0]?.adquirente).toBe("Cielo");
    // R-169: roteado NAO e o mesmo que disponivel. Sem liquidacao, o cartao nao vira saldo.
    expect(pagamentos[0]?.disponivel_em, "recebivel em aberto nao tem data de disponibilidade").toBeNull();

    // Nenhuma das tres contas recebeu saldo: nem a do PDV, nem o recebivel, nem a final.
    expect(await saldoDaConta(contaId), "cartao nao vai para a conta do PDV").toBe(0);
    expect(await saldoDaConta(contaRecebivelId), "recebivel existe, mas nao e saldo gastavel").toBe(0);
    expect(await saldoDaConta(contaFinalId), "a conta final so recebe quando liquidar").toBe(0);
  });

  it("venda dividida credita SO a parcela em dinheiro (o exemplo do gate)", async () => {
    const { contaId, identificadorExterno } = await montarPdv("dividida");
    const nomeDinheiro = `Dinheiro DIV ${carimbo}`;
    const nomeCartao = `Cartao DIV ${carimbo}`;
    const divididos: PagamentoIntegrado[] = [
      { idFormaPagamento: `DIN-DV-${carimbo}`, descricaoFormaPagamento: nomeDinheiro, valor: 40 },
      { idFormaPagamento: `CAR-DV-${carimbo}`, descricaoFormaPagamento: nomeCartao, valor: 60 }
    ];

    await ingerir(payloadVendaIntegrada(`DIV-A-${carimbo}`, identificadorExterno, 100, divididos));
    await rotearFormaComoDinheiro(nomeDinheiro);

    const idVenda = `DIV-B-${carimbo}`;
    await ingerir(payloadVendaIntegrada(idVenda, identificadorExterno, 100, divididos));

    // 40 em dinheiro entram; 60 do cartao (sem roteamento) ficam pendentes e nao entram.
    expect(await saldoDaConta(contaId), "so os 40 de dinheiro viram saldo").toBe(40);

    const { pagamentos } = await pagamentosDaVenda(idVenda);
    expect(pagamentos.map((linha) => linha.roteamento_status).sort()).toEqual(["pendente", "roteado"]);
  });

  // -------------------------------------------------------------------------------------------
  // R-173 — soma nao fecha: a VENDA INTEIRA fica pendente e nada entra em conta nenhuma.
  // -------------------------------------------------------------------------------------------

  it("soma dos pagamentos diferente do liquido deixa a venda INTEIRA pendente", async () => {
    const { contaId, identificadorExterno } = await montarPdv("divergente");
    const nomeForma = `Dinheiro DIVERG ${carimbo}`;
    const idForma = `DIN-DG-${carimbo}`;

    await ingerir(
      payloadVendaIntegrada(`DVG-A-${carimbo}`, identificadorExterno, 100, [
        { idFormaPagamento: idForma, descricaoFormaPagamento: nomeForma, valor: 100 }
      ])
    );
    await rotearFormaComoDinheiro(nomeForma);

    // Venda de 100 com pagamentos somando 99: um centavo ja e divergencia (tolerancia ZERO).
    const idVenda = `DVG-B-${carimbo}`;
    const ingestao = await ingerir(
      payloadVendaIntegrada(idVenda, identificadorExterno, 100, [
        { idFormaPagamento: idForma, descricaoFormaPagamento: nomeForma, valor: 99 }
      ])
    );
    // A venda NAO e recusada: ela e preservada (R-168/R-170).
    expect(ingestao.statusCode, ingestao.body).toBe(200);

    const { venda, pagamentos } = await pagamentosDaVenda(idVenda);
    expect(venda, "a venda divergente continua gravada").toBeTruthy();
    expect(
      pagamentos.every((linha) => linha.roteamento_status === "pendente"),
      "venda inteira pendente"
    ).toBe(true);
    expect(
      pagamentos.every((linha) => linha.conta_final_id === null),
      "nenhum destino escolhido"
    ).toBe(true);

    expect(await saldoDaConta(contaId), "nada entra quando a soma nao fecha").toBe(0);
  });

  it("divergencia de UM centavo tambem nao credita — sem tolerancia herdada da conciliacao", async () => {
    const { contaId, identificadorExterno } = await montarPdv("um-centavo");
    const nomeForma = `Dinheiro CENT ${carimbo}`;
    const idForma = `DIN-CT-${carimbo}`;
    await ingerir(
      payloadVendaIntegrada(`CENT-A-${carimbo}`, identificadorExterno, 10, [
        { idFormaPagamento: idForma, descricaoFormaPagamento: nomeForma, valor: 10 }
      ])
    );
    await rotearFormaComoDinheiro(nomeForma);

    await ingerir(
      payloadVendaIntegrada(`CENT-B-${carimbo}`, identificadorExterno, 10, [
        { idFormaPagamento: idForma, descricaoFormaPagamento: nomeForma, valor: 9.99 }
      ])
    );
    expect(await saldoDaConta(contaId), "1 centavo de diferenca ja impede o credito").toBe(0);
  });
});
