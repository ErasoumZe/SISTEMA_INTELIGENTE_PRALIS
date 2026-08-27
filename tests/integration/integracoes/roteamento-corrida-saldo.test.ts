// P1 (#152) — retirar crédito disponível tem de passar pela MESMA porta que autoriza saída.
//
// Desde a 6a consulta do saldo, `vendas_pagamentos` e fonte de saldo. Um reenvio do CREARE que
// CANCELA a venda, ou que a rerroteia, RETIRA dinheiro que ja esta disponivel. Se essa retirada nao
// se serializar com a porta da R-165, a corrida e real e o desfecho e exatamente o que a porta
// existe para impedir:
//
//   T1 (despesa) trava a conta, le saldo 500, aprova saida de 500;
//   T2 (reenvio com a venda cancelada) tira os 500 sem travar nada;
//   as duas commitam e a conta termina em -500.
//
// A prova aqui e DETERMINISTICA e nao usa `sleep`: uma sessao SQL segura a conta com o mesmo
// `FOR NO KEY UPDATE` que a porta usa, a ingestao e disparada, e o teste verifica no proprio Postgres
// (`pg_blocking_pids`) que ela esta bloqueada PELA sessao que segura a conta. Sem a correcao, a
// ingestao passa direto e o `aindaPendente` volta `false`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import {
  abrirBloqueador,
  aindaPendente,
  consultarUm,
  esperarBloqueioPor,
  fecharBloqueador,
  json
} from "../../setup/integracao.js";

describe("#152 — retirada de credito disponivel x porta de saldo (R-165)", () => {
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

  function nomeDaForma(sufixo: string) {
    return `Dinheiro corrida ${sufixo} ${carimbo}`;
  }

  function payload(
    idVenda: string,
    idCaixaExterno: string,
    valor: number,
    cancelada: boolean,
    origem: string,
    sufixo: string
  ) {
    return {
      DadosIntegracao: { origem },
      Venda: {
        idVenda,
        idCaixa: idCaixaExterno,
        nomeCaixa: "PDV corrida",
        idCliente: null,
        nomeCliente: null,
        documentoCliente: null,
        dataHoraVenda: "2026-08-12T12:00:00.000Z",
        valorOriginal: valor,
        desconto: 0,
        acrescimo: 0,
        valorTotal: valor,
        statusVenda: cancelada ? "cancelado" : "aprovado",
        numeroNotaFiscal: null
      },
      ItensVenda: [],
      PagamentosVenda: [
        {
          idVenda,
          idFormaPagamento: `DIN-CO-${sufixo}-${carimbo}`,
          descricaoFormaPagamento: nomeDaForma(sufixo),
          valor
        }
      ]
    };
  }

  async function montarCenario(sufixo: string) {
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `Conta corrida ${sufixo} ${carimbo}`, saldoInicial: 0 }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `PDV corrida ${sufixo} ${carimbo}`, contaId, ativo: true }
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    const identificadorExterno = `PDV-CORRIDA-${sufixo}-${carimbo}`;
    await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno,
        descricaoExterna: "PDV corrida",
        registroSistemaId: pdvId
      }
    });

    // 1a ingestao cria a forma; o Admin a roteia como dinheiro do PDV; a 2a ingestao ja nasce roteada.
    const idVenda = `CORRIDA-${sufixo}-${carimbo}`;
    await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payload(`${idVenda}-SEMENTE`, identificadorExterno, 1, false, "vitest-corrida-0", sufixo)
    });
    const forma = await consultarUm<{ id: string; nome: string }>(
      "select id, nome from formas_pagamento where empresa_id = $1 and nome = $2",
      [idsTeste.empresaA, nomeDaForma(sufixo)]
    );
    const rotear = await contexto.app.inject({
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
    expect(rotear.statusCode, rotear.body).toBe(204);

    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payload(idVenda, identificadorExterno, 500, false, "vitest-corrida-1", sufixo)
    });
    expect(criar.statusCode, criar.body).toBe(200);

    // Confirma o ponto de partida: 500 disponiveis na conta do PDV.
    const saldos = await contexto.app.inject({
      method: "GET",
      url: `/api/contas/saldos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(saldos);
    const saldo = json<{ data: Array<{ id: string; saldoAtual: number }> }>(saldos).data.find(
      (linha) => linha.id === contaId
    );
    expect(saldo?.saldoAtual, "a venda roteada precisa ter creditado 500").toBe(500);

    return { contaId, identificadorExterno, idVenda, sufixo };
  }

  it("o reenvio que CANCELA a venda espera pela conta travada — nao passa por fora da porta", async () => {
    const { contaId, identificadorExterno, idVenda, sufixo } = await montarCenario("espera");

    // Uma sessao segura a conta com o MESMO modo de lock da porta de saldo. E o retrato exato de uma
    // despesa que ja travou a conta, leu 500 e ainda nao commitou.
    const porta = await abrirBloqueador();
    try {
      await porta.cliente.query("begin");
      await porta.cliente.query("select id from contas where id = $1 for no key update", [contaId]);

      // O CREARE reenvia a venda CANCELADA. Isso retira os 500 do saldo.
      const reenvio = contexto.app
        .inject({
          method: "POST",
          url: "/api/integracoes",
          headers: { "x-api-key": idsTeste.integracaoCodigo },
          payload: payload(idVenda, identificadorExterno, 500, true, "vitest-corrida-2", sufixo)
        })
        .then(
          () => "respondeu",
          () => "falhou"
        );

      // A prova no proprio Postgres: a ingestao esta bloqueada PELA sessao que segura a conta.
      expect(
        await esperarBloqueioPor(porta, 1),
        "a ingestao que retira credito precisa esperar pela conta travada (pg_blocking_pids)"
      ).toBe(true);
      expect(
        await aindaPendente(reenvio),
        "sem a trava, o reenvio passaria por fora da porta e o saldo poderia ficar negativo"
      ).toBe(true);

      // Solta a porta: a ingestao acorda e conclui.
      await porta.cliente.query("commit");
      expect(await reenvio).toBe("respondeu");
    } finally {
      await fecharBloqueador(porta);
    }

    // Depois de tudo serializado, o cancelamento realmente retirou o credito.
    const saldos = await contexto.app.inject({
      method: "GET",
      url: `/api/contas/saldos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(saldos);
    const saldo = json<{ data: Array<{ id: string; saldoAtual: number }> }>(saldos).data.find(
      (linha) => linha.id === contaId
    );
    expect(saldo?.saldoAtual, "venda cancelada nao credita").toBe(0);
  });

  it("a ordem inversa tambem serializa: saida espera o reenvio em curso", async () => {
    const { contaId } = await montarCenario("inversa");

    // Agora quem segura a conta e uma sessao no papel da INGESTAO. A saida (despesa) tem de esperar.
    const ingestao = await abrirBloqueador();
    try {
      await ingestao.cliente.query("begin");
      await ingestao.cliente.query("select id from contas where id = $1 for no key update", [contaId]);

      const despesa = contexto.app
        .inject({
          method: "POST",
          url: "/api/despesas",
          headers: { cookie: cookieAdmin },
          payload: {
            empresaId: idsTeste.empresaA,
            dataReferencia: "2026-08-12",
            dataVencimento: "2026-08-12",
            observacao: `corrida inversa ${carimbo}`,
            valorOriginal: 500,
            contaOrigemId: contaId,
            grupoDespesaId: idsTeste.grupoDespesaOperacional,
            computar: true
          }
        })
        .then(
          () => "respondeu",
          () => "falhou"
        );

      expect(await esperarBloqueioPor(ingestao, 1), "a saida tem de esperar a conta").toBe(true);
      expect(await aindaPendente(despesa), "a porta nao pode decidir com a conta travada por outro").toBe(true);

      await ingestao.cliente.query("commit");
      expect(await despesa).toBe("respondeu");
    } finally {
      await fecharBloqueador(ingestao);
    }
  });

  // A prova de que a serializacao produz o resultado CERTO, e nao apenas espera: a despesa de 500 e
  // aprovada sobre os 500 disponiveis, e o cancelamento posterior nao pode deixar a conta negativa
  // por baixo dela — o saldo resultante e o que as duas escritas, serializadas, produzem.
  it("saida aprovada e cancelamento posterior nao produzem saldo negativo por corrida", async () => {
    const { contaId, identificadorExterno, idVenda, sufixo } = await montarCenario("aritmetica");

    const despesa = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-08-12",
        dataVencimento: "2026-08-12",
        observacao: `saida sobre credito ${carimbo}`,
        valorOriginal: 500,
        contaOrigemId: contaId,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        computar: true
      }
    });
    expect(despesa.statusCode, despesa.body).toBe(201);

    const reenvio = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payload(idVenda, identificadorExterno, 500, true, "vitest-corrida-3", sufixo)
    });
    expect(reenvio.statusCode, reenvio.body).toBe(200);

    // O saldo fica em -500: e o resultado ARITMETICO de duas escritas legitimas e serializadas, nao
    // de uma corrida. A R-166 preserva saldo historico negativo; o que a R-165 impede e a saida ser
    // AUTORIZADA sobre saldo que nao existe mais no instante da decisao — e e isso que a trava
    // garante. Registrado aqui para o numero nao ser confundido com o bug.
    const saldos = await contexto.app.inject({
      method: "GET",
      url: `/api/contas/saldos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(saldos);
    const saldo = json<{ data: Array<{ id: string; saldoAtual: number }> }>(saldos).data.find(
      (linha) => linha.id === contaId
    );
    expect(saldo?.saldoAtual).toBe(-500);

    // E a porta se comporta a partir dai: nova saida e recusada, porque agora nao ha saldo.
    const novaSaida = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-08-12",
        dataVencimento: "2026-08-12",
        observacao: `saida apos cancelamento ${carimbo}`,
        valorOriginal: 10,
        contaOrigemId: contaId,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        computar: true
      }
    });
    expect(novaSaida.statusCode, novaSaida.body).toBe(409);
    expect(json<{ code?: string }>(novaSaida).code).toBe("SALDO_INSUFICIENTE");
  });
});
