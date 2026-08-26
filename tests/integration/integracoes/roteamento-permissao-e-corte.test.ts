// #152 — as PROTECOES do roteamento, pelo fio real: quem pode configurar (R-176), o que a listagem
// mostra a quem, o isolamento entre empresas, o corte historico no reenvio (R-166) e a recusa de
// edicao financeira da venda integrada (R-177).
//
// O cargo `gerente` do seed existe aqui com um recorte proposital: ele CADASTRA e RENOMEIA forma de
// pagamento, e NAO tem a permissao dedicada de roteamento. E o mesmo recorte do Financeiro em
// producao. Sem esse cargo nao havia como provar a R-176 — todo usuario ou era admin (tinha tudo) ou
// nao mexia em forma nenhuma.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

type FormaListada = {
  id: string;
  nome: string;
  contaRecebivelId?: string | null;
  contaFinalId?: string | null;
  disponibilidade?: string | null;
  usaContaDoPdv?: boolean;
  adquirente?: string | null;
};

describe("#152 — permissao, isolamento, corte historico e PUT da venda integrada", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieGerente: string;
  let cookieMultiempresa: string;
  const carimbo = Date.now();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criarConta(nome: string, empresaId: string = idsTeste.empresaA) {
    // O admin do seed so acessa a empresa A; a empresa B exige o usuario multiempresa.
    const cookie = empresaId === idsTeste.empresaA ? cookieAdmin : cookieMultiempresa;
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie },
      payload: { empresaId, nome: `${nome} ${carimbo}`, saldoInicial: 0 }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  async function criarForma(nome: string, cookie: string) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/formas-pagamento",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, nome: `${nome} ${carimbo}` }
    });
    return resposta;
  }

  async function roteamentoGravado(formaId: string) {
    return consultarUm<{
      disponibilidade: string | null;
      usa_conta_do_pdv: boolean;
      conta_final_id: string | null;
      atualizado_por: string | null;
    }>(
      `select disponibilidade, usa_conta_do_pdv, conta_final_id, atualizado_por
         from formas_pagamento where id = $1`,
      [formaId]
    );
  }

  // -------------------------------------------------------------------------------------------
  // R-176 — so o Admin com a permissao dedicada decide para onde vai o dinheiro
  // -------------------------------------------------------------------------------------------

  it("quem so cadastra forma NAO cria forma com roteamento (POST protegido)", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/formas-pagamento",
      headers: { cookie: cookieGerente },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: `Forma gerente rota ${carimbo}`,
        disponibilidade: "imediata",
        usaContaDoPdv: true
      }
    });
    // O POST importa tanto quanto o PUT: sem este corte, o roteamento entraria de carona na criacao.
    expect(resposta.statusCode, resposta.body).toBe(403);
    expect(json<{ code?: string }>(resposta).code).toBe("ROTEAMENTO_SEM_PERMISSAO");

    const criada = await consultarUm<{ id: string }>(
      "select id from formas_pagamento where empresa_id = $1 and nome = $2",
      [idsTeste.empresaA, `Forma gerente rota ${carimbo}`]
    );
    expect(criada, "nada pode ter sido gravado").toBeNull();
  });

  it("quem so cadastra forma CONTINUA criando e renomeando forma sem roteamento", async () => {
    const criacao = await criarForma("Forma gerente simples", cookieGerente);
    expect(criacao.statusCode, criacao.body).toBe(201);
    const formaId = json<{ data: { id: string } }>(criacao).data.id;

    const renomear = await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${formaId}`,
      headers: { cookie: cookieGerente },
      payload: { empresaId: idsTeste.empresaA, nome: `Forma gerente renomeada ${carimbo}` }
    });
    // Renomear NAO e mexer em dinheiro: nao pode virar 403.
    expect(renomear.statusCode, renomear.body).toBe(204);
  });

  it("quem so cadastra forma nao ALTERA roteamento ja existente, e nao o apaga", async () => {
    const criacao = await criarForma("Forma roteada admin", cookieAdmin);
    const formaId = json<{ data: { id: string } }>(criacao).data.id;

    const rotear = await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${formaId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: `Forma roteada admin ${carimbo}`,
        disponibilidade: "imediata",
        usaContaDoPdv: true
      }
    });
    expect(rotear.statusCode, rotear.body).toBe(204);

    // O gerente tenta mudar o destino: recusado.
    const tentativa = await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${formaId}`,
      headers: { cookie: cookieGerente },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: `Forma roteada admin ${carimbo}`,
        disponibilidade: "por_evento",
        contaRecebivelId: await criarConta("Recebivel invasor"),
        contaFinalId: await criarConta("Final invasor")
      }
    });
    expect(tentativa.statusCode, tentativa.body).toBe(403);

    // E o mais importante: um PUT do gerente SEM os campos nao pode APAGAR o roteamento.
    const renomear = await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${formaId}`,
      headers: { cookie: cookieGerente },
      payload: { empresaId: idsTeste.empresaA, nome: `Forma preservada ${carimbo}` }
    });
    expect(renomear.statusCode, renomear.body).toBe(204);

    const depois = await roteamentoGravado(formaId);
    expect(depois?.disponibilidade, "o roteamento nao pode sumir num PUT sem permissao").toBe("imediata");
    expect(depois?.usa_conta_do_pdv).toBe(true);
  });

  it("a trilha grava QUEM mudou o roteamento, e nao quem renomeou", async () => {
    const criacao = await criarForma("Forma trilha", cookieAdmin);
    const formaId = json<{ data: { id: string } }>(criacao).data.id;

    expect((await roteamentoGravado(formaId))?.atualizado_por, "sem roteamento, sem autor").toBeNull();

    await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${formaId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: `Forma trilha ${carimbo}`,
        disponibilidade: "imediata",
        usaContaDoPdv: true
      }
    });
    const autor = (await roteamentoGravado(formaId))?.atualizado_por;
    expect(autor, "quem decidiu o destino do dinheiro fica registrado").toBeTruthy();

    // Renomear depois nao reescreve o autor da decisao financeira.
    await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${formaId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `Forma trilha renomeada ${carimbo}` }
    });
    expect((await roteamentoGravado(formaId))?.atualizado_por).toBe(autor);
  });

  // -------------------------------------------------------------------------------------------
  // Projecao — id de conta e dado financeiro, nao sai para quem so ve entradas
  // -------------------------------------------------------------------------------------------

  it("a listagem NAO expoe conta de roteamento a quem nao tem a permissao dedicada", async () => {
    const contaRecebivelId = await criarConta("Recebivel projecao");
    const contaFinalId = await criarConta("Final projecao");
    const criacao = await criarForma("Forma projecao", cookieAdmin);
    const formaId = json<{ data: { id: string } }>(criacao).data.id;
    await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${formaId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: `Forma projecao ${carimbo}`,
        adquirente: "Cielo",
        disponibilidade: "por_evento",
        contaRecebivelId,
        contaFinalId
      }
    });

    const listar = async (cookie: string) => {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/formas_pagamento?empresaId=${idsTeste.empresaA}&pageSize=100`,
        headers: { cookie }
      });
      assertOk(resposta);
      return json<{ data: FormaListada[] }>(resposta).data.find((forma) => forma.id === formaId);
    };

    const paraAdmin = await listar(cookieAdmin);
    expect(paraAdmin?.contaFinalId, "o admin precisa ver para poder configurar").toBe(contaFinalId);
    expect(paraAdmin?.adquirente).toBe("Cielo");

    const paraGerente = await listar(cookieGerente);
    expect(paraGerente, "o gerente continua vendo a forma").toBeTruthy();
    expect(paraGerente?.nome).toContain("Forma projecao");
    // O corte: nem o id da conta, nem o adquirente, nem a disponibilidade.
    expect(paraGerente?.contaRecebivelId, "id de conta e dado financeiro").toBeUndefined();
    expect(paraGerente?.contaFinalId).toBeUndefined();
    expect(paraGerente?.disponibilidade).toBeUndefined();
    expect(paraGerente?.adquirente).toBeUndefined();

    // Prova pelo corpo cru: o id da conta nao pode aparecer em lugar nenhum da resposta.
    const cru = await contexto.app.inject({
      method: "GET",
      url: `/api/formas_pagamento?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });
    expect(cru.body).not.toContain(contaFinalId);
    expect(cru.body).not.toContain(contaRecebivelId);
  });

  // -------------------------------------------------------------------------------------------
  // Isolamento entre empresas
  // -------------------------------------------------------------------------------------------

  it("nao aceita conta de OUTRA empresa como destino do roteamento", async () => {
    const contaDaEmpresaB = await criarConta("Conta empresa B", idsTeste.empresaB);
    const criacao = await criarForma("Forma cross tenant", cookieAdmin);
    const formaId = json<{ data: { id: string } }>(criacao).data.id;

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${formaId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: `Forma cross tenant ${carimbo}`,
        disponibilidade: "por_evento",
        contaRecebivelId: await criarConta("Recebivel proprio"),
        contaFinalId: contaDaEmpresaB
      }
    });
    // 400 legivel, e nao 23503 sanitizado: a FK composta continua sendo a ultima porta.
    expect(resposta.statusCode, resposta.body).toBe(400);
    expect(json<{ code?: string }>(resposta).code).toBe("ROTEAMENTO_CONTA_DE_OUTRA_EMPRESA");

    const gravado = await roteamentoGravado(formaId);
    expect(gravado?.conta_final_id, "nada pode ter sido gravado").toBeNull();
  });

  // -------------------------------------------------------------------------------------------
  // R-166 — reenvio de venda antiga nao ativa roteamento
  // -------------------------------------------------------------------------------------------

  it("reenvio de venda HISTORICA (anterior ao codigo novo) nao a promove nem credita", async () => {
    const contaId = await criarConta("Conta historica");
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `PDV historico ${carimbo}`, contaId, ativo: true }
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    const identificadorExterno = `PDV-HIST-${carimbo}`;
    await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno,
        descricaoExterna: "PDV historico",
        registroSistemaId: pdvId
      }
    });

    const nomeForma = `Dinheiro historico ${carimbo}`;
    const idForma = `DIN-HI-${carimbo}`;
    const idVenda = `HIST-${carimbo}`;

    // A forma existe e JA esta roteada — e o cenario mais perigoso para o corte: se o reenvio
    // recalculasse a venda antiga, ela creditaria um periodo ja fechado.
    const criacaoForma = await contexto.app.inject({
      method: "POST",
      url: "/api/formas-pagamento",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: nomeForma,
        disponibilidade: "imediata",
        usaContaDoPdv: true
      }
    });
    expect(criacaoForma.statusCode, criacaoForma.body).toBe(201);
    const formaId = json<{ data: { id: string } }>(criacaoForma).data.id;

    // Uma venda ANTERIOR ao codigo novo, escrita direto no banco: e a unica forma honesta de
    // simular o passado, porque o codigo novo nunca grava `nao_aplicavel`. O vinculo do registro de
    // integracao e o que faz a ingestao encontra-la em vez de criar outra.
    const chave = await consultarUm<{ id: string }>(
      "select id from integracoes_chaves where empresa_id = $1 and codigo = $2",
      [idsTeste.empresaA, idsTeste.integracaoCodigo]
    );
    const vendaHistorica = await consultarUm<{ id: string }>(
      `insert into vendas (empresa_id, integracao_chave_id, data_referencia, data_venda, descricao,
                           valor_original, identificador_externo, pdv_id, status, computar)
       values ($1, $2, '2026-08-12', '2026-08-12T12:00:00Z', $3, 200, $4, $5, 'aprovado', true)
       returning id`,
      [idsTeste.empresaA, chave?.id, `Venda ${idVenda}`, idVenda, pdvId]
    );
    await executarSql(
      `insert into vendas_pagamentos (venda_id, forma_pagamento_id, tipo_pagamento_automacao_id,
                                      tipo_pagamento_automacao, numero_vendas, total_pago)
       values ($1, $2, $3, $4, 1, 200)`,
      [vendaHistorica?.id, formaId, idForma, nomeForma]
    );
    const antes = await consultarUm<{ roteamento_status: string }>(
      "select roteamento_status from vendas_pagamentos where venda_id = $1",
      [vendaHistorica?.id]
    );
    expect(antes?.roteamento_status, "a linha historica nasce no DEFAULT").toBe("nao_aplicavel");

    // O CREARE reenvia a venda antiga — exatamente a onda de reenvio ja agendada pelo hash novo.
    const reenvio = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: {
        DadosIntegracao: { origem: "vitest-historico" },
        Venda: {
          idVenda,
          idCaixa: identificadorExterno,
          nomeCaixa: "PDV historico",
          idCliente: null,
          nomeCliente: null,
          documentoCliente: null,
          dataHoraVenda: "2026-08-12T12:00:00.000Z",
          valorOriginal: 200,
          desconto: 0,
          acrescimo: 0,
          valorTotal: 200,
          statusVenda: "aprovado",
          numeroNotaFiscal: null
        },
        ItensVenda: [],
        PagamentosVenda: [{ idVenda, idFormaPagamento: idForma, descricaoFormaPagamento: nomeForma, valor: 200 }]
      }
    });
    expect(reenvio.statusCode, reenvio.body).toBe(200);

    const total = await consultarTodos<{ id: string }>(
      "select id from vendas where identificador_externo = $1 and empresa_id = $2",
      [idVenda, idsTeste.empresaA]
    );
    expect(total.length, "reenvio nao duplica venda").toBe(1);

    const pagamentos = await consultarTodos<{ roteamento_status: string; conta_final_id: string | null }>(
      "select roteamento_status, conta_final_id from vendas_pagamentos where venda_id = $1",
      [vendaHistorica?.id]
    );
    expect(pagamentos.length, "reenvio nao duplica pagamento").toBe(1);
    // O corte: mesmo com a forma JA roteada, a venda historica continua `nao_aplicavel`. Promove-la
    // seria regularizacao automatica de historico, que a R-166 proibe.
    expect(pagamentos[0]?.roteamento_status, "reenvio nao promove venda historica").toBe("nao_aplicavel");
    expect(pagamentos[0]?.conta_final_id).toBeNull();

    const saldos = await contexto.app.inject({
      method: "GET",
      url: `/api/contas/saldos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(saldos);
    const linha = json<{ data: Array<{ id: string; saldoAtual: number }> }>(saldos).data.find(
      (conta) => conta.id === contaId
    );
    expect(linha?.saldoAtual, "nenhum saldo de periodo anterior se mexe no reenvio").toBe(0);
  });

  it("reenvio de venda NOVA recalcula o snapshot, sem duplicar venda nem pagamento", async () => {
    const contaId = await criarConta("Conta recalculo");
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `PDV recalculo ${carimbo}`, contaId, ativo: true }
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    const identificadorExterno = `PDV-RECALC-${carimbo}`;
    await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno,
        descricaoExterna: "PDV recalculo",
        registroSistemaId: pdvId
      }
    });

    const idVenda = `RECALC-${carimbo}`;
    const nomeForma = `Dinheiro recalculo ${carimbo}`;
    const idForma = `DIN-RC-${carimbo}`;
    const payload = (valor: number, origem: string) => ({
      DadosIntegracao: { origem },
      Venda: {
        idVenda,
        idCaixa: identificadorExterno,
        nomeCaixa: "PDV recalculo",
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
      ItensVenda: [],
      PagamentosVenda: [{ idVenda, idFormaPagamento: idForma, descricaoFormaPagamento: nomeForma, valor }]
    });

    // Nasce pelo codigo novo com a forma ainda sem roteamento: PENDENTE, e nada credita.
    const primeira = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payload(200, "vitest-recalc-1")
    });
    expect(primeira.statusCode, primeira.body).toBe(200);
    const venda = await consultarUm<{ id: string }>("select id from vendas where identificador_externo = $1", [
      idVenda
    ]);
    const inicial = await consultarUm<{ roteamento_status: string }>(
      "select roteamento_status from vendas_pagamentos where venda_id = $1",
      [venda?.id]
    );
    expect(inicial?.roteamento_status).toBe("pendente");

    // O Admin configura o roteamento e o CREARE reenvia.
    const forma = await consultarUm<{ id: string }>(
      "select id from formas_pagamento where empresa_id = $1 and nome = $2",
      [idsTeste.empresaA, nomeForma]
    );
    await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${forma?.id}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: nomeForma,
        disponibilidade: "imediata",
        usaContaDoPdv: true
      }
    });
    const reenvio = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payload(250, "vitest-recalc-2")
    });
    expect(reenvio.statusCode, reenvio.body).toBe(200);

    // A venda NASCEU do codigo novo, entao o reenvio RECALCULA — nao e promocao de historico, e
    // resolucao de uma pendencia que existia justamente porque faltava configurar a forma.
    const depois = await consultarTodos<{ roteamento_status: string; conta_final_id: string | null }>(
      "select roteamento_status, conta_final_id from vendas_pagamentos where venda_id = $1",
      [venda?.id]
    );
    expect(depois.length, "reenvio nao duplica pagamento").toBe(1);
    expect(depois[0]?.roteamento_status, "pendencia resolvida no reenvio").toBe("roteado");
    expect(depois[0]?.conta_final_id).toBe(contaId);

    const total = await consultarTodos<{ id: string }>(
      "select id from vendas where identificador_externo = $1 and empresa_id = $2",
      [idVenda, idsTeste.empresaA]
    );
    expect(total.length, "reenvio nao duplica venda").toBe(1);
  });
});
