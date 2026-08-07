import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, json } from "../../setup/integracao.js";

// Decisao 5 e 8 · conferencia ESTRITA e recusa auditavel — exclusivas do fluxo Caixa -> Cofre.
//
// O que estes testes protegem:
//   - `/confirmar` de uma entrega do Caixa exige o valor contado e recusa qualquer divergencia,
//     SEM confirmar e SEM cancelar (o movimento fica `pendente`, pronto para reconferencia);
//   - a divergencia tem endpoint proprio, e o registro dela precisa ser COMMITADO — se fosse
//     sinalizada por excecao dentro do confirmar, o rollback apagaria a propria trilha;
//   - cada tentativa gera OUTRA linha de auditoria e reabre a notificacao;
//   - quem e notificado e quem ENTREGOU (o executor real), nao quem programou;
//   - e a transferencia GENERICA nao muda de comportamento por causa de nada disso.
describe("transferencias - conferencia estrita e recusa auditavel (Caixa -> Cofre)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieTesouraria: string;
  // O gerente tambem e responsavel pelo cofre no seed. Ele existe aqui porque quem CRIA um
  // movimento nunca pode conferi-lo (R-028): quando a Tesouraria programa, quem confere e ele.
  let cookieGerente: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieTesouraria, cookieGerente] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "tesouraria"),
      cookieSessao(contexto.app, "gerente")
    ]);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const empresaId = idsTeste.empresaA;

  function post(url: string, payload: object, cookie = cookieAdmin) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
  }

  async function criar(url: string, payload: object) {
    const resposta = await post(url, payload);
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  async function usuarioPorEmail(email: string) {
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [email]);
    if (!usuario) throw new Error(`Usuario ${email} nao encontrado`);
    return usuario.id;
  }

  // Abre caixa com saldo e entrega tudo ao cofre — o movimento resultante fica `pendente`,
  // que e o estado em que a conferencia acontece.
  async function entregaPendente(nome: string, dataHora: string, valor: number, lacre: string | null) {
    const contaId = await criar("/api/contas", { empresaId, nome: `Conta ${nome}` });
    const pdvId = await criar("/api/pdvs", { empresaId, nome: `PDV ${nome}`, contaId, ativo: true });
    const caixaId = await criar("/api/caixa/abrir", {
      empresaId,
      pdvId,
      usuarioCaixaId: await usuarioPorEmail(usuariosTeste.admin.email),
      dataHoraAbertura: dataHora
    });
    const dataReferencia = dataHora.slice(0, 10);
    await criar("/api/vendas", {
      empresaId,
      dataReferencia,
      dataPagamento: dataReferencia,
      descricao: `Venda ${nome}`,
      valorOriginal: valor,
      contaOrigemId: contaId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        { produtoId: idsTeste.produto, descricaoProduto: "Pao", quantidade: 1, valorUnitario: valor, valorTotal: valor }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: valor }]
    });
    const entrega = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      tipo: "retorno",
      valor,
      ...(lacre ? { lacre } : {}),
      idempotenciaChave: randomUUID()
    });
    expect(entrega.statusCode, entrega.body).toBe(200);
    const movimento = await consultarUm<{ id: string }>(
      "select id from transferencias where caixa_id = $1 order by criado_em desc limit 1",
      [caixaId]
    );
    return { caixaId, contaId, movimentoId: movimento!.id };
  }

  function recusas(transferenciaId: string) {
    return consultarTodos<{
      motivo: string;
      lacre_informado: string | null;
      valor_informado: string | null;
      recusado_por: string;
    }>(
      `select motivo, lacre_informado, valor_informado, recusado_por
         from transferencias_conferencias_recusadas where transferencia_id = $1 order by criado_em`,
      [transferenciaId]
    );
  }

  it("confirmar entrega do Caixa sem informar o valor recebido e recusado", async () => {
    const { movimentoId } = await entregaPendente("conf-sem-valor", "2026-07-01T08:00", 100, "REC-SEM-VALOR");

    const semValor = await post(
      `/api/transferencias/${movimentoId}/confirmar`,
      { contaDestinoId: idsTeste.contaCofre, nLacreDoc: "REC-SEM-VALOR" },
      cookieTesouraria
    );
    assertProblem(semValor, 400);
    expect(semValor.body).toMatch(/valor recebido/iu);

    // Continua pendente: nada foi confirmado.
    expect(
      (await consultarUm<{ status: string }>("select status from transferencias where id = $1", [movimentoId]))?.status
    ).toBe("pendente");
  });

  it("valor divergente no /confirmar nao confirma e nao cancela — orienta a recusa", async () => {
    const { movimentoId } = await entregaPendente("conf-valor-diverge", "2026-07-02T08:00", 100, "REC-DIV-1");

    const divergente = await post(
      `/api/transferencias/${movimentoId}/confirmar`,
      { contaDestinoId: idsTeste.contaCofre, nLacreDoc: "REC-DIV-1", valorRecebido: 90 },
      cookieTesouraria
    );
    assertProblem(divergente, 409);
    expect(divergente.body).toMatch(/recusar-conferencia/iu);

    const linha = await consultarUm<{ status: string; confirmado_por: string | null }>(
      "select status, confirmado_por from transferencias where id = $1",
      [movimentoId]
    );
    expect(linha).toMatchObject({ status: "pendente", confirmado_por: null });
    // E nada foi gravado como recusa: a recusa exige motivo e tem endpoint proprio.
    expect(await recusas(movimentoId)).toHaveLength(0);
  });

  it("recusa registra a tentativa, mantem pendente e permite confirmar depois de resolvida", async () => {
    const { movimentoId } = await entregaPendente("recusa-fluxo", "2026-07-03T08:00", 100, "REC-FLUXO-1");
    const tesourariaId = await usuarioPorEmail(usuariosTeste.tesouraria.email);

    const recusa = await post(
      `/api/transferencias/${movimentoId}/recusar-conferencia`,
      {
        contaDestinoId: idsTeste.contaCofre,
        motivo: "Envelope veio com 90, faltam 10",
        nLacreDoc: "REC-FLUXO-1",
        valorRecebido: 90
      },
      cookieTesouraria
    );
    expect(recusa.statusCode, recusa.body).toBe(200);
    // Desfecho EXPLICITO de divergencia — nunca sucesso de confirmacao.
    expect(json<{ data: { registrada: boolean; tentativas: number } }>(recusa).data).toMatchObject({
      registrada: true,
      tentativas: 1
    });

    // O registro sobreviveu (nao houve excecao depois de grava-lo) e o movimento segue pendente.
    const trilha = await recusas(movimentoId);
    expect(trilha).toHaveLength(1);
    expect(trilha[0]).toMatchObject({
      motivo: "Envelope veio com 90, faltam 10",
      lacre_informado: "REC-FLUXO-1",
      valor_informado: "90.00",
      recusado_por: tesourariaId
    });
    const linha = await consultarUm<{ status: string; confirmado_por: string | null }>(
      "select status, confirmado_por from transferencias where id = $1",
      [movimentoId]
    );
    expect(linha).toMatchObject({ status: "pendente", confirmado_por: null });

    // Segunda tentativa: OUTRA linha de auditoria (a trilha nao pode mentir por deduplicacao).
    const segunda = await post(
      `/api/transferencias/${movimentoId}/recusar-conferencia`,
      { contaDestinoId: idsTeste.contaCofre, motivo: "Conferi de novo, continua faltando", valorRecebido: 90 },
      cookieTesouraria
    );
    expect(segunda.statusCode, segunda.body).toBe(200);
    expect(json<{ data: { tentativas: number } }>(segunda).data.tentativas).toBe(2);
    expect(await recusas(movimentoId)).toHaveLength(2);

    // Resolvida a divergencia no mundo real, a conferencia correta passa normalmente.
    const correta = await post(
      `/api/transferencias/${movimentoId}/confirmar`,
      { contaDestinoId: idsTeste.contaCofre, nLacreDoc: "REC-FLUXO-1", valorRecebido: 100 },
      cookieTesouraria
    );
    expect(correta.statusCode, correta.body).toBe(200);
    expect(
      (await consultarUm<{ status: string }>("select status from transferencias where id = $1", [movimentoId]))?.status
    ).toBe("recebido");
    // A trilha continua la depois de confirmar — auditoria nao some quando o problema e resolvido.
    expect(await recusas(movimentoId)).toHaveLength(2);
  });

  it("a recusa notifica quem EXECUTOU a solicitacao, nao quem a programou", async () => {
    // Solicitacao programada pela Tesouraria e executada pelo admin: sao pessoas diferentes.
    const contaId = await criar("/api/contas", { empresaId, nome: "Conta recusa-executor" });
    const pdvId = await criar("/api/pdvs", { empresaId, nome: "PDV recusa-executor", contaId, ativo: true });
    const adminId = await usuarioPorEmail(usuariosTeste.admin.email);
    const caixaId = await criar("/api/caixa/abrir", {
      empresaId,
      pdvId,
      usuarioCaixaId: adminId,
      dataHoraAbertura: "2026-07-04T08:00"
    });
    await criar("/api/vendas", {
      empresaId,
      dataReferencia: "2026-07-04",
      dataPagamento: "2026-07-04",
      descricao: "Venda recusa-executor",
      valorOriginal: 70,
      contaOrigemId: contaId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        { produtoId: idsTeste.produto, descricaoProduto: "Pao", quantidade: 1, valorUnitario: 70, valorTotal: 70 }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 70 }]
    });

    const programar = await post(
      `/api/caixa/${caixaId}/solicitacoes-cofre`,
      { tipo: "retorno", valor: 70, idempotenciaChave: randomUUID() },
      cookieTesouraria
    );
    expect(programar.statusCode, programar.body).toBe(200);
    const solicitacaoId = json<{ data: { id: string }[] }>(programar).data[0]!.id;
    expect(
      (await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${solicitacaoId}/executar`, { lacre: "REC-EXEC-1" }))
        .statusCode
    ).toBe(200);

    // Quem recusa e o GERENTE: a Tesouraria criou a solicitacao e por isso nao pode confirmar nem
    // recusar o proprio pedido (R-028).
    const recusa = await post(
      `/api/transferencias/${solicitacaoId}/recusar-conferencia`,
      { contaDestinoId: idsTeste.contaCofre, motivo: "Lacre violado", nLacreDoc: "REC-EXEC-1", valorRecebido: 70 },
      cookieGerente
    );
    expect(recusa.statusCode, recusa.body).toBe(200);

    const destinatarios = await consultarTodos<{ destinatario_usuario_id: string }>(
      "select destinatario_usuario_id from notificacoes where referencia_id = $1 and tipo = 'transferencia_divergencia'",
      [solicitacaoId]
    );
    const ids = destinatarios.map((linha) => linha.destinatario_usuario_id);
    // O EXECUTOR (admin) foi avisado. Se o codigo usasse `criado_por`, so a Tesouraria — que
    // programou e ja sabe do problema — seria notificada, e o operador ficaria no escuro.
    expect(ids).toContain(adminId);
  });

  it("recusa nao existe para transferencia generica (404) e o comportamento dela e preservado", async () => {
    // Generica pendente cofre -> banco, sem relacao com caixa.
    const generica = await criar("/api/transferencias", {
      empresaId,
      dataReferencia: "2026-07-05",
      descricao: "Transferencia generica",
      valorOriginal: 200,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: idsTeste.contaBanco,
      nLacreDoc: "GEN-CONF-1",
      tempoConfirmacao: "1dia"
    });

    // 1) Recusa auditavel nao se aplica a ela.
    const recusa = await post(
      `/api/transferencias/${generica}/recusar-conferencia`,
      { contaDestinoId: idsTeste.contaBanco, motivo: "nao deveria funcionar" },
      cookieTesouraria
    );
    assertProblem(recusa, 404);
    expect(await recusas(generica)).toHaveLength(0);

    // 2) NAO-REGRESSAO: na generica, valor divergente CONFIRMA e notifica — comportamento vigente.
    const tesourariaId = await usuarioPorEmail(usuariosTeste.tesouraria.email);
    await post("/api/contas-usuarios", { empresaId, contaId: idsTeste.contaBanco, usuarioId: tesourariaId });
    const confirmar = await post(
      `/api/transferencias/${generica}/confirmar`,
      { contaDestinoId: idsTeste.contaBanco, nLacreDoc: "GEN-CONF-1", valorRecebido: 180 },
      cookieTesouraria
    );
    expect(confirmar.statusCode, confirmar.body).toBe(200);
    expect(
      (await consultarUm<{ status: string }>("select status from transferencias where id = $1", [generica]))?.status
    ).toBe("recebido");
    const notificou = await consultarTodos<{ id: string }>(
      "select id from notificacoes where referencia_id = $1 and tipo = 'transferencia_divergencia'",
      [generica]
    );
    expect(notificou.length).toBeGreaterThan(0);
  });

  it("movimento do Caixa sem lacre confirma sem lacre e recusa lacre inventado", async () => {
    const { movimentoId } = await entregaPendente("conf-sem-lacre", "2026-07-06T08:00", 40, null);

    const comLacreInventado = await post(
      `/api/transferencias/${movimentoId}/confirmar`,
      { contaDestinoId: idsTeste.contaCofre, nLacreDoc: "INVENTADO", valorRecebido: 40 },
      cookieTesouraria
    );
    assertProblem(comLacreInventado, 409);

    const semLacre = await post(
      `/api/transferencias/${movimentoId}/confirmar`,
      { contaDestinoId: idsTeste.contaCofre, valorRecebido: 40 },
      cookieTesouraria
    );
    expect(semLacre.statusCode, semLacre.body).toBe(200);
  });

  it("quem criou o movimento nao pode recusar a propria entrega", async () => {
    const { movimentoId } = await entregaPendente("recusa-criador", "2026-07-07T08:00", 50, "REC-CRIADOR-1");

    // O admin criou a entrega; ele nao pode conferi-la nem recusa-la (R-028).
    const resposta = await post(
      `/api/transferencias/${movimentoId}/recusar-conferencia`,
      { contaDestinoId: idsTeste.contaCofre, motivo: "tentando recusar o proprio envio", valorRecebido: 10 },
      cookieAdmin
    );
    assertProblem(resposta, 400);
    expect(await recusas(movimentoId)).toHaveLength(0);
  });

  // O campo que a TELA usa para saber qual regra aplicar. Sem ele o cockpit tratava toda
  // transferencia como se fosse do Caixa: exigia valor sempre e oferecia "Nao bateu" numa
  // generica, onde a rota de recusa responde 404.
  it("a listagem marca ehCaixaParaCofre com o predicado canonico", async () => {
    const { movimentoId } = await entregaPendente("dto-flag", "2026-07-10T08:00", 25, "DTO-FLAG-1");
    const generica = await criar("/api/transferencias", {
      empresaId,
      dataReferencia: "2026-07-10",
      descricao: "Generica para o DTO",
      valorOriginal: 15,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: idsTeste.contaBanco,
      nLacreDoc: "DTO-GEN-1",
      tempoConfirmacao: "1dia"
    });

    const lista = await contexto.app.inject({
      method: "GET",
      url: `/api/transferencias?empresaId=${empresaId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(lista);
    const itens = json<{ data: { id: string; ehCaixaParaCofre: boolean }[] }>(lista).data;

    expect(itens.find((item) => item.id === movimentoId)?.ehCaixaParaCofre).toBe(true);
    // Cofre -> banco: destino nao e a conta de cofre, e nao ha caixa. Fluxo generico.
    expect(itens.find((item) => item.id === generica)?.ehCaixaParaCofre).toBe(false);
  });

  it("a lista de conferencia continua acessivel apos a recusa", async () => {
    const { movimentoId } = await entregaPendente("recusa-lista", "2026-07-08T08:00", 30, "REC-LISTA-1");
    await post(
      `/api/transferencias/${movimentoId}/recusar-conferencia`,
      { contaDestinoId: idsTeste.contaCofre, motivo: "divergencia", valorRecebido: 20 },
      cookieTesouraria
    );

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/transferencias/${movimentoId}`,
      headers: { cookie: cookieTesouraria }
    });
    assertOk(detalhe);
    expect(json<{ data: { status: string } }>(detalhe).data.status).toBe("pendente");
  });
});
