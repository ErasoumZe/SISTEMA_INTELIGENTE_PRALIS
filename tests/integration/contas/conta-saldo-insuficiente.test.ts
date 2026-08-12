// R-143 (Jose p.34-35): "nao existe transferencia sem fundo na conta de origem" — a regra estrutural
// que o proprio registro marcava como "sem teste que a expresse". Este arquivo e o teste que faltava,
// generalizado para as QUATRO saidas pela decisao registrada em R-165: nenhuma movimentacao pode
// comprometer mais dinheiro do que existe na conta de origem.
//
// O defeito medido (RELATORIO-CT00-CT16-2026-08-12, secao 4): conta com R$ 10,00 aceitou despesa,
// mercadoria, retirada e transferencia de R$ 15,00 cada — as quatro com HTTP 201 — deixando a conta
// em R$ -50,00 com R$ 15,00 ainda pendentes.
//
// A aritmetica NAO muda: `saldoContaCentavos` (shared/src/caixa/regras.ts) continua podendo
// devolver negativo para historico ja gravado. O que nasce aqui e uma PORTA DE ESCRITA, e ela vive
// sob o mesmo protocolo da R-164: lock primeiro, releitura DEPOIS do lock, dentro da transacao que
// grava. Ordem de locks (emenda registrada na R-164, nota "grafo para o futuro P0 de saldo"):
//
//     pdvs -> fechamentos_caixa -> contas (id ASC) -> linha do lancamento -> filhas
//
// Contas de teste proprias, com fundo BAIXO e declarado, para que a prova nao dependa do fundo das
// contas do seed — exatamente como o harness externo do CT faz.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import {
  abrirBloqueador,
  consultarTodos,
  esperarCadeiaDeBloqueio,
  fecharBloqueador,
  json,
  universoDeLancamentos
} from "../../setup/integracao.js";

type ContaComSaldo = { id: string; saldoInicial: number; saldoAtual: number; saldoPendente: number };

const DATA = "2026-08-12";

describe("saldo insuficiente na conta de origem (R-143 / R-165) integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criarConta(nome: string, saldoInicial: number): Promise<string> {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: `${nome} ${Date.now()}`, saldoInicial }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  async function saldoDe(contaId: string): Promise<ContaComSaldo | undefined> {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/contas/saldos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    return json<{ data: ContaComSaldo[] }>(resposta).data.find((linha) => linha.id === contaId);
  }

  // As quatro saidas do relatorio, com o payload minimo que cada rota exige. O destino da
  // transferencia e uma conta propria e SEMPRE diferente da origem (CHECK conta_origem <> destino).
  function payloadDe(rota: string, contaOrigemId: string, valorOriginal: number, destinoId: string) {
    const comum = {
      empresaId: idsTeste.empresaA,
      dataReferencia: DATA,
      dataVencimento: DATA,
      valorOriginal,
      contaOrigemId,
      computar: true
    };
    if (rota === "transferencias") {
      return {
        empresaId: idsTeste.empresaA,
        dataReferencia: DATA,
        observacao: "R-165 saida sem fundo",
        valorOriginal,
        contaOrigemId,
        contaDestinoId: destinoId,
        nLacreDoc: `R165-${rota}-${Date.now()}-${Math.trunc(valorOriginal * 100)}`,
        tempoConfirmacao: "1dia",
        computar: true
      };
    }
    if (rota === "despesas")
      return { ...comum, observacao: "R-165 despesa", grupoDespesaId: idsTeste.grupoDespesaOperacional };
    // Mercadoria e retirada exigem credor tipado (R-046/R-128) — sem ele o 400 de validacao
    // chegaria ANTES da porta de saldo e o teste ficaria verde pelo motivo errado.
    const comCredor = { ...comum, fornecedorId: idsTeste.fornecedor, credorTipo: "fornecedor" as const };
    if (rota === "mercadorias") return { ...comCredor, observacao: "R-165 mercadoria", temNotaFiscal: false };
    return { ...comCredor, observacao: "R-165 retirada" };
  }

  async function postar(rota: string, contaOrigemId: string, valor: number, destinoId: string) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/${rota}`,
      headers: { cookie: cookieAdmin },
      payload: payloadDe(rota, contaOrigemId, valor, destinoId)
    });
  }

  const ROTAS = ["despesas", "mercadorias", "retiradas", "transferencias"] as const;

  // --- RED principal: a prova literal do relatorio -------------------------------------------
  it.each(ROTAS)("conta com R$ 10 recusa %s de R$ 15 com SALDO_INSUFICIENTE e nao grava nada", async (rota) => {
    const origem = await criarConta(`R165 origem ${rota}`, 10);
    const destino = await criarConta(`R165 destino ${rota}`, 0);
    const universoAntes = await universoDeLancamentos();

    const resposta = await postar(rota, origem, 15, destino);

    expect(resposta.statusCode, resposta.body).toBe(409);
    expect(json<{ code?: string }>(resposta).code).toBe("SALDO_INSUFICIENTE");
    // Zero escrita parcial: nem raiz, nem filhas, nem marca-d'agua do universo.
    expect(await universoDeLancamentos()).toEqual(universoAntes);
    expect(await saldoDe(origem)).toMatchObject({ saldoAtual: 10, saldoPendente: 0 });
  });

  it("as quatro saidas juntas nao levam a conta a saldo negativo (cenario integral do relatorio)", async () => {
    const origem = await criarConta("R165 quatro saidas", 10);
    const destino = await criarConta("R165 quatro destino", 0);

    for (const rota of ROTAS) {
      const resposta = await postar(rota, origem, 15, destino);
      expect(resposta.statusCode, `${rota}: ${resposta.body}`).toBe(409);
    }

    const conta = await saldoDe(origem);
    expect(conta?.saldoAtual).toBe(10);
    expect(conta?.saldoAtual).toBeGreaterThanOrEqual(0);
  });

  // --- GREEN: saldo exato, saldo zero, e o que deve continuar passando -------------------------
  it("saldo EXATO passa: conta com R$ 10 aceita despesa de R$ 10 e fica em zero", async () => {
    const origem = await criarConta("R165 exato", 10);
    const destino = await criarConta("R165 exato destino", 0);

    const resposta = await postar("despesas", origem, 10, destino);

    expect(resposta.statusCode, resposta.body).toBe(201);
    expect(await saldoDe(origem)).toMatchObject({ saldoAtual: 0 });
  });

  it("saldo ZERO recusa qualquer valor positivo", async () => {
    const origem = await criarConta("R165 zerada", 0);
    const destino = await criarConta("R165 zerada destino", 0);

    const resposta = await postar("despesas", origem, 0.01, destino);

    expect(resposta.statusCode, resposta.body).toBe(409);
    expect(json<{ code?: string }>(resposta).code).toBe("SALDO_INSUFICIENTE");
  });

  it("a entrada por transferencia CONFIRMADA reabre espaco para gastar", async () => {
    const origem = await criarConta("R165 recebe", 0);
    const financiadora = await criarConta("R165 financia", 50);

    const transferencia = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: payloadDe("transferencias", financiadora, 40, origem)
    });
    expect(transferencia.statusCode, transferencia.body).toBe(201);

    // Pendente ainda NAO credita o destino (R-036): a despesa de 40 continua recusada.
    const antesDeConfirmar = await postar("despesas", origem, 40, financiadora);
    expect(antesDeConfirmar.statusCode, antesDeConfirmar.body).toBe(409);
  });

  // --- Recorrencia: a serie inteira e reservada de uma vez -------------------------------------
  // Um POST de recorrencia cria ate 12 lancamentos da MESMA conta na MESMA transacao. Validar so a
  // 1a ocorrencia deixaria as outras 11 entrarem sem lastro — e o saldo so ficaria negativo depois,
  // com a serie ja gravada. Estes dois casos existem porque a mutacao "cobrar so a 1a ocorrencia"
  // (`ocorrenciasDaSerie = 1` em despesas.service.ts) SOBREVIVEU a suite: nenhum teste a matava.
  it("a recorrencia reserva a SERIE INTEIRA: 3 x R$ 10 nao cabe em R$ 20 e nada e gravado", async () => {
    const origem = await criarConta("R165 serie nao cabe", 20);
    const universoAntes = await universoDeLancamentos();

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        ...payloadDe("despesas", origem, 10, origem),
        recorrencia: { frequencia: "mes", repeticoes: 3 }
      }
    });

    // A 1a ocorrencia sozinha (R$ 10) CABERIA em R$ 20 — o 409 so aparece porque a serie inteira
    // (R$ 30) e cobrada de uma vez. E exatamente esta assercao que mata a mutacao.
    expect(resposta.statusCode, resposta.body).toBe(409);
    expect(json<{ code?: string }>(resposta).code).toBe("SALDO_INSUFICIENTE");
    expect(json<{ details?: { solicitado: number } }>(resposta).details?.solicitado).toBe(30);
    // Nem a serie, nem a 1a ocorrencia, nem a definicao da recorrencia.
    expect(await universoDeLancamentos()).toEqual(universoAntes);
    expect(await saldoDe(origem)).toMatchObject({ saldoAtual: 20 });
  });

  it("a serie que CABE passa inteira e debita as tres ocorrencias", async () => {
    const origem = await criarConta("R165 serie cabe", 30);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        ...payloadDe("despesas", origem, 10, origem),
        recorrencia: { frequencia: "mes", repeticoes: 3 }
      }
    });

    expect(resposta.statusCode, resposta.body).toBe(201);
    expect(json<{ data: { serie: number } }>(resposta).data.serie).toBe(3);
    // As TRES pesam no saldo, e nao so a primeira: 30 - (3 x 10) = 0.
    expect(await saldoDe(origem)).toMatchObject({ saldoAtual: 0 });
  });

  // --- PUT: delta real, reducao legitima e reenvio identico ------------------------------------
  it("PUT respeita o DELTA: aumentar alem do saldo recusa, reduzir passa, reenvio identico passa", async () => {
    const origem = await criarConta("R165 edicao", 100);
    const destino = await criarConta("R165 edicao destino", 0);

    const criada = await postar("despesas", origem, 60, destino);
    expect(criada.statusCode, criada.body).toBe(201);
    const id = json<{ data: { id: string } }>(criada).data.id;
    expect(await saldoDe(origem)).toMatchObject({ saldoAtual: 40 });

    const editar = async (valorOriginal: number) =>
      contexto.app.inject({
        method: "PUT",
        url: `/api/despesas/${id}`,
        headers: { cookie: cookieAdmin },
        payload: { ...payloadDe("despesas", origem, valorOriginal, destino) }
      });

    // Reenvio IDENTICO: delta zero. Nao pode cobrar o valor inteiro de novo.
    const reenvio = await editar(60);
    expect(reenvio.statusCode, `reenvio identico deveria passar: ${reenvio.body}`).toBe(200);
    expect(await saldoDe(origem)).toMatchObject({ saldoAtual: 40 });

    // Reducao legitima nunca pode ser bloqueada.
    const reduzir = await editar(20);
    expect(reduzir.statusCode, `reducao deveria passar: ${reduzir.body}`).toBe(200);
    expect(await saldoDe(origem)).toMatchObject({ saldoAtual: 80 });

    // Aumento dentro do disponivel passa; alem dele, recusa.
    const aumentarOk = await editar(100);
    expect(aumentarOk.statusCode, aumentarOk.body).toBe(200);
    expect(await saldoDe(origem)).toMatchObject({ saldoAtual: 0 });

    const aumentarDemais = await editar(100.01);
    expect(aumentarDemais.statusCode, aumentarDemais.body).toBe(409);
    expect(json<{ code?: string }>(aumentarDemais).code).toBe("SALDO_INSUFICIENTE");
    expect(await saldoDe(origem)).toMatchObject({ saldoAtual: 0 });
  });

  it("trocar a conta de origem devolve a reserva antiga e valida a nova", async () => {
    const antiga = await criarConta("R165 troca antiga", 100);
    const nova = await criarConta("R165 troca nova", 30);
    const destino = await criarConta("R165 troca destino", 0);

    const criada = await postar("despesas", antiga, 50, destino);
    expect(criada.statusCode, criada.body).toBe(201);
    const id = json<{ data: { id: string } }>(criada).data.id;

    // A nova conta so tem 30: mover a despesa de 50 para ela precisa ser recusado...
    const mover = await contexto.app.inject({
      method: "PUT",
      url: `/api/despesas/${id}`,
      headers: { cookie: cookieAdmin },
      payload: payloadDe("despesas", nova, 50, destino)
    });
    expect(mover.statusCode, mover.body).toBe(409);
    // ...e a conta ANTIGA nao pode ter perdido a reserva por causa da tentativa.
    expect(await saldoDe(antiga)).toMatchObject({ saldoAtual: 50 });
    expect(await saldoDe(nova)).toMatchObject({ saldoAtual: 30 });

    // Mover um valor que cabe na nova conta funciona e devolve o dinheiro para a antiga.
    const moverOk = await contexto.app.inject({
      method: "PUT",
      url: `/api/despesas/${id}`,
      headers: { cookie: cookieAdmin },
      payload: payloadDe("despesas", nova, 30, destino)
    });
    expect(moverOk.statusCode, moverOk.body).toBe(200);
    expect(await saldoDe(antiga)).toMatchObject({ saldoAtual: 100 });
    expect(await saldoDe(nova)).toMatchObject({ saldoAtual: 0 });
  });

  // --- CONCORRENCIA: duas saidas nao consomem o mesmo dinheiro ---------------------------------
  //
  // Sem sleep como prova. A conexao bloqueadora dedicada segura a linha de `contas` com o MESMO
  // `for update` que a porta usa; as duas requisicoes reais entram em fila comprovada por
  // `pg_blocking_pids`, e so depois o bloqueador solta. Se a porta nao travar `contas`, as duas
  // passam e o teste morre — que e exatamente o RED desejado.
  it("duas saidas concorrentes de R$ 8 sobre saldo R$ 10: exatamente uma passa", async () => {
    const origem = await criarConta("R165 corrida", 10);
    const destino = await criarConta("R165 corrida destino", 0);

    const bloqueador = await abrirBloqueador();
    let primeira: Promise<unknown>;
    let segunda: Promise<unknown>;
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from contas where id = $1 for update", [origem]);

      primeira = postar("despesas", origem, 8, destino);
      segunda = postar("retiradas", origem, 8, destino);

      // CADEIA, e nao bloqueio direto: com duas sessoes disputando a MESMA linha, a segunda espera
      // o `tuple` lock da primeira e `pg_blocking_pids` devolve a primeira, nunca o bloqueador — a
      // armadilha esta documentada em `tests/setup/integracao.ts`. Condicao, nunca sleep.
      expect(
        await esperarCadeiaDeBloqueio(bloqueador, 2),
        "as duas escritas deveriam estar na fila da linha de contas"
      ).toBe(true);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    type RespostaCorrida = { statusCode: number; body: string };
    // Tupla, nao array: com `noUncheckedIndexedAccess` o indice de array e `T | undefined`.
    const [respostaA, respostaB] = (await Promise.all([primeira!, segunda!])) as [RespostaCorrida, RespostaCorrida];
    const aceitas = [respostaA, respostaB].filter((resposta) => resposta.statusCode === 201);
    const recusadas = [respostaA, respostaB].filter((resposta) => resposta.statusCode === 409);

    expect(aceitas, `A=${respostaA.body} B=${respostaB.body}`).toHaveLength(1);
    expect(recusadas).toHaveLength(1);
    expect(await saldoDe(origem)).toMatchObject({ saldoAtual: 2 });
  });

  // --- ISOLAMENTO ------------------------------------------------------------------------------
  it("a porta nao vaza conta de outra empresa: origem da empresa B e recusada na empresa A", async () => {
    const contaOutraEmpresa = await consultarTodos<{ id: string }>(
      "select id from contas where empresa_id = $1 limit 1",
      [idsTeste.empresaB]
    );
    if (!contaOutraEmpresa.length) return;

    const destino = await criarConta("R165 isolamento destino", 0);
    const resposta = await postar("despesas", contaOutraEmpresa[0]!.id, 1, destino);

    expect([400, 403, 404, 409]).toContain(resposta.statusCode);
    expect(resposta.statusCode).not.toBe(201);
  });
});
