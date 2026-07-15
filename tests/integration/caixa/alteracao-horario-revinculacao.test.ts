import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql } from "../../setup/integracao.js";

// PR1 — alteracao de horario por token/permissao + revinculacao retroativa das vendas integradas.
// Cenario central: caixa aberto tarde, corrige abertura para cedo -> vendas integradas orfas do PDV
// no periodo entram no caixa. Cobre: anexar, desanexar, nao-roubo, token expirado/reusado, direta.
describe("caixa: alteracao de horario + revinculacao de vendas", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string; // tem caixa_alterar_horario (autoriza e altera direto)
  let cookieCaixa: string; // operador: caixa_operar, SEM caixa_alterar_horario
  let operadorId: string;
  let caixaId: string;

  const PDV = idsTeste.pdvLivre; // sem caixa aberto no seed (o caixaFechado dele esta fechado)

  function put(url: string, payload: object, cookie: string) {
    return contexto.app.inject({ method: "PUT", url, headers: { cookie }, payload });
  }
  function post(url: string, payload: object, cookie: string) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
  }

  async function setAbertura(iso: string) {
    await executarSql("update fechamentos_caixa set data_hora_abertura = $1, data_movimento = $2 where id = $3", [
      iso,
      iso.slice(0, 10),
      caixaId
    ]);
  }

  async function inserirVendaIntegrada(idExterno: string, dataVendaIso: string, caixa: string | null) {
    await executarSql(
      `insert into vendas
         (empresa_id, integracao_chave_id, caixa_id, pdv_id, data_referencia, data_venda, descricao,
          valor_original, identificador_externo, status, computar)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'aprovado',true)`,
      [
        idsTeste.empresaA,
        idsTeste.integracaoChave,
        caixa,
        PDV,
        dataVendaIso.slice(0, 10),
        dataVendaIso,
        "Venda integrada",
        "10.00",
        idExterno
      ]
    );
  }

  async function inserirVendaManual(idExterno: string, caixa: string) {
    // Venda manual: SEM integracao_chave_id e SEM data_venda -> a revinculacao nunca a toca.
    await executarSql(
      `insert into vendas
         (empresa_id, caixa_id, pdv_id, data_referencia, descricao, valor_original, identificador_externo,
          status, computar)
       values ($1,$2,$3,$4,$5,$6,$7,'aprovado',true)`,
      [idsTeste.empresaA, caixa, PDV, "2026-07-15", "Venda manual", "5.00", idExterno]
    );
  }

  async function caixaDaVenda(idExterno: string) {
    const linha = await consultarUm<{ caixa_id: string | null }>(
      "select caixa_id from vendas where identificador_externo = $1",
      [idExterno]
    );
    return linha?.caixa_id ?? null;
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
    const operador = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where email = $1",
      [usuariosTeste.caixa.email]
    );
    operadorId = operador!.usuario_id;

    // Caixa aberto no PDV livre, de propriedade do OPERADOR, aberto "tarde" (12:53).
    const caixa = await consultarUm<{ id: string }>(
      `insert into fechamentos_caixa
         (empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id, data_movimento,
          data_hora_abertura, aberto_em, token_edicao, status, criado_por)
       values ($1,$2,$3,$3,$4,'2026-07-15','2026-07-15T12:53:00.000Z','2026-07-15T12:53:00.000Z',
               'TOKEN-TESTE','aberto',$3)
       returning id`,
      [idsTeste.empresaA, PDV, operadorId, idsTeste.colaboradorCaixa]
    );
    caixaId = caixa!.id;
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  beforeEach(async () => {
    await executarSql("delete from vendas where identificador_externo like 'TESTE-%'", []);
    await setAbertura("2026-07-15T12:53:00.000Z");
  });

  it("permissao direta (gerente/admin): corrige abertura 12:53 -> 08:00 e ANEXA as orfas do periodo", async () => {
    await inserirVendaIntegrada("TESTE-DENTRO", "2026-07-15T09:00:00.000Z", null); // orfa, dentro de [08:00, agora]
    await inserirVendaIntegrada("TESTE-ANTES", "2026-07-15T06:00:00.000Z", null); // orfa, ANTES de 08:00
    await inserirVendaIntegrada("TESTE-OUTROCAIXA", "2026-07-15T10:00:00.000Z", idsTeste.caixaFechado); // de outro caixa

    const resposta = await put(
      `/api/caixa/${caixaId}/horario`,
      { dataHoraAbertura: "2026-07-15T08:00", observacao: "Abertura real foi as 08:00" },
      cookieAdmin
    );

    expect(resposta.statusCode, resposta.body).toBe(200);
    const dados = resposta.json().data;
    expect(dados.revinculacao.anexadas).toBe(1);
    expect(await caixaDaVenda("TESTE-DENTRO")).toBe(caixaId); // anexada
    expect(await caixaDaVenda("TESTE-ANTES")).toBeNull(); // fora do periodo, continua orfa
    expect(await caixaDaVenda("TESTE-OUTROCAIXA")).toBe(idsTeste.caixaFechado); // NAO-ROUBO: nao mexeu
  });

  it("DESANEXA ao encolher o periodo e NAO toca venda manual", async () => {
    await setAbertura("2026-07-15T08:00:00.000Z");
    await inserirVendaIntegrada("TESTE-CEDO", "2026-07-15T08:30:00.000Z", caixaId); // ja anexada, dentro de 08:00
    await inserirVendaManual("TESTE-MANUAL", caixaId); // manual, sem data_venda

    // Encolhe: abertura passa para 09:30 -> a venda das 08:30 fica fora.
    const resposta = await put(
      `/api/caixa/${caixaId}/horario`,
      { dataHoraAbertura: "2026-07-15T09:30", observacao: "Ajuste de abertura" },
      cookieAdmin
    );

    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(resposta.json().data.revinculacao.desanexadas).toBe(1);
    expect(await caixaDaVenda("TESTE-CEDO")).toBeNull(); // desanexada
    expect(await caixaDaVenda("TESTE-MANUAL")).toBe(caixaId); // manual permanece
  });

  it("fluxo por token: operador solicita, autorizador gera, operador aplica (anexa) e nao reusa", async () => {
    await inserirVendaIntegrada("TESTE-TOKEN", "2026-07-15T09:00:00.000Z", null);

    // 1) Operador solicita, escolhendo o admin como autorizador.
    const solicitacao = await post(
      `/api/caixa/${caixaId}/autorizacoes`,
      {
        autorizadorId: (await consultarUm<{ usuario_id: string }>(
          "select usuario_id from perfis_usuarios where email = $1",
          [usuariosTeste.admin.email]
        ))!.usuario_id,
        observacao: "Esqueci de abrir cedo"
      },
      cookieCaixa
    );
    expect(solicitacao.statusCode, solicitacao.body).toBe(201);
    const autorizacaoId = solicitacao.json().data.id;

    // 2) Autorizador (admin) gera o token — retornado UMA vez.
    const geracao = await post(`/api/caixa/autorizacoes/${autorizacaoId}/token`, {}, cookieAdmin);
    expect(geracao.statusCode, geracao.body).toBe(200);
    const token: string = geracao.json().data.token;
    expect(token).toMatch(/^\d{6}$/);

    // 3) Operador aplica com o token + observacao obrigatoria.
    const aplicar = await put(
      `/api/caixa/${caixaId}/horario`,
      { dataHoraAbertura: "2026-07-15T08:00", token, observacao: "Autorizado pelo gerente" },
      cookieCaixa
    );
    expect(aplicar.statusCode, aplicar.body).toBe(200);
    expect(aplicar.json().data.revinculacao.anexadas).toBe(1);
    expect(await caixaDaVenda("TESTE-TOKEN")).toBe(caixaId);

    // 4) Reuso do MESMO token -> 410 (uso unico).
    const reuso = await put(
      `/api/caixa/${caixaId}/horario`,
      { dataHoraAbertura: "2026-07-15T08:15", token, observacao: "tentando reusar" },
      cookieCaixa
    );
    expect(reuso.statusCode).toBe(410);
  });

  it("operador sem token nao altera (400) e token expirado e recusado (410)", async () => {
    const adminId = (await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where email = $1",
      [usuariosTeste.admin.email]
    ))!.usuario_id;

    // Sem token -> 400.
    const semToken = await put(
      `/api/caixa/${caixaId}/horario`,
      { dataHoraAbertura: "2026-07-15T08:00", observacao: "sem token" },
      cookieCaixa
    );
    expect(semToken.statusCode).toBe(400);

    // Token gerado e depois EXPIRADO manualmente -> 410.
    const solicitacao = await post(`/api/caixa/${caixaId}/autorizacoes`, { autorizadorId: adminId }, cookieCaixa);
    const autorizacaoId = solicitacao.json().data.id;
    const token: string = (await post(`/api/caixa/autorizacoes/${autorizacaoId}/token`, {}, cookieAdmin)).json().data
      .token;
    await executarSql("update caixa_autorizacoes set expira_em = '2020-01-01T00:00:00.000Z' where id = $1", [
      autorizacaoId
    ]);

    const expirado = await put(
      `/api/caixa/${caixaId}/horario`,
      { dataHoraAbertura: "2026-07-15T08:00", token, observacao: "token expirado" },
      cookieCaixa
    );
    expect(expirado.statusCode).toBe(410);
  });

  it("observacao e obrigatoria mesmo na permissao direta", async () => {
    const resposta = await put(
      `/api/caixa/${caixaId}/horario`,
      { dataHoraAbertura: "2026-07-15T08:00", observacao: "" },
      cookieAdmin
    );
    expect(resposta.statusCode).toBe(400);
  });
});
