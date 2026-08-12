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
  json
} from "../../setup/integracao.js";
import { processarTransferenciasTemporais } from "../../../api/src/transferencias/transferencias.service.js";

// S1/S2 do P0 lancamento x fechamento (decisao do Jose, 11/08/2026): a autorizacao cobre QUALQUER
// mudanca de status/conta/valor/computar que altere os sete totais — inclusive as duas escritas
// que nao chegam por rota de lancamento:
//   S1: o cron `processarTransferenciasTemporais` efetiva `agendada -> pendente`, e `pendente`
//       CONTA como saida do caixa. Caixa aberto: trava (FOR SHARE), revalida e efetiva; caixa
//       FECHADO: nao altera status nem totais.
//   S2: `cancelarSerieRecorrencia` (R-063) apaga parcelas futuras nao pagas — e parcela com
//       `caixa_id` conta nos totais. Parcela presa a caixa FECHADO nao e apagada; com caixa
//       aberto o DELETE obedece o lock e a ordem unica (caixa -> linhas).
// Mesmo ferramental deterministico das suites irmas: gates por linha + pg_blocking_pids.

describe("P0 - cron e recorrencia x fechamento (S1/S2)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieCaixa = "";
  const hoje = "2026-08-01";
  let sequencia = 0;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
  }, 180_000);

  afterAll(async () => contexto.fechar());

  function inject(method: "POST" | "PATCH", url: string, cookie: string, payload: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, payload });
  }

  async function novaFixture(nome: string, operador: "caixa" | "admin" = "caixa") {
    sequencia += 1;
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: operador === "caixa" ? cookieCaixa : cookieAdmin,
      emailOperador: usuariosTeste[operador].email,
      nome: `P0S ${nome} ${sequencia}`
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
  }

  function fecharCaixaInject(caixaId: string, cookie: string, payload: object = {}) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie },
      payload
    });
  }

  /** Transferencia AGENDADA do operador (origem = conta do PDV -> saida futura do caixa), ja vencida. */
  async function agendadaVencidaDoOperador(fx: { contaId: string }, lacre: string, valor = 55) {
    const criada = await inject("POST", "/api/transferencias", cookieCaixa, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: lacre,
      valorOriginal: valor,
      contaOrigemId: fx.contaId,
      contaDestinoId: idsTeste.contaBanco,
      nLacreDoc: lacre,
      agendadaPara: "2027-01-01T08:00:00.000Z"
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;
    // Fixture-shaping: vence o agendamento por SQL (o contrato recusa data passada no POST).
    await executarSql("update transferencias set agendada_para = now() - interval '1 hour' where id = $1", [id]);
    return id;
  }

  /** Despesa RECORRENTE do admin (retaguarda com caixa proprio): a 1a parcela carrega o caixa_id. */
  async function serieDoAdmin(fx: { contaId: string }, marcador: string, valor = 55) {
    const criada = await inject("POST", "/api/despesas", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      dataVencimento: "2027-01-15",
      descricao: marcador,
      valorOriginal: valor,
      contaOrigemId: fx.contaId,
      grupoDespesaId: idsTeste.grupoDespesaOperacional,
      fornecedorId: idsTeste.fornecedor,
      recorrencia: { frequencia: "mes", repeticoes: 3 }
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;
    const linha = await consultarUm<{ recorrencia_id: string; caixa_id: string | null }>(
      "select recorrencia_id, caixa_id from despesas where id = $1",
      [id]
    );
    expect(linha?.recorrencia_id).toBeTruthy();
    return { primeiraId: id, recorrenciaId: linha!.recorrencia_id, caixaIdDaPrimeira: linha!.caixa_id };
  }

  function cancelarSerie(recorrenciaId: string) {
    return inject("PATCH", `/api/recorrencias/${recorrenciaId}/cancelar`, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      dominio: "despesa"
    });
  }

  // ------------------------------------------------------------------------------------------
  // S1 — o cron entra na porta do caixa.
  // ------------------------------------------------------------------------------------------

  it("Deve_EsperarEIncluirNoTotal_Quando_OCronVenceACorridaDoFechamento", async () => {
    const fx = await novaFixture("S1a cron");
    const lacre = `P0-S1a-${sequencia}`;
    await vendaManual(cookieCaixa, 100, `${lacre}-venda`);
    const transferenciaId = await agendadaVencidaDoOperador(fx, lacre);

    const bloqueador = await abrirBloqueador();
    try {
      // Gate na LINHA da transferencia: o cron (ja segurando o FOR SHARE do caixa) prende no
      // UPDATE agendada -> pendente; o fechamento tem de entrar na fila atras dele.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from transferencias where id = $1 for update", [transferenciaId]);

      const cron = processarTransferenciasTemporais();
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const fechamento = fecharCaixaInject(fx.caixaId, cookieCaixa);
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      await cron;
      expect((await fechamento).statusCode).toBe(204);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(
      await consultarUm<{ status: string }>("select status from transferencias where id = $1", [transferenciaId])
    ).toMatchObject({ status: "pendente" });
    // A saida efetivada entrou nos totais congelados: 55 (agendada) + 45 (retorno final) = 100.
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_transferencias_saida: "100.00",
      saldo: "0.00"
    });
  });

  it("Deve_ManterAgendadaSemAlterarTotais_Quando_OFechamentoVenceOCron", async () => {
    const fx = await novaFixture("S1b cron");
    const lacre = `P0-S1b-${sequencia}`;
    await vendaManual(cookieCaixa, 100, `${lacre}-venda`);
    const transferenciaId = await agendadaVencidaDoOperador(fx, lacre);

    const bloqueador = await abrirBloqueador();
    try {
      // G-COFRE: o fechamento REAL segura o FOR UPDATE do caixa e prende no retorno final.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from contas where id = $1 for update", [idsTeste.contaCofre]);

      const fechamento = fecharCaixaInject(fx.caixaId, cookieCaixa);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const cron = processarTransferenciasTemporais();
      // Hoje o cron NEM espera (nao trava caixa nenhum) — este e o RED do S1.
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await fechamento).statusCode).toBe(204);
      await cron;
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // Caixa fechado: o cron NAO altera status nem totais — a linha segue agendada.
    expect(
      await consultarUm<{ status: string }>("select status from transferencias where id = $1", [transferenciaId])
    ).toMatchObject({ status: "agendada" });
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_transferencias_saida: "100.00",
      saldo: "0.00"
    });
  });

  it("Deve_EfetivarSemLock_Quando_AAgendadaNaoTemCaixa", async () => {
    // Contraste: agendada da retaguarda (admin sem envolver conta de PDV) segue efetivando normal.
    sequencia += 1;
    const lacre = `P0-S1c-${sequencia}`;
    const criada = await inject("POST", "/api/transferencias", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: lacre,
      valorOriginal: 20,
      contaOrigemId: idsTeste.contaBanco,
      contaDestinoId: idsTeste.contaLivre,
      nLacreDoc: lacre,
      agendadaPara: "2027-01-01T08:00:00.000Z"
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;
    await executarSql("update transferencias set agendada_para = now() - interval '1 hour' where id = $1", [id]);

    await processarTransferenciasTemporais();

    expect(
      await consultarUm<{ status: string; caixa_id: string | null }>(
        "select status, caixa_id from transferencias where id = $1",
        [id]
      )
    ).toMatchObject({ status: "pendente", caixa_id: null });
  });

  // ------------------------------------------------------------------------------------------
  // S2 — cancelar serie de recorrencia respeita o caixa.
  // ------------------------------------------------------------------------------------------

  it("Deve_PreservarAParcelaDoCaixaFechado_Quando_ASerieECancelada", async () => {
    const fx = await novaFixture("S2a serie", "admin");
    const marcador = `P0-S2a-${sequencia}`;
    const serie = await serieDoAdmin(fx, marcador);
    expect(serie.caixaIdDaPrimeira).toBe(fx.caixaId);
    await vendaManual(cookieAdmin, 100, `${marcador}-venda`);
    const fechamento = await fecharCaixaInject(fx.caixaId, cookieAdmin);
    expect(fechamento.statusCode, fechamento.body).toBe(204);
    const congelado = await universoDoCaixa(fx.caixaId);

    const resposta = await cancelarSerie(serie.recorrenciaId);
    expect(resposta.statusCode, resposta.body).toBe(200);
    // Das 3 parcelas, so as 2 futuras SEM caixa caem; a presa ao caixa fechado fica.
    expect(json<{ data: { removidas: number } }>(resposta).data.removidas).toBe(2);

    const restante = await consultarUm<{ total: string }>(
      "select count(*) as total from despesas where recorrencia_id = $1",
      [serie.recorrenciaId]
    );
    expect(Number(restante?.total ?? "0")).toBe(1);
    expect(
      await consultarUm<{ id: string }>("select id from despesas where id = $1", [serie.primeiraId])
    ).not.toBeNull();
    // Os sete totais congelados nao mexem.
    expect(await universoDoCaixa(fx.caixaId)).toEqual(congelado);
  });

  it("Deve_EsperarEPreservar_Quando_OFechamentoVenceOCancelamento", async () => {
    const fx = await novaFixture("S2b serie", "admin");
    const marcador = `P0-S2b-${sequencia}`;
    const serie = await serieDoAdmin(fx, marcador);
    await vendaManual(cookieAdmin, 100, `${marcador}-venda`);

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from contas where id = $1 for update", [idsTeste.contaCofre]);

      const fechamento = fecharCaixaInject(fx.caixaId, cookieAdmin);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const cancelamento = cancelarSerie(serie.recorrenciaId);
      // Hoje o DELETE nem espera — RED do S2.
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await fechamento).statusCode).toBe(204);
      const resposta = await cancelamento;
      expect(resposta.statusCode, resposta.body).toBe(200);
      expect(json<{ data: { removidas: number } }>(resposta).data.removidas).toBe(2);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(
      await consultarUm<{ id: string }>("select id from despesas where id = $1", [serie.primeiraId])
    ).not.toBeNull();
    // O fechamento venceu: congelou COM a parcela (55) e ela permanece no banco.
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_despesas: "55.00",
      saldo: "0.00"
    });
  });

  // S2-d — a janela que a revisao pegou: o pagamento que commita ENTRE a listagem e o DELETE.
  // O DELETE reavalia os predicados da R-063 sobre a versao corrente da linha (READ COMMITTED):
  // parcela paga no meio da corrida escapa sozinha, mesmo ja listada como candidata.
  it("Deve_PreservarAParcelaPaga_Quando_OPagamentoCommitaDuranteOCancelamento", async () => {
    const fx = await novaFixture("S2d serie", "admin");
    const marcador = `P0-S2d-${sequencia}`;
    const serie = await serieDoAdmin(fx, marcador);

    const bloqueador = await abrirBloqueador();
    try {
      // O bloqueador FAZ o papel da edicao concorrente: segura a linha da 1a parcela, deixa o
      // cancelamento listar e prender no DELETE, grava o pagamento e commita.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from despesas where id = $1 for no key update", [serie.primeiraId]);

      const cancelamento = cancelarSerie(serie.recorrenciaId);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      await bloqueador.cliente.query("update despesas set data_pagamento = '2026-08-01' where id = $1", [
        serie.primeiraId
      ]);
      await bloqueador.cliente.query("commit");

      const resposta = await cancelamento;
      expect(resposta.statusCode, resposta.body).toBe(200);
      // So as 2 parcelas nao pagas caem; a paga no meio da corrida fica.
      expect(json<{ data: { removidas: number } }>(resposta).data.removidas).toBe(2);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(
      await consultarUm<{ id: string }>("select id from despesas where id = $1", [serie.primeiraId])
    ).not.toBeNull();
  });

  it("Deve_ApagarSobOLock_Quando_OCancelamentoVenceOFechamento", async () => {
    const fx = await novaFixture("S2c serie", "admin");
    const marcador = `P0-S2c-${sequencia}`;
    const serie = await serieDoAdmin(fx, marcador);
    await vendaManual(cookieAdmin, 100, `${marcador}-venda`);

    const bloqueador = await abrirBloqueador();
    try {
      // Gate na LINHA da 1a parcela: o cancelamento (ja com o FOR SHARE do caixa) prende no
      // DELETE; o fechamento entra na fila atras dele e congela SEM a parcela.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from despesas where id = $1 for update", [serie.primeiraId]);

      const cancelamento = cancelarSerie(serie.recorrenciaId);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const fechamento = fecharCaixaInject(fx.caixaId, cookieAdmin);
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      const resposta = await cancelamento;
      expect(resposta.statusCode, resposta.body).toBe(200);
      expect(json<{ data: { removidas: number } }>(resposta).data.removidas).toBe(3);
      expect((await fechamento).statusCode).toBe(204);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    const restante = await consultarUm<{ total: string }>(
      "select count(*) as total from despesas where recorrencia_id = $1",
      [serie.recorrenciaId]
    );
    expect(Number(restante?.total ?? "0")).toBe(0);
    // O cancelamento venceu: o caixa congelou SEM a despesa (venda 100 -> retorno 100).
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_despesas: "0.00",
      saldo: "0.00"
    });
  });
});
