import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// P1 da #101 — a TERCEIRA porta para o mesmo par de contas, achada pela revisao de seguranca
// depois que as duas primeiras fecharam.
//
// `conta_destino_id` tem TRES escritores, e nao dois. Alem do INSERT da criacao e do UPDATE do PUT,
// `confirmarTransferenciaRepository` tambem reescreve o destino — ele grava a conta VENCEDORA entre
// as candidatas de `transferencias_destinos_candidatos`, que a criacao aceita sem olhar nada alem
// de "pertence a empresa". O caminho era:
//
//   1. o operador cria uma transferencia comum do PDV para uma conta qualquer, listando o COFRE
//      entre as `contasDestinoIds`. A guarda da criacao olhava so a ancora, entao passava;
//   2. o caixa fecha — a linha e `suprimento` com destino comum, invisivel para a R-171;
//   3. depois, quem opera o cofre confirma escolhendo a conta cofre, e o UPDATE reescreve o
//      destino. O estado final e o mesmo malote Caixa -> Cofre, sem confirmador exigido na
//      criacao, sem ordem, sem idempotencia e sem recusa auditavel — `/recusar-conferencia`
//      responde 404 porque `tipo` continua `suprimento`.
//
// Duas travas fecham a porta, e as duas sao necessarias: a da criacao impede que a linha nasca com
// o cofre entre as candidatas; a da conferencia e a autoridade final, e alcanca tambem as linhas
// que ja existem no banco de producao com essa forma. Sem a segunda, o legado continuaria passando.
describe("caixa - conferencia nao vira atalho para o cofre (P1/D9/R-179)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieCaixa = "";
  let cookieGerente = "";
  let sequencia = 0;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa, cookieGerente] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa"),
      cookieSessao(contexto.app, "gerente")
    ]);
  }, 180_000);

  afterAll(async () => contexto.fechar());

  const empresaId = idsTeste.empresaA;
  // Posterior a abertura padrao da fixture (2026-07-31T08:00).
  const DIA = "2026-08-01";

  function inject(method: "GET" | "POST" | "PUT", url: string, cookie: string, payload?: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  async function novoCaixa(nome: string) {
    sequencia += 1;
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: `${nome} ${sequencia}`
    });
  }

  async function venda(valor: number) {
    const resposta = await inject("POST", "/api/vendas", cookieCaixa, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Venda do turno",
      valorOriginal: valor
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
  }

  async function contaNova(nome: string) {
    sequencia += 1;
    const resposta = await inject("POST", "/api/contas", cookieAdmin, { empresaId, nome: `${nome} ${sequencia}` });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  function criarComum(contaOrigemId: string, contaDestinoId: string, contasDestinoIds: string[] = [], valor = 50) {
    sequencia += 1;
    return inject("POST", "/api/transferencias", cookieCaixa, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Transferencia comum do turno",
      valorOriginal: valor,
      contaOrigemId,
      contaDestinoId,
      contasDestinoIds,
      nLacreDoc: `P1-CAND-${sequencia}`,
      tempoConfirmacao: "1dia"
    });
  }

  function linhaDaTransferencia(transferenciaId: string) {
    return consultarUm<{ conta_destino_id: string; status: string; tipo: string }>(
      "select conta_destino_id, status, tipo from transferencias where id = $1",
      [transferenciaId]
    );
  }

  // ------------------------------------------------------------------------------------------
  // RED-1 · a porta de entrada: o cofre nao entra na lista de candidatos de uma transferencia que
  // sai da conta do PDV. A ancora ja era barrada; a lista nao era olhada.
  // ------------------------------------------------------------------------------------------
  it("Deve_RecusarACriacao_Quando_OCofreEntraComoDestinoCandidato", async () => {
    const fx = await novoCaixa("P1 candidato");
    await venda(500);
    const comum = await contaNova("Conta ancora");

    const resposta = await criarComum(fx.contaId, comum, [idsTeste.contaCofre], 200);

    assertProblem(resposta, 400);
    expect(resposta.body).toMatch(/cofre/iu);
    expect(
      await consultarUm<{ total: string }>("select count(*)::text as total from transferencias where caixa_id = $1", [
        fx.caixaId
      ])
    ).toMatchObject({ total: "0" });
  });

  // ------------------------------------------------------------------------------------------
  // RED-2 · a autoridade final. A linha ja existe no banco com o cofre entre as candidatas — e o
  // estado que a porta de cima passa a impedir, mas que producao ja pode ter. So o SQL direto
  // consegue monta-lo agora, e e por isso que ele esta aqui: sem este caso, a trava da conferencia
  // nao teria nenhum teste e o legado continuaria com atalho.
  // ------------------------------------------------------------------------------------------
  it("Deve_RecusarAConferencia_Quando_ElaApontaODestinoDoCaixaParaOCofre", async () => {
    const fx = await novoCaixa("P1 conferencia atalho");
    await venda(500);
    const comum = await contaNova("Conta ancora legado");

    const criada = await criarComum(fx.contaId, comum, [], 200);
    expect(criada.statusCode, criada.body).toBe(201);
    const transferenciaId = json<{ data: { id: string } }>(criada).data.id;

    // O estado legado: o cofre como candidato, exatamente o que a criacao gravava antes.
    await executarSql(
      "insert into transferencias_destinos_candidatos (empresa_id, transferencia_id, conta_id) values ($1, $2, $3)",
      [empresaId, transferenciaId, idsTeste.contaCofre]
    );

    // O gerente opera o cofre no seed e nao criou o movimento (R-028), entao ele e candidato
    // elegivel: a recusa que vier NAO pode ser de elegibilidade.
    const conferencia = await inject("POST", `/api/transferencias/${transferenciaId}/confirmar`, cookieGerente, {
      contaDestinoId: idsTeste.contaCofre,
      valorRecebido: 200,
      nLacreDoc: (
        await consultarUm<{ n_lacre_doc: string }>("select n_lacre_doc from transferencias where id = $1", [
          transferenciaId
        ])
      )?.n_lacre_doc
    });

    assertProblem(conferencia, 400);
    expect(conferencia.body).toMatch(/cofre/iu);
    // O destino NAO pode ter sido reescrito, e a linha continua pendente.
    expect(await linhaDaTransferencia(transferenciaId)).toMatchObject({
      conta_destino_id: comum,
      status: "pendente",
      tipo: "suprimento"
    });
  });

  // ------------------------------------------------------------------------------------------
  // RED-3 · o limite: a conferencia CANONICA da entrega ao cofre continua funcionando. Sem este
  // caso, uma trava larga demais na conferencia mataria o unico caminho que deveria existir.
  // ------------------------------------------------------------------------------------------
  it("Deve_PermitirAConferencia_Quando_ElaEhDaEntregaCanonicaAoCofre", async () => {
    const fx = await novoCaixa("P1 conferencia canonica");
    await venda(500);
    const lacre = `P1-CANON-CONF-${sequencia}`;

    const entrega = await inject("POST", `/api/caixa/${fx.caixaId}/transferencia-cofre`, cookieCaixa, {
      tipo: "sangria",
      valor: 200,
      lacre,
      idempotenciaChave: randomUUID()
    });
    expect(entrega.statusCode, entrega.body).toBe(200);
    const movimento = await consultarUm<{ id: string }>(
      "select id from transferencias where caixa_id = $1 and tipo = 'sangria' order by criado_em desc limit 1",
      [fx.caixaId]
    );

    const conferencia = await inject("POST", `/api/transferencias/${movimento!.id}/confirmar`, cookieGerente, {
      contaDestinoId: idsTeste.contaCofre,
      valorRecebido: 200,
      nLacreDoc: lacre
    });

    expect(conferencia.statusCode, conferencia.body).toBe(200);
    expect(await linhaDaTransferencia(movimento!.id)).toMatchObject({ status: "recebido", tipo: "sangria" });
  });
});
