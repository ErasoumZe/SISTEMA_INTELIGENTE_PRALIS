import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { abrirCaixaDoOperador, universoDoCaixa } from "../../setup/caixa.js";
import {
  abrirBloqueador,
  consultarUm,
  esperarBloqueioPor,
  esperarCadeiaDeBloqueio,
  executarSql,
  fecharBloqueador,
  json,
  type ClienteBloqueador
} from "../../setup/integracao.js";

// P0 — bordas do fechamento: cofre (contraste), venda CREARE (R-013), confirmacao de transferencia
// (Q4: bloqueada imediatamente quando alteraria entrada/saida de caixa ja fechado) e Q2 (retaguarda
// usando a conta do PDV e recusada se o caixa fechar durante a operacao — nunca cair para
// caixa_id nulo em silencio). Decisoes homologadas pelo Jose em 11/08/2026.
//
// Mesmo ferramental do arquivo irmao caixa-lancamento-vs-fechamento.test.ts: bloqueador dedicado
// ou gate por FK, espera provada por `pg_blocking_pids` — nunca por tempo.

const LOCK_DO_FECHAMENTO = "update";
const VALOR_INJETADO = 55;

type Fixture = { caixaId: string; contaId: string; pdvId: string; usuarioId: string };

describe("P0 - bordas do fechamento (cofre, CREARE, confirmacao, Q2)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieCaixa = "";
  let cookieGerente = "";
  let gerenteId = "";
  const hoje = "2026-08-01";
  let sequencia = 0;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa, cookieGerente] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa"),
      cookieSessao(contexto.app, "gerente")
    ]);
    const gerente = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where lower(email) = lower($1)",
      [usuariosTeste.gerente.email]
    );
    if (!gerente) throw new Error("Usuario gerente nao encontrado");
    gerenteId = gerente.usuario_id;
  }, 180_000);

  afterAll(async () => contexto.fechar());

  function inject(method: "POST" | "PUT", url: string, cookie: string, payload: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, payload });
  }

  async function novaFixture(nome: string, operador: "caixa" | "admin" = "caixa"): Promise<Fixture> {
    sequencia += 1;
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: operador === "caixa" ? cookieCaixa : cookieAdmin,
      emailOperador: usuariosTeste[operador].email,
      nome: `P0B ${nome} ${sequencia}`
    });
  }

  async function vendaManual(cookie: string, valor: number, marcador: string) {
    const venda = await inject("POST", "/api/vendas", cookie, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: marcador,
      valorOriginal: valor
    });
    expect(venda.statusCode, venda.body).toBe(201);
    return json<{ data: { id: string } }>(venda).data.id;
  }

  function fecharCaixaInject(caixaId: string, cookie: string, payload: object = {}) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie },
      payload
    });
  }

  async function segurarContaDoCofre(): Promise<ClienteBloqueador> {
    const bloqueador = await abrirBloqueador();
    await bloqueador.cliente.query("begin");
    await bloqueador.cliente.query("select id from contas where id = $1 for update", [idsTeste.contaCofre]);
    return bloqueador;
  }

  function payloadVendaIntegrada(idVenda: string, idCaixaExterno: string, valor: number, dataHoraVenda: string) {
    return {
      DadosIntegracao: { origem: "vitest-p0" },
      Venda: {
        idVenda,
        idCaixa: idCaixaExterno,
        nomeCaixa: "PDV P0 Integracao",
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
          idProduto: "PROD-EXT",
          descricaoProduto: "Pao frances (integracao)",
          dataHoraItem: dataHoraVenda,
          quantidade: 1,
          valorUnitario: valor,
          total: valor,
          itemCancelado: false
        }
      ],
      PagamentosVenda: [{ idVenda, idFormaPagamento: "DIN", descricaoFormaPagamento: "Dinheiro", valor }]
    };
  }

  function enviarVendaIntegrada(payload: object) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload
    });
  }

  async function vincularPdvExterno(identificadorExterno: string, pdvId: string) {
    const vinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno,
        descricaoExterna: "PDV P0",
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);
  }

  // ------------------------------------------------------------------------------------------
  // F — contraste do cofre: a sangria avulsa JA espera e JA recusa (FOR UPDATE + revalidacao).
  // Fixa o comportamento correto existente — e o alvo que as rotas de lancamento devem espelhar.
  // ------------------------------------------------------------------------------------------

  it("Deve_EsperarERecusar_Quando_ASangriaAvulsaConcorreComOFechamento", async () => {
    const fx = await novaFixture("F sangria");

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query(`select id from fechamentos_caixa where id = $1 for ${LOCK_DO_FECHAMENTO}`, [
        fx.caixaId
      ]);

      const sangria = inject("POST", `/api/caixa/${fx.caixaId}/transferencia-cofre`, cookieCaixa, {
        tipo: "sangria",
        valor: 10,
        idempotenciaChave: randomUUID()
      });
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      await bloqueador.cliente.query(
        `update fechamentos_caixa
            set status = 'fechado', data_hora_fechamento = now(), fechado_em = now(), fechado_por = $2
          where id = $1 and status = 'aberto'`,
        [fx.caixaId, fx.usuarioId]
      );
      await bloqueador.cliente.query("commit");

      const resposta = await sangria;
      expect(resposta.statusCode, resposta.body).toBe(400);
      expect(resposta.body).toMatch(/Caixa j[aá] fechado/);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    const sangrias = await consultarUm<{ total: string }>(
      "select count(*) as total from transferencias where caixa_id = $1 and tipo = 'sangria'",
      [fx.caixaId]
    );
    expect(Number(sangrias?.total ?? "0")).toBe(0);
  });

  // ------------------------------------------------------------------------------------------
  // CREARE (R-013) — a venda integrada NUNCA e recusada: vincula ao caixa fechado E registra a
  // trilha. C1 e a corrida em voo (RED hoje: a decisao `caixaFechado` sai do retrato pre-lock e a
  // venda entra SEM trilha); C2 e o contraste sequencial; C3 prova que a excecao nao virou
  // liberacao generica.
  // ------------------------------------------------------------------------------------------

  it("Deve_VincularComTrilha_Quando_AVendaCreareChegaDuranteOFechamento", async () => {
    const fx = await novaFixture("C1 creare");
    const idExterno = `P0-C1-${sequencia}`;
    await vincularPdvExterno(`PDV-P0-${sequencia}`, fx.pdvId);
    await vendaManual(cookieCaixa, 100, `${idExterno}-venda-fixture`);

    const bloqueador = await segurarContaDoCofre();
    try {
      const fechamento = fecharCaixaInject(fx.caixaId, cookieCaixa);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const integracao = enviarVendaIntegrada(
        payloadVendaIntegrada(idExterno, `PDV-P0-${sequencia}`, VALOR_INJETADO, "2026-08-01T12:00:00.000Z")
      );
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await fechamento).statusCode).toBe(204);

      const resposta = await integracao;
      expect(resposta.statusCode, resposta.body).toBe(200);
      expect(resposta.body).toContain("criado");
    } finally {
      await fecharBloqueador(bloqueador);
    }

    const venda = await consultarUm<{ caixa_id: string | null }>(
      "select caixa_id from vendas where identificador_externo = $1",
      [idExterno]
    );
    expect(venda?.caixa_id).toBe(fx.caixaId);
    // A trilha e o que separa "vinculou por regra" de "escapou do congelamento em silencio".
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_entradas: "100.00",
      trilha_pos_fechamento: 1
    });
  });

  it("Deve_VincularComTrilha_Quando_AVendaCreareChegaDepoisDoFechamento", async () => {
    const fx = await novaFixture("C2 creare");
    const idExterno = `P0-C2-${sequencia}`;
    await vincularPdvExterno(`PDV-P0-${sequencia}`, fx.pdvId);
    await vendaManual(cookieCaixa, 100, `${idExterno}-venda-fixture`);
    const fechamento = await fecharCaixaInject(fx.caixaId, cookieCaixa);
    expect(fechamento.statusCode, fechamento.body).toBe(204);

    const resposta = await enviarVendaIntegrada(
      payloadVendaIntegrada(idExterno, `PDV-P0-${sequencia}`, 30, "2026-08-01T12:00:00.000Z")
    );
    expect(resposta.statusCode, resposta.body).toBe(200);

    const venda = await consultarUm<{ caixa_id: string | null }>(
      "select caixa_id from vendas where identificador_externo = $1",
      [idExterno]
    );
    expect(venda?.caixa_id).toBe(fx.caixaId);
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_entradas: "100.00",
      trilha_pos_fechamento: 1
    });
  });

  it("Deve_ContinuarRecusandoOperador_Quando_OCaixaEstaFechado", async () => {
    const fx = await novaFixture("C3 contraste");
    await vendaManual(cookieCaixa, 100, `P0-C3-${sequencia}-venda-fixture`);
    const fechamento = await fecharCaixaInject(fx.caixaId, cookieCaixa);
    expect(fechamento.statusCode, fechamento.body).toBe(204);

    // A excecao do CREARE ("a linha existe" em vez de "status aberto") vale SO para a integracao.
    const marcador = `P0-C3-${sequencia}`;
    const resposta = await inject("POST", "/api/despesas", cookieCaixa, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      dataVencimento: hoje,
      descricao: marcador,
      valorOriginal: VALOR_INJETADO,
      contaOrigemId: fx.contaId,
      grupoDespesaId: idsTeste.grupoDespesaOperacional,
      fornecedorId: idsTeste.fornecedor
    });
    expect(resposta.statusCode, resposta.body).toBe(400);
    expect(resposta.body).toContain("Abra um caixa");
    const linha = await consultarUm<{ total: string }>(
      "select count(*) as total from despesas where descricao = $1 or observacao = $1",
      [marcador]
    );
    expect(Number(linha?.total ?? "0")).toBe(0);
  });

  // ------------------------------------------------------------------------------------------
  // Confirmacao de transferencia (Q4). A transferencia nasce PENDENTE apontando a conta do PDV
  // como destino (entrada futura do caixa). Confirmar depois do fechamento mudaria o lado ENTRADA
  // dos totais congelados — decisao do Jose: bloqueio imediato. T3 prova a ordem inversa: quem
  // confirma ANTES segura o caixa, e o fechamento espera e inclui a entrada.
  // ------------------------------------------------------------------------------------------

  async function fixtureConfirmacao(nome: string) {
    const fx = await novaFixture(nome);
    const lacre = `P0-CONF-${sequencia}`;
    await vendaManual(cookieCaixa, 100, `${lacre}-venda-fixture`);
    const criada = await inject("POST", "/api/transferencias", cookieCaixa, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: `${lacre}-mov`,
      valorOriginal: VALOR_INJETADO,
      contaOrigemId: idsTeste.contaBanco,
      contaDestinoId: fx.contaId,
      nLacreDoc: lacre
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const transferenciaId = json<{ data: { id: string } }>(criada).data.id;
    // So operador vinculado a conta destino confirma (R-028) — e nunca quem criou o movimento.
    await executarSql("insert into contas_usuarios (id, empresa_id, conta_id, usuario_id) values ($1, $2, $3, $4)", [
      randomUUID(),
      idsTeste.empresaA,
      fx.contaId,
      gerenteId
    ]);
    return { fx, lacre, transferenciaId };
  }

  function confirmar(transferenciaId: string, contaDestinoId: string, lacre: string) {
    return inject("POST", `/api/transferencias/${transferenciaId}/confirmar`, cookieGerente, {
      contaDestinoId,
      nLacreDoc: lacre
    });
  }

  it("Deve_BloquearAConfirmacao_Quando_OCaixaDestinoJaFechou", async () => {
    const { fx, lacre, transferenciaId } = await fixtureConfirmacao("T1 confirmacao");
    const fechamento = await fecharCaixaInject(fx.caixaId, cookieCaixa);
    expect(fechamento.statusCode, fechamento.body).toBe(204);
    const congelado = await universoDoCaixa(fx.caixaId);

    const resposta = await confirmar(transferenciaId, fx.contaId, lacre);
    expect(resposta.statusCode, resposta.body).toBe(400);
    expect(resposta.body).toMatch(/Caixa j[aá] fechado/);

    expect(
      await consultarUm<{ status: string }>("select status from transferencias where id = $1", [transferenciaId])
    ).toMatchObject({ status: "pendente" });
    expect(
      await consultarUm<{ rompido: boolean }>("select rompido from lacres where numero = $1", [lacre])
    ).toMatchObject({ rompido: false });
    expect(await universoDoCaixa(fx.caixaId)).toEqual(congelado);
  });

  it("Deve_EsperarEBloquear_Quando_AConfirmacaoPerdeACorridaDoFechamento", async () => {
    const { fx, lacre, transferenciaId } = await fixtureConfirmacao("T2 confirmacao");

    const bloqueador = await segurarContaDoCofre();
    try {
      const fechamento = fecharCaixaInject(fx.caixaId, cookieCaixa);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const confirmacao = confirmar(transferenciaId, fx.contaId, lacre);
      // Hoje a confirmacao NEM espera (nao trava caixa nenhum) — RED direto aqui.
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await fechamento).statusCode).toBe(204);

      const resposta = await confirmacao;
      expect(resposta.statusCode, resposta.body).toBe(400);
      expect(resposta.body).toMatch(/Caixa j[aá] fechado/);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(
      await consultarUm<{ status: string }>("select status from transferencias where id = $1", [transferenciaId])
    ).toMatchObject({ status: "pendente" });
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_transferencias_entrada: "0.00"
    });
  });

  it("Deve_IncluirAEntrada_Quando_AConfirmacaoVenceACorridaDoFechamento", async () => {
    const { fx, lacre, transferenciaId } = await fixtureConfirmacao("T3 confirmacao");

    const bloqueador = await abrirBloqueador();
    try {
      // Gate na linha do LACRE: a confirmacao ja segurou o caixa e a transferencia, e prende no
      // `update lacres` — o ultimo passo. O fechamento tem de entrar na fila atras dela.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from lacres where empresa_id = $1 and numero = $2 for update", [
        idsTeste.empresaA,
        lacre
      ]);

      const confirmacao = confirmar(transferenciaId, fx.contaId, lacre);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const fechamento = fecharCaixaInject(fx.caixaId, cookieCaixa);
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await confirmacao).statusCode).toBe(200);
      expect((await fechamento).statusCode).toBe(204);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // Entrada de 55 confirmada ANTES do congelamento: os totais tem de conte-la (100 + 55 saem
    // como retorno final; saldo zero).
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_transferencias_entrada: "55.00",
      saldo: "0.00"
    });
  });

  // ------------------------------------------------------------------------------------------
  // Q2 — retaguarda (admin) usando a conta do PDV do PROPRIO caixa que fecha durante a operacao:
  // RECUSA, nunca `caixa_id = null` silencioso. O contraste (Q2b) preserva a A-1/R-032: com outra
  // conta, a retaguarda segue lancando sem caixa, com `caixa_id` nulo.
  // ------------------------------------------------------------------------------------------

  it("Deve_RecusarSemGravar_Quando_ARetaguardaUsaAContaDoPdvEOCaixaFechaNaCorrida", async () => {
    const fx = await novaFixture("Q2a retaguarda", "admin");
    const marcador = `P0-Q2a-${sequencia}`;
    await vendaManual(cookieAdmin, 100, `${marcador}-venda-fixture`);

    const bloqueador = await segurarContaDoCofre();
    try {
      const fechamento = fecharCaixaInject(fx.caixaId, cookieAdmin);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const lancamento = inject("POST", "/api/despesas", cookieAdmin, {
        empresaId: idsTeste.empresaA,
        dataReferencia: hoje,
        dataVencimento: hoje,
        descricao: marcador,
        valorOriginal: VALOR_INJETADO,
        contaOrigemId: fx.contaId,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      });
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await fechamento).statusCode).toBe(204);

      const resposta = await lancamento;
      expect(resposta.statusCode, resposta.body).toBe(400);
      expect(resposta.body).toMatch(/Caixa j[aá] fechado/);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // Nada gravado — nem com `caixa_id` preenchido, nem com `caixa_id` nulo.
    const linha = await consultarUm<{ total: string }>(
      "select count(*) as total from despesas where descricao = $1 or observacao = $1",
      [marcador]
    );
    expect(Number(linha?.total ?? "0")).toBe(0);
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({ status: "fechado", total_despesas: "0.00" });
  });

  it("Deve_GravarComCaixaNulo_Quando_ARetaguardaUsaOutraContaComOCaixaFechado", async () => {
    // O caixa do admin criado no caso anterior ja fechou; aqui nao ha corrida nenhuma.
    const marcador = `P0-Q2b-${sequencia}`;
    const resposta = await inject("POST", "/api/despesas", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      dataVencimento: hoje,
      descricao: marcador,
      valorOriginal: VALOR_INJETADO,
      contaOrigemId: idsTeste.contaBanco,
      grupoDespesaId: idsTeste.grupoDespesaOperacional,
      fornecedorId: idsTeste.fornecedor
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(resposta).data;
    expect(
      await consultarUm<{ caixa_id: string | null }>("select caixa_id from despesas where id = $1", [id])
    ).toMatchObject({ caixa_id: null });
  });

  // ------------------------------------------------------------------------------------------
  // D — estresse etiquetado (fora do CI padrao): rotas reais concorrentes, sem gate. Invariantes:
  // nenhum 5xx, nenhum deadlock (40P01), e todo caixa fechado com os sete totais iguais ao
  // recomputo com as MESMAS clausulas de `calcularTotaisCaixaOperacionalRepository`.
  // ------------------------------------------------------------------------------------------

  describe.skipIf(!process.env["TESTE_CORRIDA_ESTRESSE"])("D - estresse", () => {
    it("Deve_ManterOsTotaisConsistentes_Quando_RotasReaisConcorremComOFechamento", async () => {
      for (let rodada = 1; rodada <= 8; rodada += 1) {
        const fx = await novaFixture(`D rodada ${rodada}`);
        const marcador = `P0-D-${sequencia}`;
        const despesaBase = await inject("POST", "/api/despesas", cookieCaixa, {
          empresaId: idsTeste.empresaA,
          dataReferencia: hoje,
          dataVencimento: hoje,
          descricao: `${marcador}-base`,
          valorOriginal: 40,
          contaOrigemId: fx.contaId,
          grupoDespesaId: idsTeste.grupoDespesaOperacional,
          fornecedorId: idsTeste.fornecedor
        });
        expect(despesaBase.statusCode, despesaBase.body).toBe(201);
        const despesaBaseId = json<{ data: { id: string } }>(despesaBase).data.id;

        const respostas = await Promise.all([
          inject("POST", "/api/vendas", cookieCaixa, {
            empresaId: idsTeste.empresaA,
            dataReferencia: hoje,
            descricao: `${marcador}-venda`,
            valorOriginal: 100
          }),
          inject("POST", "/api/despesas", cookieCaixa, {
            empresaId: idsTeste.empresaA,
            dataReferencia: hoje,
            dataVencimento: hoje,
            descricao: `${marcador}-despesa`,
            valorOriginal: 10,
            contaOrigemId: fx.contaId,
            grupoDespesaId: idsTeste.grupoDespesaOperacional,
            fornecedorId: idsTeste.fornecedor
          }),
          inject("POST", "/api/retiradas", cookieCaixa, {
            empresaId: idsTeste.empresaA,
            dataReferencia: hoje,
            dataVencimento: hoje,
            descricao: `${marcador}-retirada`,
            valorOriginal: 20,
            contaOrigemId: fx.contaId,
            grupoRetiradaId: idsTeste.grupoRetiradaSangria,
            fornecedorId: idsTeste.fornecedor
          }),
          inject("PUT", `/api/despesas/${despesaBaseId}`, cookieCaixa, {
            empresaId: idsTeste.empresaA,
            dataReferencia: hoje,
            dataVencimento: hoje,
            descricao: `${marcador}-base-editada`,
            valorOriginal: 45,
            contaOrigemId: fx.contaId,
            grupoDespesaId: idsTeste.grupoDespesaOperacional,
            fornecedorId: idsTeste.fornecedor
          }),
          fecharCaixaInject(fx.caixaId, cookieCaixa, { observacao: `quebra possivel ${marcador}` })
        ]);

        for (const resposta of respostas) {
          expect(resposta.statusCode, resposta.body).toBeLessThan(500);
          expect(resposta.body).not.toContain("40P01");
        }
        const fechamento = respostas[4];
        expect(fechamento.statusCode, fechamento.body).toBe(204);

        const recomputo = await consultarUm<Record<string, string>>(
          `select
               coalesce((select sum(v.valor_original - v.valor_desconto + v.valor_acrescimo)
                           from vendas v
                          where v.caixa_id = $1 and v.computar and v.status <> 'cancelado'), 0)::numeric(14,2)::text as entradas,
               coalesce((select sum(d.valor_original) from despesas d
                          where d.caixa_id = $1 and d.computar and d.status <> 'cancelado'), 0)::numeric(14,2)::text as despesas,
               coalesce((select sum(r.valor_original) from retiradas r
                          where r.caixa_id = $1 and r.computar and r.status <> 'cancelado'), 0)::numeric(14,2)::text as retiradas,
               coalesce((select sum(m.valor_original) from mercadorias m
                          where m.caixa_id = $1 and m.computar and m.status <> 'cancelado'), 0)::numeric(14,2)::text as mercadorias,
               coalesce((select sum(t.valor_original) from transferencias t
                          where t.caixa_id = $1 and t.computar and t.status = 'recebido'
                            and t.conta_destino_id = $2), 0)::numeric(14,2)::text as transferencias_entrada,
               coalesce((select sum(t.valor_original) from transferencias t
                          where t.caixa_id = $1 and t.computar and t.status in ('pendente', 'recebido')
                            and t.conta_origem_id = $2), 0)::numeric(14,2)::text as transferencias_saida`,
          [fx.caixaId, fx.contaId]
        );
        const congelado = await universoDoCaixa(fx.caixaId);
        expect(congelado).toMatchObject({
          status: "fechado",
          total_entradas: recomputo?.entradas,
          total_despesas: recomputo?.despesas,
          total_retiradas: recomputo?.retiradas,
          total_mercadorias: recomputo?.mercadorias,
          total_transferencias_entrada: recomputo?.transferencias_entrada,
          total_transferencias_saida: recomputo?.transferencias_saida
        });
      }
    }, 240_000);
  });
});
