import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// Decisao 5 e 8 · conferencia ESTRITA e recusa auditavel — exclusivas do fluxo Caixa -> Cofre.
//
// O que estes testes protegem:
//   - `/confirmar` de uma entrega do Caixa exige o valor contado e recusa qualquer divergencia,
//     SEM confirmar e SEM cancelar (o movimento fica `pendente`, pronto para reconferencia);
//   - a divergencia tem endpoint proprio, e o registro dela precisa ser COMMITADO — se fosse
//     sinalizada por excecao dentro do confirmar, o rollback apagaria a propria trilha;
//   - cada tentativa gera OUTRA linha de auditoria e reabre a notificacao;
//   - quem e notificado e quem ENTREGOU o malote — e "quem entregou" continua sendo lido de
//     `executado_por` nas linhas HISTORICAS, que e o unico lugar onde essa coluna ainda existe;
//   - e a transferencia GENERICA nao muda de comportamento por causa de nada disso.
describe("transferencias - conferencia estrita e recusa auditavel (Caixa -> Cofre)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieTesouraria: string;
  // O gerente tambem e responsavel pelo cofre no seed. Ele existe aqui porque quem CRIA um
  // movimento nunca pode conferi-lo (R-028): a entrega sai pela mao do admin, e quem confere e ele.
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

  it("filtra transferencias por status no banco antes de paginar", async () => {
    const { movimentoId } = await entregaPendente("filtro-status", "2026-07-01T08:00", 100, "FILTRO-STATUS");

    const pendentes = await contexto.app.inject({
      method: "GET",
      url: `/api/transferencias?empresaId=${empresaId}&status=pendente&pageSize=100`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(pendentes);
    const itensPendentes = json<{ data: { id: string; status: string }[] }>(pendentes).data;
    expect(itensPendentes).toContainEqual(expect.objectContaining({ id: movimentoId, status: "pendente" }));

    const recebidas = await contexto.app.inject({
      method: "GET",
      url: `/api/transferencias?empresaId=${empresaId}&status=recebido&pageSize=100`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(recebidas);
    expect(json<{ data: { id: string }[] }>(recebidas).data.map((item) => item.id)).not.toContain(movimentoId);
  });

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

  // R-179/Fatia 3 · o caso original montava uma ordem programada pela Tesouraria e executada pelo
  // admin, para provar que a notificacao ia ao EXECUTOR e nao ao programador. Com o caminho unico
  // as duas pessoas sao uma so: quem entrega e quem cria. O fio que este caso protege continua o
  // mesmo — `atual.executadoPor ?? atual.criadoPor` em `transferencias.service.ts` —, e o `??`
  // segue necessario para as linhas HISTORICAS, que tem `executado_por` preenchido.
  it("a recusa notifica quem ENTREGOU o malote", async () => {
    const adminId = await usuarioPorEmail(usuariosTeste.admin.email);
    const { movimentoId } = await entregaPendente("recusa-entregador", "2026-07-04T08:00", 70, "REC-EXEC-1");

    // Quem recusa e o GERENTE: quem entregou nao confere a propria entrega (R-028).
    const recusa = await post(
      `/api/transferencias/${movimentoId}/recusar-conferencia`,
      { contaDestinoId: idsTeste.contaCofre, motivo: "Lacre violado", nLacreDoc: "REC-EXEC-1", valorRecebido: 70 },
      cookieGerente
    );
    expect(recusa.statusCode, recusa.body).toBe(200);

    const destinatarios = await consultarTodos<{ destinatario_usuario_id: string }>(
      "select destinatario_usuario_id from notificacoes where referencia_id = $1 and tipo = 'transferencia_divergencia'",
      [movimentoId]
    );
    const ids = destinatarios.map((linha) => linha.destinatario_usuario_id);
    // Quem entregou (admin) foi avisado. Sem isso a divergencia so chegaria a Tesouraria, e quem
    // pos o dinheiro no envelope ficaria no escuro.
    expect(ids).toContain(adminId);
  });

  // R-179/Fatia 3 · A LINHA LEGADA, e os tres leitores de `executado_por` que ela mantem vivos.
  //
  // O fluxo D4 foi removido, entao nenhum codigo ESCREVE mais `executado_por`. Mas a coluna ficou
  // (remove-la e migration) e um banco em uso tem linhas onde ela esta preenchida: quem PROGRAMOU
  // e quem ENTREGOU sao pessoas diferentes. Tres decisoes ainda dependem dessa distincao:
  //
  //   1. `candidatoConfirmacao` exclui quem entregou (R-028: nao se confere a propria entrega);
  //   2. a quebra por falta nasce contra quem entregou, nao contra quem programou;
  //   3. a notificacao de divergencia vai para quem entregou.
  //
  // Sao tres DECISOES em DUAS expressoes: `executadoPor ?? criadoPor` (`transferencias.service.ts`,
  // no dono da quebra e no destinatario da notificacao) e `permitida.executadoPor === usuarioId`
  // (`transferencias.repository.ts`, na elegibilidade). Sem este caso as tres viram codigo sem rede:
  // apagar qualquer uma deixa a suite inteira verde e, em producao, a falta de dinheiro passa a ser
  // cobrada da pessoa errada. A linha e montada em SQL porque nenhuma API a produz mais — e este e
  // exatamente o estado que o banco real tem.
  it("na linha legada, quem ENTREGOU nao confere, responde pela quebra e e notificado", async () => {
    const gerenteId = await usuarioPorEmail(usuariosTeste.gerente.email);
    const adminId = await usuarioPorEmail(usuariosTeste.admin.email);
    const { caixaId, movimentoId } = await entregaPendente("legado-executor", "2026-07-11T08:00", 90, "REC-LEG-1");

    // Vira uma entrega do fluxo antigo: o admin PROGRAMOU (`criado_por`, ja gravado) e o gerente
    // EXECUTOU. Satisfaz `transferencias_solicitacao_cofre_check` — marcador + caixa + tipo
    // sangria/retorno + status `pendente` com executor preenchido.
    await executarSql(
      `update transferencias
          set solicitacao_cofre_em = now(), executado_por = $2, executado_em = now()
        where id = $1`,
      [movimentoId, gerenteId]
    );
    const legada = await consultarUm<{ criado_por: string; executado_por: string }>(
      "select criado_por, executado_por from transferencias where id = $1",
      [movimentoId]
    );
    expect(legada?.criado_por).toBe(adminId);
    expect(legada?.executado_por).toBe(gerenteId);

    // (1) O gerente TEM `transferencias_conferir` e TEM vinculo com o cofre — e mesmo assim e
    // recusado, porque foi ele quem entregou. 400 de dominio, nao 403 de guard: se viesse 403 a
    // requisicao teria morrido antes da regra e o caso nao provaria nada.
    const proprioExecutor = await post(
      `/api/transferencias/${movimentoId}/recusar-conferencia`,
      { contaDestinoId: idsTeste.contaCofre, motivo: "conferindo o proprio envio", valorRecebido: 70 },
      cookieGerente
    );
    assertProblem(proprioExecutor, 400);
    // A MENSAGEM tambem e fixada, como nos casos vizinhos: hoje este e o unico 400 alcancavel nesta
    // chamada, mas mover qualquer validacao de dominio para antes da elegibilidade deixaria o caso
    // verde pelo motivo errado — provando uma recusa que nao e a da R-028.
    expect(proprioExecutor.body).toMatch(/operador de uma conta destino/iu);
    expect(await recusas(movimentoId)).toHaveLength(0);

    // (2) e (3) Quem nao entregou encerra: a Tesouraria conta R$ 70 dos R$ 90 declarados.
    const encerramento = await post(
      `/api/transferencias/${movimentoId}/recusar-conferencia`,
      { contaDestinoId: idsTeste.contaCofre, motivo: "faltou no malote", valorRecebido: 70, encerrar: true },
      cookieTesouraria
    );
    expect(encerramento.statusCode, encerramento.body).toBe(200);

    // A quebra e do GERENTE (quem entregou), nunca do admin (quem programou).
    const quebras = await consultarTodos<{ usuario_id: string; valor: string }>(
      "select usuario_id, valor from quebras_caixa where transferencia_id = $1",
      [movimentoId]
    );
    expect(quebras).toEqual([{ usuario_id: gerenteId, valor: "-20.00" }]);
    expect(quebras.map((q) => q.usuario_id)).not.toContain(adminId);
    // A quebra pertence ao fechamento a que a ENTREGA pertence.
    const vinculo = await consultarUm<{ fechamento_caixa_id: string }>(
      "select fechamento_caixa_id from quebras_caixa where transferencia_id = $1",
      [movimentoId]
    );
    expect(vinculo?.fechamento_caixa_id).toBe(caixaId);

    // E a divergencia chega a quem entregou. Se o servico usasse so `criado_por`, o gerente — que
    // pos o dinheiro no envelope e vai responder pela falta — nao seria avisado.
    const avisados = await consultarTodos<{ destinatario_usuario_id: string }>(
      "select destinatario_usuario_id from notificacoes where referencia_id = $1 and tipo = 'transferencia_divergencia'",
      [movimentoId]
    );
    expect(avisados.map((linha) => linha.destinatario_usuario_id)).toContain(gerenteId);
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
