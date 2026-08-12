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
  json
} from "../../setup/integracao.js";

// S3-S8 do P0 (decisao do Jose, 11/08/2026): a autorizacao cobre QUALQUER mudanca de status,
// computar, conta ou valor que altere os sete totais. Fecham aqui:
//   S3: trocar a CONTA do PDV muda o pivo dos totais de transferencia — com caixa aberto no PDV a
//       troca e recusada; a recusa serializa com o fechamento (espera e revalida).
//   S4: a abertura por lacre nao pode migrar em silencio uma transferencia ja vinculada a outro
//       caixa — o claim exige `caixa_id IS NULL` (imposto no proprio UPDATE).
//   S5: aprovar/recusar NF-e muda status/computar — entra na porta (caixa -> linha) em transacao;
//       caixa fechado nao tem totais vivos alterados (recusa).
//   S6: prova por teste (auditoria) de que PUT/confirmar reescrevendo CONTAS nunca altera um
//       SEGUNDO caixa: totais so contam linhas com o proprio caixa_id — nenhum lock em B e
//       necessario porque nenhum total de B pode mudar.
//   S8: o re-envio CREARE pode MOVER a venda entre caixas — origem e destino sao travados em ordem
//       deterministica, a venda nunca e recusada, e o caixa FECHADO que perde a venda ganha a
//       trilha imutavel de pos-fechamento.

describe("P0 - portas S3-S8 (pivo do PDV, lacre, NF-e, contas e re-envio CREARE)", () => {
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

    // O operador do seed nao tem `transferencias_editar` (prova S6-a). ACRESCENTA as regras atuais
    // e reloga — mesma receita das suites irmas.
    const operador = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where lower(email) = lower($1)",
      [usuariosTeste.caixa.email]
    );
    if (!operador) throw new Error("Usuario caixa nao encontrado");
    const regrasAtuais = await consultarUm<{ regras: Record<string, boolean> }>(
      "select regras from permissoes_usuarios where usuario_id = $1",
      [operador.usuario_id]
    );
    const concessao = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieAdmin },
      payload: {
        tipoPermissao: "usuario",
        usuarioId: operador.usuario_id,
        regras: { ...(regrasAtuais?.regras ?? {}), transferencias_editar: true }
      }
    });
    expect([200, 201]).toContain(concessao.statusCode);
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
  }, 180_000);

  afterAll(async () => contexto.fechar());

  function inject(method: "POST" | "PUT" | "PATCH", url: string, cookie: string, payload: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, payload });
  }

  async function novaFixture(nome: string, operador: "caixa" | "admin" = "caixa") {
    sequencia += 1;
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: operador === "caixa" ? cookieCaixa : cookieAdmin,
      emailOperador: usuariosTeste[operador].email,
      nome: `P0X ${nome} ${sequencia}`
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

  async function segurarContaDoCofre() {
    const bloqueador = await abrirBloqueador();
    await bloqueador.cliente.query("begin");
    await bloqueador.cliente.query("select id from contas where id = $1 for update", [idsTeste.contaCofre]);
    return bloqueador;
  }

  function putPdv(pdvId: string, contaId: string, nome: string) {
    return inject("PUT", `/api/pdvs/${pdvId}`, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      nome,
      contaId,
      ativo: true
    });
  }

  // ------------------------------------------------------------------------------------------
  // S3 — trocar a conta do PDV com caixa aberto.
  // ------------------------------------------------------------------------------------------

  it("Deve_RecusarATrocaDeConta_Quando_OPdvTemCaixaAberto", async () => {
    const fx = await novaFixture("S3b pivo");
    const antes = await consultarUm<{ conta_id: string }>("select conta_id from pdvs where id = $1", [fx.pdvId]);

    // Trocar a CONTA com caixa aberto: recusado. O pivo dos totais nao muda sob um caixa vivo.
    const troca = await putPdv(fx.pdvId, idsTeste.contaBanco, `PDV S3b ${sequencia}`);
    expect(troca.statusCode, troca.body).toBe(400);
    expect(troca.body).toMatch(/caixa aberto/i);
    expect(await consultarUm<{ conta_id: string }>("select conta_id from pdvs where id = $1", [fx.pdvId])).toEqual(
      antes
    );

    // Renomear SEM trocar a conta continua livre — a recusa e do pivo, nao do cadastro.
    const renome = await putPdv(fx.pdvId, fx.contaId, `PDV S3b renomeado ${sequencia}`);
    expect(renome.statusCode, renome.body).toBe(204);
  });

  it("Deve_EsperarOFechamentoETrocarDepois_Quando_ATrocaConcorreComOFechamento", async () => {
    const fx = await novaFixture("S3a pivo");
    const marcador = `P0-S3a-${sequencia}`;
    await vendaManual(cookieCaixa, 100, `${marcador}-venda`);
    // Transferencia de ENTRADA pendente do proprio caixa: e o que faz o pivo importar no
    // fechamento (saida/entrada por conta do PDV).
    const transferencia = await inject("POST", "/api/transferencias", cookieCaixa, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: marcador,
      valorOriginal: 30,
      contaOrigemId: fx.contaId,
      contaDestinoId: idsTeste.contaBanco,
      nLacreDoc: marcador
    });
    expect(transferencia.statusCode, transferencia.body).toBe(201);

    const bloqueador = await segurarContaDoCofre();
    try {
      const fechamento = fecharCaixaInject(fx.caixaId, cookieCaixa);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      // A troca chega DURANTE o fechamento: tem de esperar (serializa com o FOR UPDATE) e, ao
      // passar, encontrar o caixa fechado — ai a troca e permitida, com o fechamento ja congelado
      // sobre o pivo ANTIGO.
      const troca = putPdv(fx.pdvId, idsTeste.contaBanco, `PDV S3a ${sequencia}`);
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await fechamento).statusCode).toBe(204);

      const resposta = await troca;
      expect(resposta.statusCode, resposta.body).toBe(204);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // O fechamento usou o pivo antigo: saida da transferencia (30) + retorno final (70) = 100.
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_transferencias_saida: "100.00",
      saldo: "0.00"
    });
    expect(
      await consultarUm<{ conta_id: string }>("select conta_id from pdvs where id = $1", [fx.pdvId])
    ).toMatchObject({ conta_id: idsTeste.contaBanco });
  });

  /**
   * A outra metade da janela S3 (revisao r4): o PUT que troca a conta pode VENCER uma abertura em
   * voo — se a abertura decide com o retrato PRE-lock do PDV, o fundo do lacre confirma na conta
   * ANTIGA de um PDV que ja aponta para outra. A abertura tem de estabilizar o PDV sob lock: quem
   * chega durante a troca espera, rele a conta NOVA e o lacre destinado a conta antiga e recusado
   * sem nenhuma escrita.
   */
  it("Deve_RecusarOLacreDaContaAntiga_Quando_ATrocaDeContaVenceAAberturaEmVoo", async () => {
    sequencia += 1;
    const lacre = `P0-S3C-${sequencia}`;
    const contaC = await inject("POST", "/api/contas", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      nome: `Conta S3c destino ${sequencia}`
    });
    expect(contaC.statusCode, contaC.body).toBe(201);
    const contaCId = json<{ data: { id: string } }>(contaC).data.id;
    const contaN = await inject("POST", "/api/contas", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      nome: `Conta S3c nova ${sequencia}`
    });
    expect(contaN.statusCode, contaN.body).toBe(201);
    const contaNId = json<{ data: { id: string } }>(contaN).data.id;
    const pdv = await inject("POST", "/api/pdvs", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      nome: `PDV S3c ${sequencia}`,
      contaId: contaCId,
      ativo: true
    });
    expect(pdv.statusCode, pdv.body).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const criada = await inject("POST", "/api/transferencias", cookieGerente, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: lacre,
      valorOriginal: 35,
      contaOrigemId: idsTeste.contaBanco,
      contaDestinoId: contaCId,
      contasDestinoIds: [contaCId],
      nLacreDoc: lacre
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const transferenciaId = json<{ data: { id: string } }>(criada).data.id;

    const usuarioCaixa = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);

    const bloqueador = await abrirBloqueador();
    try {
      // O PUT do S3 em voo: FOR UPDATE no PDV + troca da conta, ainda sem commit (mesmos passos
      // de travarPdvRepository + salvarPdvRepository).
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from pdvs where id = $1 for update", [pdvId]);
      await bloqueador.cliente.query("update pdvs set conta_id = $2 where id = $1", [pdvId, contaNId]);

      const abertura = inject("POST", "/api/caixa/abrir", cookieCaixa, {
        empresaId: idsTeste.empresaA,
        pdvId,
        usuarioCaixaId: usuarioCaixa!.id,
        dataHoraAbertura: "2026-07-31T08:30",
        lacreAbertura: lacre
      });
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);
      await bloqueador.cliente.query("commit");

      // A abertura rele o PDV POS-troca: o lacre e destinado a conta antiga -> recusa integral.
      const resposta = await abertura;
      expect(resposta.statusCode, resposta.body).toBe(400);
      expect(resposta.body).toMatch(/destino desta transfer/i);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // Nada foi escrito: sem caixa no PDV, lacre integro, transferencia pendente e sem caixa.
    const caixasNoPdv = await consultarUm<{ total: string }>(
      "select count(*) as total from fechamentos_caixa where pdv_id = $1",
      [pdvId]
    );
    expect(Number(caixasNoPdv?.total ?? "0")).toBe(0);
    expect(
      await consultarUm<{ rompido: boolean }>("select rompido from lacres where numero = $1", [lacre])
    ).toMatchObject({ rompido: false });
    expect(
      await consultarUm<{ caixa_id: string | null; status: string; conta_destino_id: string }>(
        "select caixa_id, status, conta_destino_id from transferencias where id = $1",
        [transferenciaId]
      )
    ).toMatchObject({ caixa_id: null, status: "pendente", conta_destino_id: contaCId });
    expect(await consultarUm<{ conta_id: string }>("select conta_id from pdvs where id = $1", [pdvId])).toMatchObject({
      conta_id: contaNId
    });
  });

  // ------------------------------------------------------------------------------------------
  // S4 — abertura por lacre nao migra transferencia ja vinculada a outro caixa.
  // ------------------------------------------------------------------------------------------

  it("Deve_RecusarAAberturaSemTocarOCaixaDeOrigem_Quando_OLacreJaPertenceAOutroCaixa", async () => {
    const fx = await novaFixture("S4a lacre");
    const lacre = `P0-S4A-${sequencia}`;
    // O operador A cria a transferencia (saida do caixa A, ja contada) com a conta do gerente
    // como candidata — o cenario da migracao silenciosa.
    const contaB = await inject("POST", "/api/contas", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      nome: `Conta S4 ${sequencia}`
    });
    expect(contaB.statusCode, contaB.body).toBe(201);
    const contaBId = json<{ data: { id: string } }>(contaB).data.id;
    const pdvB = await inject("POST", "/api/pdvs", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      nome: `PDV S4 ${sequencia}`,
      contaId: contaBId,
      ativo: true
    });
    expect(pdvB.statusCode, pdvB.body).toBe(201);
    const pdvBId = json<{ data: { id: string } }>(pdvB).data.id;

    const criada = await inject("POST", "/api/transferencias", cookieCaixa, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: lacre,
      valorOriginal: 40,
      contaOrigemId: fx.contaId,
      contaDestinoId: contaBId,
      contasDestinoIds: [contaBId],
      nLacreDoc: lacre
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const transferenciaId = json<{ data: { id: string } }>(criada).data.id;
    expect(
      await consultarUm<{ caixa_id: string | null }>("select caixa_id from transferencias where id = $1", [
        transferenciaId
      ])
    ).toMatchObject({ caixa_id: fx.caixaId });

    // O gerente tenta ABRIR caixa no PDV B usando o lacre: a abertura tem de FALHAR inteira —
    // sem migrar a transferencia, sem romper o lacre, sem criar o caixa B.
    const usuarioGerente = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.gerente.email
    ]);
    const abertura = await inject("POST", "/api/caixa/abrir", cookieGerente, {
      empresaId: idsTeste.empresaA,
      pdvId: pdvBId,
      usuarioCaixaId: usuarioGerente!.id,
      dataHoraAbertura: "2026-07-31T09:00",
      lacreAbertura: lacre
    });
    expect(abertura.statusCode, abertura.body).toBe(400);
    expect(abertura.body).toMatch(/pertence a outro caixa/i);

    expect(
      await consultarUm<{ caixa_id: string | null; status: string }>(
        "select caixa_id, status from transferencias where id = $1",
        [transferenciaId]
      )
    ).toMatchObject({ caixa_id: fx.caixaId, status: "pendente" });
    expect(
      await consultarUm<{ rompido: boolean }>("select rompido from lacres where numero = $1", [lacre])
    ).toMatchObject({ rompido: false });
    const caixasNoPdvB = await consultarUm<{ total: string }>(
      "select count(*) as total from fechamentos_caixa where pdv_id = $1",
      [pdvBId]
    );
    expect(Number(caixasNoPdvB?.total ?? "0")).toBe(0);
    // A saida segue contando no caixa de origem (ainda aberto).
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({ status: "aberto", transferencias: 1 });
  });

  it("Deve_AbrirNormalmente_Quando_OLacreVemDeTransferenciaSemCaixa", async () => {
    // Caminho legitimo (tesouraria -> caixa novo) intacto: transferencia com caixa_id nulo.
    sequencia += 1;
    const lacre = `P0-S4B-${sequencia}`;
    const conta = await inject("POST", "/api/contas", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      nome: `Conta S4b ${sequencia}`
    });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await inject("POST", "/api/pdvs", cookieAdmin, {
      empresaId: idsTeste.empresaA,
      nome: `PDV S4b ${sequencia}`,
      contaId,
      ativo: true
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const criada = await inject("POST", "/api/transferencias", cookieGerente, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: lacre,
      valorOriginal: 25,
      contaOrigemId: idsTeste.contaBanco,
      contaDestinoId: contaId,
      contasDestinoIds: [contaId],
      nLacreDoc: lacre
    });
    expect(criada.statusCode, criada.body).toBe(201);
    expect(
      await consultarUm<{ caixa_id: string | null }>("select caixa_id from transferencias where n_lacre_doc = $1", [
        lacre
      ])
    ).toMatchObject({ caixa_id: null });

    const usuarioCaixa = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);
    const abertura = await inject("POST", "/api/caixa/abrir", cookieCaixa, {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: usuarioCaixa!.id,
      dataHoraAbertura: "2026-07-31T09:30",
      lacreAbertura: lacre
    });
    expect(abertura.statusCode, abertura.body).toBe(201);
  });

  // ------------------------------------------------------------------------------------------
  // S5 — aprovar/recusar NF-e entra na porta.
  // ------------------------------------------------------------------------------------------

  /**
   * Mercadoria de NF-e presa ao caixa: o estado e alcancavel em producao (NF-e importada +
   * PUT da retaguarda com a conta do PDV carimba o caixa_id). A fixture cria pela rota real e
   * devolve o registro ao estado de fila por SQL — mesmo padrao de shaping das suites irmas.
   */
  async function mercadoriaAguardandoNoCaixa(fx: { contaId: string }, marcador: string, valor = 55) {
    const criada = await inject("POST", "/api/mercadorias", cookieCaixa, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      dataVencimento: hoje,
      descricao: marcador,
      valorOriginal: valor,
      contaOrigemId: fx.contaId,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      fornecedorId: idsTeste.fornecedor
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;
    await executarSql("update mercadorias set status = 'aguardando_aprovacao', computar = false where id = $1", [id]);
    return id;
  }

  function aprovar(mercadoriaId: string) {
    return inject("PATCH", `/api/mercadorias/${mercadoriaId}/aprovar`, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      computar: true
    });
  }

  it("Deve_EsperarEIncluirNoTotal_Quando_AAprovacaoVenceOFechamento", async () => {
    const fx = await novaFixture("S5a nfe");
    const marcador = `P0-S5a-${sequencia}`;
    const mercadoriaId = await mercadoriaAguardandoNoCaixa(fx, marcador);
    await vendaManual(cookieCaixa, 100, `${marcador}-venda`);

    const bloqueador = await abrirBloqueador();
    try {
      // Gate na LINHA da mercadoria: a aprovacao (ja com o FOR SHARE do caixa) prende na trava da
      // linha; o fechamento entra na fila atras dela e congela COM a mercadoria computada.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from mercadorias where id = $1 for update", [mercadoriaId]);

      const aprovacao = aprovar(mercadoriaId);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const fechamento = fecharCaixaInject(fx.caixaId, cookieCaixa);
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await aprovacao).statusCode).toBe(200);
      expect((await fechamento).statusCode).toBe(204);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_mercadorias: "55.00",
      saldo: "0.00"
    });
  });

  it("Deve_RecusarAAprovacao_Quando_OFechamentoVence", async () => {
    const fx = await novaFixture("S5b nfe");
    const marcador = `P0-S5b-${sequencia}`;
    const mercadoriaId = await mercadoriaAguardandoNoCaixa(fx, marcador);
    await vendaManual(cookieCaixa, 100, `${marcador}-venda`);

    const bloqueador = await segurarContaDoCofre();
    try {
      const fechamento = fecharCaixaInject(fx.caixaId, cookieCaixa);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const aprovacao = aprovar(mercadoriaId);
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await fechamento).statusCode).toBe(204);

      const resposta = await aprovacao;
      expect(resposta.statusCode, resposta.body).toBe(400);
      expect(resposta.body).toMatch(/Caixa j[aá] fechado/);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(
      await consultarUm<{ status: string; computar: boolean }>(
        "select status, computar from mercadorias where id = $1",
        [mercadoriaId]
      )
    ).toMatchObject({ status: "aguardando_aprovacao", computar: false });
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({ status: "fechado", total_mercadorias: "0.00" });
  });

  it("Deve_RecusarARecusaDeNfe_Quando_OCaixaJaFechou", async () => {
    const fx = await novaFixture("S5c nfe");
    const marcador = `P0-S5c-${sequencia}`;
    const mercadoriaId = await mercadoriaAguardandoNoCaixa(fx, marcador);
    await vendaManual(cookieCaixa, 100, `${marcador}-venda`);
    const fechamento = await fecharCaixaInject(fx.caixaId, cookieCaixa);
    expect(fechamento.statusCode, fechamento.body).toBe(204);

    const resposta = await inject("PATCH", `/api/mercadorias/${mercadoriaId}/recusar`, cookieAdmin, {
      empresaId: idsTeste.empresaA
    });
    expect(resposta.statusCode, resposta.body).toBe(400);
    expect(resposta.body).toMatch(/Caixa j[aá] fechado/);
    expect(
      await consultarUm<{ status: string }>("select status from mercadorias where id = $1", [mercadoriaId])
    ).toMatchObject({ status: "aguardando_aprovacao" });
  });

  // ------------------------------------------------------------------------------------------
  // S6 — auditoria provada: reescrever CONTAS nunca altera um SEGUNDO caixa.
  // ------------------------------------------------------------------------------------------

  it("Deve_CompletarSemTravarOSegundoCaixa_Quando_OPutReapontaContasParaOutroPdv", async () => {
    const fxA = await novaFixture("S6a A");
    const fxB = await novaFixture("S6a B", "admin");
    const marcador = `P0-S6a-${sequencia}`;
    const criada = await inject("POST", "/api/transferencias", cookieCaixa, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: marcador,
      valorOriginal: 20,
      contaOrigemId: fxA.contaId,
      contaDestinoId: idsTeste.contaBanco,
      nLacreDoc: marcador
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const transferenciaId = json<{ data: { id: string } }>(criada).data.id;
    const congeladoB = await universoDoCaixa(fxB.caixaId);

    const bloqueador = await abrirBloqueador();
    try {
      // B esta EXCLUSIVAMENTE travado. Se o PUT precisasse do caixa B, esperaria aqui.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from fechamentos_caixa where id = $1 for update", [fxB.caixaId]);

      const edicao = inject("PUT", `/api/transferencias/${transferenciaId}`, cookieCaixa, {
        empresaId: idsTeste.empresaA,
        dataReferencia: hoje,
        descricao: `${marcador}-editada`,
        valorOriginal: 20,
        contaOrigemId: fxA.contaId,
        contaDestinoId: fxB.contaId,
        nLacreDoc: marcador
      });
      expect(await esperarBloqueioPor(bloqueador, 1, 3_000)).toBe(false);
      const resposta = await edicao;
      expect(resposta.statusCode, resposta.body).toBe(200);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // O total de B nao muda NUNCA por esta linha: ela pertence (caixa_id) ao caixa A.
    expect(await universoDoCaixa(fxB.caixaId)).toEqual(congeladoB);
    expect(
      await consultarUm<{ caixa_id: string }>("select caixa_id from transferencias where id = $1", [transferenciaId])
    ).toMatchObject({ caixa_id: fxA.caixaId });
  });

  it("Deve_ConfirmarSemTravarOSegundoCaixa_Quando_ODestinoEhContaDeOutroPdv", async () => {
    const fxA = await novaFixture("S6b A");
    const fxB = await novaFixture("S6b B", "admin");
    const marcador = `P0-S6b-${sequencia}`;
    const criada = await inject("POST", "/api/transferencias", cookieCaixa, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: marcador,
      valorOriginal: 15,
      contaOrigemId: fxA.contaId,
      contaDestinoId: fxB.contaId,
      contasDestinoIds: [fxB.contaId],
      nLacreDoc: marcador
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const transferenciaId = json<{ data: { id: string } }>(criada).data.id;
    await executarSql("insert into contas_usuarios (id, empresa_id, conta_id, usuario_id) values ($1, $2, $3, $4)", [
      randomUUID(),
      idsTeste.empresaA,
      fxB.contaId,
      gerenteId
    ]);
    const congeladoB = await universoDoCaixa(fxB.caixaId);

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from fechamentos_caixa where id = $1 for update", [fxB.caixaId]);

      const confirmacao = inject("POST", `/api/transferencias/${transferenciaId}/confirmar`, cookieGerente, {
        contaDestinoId: fxB.contaId,
        nLacreDoc: marcador
      });
      expect(await esperarBloqueioPor(bloqueador, 1, 3_000)).toBe(false);
      const resposta = await confirmacao;
      expect(resposta.statusCode, resposta.body).toBe(200);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // A entrada NAO conta em B (caixa_id = A); os totais de B ficam intactos.
    expect(await universoDoCaixa(fxB.caixaId)).toEqual(congeladoB);
  });

  // ------------------------------------------------------------------------------------------
  // S8 — re-envio CREARE movendo a venda entre caixas.
  // ------------------------------------------------------------------------------------------

  function payloadVendaIntegrada(idVenda: string, idCaixaExterno: string, valor: number, dataHoraVenda: string) {
    return {
      DadosIntegracao: { origem: "vitest-p0" },
      Venda: {
        idVenda,
        idCaixa: idCaixaExterno,
        nomeCaixa: "PDV P0 S8",
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
        descricaoExterna: "PDV P0 S8",
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);
  }

  it("Deve_RegistrarTrilhaNoCaixaQuePerdeu_Quando_OReenvioMoveAVendaParaForaDoCaixaFechado", async () => {
    const fx = await novaFixture("S8a creare");
    const idExterno = `P0-S8A-${sequencia}`;
    await vincularPdvExterno(`PDV-S8-${sequencia}`, fx.pdvId);

    // Venda dentro do periodo do caixa A.
    const criada = await enviarVendaIntegrada(
      payloadVendaIntegrada(idExterno, `PDV-S8-${sequencia}`, 100, "2026-08-01T12:00:00.000Z")
    );
    expect(criada.statusCode, criada.body).toBe(200);
    const fechamento = await fecharCaixaInject(fx.caixaId, cookieCaixa);
    expect(fechamento.statusCode, fechamento.body).toBe(204);
    const congelado = await universoDoCaixa(fx.caixaId);
    expect(congelado).toMatchObject({ total_entradas: "100.00" });

    // Re-envio identico nao muda nada (idempotencia preservada).
    const reenvioIgual = await enviarVendaIntegrada(
      payloadVendaIntegrada(idExterno, `PDV-S8-${sequencia}`, 100, "2026-08-01T12:00:00.000Z")
    );
    expect(reenvioIgual.statusCode, reenvioIgual.body).toBe(200);
    expect(reenvioIgual.body).toContain("sem_novidade");

    // Re-envio com a venda MOVIDA para fora do periodo (antes da abertura): destino null.
    const reenvio = await enviarVendaIntegrada(
      payloadVendaIntegrada(idExterno, `PDV-S8-${sequencia}`, 100, "2020-01-01T12:00:00.000Z")
    );
    expect(reenvio.statusCode, reenvio.body).toBe(200);
    expect(reenvio.body).toContain("atualizado");

    const venda = await consultarUm<{ caixa_id: string | null; data_venda: string }>(
      "select caixa_id, data_venda::text as data_venda from vendas where identificador_externo = $1",
      [idExterno]
    );
    expect(venda?.data_venda).toContain("2020-01-01");
    expect(venda?.caixa_id, `caixa_id=${venda?.caixa_id} fx=${fx.caixaId}`).toBeNull();
    // O caixa que PERDEU a venda (fechado) ganha a trilha imutavel; os totais congelados ficam.
    const depois = await universoDoCaixa(fx.caixaId);
    expect(depois).toMatchObject({
      status: "fechado",
      total_entradas: "100.00",
      trilha_pos_fechamento: 1,
      vendas: 0
    });
  });

  it("Deve_CongelarSemAVenda_Quando_OReenvioQueMoveVenceOFechamento", async () => {
    const fx = await novaFixture("S8b creare");
    const idExterno = `P0-S8B-${sequencia}`;
    await vincularPdvExterno(`PDV-S8-${sequencia}`, fx.pdvId);
    const criada = await enviarVendaIntegrada(
      payloadVendaIntegrada(idExterno, `PDV-S8-${sequencia}`, 100, "2026-08-01T12:00:00.000Z")
    );
    expect(criada.statusCode, criada.body).toBe(200);
    const vendaId = (
      await consultarUm<{ id: string }>("select id from vendas where identificador_externo = $1", [idExterno])
    )?.id;

    const bloqueador = await abrirBloqueador();
    try {
      // Gate na LINHA da venda: o re-envio (ja com o FOR SHARE da origem) prende no UPDATE; o
      // fechamento entra na fila atras dele e congela SEM a venda (que esta migrando para null).
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from vendas where id = $1 for update", [vendaId]);

      const reenvio = enviarVendaIntegrada(
        payloadVendaIntegrada(idExterno, `PDV-S8-${sequencia}`, 100, "2020-01-01T12:00:00.000Z")
      );
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const fechamento = fecharCaixaInject(fx.caixaId, cookieCaixa, { observacao: "S8b sem a venda" });
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await reenvio).statusCode).toBe(200);
      expect((await fechamento).statusCode).toBe(204);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // O re-envio venceu: a venda saiu ANTES do congelamento — totais sem ela e SEM trilha
    // (o caixa estava aberto quando perdeu a venda).
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_entradas: "0.00",
      trilha_pos_fechamento: 0,
      vendas: 0
    });
  });

  it("Deve_EsperarERegistrarTrilha_Quando_OFechamentoVenceOReenvioQueMove", async () => {
    const fx = await novaFixture("S8c creare");
    const idExterno = `P0-S8C-${sequencia}`;
    await vincularPdvExterno(`PDV-S8-${sequencia}`, fx.pdvId);
    const criada = await enviarVendaIntegrada(
      payloadVendaIntegrada(idExterno, `PDV-S8-${sequencia}`, 100, "2026-08-01T12:00:00.000Z")
    );
    expect(criada.statusCode, criada.body).toBe(200);

    const bloqueador = await segurarContaDoCofre();
    try {
      const fechamento = fecharCaixaInject(fx.caixaId, cookieCaixa);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      // O re-envio que move a venda chega DURANTE o fechamento: espera no FOR SHARE da origem,
      // e ao passar encontra o caixa fechado — move a venda E registra a trilha do perdedor.
      const reenvio = enviarVendaIntegrada(
        payloadVendaIntegrada(idExterno, `PDV-S8-${sequencia}`, 100, "2020-01-01T12:00:00.000Z")
      );
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await fechamento).statusCode).toBe(204);
      expect((await reenvio).statusCode).toBe(200);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_entradas: "100.00",
      trilha_pos_fechamento: 1,
      vendas: 0
    });
  });

  /**
   * A outra metade da janela S8 (revisao r4): a ORIGEM e lida sem trava. Se a venda mudar de caixa
   * entre essa leitura e a escrita (outro re-envio em voo, ou a revinculacao da abertura
   * retroativa), o conjunto travado fica ERRADO — o caixa real perde a venda sem nunca ter sido
   * travado e, fechado, sem trilha. A porta tem de reler a venda SOB a trava da linha e, na
   * divergencia, abortar com erro RETRIABLE (5xx): a R-013 proibe recusar venda integrada, entao o
   * agente re-tenta e o ciclo seguinte faz a coisa certa — inclusive a trilha do perdedor.
   */
  it("Deve_RecusarRetriavelSemPerderVendaNemTrilha_Quando_AOrigemRealMudaDuranteOReenvio", async () => {
    const fxA = await novaFixture("S8d origem");
    const idExterno = `P0-S8D-${sequencia}`;
    await vincularPdvExterno(`PDV-S8-${sequencia}`, fxA.pdvId);
    const criada = await enviarVendaIntegrada(
      payloadVendaIntegrada(idExterno, `PDV-S8-${sequencia}`, 100, "2026-08-01T12:00:00.000Z")
    );
    expect(criada.statusCode, criada.body).toBe(200);
    const vendaId = (
      await consultarUm<{ id: string }>("select id from vendas where identificador_externo = $1", [idExterno])
    )?.id;

    // Caixa B: FECHADO e vazio. E ele que vai receber a venda no meio da corrida — se o re-envio
    // decidir pela origem velha (A), B perde a venda sem trilha e sem nunca ter sido travado.
    const fxB = await novaFixture("S8d destino real", "admin");
    const fechamentoB = await fecharCaixaInject(fxB.caixaId, cookieAdmin);
    expect(fechamentoB.statusCode, fechamentoB.body).toBe(204);

    const bloqueador = await abrirBloqueador();
    try {
      // A revinculacao concorrente (mesma escrita da abertura retroativa) segura a linha da venda.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("update vendas set caixa_id = $2 where id = $1", [vendaId, fxB.caixaId]);

      // O re-envio move a venda para fora de qualquer caixa: le a origem A (retrato pre-lock) e
      // espera na linha da venda.
      const reenvio = enviarVendaIntegrada(
        payloadVendaIntegrada(idExterno, `PDV-S8-${sequencia}`, 100, "2020-01-01T12:00:00.000Z")
      );
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      await bloqueador.cliente.query("commit");

      // Sob a trava a venda ja esta em B: a origem prevista (A) nao vale mais -> 503 retriable.
      const resposta = await reenvio;
      expect(resposta.statusCode, resposta.body).toBe(503);
      expect(resposta.body).toContain("LOCK_OCUPADO");
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // Nada foi escrito pelo re-envio recusado: a venda continua em B com a data original.
    expect(
      await consultarUm<{ caixa_id: string | null; data_venda: string }>(
        "select caixa_id, data_venda::text as data_venda from vendas where id = $1",
        [vendaId]
      )
    ).toMatchObject({ caixa_id: fxB.caixaId });
    expect(await universoDoCaixa(fxB.caixaId)).toMatchObject({ status: "fechado", trilha_pos_fechamento: 0 });

    // O agente re-tenta (mesmo payload): agora a origem real e B — a venda sai e B, fechado, ganha
    // a trilha imutavel. O rollback preservou o hash antigo, entao o retry NAO cai em sem_novidade.
    const retry = await enviarVendaIntegrada(
      payloadVendaIntegrada(idExterno, `PDV-S8-${sequencia}`, 100, "2020-01-01T12:00:00.000Z")
    );
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.body).toContain("atualizado");
    expect(
      await consultarUm<{ caixa_id: string | null; data_venda: string }>(
        "select caixa_id, data_venda::text as data_venda from vendas where id = $1",
        [vendaId]
      )
    ).toMatchObject({ caixa_id: null });
    expect(await universoDoCaixa(fxB.caixaId)).toMatchObject({
      status: "fechado",
      trilha_pos_fechamento: 1,
      vendas: 0
    });
  });
});
