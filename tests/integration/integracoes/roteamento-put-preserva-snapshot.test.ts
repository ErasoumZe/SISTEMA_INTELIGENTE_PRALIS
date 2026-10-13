// P0 (#152) — um PUT PERMITIDO não pode apagar o snapshot financeiro da venda integrada.
//
// O defeito que estes casos prendem: `atualizarVendaRepository` apagava e recriava
// `vendas_pagamentos` sem as colunas de roteamento. As linhas renasciam no DEFAULT `nao_aplicavel`,
// o credito sumia do saldo e — pior — `vendaAceitaRoteamento` passava a ler a venda como HISTORICA,
// entao nenhum reenvio do CREARE a rotearia de novo. Perda permanente e silenciosa, disparada por
// editar a observacao.
//
// O teste anterior percorria exatamente este caminho e nao via nada: conferia so `sum(total_pago)`,
// que sobrevive ao apagamento. Aqui as colunas sao lidas UMA A UMA.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, json } from "../../setup/integracao.js";

type PagamentoGravado = {
  roteamento_status: string;
  conta_recebivel_id: string | null;
  conta_final_id: string | null;
  disponivel_em: string | null;
  adquirente: string | null;
  total_pago: string;
};

describe("#152 — PUT permitido preserva o snapshot de roteamento", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  const carimbo = Date.now();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  function payload(sufixo: string, idVenda: string, idCaixaExterno: string, valor: number, dataHoraVenda: string) {
    return {
      DadosIntegracao: { origem: `vitest-put-${sufixo}` },
      Venda: {
        idVenda,
        idCaixa: idCaixaExterno,
        nomeCaixa: `PDV put ${sufixo}`,
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
      ItensVenda: [],
      PagamentosVenda: [
        {
          idVenda,
          idFormaPagamento: `PUT-${sufixo}-${carimbo}`,
          descricaoFormaPagamento: `Forma put ${sufixo} ${carimbo}`,
          valor
        }
      ]
    };
  }

  async function montar(sufixo: string, rotear: boolean) {
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `Conta put ${sufixo} ${carimbo}`, saldoInicial: 0 }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `PDV put ${sufixo} ${carimbo}`, contaId, ativo: true }
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    const identificadorExterno = `PDV-PUT-${sufixo}-${carimbo}`;
    await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno,
        descricaoExterna: `PDV put ${sufixo}`,
        registroSistemaId: pdvId
      }
    });

    // A venda integrada nasce vinculada ao caixa do turno, e editar lancamento de caixa que nao e o
    // seu ja era recusado antes da #152. Para provar a preservacao do snapshot num PUT REAL, o admin
    // precisa ter esse caixa aberto — senao o teste morre na regra de caixa e nao chega a olhar o
    // roteamento, que e o que ele existe para verificar.
    await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieAdmin,
      emailOperador: usuariosTeste.admin.email,
      nome: `Caixa put ${sufixo}`,
      contaId,
      pdvId
    });
    // O servidor é a autoridade da abertura. A venda precisa nascer depois dela,
    // como acontece quando o CREARE envia uma venda do turno corrente.
    const dataHoraVenda = new Date().toISOString();

    const idVenda = `PUT-${sufixo}-${carimbo}`;
    // Semente: cria a forma de pagamento.
    await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payload(sufixo, `${idVenda}-SEMENTE`, identificadorExterno, 1, dataHoraVenda)
    });

    if (rotear) {
      const forma = await consultarUm<{ id: string; nome: string }>(
        "select id, nome from formas_pagamento where empresa_id = $1 and nome = $2",
        [idsTeste.empresaA, `Forma put ${sufixo} ${carimbo}`]
      );
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
    }

    const ingestao = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payload(sufixo, idVenda, identificadorExterno, 250, dataHoraVenda)
    });
    expect(ingestao.statusCode, ingestao.body).toBe(200);

    const venda = await consultarUm<{ id: string }>("select id from vendas where identificador_externo = $1", [
      idVenda
    ]);
    return { contaId, identificadorExterno, idVenda, vendaId: venda?.id ?? "", dataHoraVenda };
  }

  async function pagamentos(vendaId: string) {
    return consultarTodos<PagamentoGravado>(
      `select roteamento_status, conta_recebivel_id, conta_final_id, disponivel_em, adquirente, total_pago
         from vendas_pagamentos where venda_id = $1`,
      [vendaId]
    );
  }

  async function saldo(contaId: string) {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/contas/saldos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    return (
      json<{ data: Array<{ id: string; saldoAtual: number }> }>(resposta).data.find((linha) => linha.id === contaId)
        ?.saldoAtual ?? null
    );
  }

  // Monta o corpo do PUT a partir do estado atual, mudando SO a observacao — o caso que a R-177
  // permite e que apagava tudo.
  async function editarObservacao(vendaId: string, observacao: string) {
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas/${vendaId}`,
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
        contaOrigemId: string | null;
        pdvId: string | null;
        computar: boolean;
        tiposPagamento: Array<{ formaPagamentoId: string | null; totalPago: number }>;
      };
    }>(detalhe).data;

    return contexto.app.inject({
      method: "PUT",
      url: `/api/vendas/${vendaId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: atual.empresaId,
        dataReferencia: atual.dataReferencia,
        descricao: atual.descricao,
        valorOriginal: atual.valorOriginal,
        valorDesconto: atual.valorDesconto,
        valorAcrescimo: atual.valorAcrescimo,
        pdvId: atual.pdvId,
        computar: atual.computar,
        contaOrigemId: atual.contaOrigemId,
        tiposPagamento: atual.tiposPagamento,
        observacao
      }
    });
  }

  it("venda ROTEADA: o PUT permitido preserva conta, disponibilidade e o credito no saldo", async () => {
    const { contaId, vendaId } = await montar("roteada", true);

    const antes = await pagamentos(vendaId);
    expect(antes[0]?.roteamento_status).toBe("roteado");
    expect(antes[0]?.conta_final_id).toBe(contaId);
    expect(antes[0]?.disponivel_em).not.toBeNull();
    expect(await saldo(contaId), "ponto de partida: 250 creditados").toBe(250);

    const resposta = await editarObservacao(vendaId, `revisado ${carimbo}`);
    // Status EXATO. O teste antigo aceitava qualquer coisa que nao fosse codigo da R-177 — e por isso
    // nao via o apagamento.
    expect(resposta.statusCode, resposta.body).toBe(200);

    const depois = await pagamentos(vendaId);
    expect(depois.length, "o PUT nao pode duplicar nem sumir com pagamento").toBe(1);
    expect(depois[0]?.roteamento_status, "o roteamento tem de sobreviver ao PUT").toBe("roteado");
    expect(depois[0]?.conta_recebivel_id).toBe(antes[0]?.conta_recebivel_id);
    expect(depois[0]?.conta_final_id).toBe(contaId);
    // `toBe` compararia INSTANCIAS: o driver devolve `Date`, e duas leituras dao dois objetos.
    // O que importa e o INSTANTE.
    expect(String(depois[0]?.disponivel_em), "a disponibilidade tem de sobreviver").toBe(
      String(antes[0]?.disponivel_em)
    );
    expect(depois[0]?.total_pago).toBe(antes[0]?.total_pago);

    // O que importa para a padaria: o dinheiro continua na conta.
    expect(await saldo(contaId), "o credito nao pode sumir por causa de uma observacao").toBe(250);

    // E o campo permitido realmente mudou.
    const venda = await consultarUm<{ observacao: string | null; conta_origem_id: string | null }>(
      "select observacao, conta_origem_id from vendas where id = $1",
      [vendaId]
    );
    expect(venda?.observacao).toBe(`revisado ${carimbo}`);
    expect(venda?.conta_origem_id, "venda integrada segue sem conta de origem").toBeNull();
  });

  it("venda PENDENTE: o PUT permitido preserva a pendencia, sem rebaixar para historica", async () => {
    const { contaId, vendaId } = await montar("pendente", false);

    expect((await pagamentos(vendaId))[0]?.roteamento_status).toBe("pendente");

    const resposta = await editarObservacao(vendaId, `observado ${carimbo}`);
    expect(resposta.statusCode, resposta.body).toBe(200);

    const depois = await pagamentos(vendaId);
    // `nao_aplicavel` aqui seria o desastre: a venda sairia da lista de pendencias E nunca mais
    // poderia ser roteada, porque passaria a ser lida como anterior ao roteamento.
    expect(depois[0]?.roteamento_status, "pendente tem de continuar pendente").toBe("pendente");
    expect(depois[0]?.conta_final_id).toBeNull();
    expect(await saldo(contaId)).toBe(0);
  });

  it("reingestao DEPOIS do PUT permitido nao reclassifica a venda como historica", async () => {
    const { contaId, identificadorExterno, idVenda, vendaId, dataHoraVenda } = await montar("reingestao", true);

    const resposta = await editarObservacao(vendaId, `antes do reenvio ${carimbo}`);
    expect(resposta.statusCode, resposta.body).toBe(200);

    // O CREARE reenvia com valor diferente, para forcar hash novo e o caminho de atualizacao.
    const reenvio = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payload("reingestao", idVenda, identificadorExterno, 400, dataHoraVenda)
    });
    expect(reenvio.statusCode, reenvio.body).toBe(200);

    const depois = await pagamentos(vendaId);
    expect(depois.length, "reenvio nao duplica pagamento").toBe(1);
    // Se o PUT tivesse apagado o roteamento, o reenvio leria `nao_aplicavel` e trataria a venda como
    // historica — ficaria assim para sempre.
    expect(depois[0]?.roteamento_status, "a venda continua sendo do codigo novo").toBe("roteado");
    expect(depois[0]?.conta_final_id).toBe(contaId);
    expect(await saldo(contaId), "o reenvio recalcula sobre o valor novo").toBe(400);
  });

  it("usuario de outra empresa nao descobre existencia, integracao nem pagamentos", async () => {
    const { vendaId } = await montar("tenant", true);
    const cookieOutraEmpresa = await cookieSessao(contexto.app, "multiempresa");

    // O `multiempresa` acessa a empresa B; a venda e da empresa A. Ele declara a PROPRIA empresa no
    // corpo, que e o que passaria pelo guard do controller.
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/vendas/${vendaId}`,
      headers: { cookie: cookieOutraEmpresa },
      payload: {
        empresaId: idsTeste.empresaB,
        dataReferencia: "2026-08-12",
        descricao: "sondagem",
        valorOriginal: 250,
        valorDesconto: 0,
        valorAcrescimo: 0,
        computar: true,
        contaOrigemId: null,
        tiposPagamento: [{ formaPagamentoId: null, totalPago: 250 }]
      }
    });

    const corpo = resposta.body;
    const codigo = json<{ code?: string }>(resposta).code;
    // Nao pode ser o codigo da R-177: ele confirmaria que o registro existe, que e integrado e que os
    // pagamentos divergem do enviado — tudo de outra empresa.
    expect(["VENDA_INTEGRADA_PAGAMENTOS", "VENDA_INTEGRADA_CONTA_ORIGEM"], corpo).not.toContain(codigo);
    // E a resposta nao pode carregar nada da venda alheia.
    expect(corpo).not.toContain(vendaId);
    expect(corpo.toLowerCase()).not.toContain("integrada");
    // Recurso inacessivel: mesma resposta de recurso inexistente.
    expect(resposta.statusCode, corpo).toBe(404);
  });
});
