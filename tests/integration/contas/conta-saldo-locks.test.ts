// R-165 · A ORDEM E A FORÇA dos locks da porta de saldo.
//
// A R-165 entrou com `FOR UPDATE` na conta de origem e a nota de desenho afirmava que a ausência de
// ciclo era "trivial, porque é uma conta por transação". **A premissa era falsa.** A transferência
// referencia DUAS contas, e o INSERT tira `FOR KEY SHARE` na linha do DESTINO por causa das FKs
// `transferencias_conta_origem_id_contas_id_fk` / `..._conta_destino_id_...` (baseline 928-929).
// `FOR KEY SHARE` CONFLITA com `FOR UPDATE` — então duas transferências em sentidos opostos
// fechavam um ciclo ABBA e o Postgres matava uma com 40P01.
//
// Matriz de conflito medida no proprio Postgres (não copiada de documentação):
//
//   segurado \ pedido   key share   share      no key update   update
//   key share           convive     convive    convive         CONFLITA
//   share               convive     convive    CONFLITA        CONFLITA
//   no key update       convive     CONFLITA   CONFLITA        CONFLITA
//   update              CONFLITA    CONFLITA   CONFLITA        CONFLITA
//
// É por isso que a força certa é `FOR NO KEY UPDATE`, e não `FOR UPDATE` nem `FOR SHARE`:
//   * convive com o `KEY SHARE` das FKs  -> o ciclo da transferência deixa de existir;
//   * CONFLITA consigo mesmo             -> duas saídas da mesma origem continuam serializando,
//                                           que é justamente o que a mutação de `for share` derrubou.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, json } from "../../setup/integracao.js";

const DATA = "2026-08-12";

describe("R-165 - ordem e forca dos locks da porta de saldo (integration)", () => {
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
      payload: { empresaId: idsTeste.empresaA, nome: `${nome} ${Date.now()}-${Math.trunc(saldoInicial)}`, saldoInicial }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  function transferir(origem: string, destino: string, marcador: string, valor = 10) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: DATA,
        observacao: marcador,
        valorOriginal: valor,
        contaOrigemId: origem,
        contaDestinoId: destino,
        nLacreDoc: marcador,
        tempoConfirmacao: "1dia",
        computar: true
      }
    });
  }

  function despesa(origem: string, marcador: string, valor: number) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: DATA,
        dataVencimento: DATA,
        observacao: marcador,
        valorOriginal: valor,
        contaOrigemId: origem,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        computar: true
      }
    });
  }

  // --- 1. O ciclo ABBA da transferência ---------------------------------------------------------
  // As duas cabem folgadamente no saldo: qualquer 5xx aqui é contenção, nunca regra de negócio.
  it("A->B e B->A ao mesmo tempo: as duas passam, sem deadlock", async () => {
    const falhas: string[] = [];

    for (let rodada = 1; rodada <= 8; rodada += 1) {
      const contaA = await criarConta(`LOCK-A${rodada}`, 100_000);
      const contaB = await criarConta(`LOCK-B${rodada}`, 100_000);

      const [ida, volta] = await Promise.all([
        transferir(contaA, contaB, `LOCK-IDA-${rodada}-${Date.now()}`),
        transferir(contaB, contaA, `LOCK-VOLTA-${rodada}-${Date.now()}`)
      ]);

      if (ida.statusCode !== 201) falhas.push(`rodada ${rodada} IDA: ${ida.statusCode} ${ida.body}`);
      if (volta.statusCode !== 201) falhas.push(`rodada ${rodada} VOLTA: ${volta.statusCode} ${volta.body}`);
    }

    expect(falhas, `falhas:\n${falhas.join("\n")}`).toEqual([]);
  }, 180_000);

  // A ordem inversa de disparo não pode mudar o resultado — se mudasse, a ausência de ciclo
  // dependeria de quem chega primeiro, que é exatamente o que um lock canônico elimina.
  it("a ordem de disparo nao muda nada: VOLTA primeiro tambem passa", async () => {
    const falhas: string[] = [];

    for (let rodada = 1; rodada <= 6; rodada += 1) {
      const contaA = await criarConta(`LOCKINV-A${rodada}`, 100_000);
      const contaB = await criarConta(`LOCKINV-B${rodada}`, 100_000);

      const [volta, ida] = await Promise.all([
        transferir(contaB, contaA, `LOCKINV-VOLTA-${rodada}-${Date.now()}`),
        transferir(contaA, contaB, `LOCKINV-IDA-${rodada}-${Date.now()}`)
      ]);

      if (ida.statusCode !== 201) falhas.push(`rodada ${rodada} IDA: ${ida.statusCode} ${ida.body}`);
      if (volta.statusCode !== 201) falhas.push(`rodada ${rodada} VOLTA: ${volta.statusCode} ${volta.body}`);
    }

    expect(falhas, `falhas:\n${falhas.join("\n")}`).toEqual([]);
  }, 180_000);

  // --- 2. A serialização que NÃO pode ser perdida junto -----------------------------------------
  // Baixar a força do lock só vale se duas saídas da MESMA origem continuarem serializando. Este é
  // o caso que a mutação `for share` derrubava, e ele tem de continuar derrubando.
  it("duas saidas concorrentes da MESMA origem: exatamente uma consome o saldo", async () => {
    for (let rodada = 1; rodada <= 4; rodada += 1) {
      const origem = await criarConta(`LOCK-SERIAL${rodada}`, 10);

      const [a, b] = await Promise.all([
        despesa(origem, `LOCK-SERIAL-A-${rodada}-${Date.now()}`, 8),
        despesa(origem, `LOCK-SERIAL-B-${rodada}-${Date.now()}`, 8)
      ]);

      const aceitas = [a, b].filter((r) => r.statusCode === 201);
      const recusadas = [a, b].filter((r) => r.statusCode === 409);
      expect(aceitas.length, `rodada ${rodada}: A=${a.statusCode} ${a.body} B=${b.statusCode} ${b.body}`).toBe(1);
      expect(recusadas.length).toBe(1);

      const gravadas = await consultarTodos<{ id: string }>("select id from despesas where conta_origem_id = $1", [
        origem
      ]);
      expect(gravadas).toHaveLength(1);
    }
  }, 180_000);

  // --- 3. Zero escrita parcial quando a porta recusa --------------------------------------------
  it("a recusa por saldo nao deixa transferencia nem lacre gravado", async () => {
    const origem = await criarConta("LOCK-PARCIAL-O", 5);
    const destino = await criarConta("LOCK-PARCIAL-D", 0);
    const marcador = `LOCK-PARCIAL-${Date.now()}`;

    const resposta = await transferir(origem, destino, marcador, 500);

    expect(resposta.statusCode, resposta.body).toBe(409);
    expect(json<{ code?: string }>(resposta).code).toBe("SALDO_INSUFICIENTE");

    const linhas = await consultarTodos<{ id: string }>("select id from transferencias where n_lacre_doc = $1", [
      marcador
    ]);
    expect(linhas).toHaveLength(0);
  }, 60_000);
});
