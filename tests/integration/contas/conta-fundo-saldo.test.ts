// PROJECT_BRAIN/17 D8 (S4): conta com FUNDO + quem opera.
//
// O fundo (contas.saldo_inicial) e o ponto de partida declarado no cadastro; o saldo ATUAL e
// DERIVADO dos movimentos e nunca vira coluna. As convencoes de quais movimentos contam sao as
// mesmas do saldo do caixa (ADR-001): computar = true e status <> 'cancelado'.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

type ContaComSaldo = {
  id: string;
  nome: string;
  saldoInicial: number;
  saldoAtual: number;
  saldoPendente: number;
  usuariosIds: string[];
};

async function usuarioIdPorEmail(email: string): Promise<string> {
  const linha = await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where email = $1", [
    email
  ]);
  if (!linha) throw new Error(`Usuario de teste nao encontrado: ${email}`);
  return linha.usuario_id;
}

describe("conta com fundo e saldo derivado (D8) integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieTesouraria: string;
  let cookieGerente: string;
  let usuarioCaixaId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieTesouraria = await cookieSessao(contexto.app, "tesouraria");
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    usuarioCaixaId = await usuarioIdPorEmail(usuariosTeste.caixa.email);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function saldos(): Promise<ContaComSaldo[]> {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/contas/saldos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    return json<{ data: ContaComSaldo[] }>(resposta).data;
  }

  async function criarConta(payload: Record<string, unknown>): Promise<string> {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, ...payload }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  it("grava o fundo no cadastro e o saldo comeca igual a ele", async () => {
    const contaId = await criarConta({ nome: "Cofre D8", saldoInicial: 10_000 });

    const gravado = await consultarUm<{ saldo_inicial: string }>("select saldo_inicial from contas where id = $1", [
      contaId
    ]);
    expect(Number(gravado?.saldo_inicial)).toBe(10_000);

    const conta = (await saldos()).find((linha) => linha.id === contaId);
    expect(conta).toMatchObject({ saldoInicial: 10_000, saldoAtual: 10_000 });
  });

  // O exemplo que o Jose escreveu na spec, ponta a ponta pela API.
  //
  // O destino e a conta do PDV do caixa aberto (contaCaixa) e nao uma conta nova: a regra de
  // transferencia exige que o movimento envolva a conta do PDV aberto. O saldo dela e comparado por
  // DELTA porque o seed e os outros testes ja lancaram coisas nela — o cofre, esse sim, nasce aqui
  // e pode ser conferido no valor exato.
  it("exemplo do Jose: cofre 10.000, transferencia de 500 -> cofre 9.500 e destino +500", async () => {
    const cofreId = await criarConta({ nome: "Cofre do exemplo", saldoInicial: 10_000 });
    const destinoId = idsTeste.contaCaixa;
    const destinoAntes = (await saldos()).find((linha) => linha.id === destinoId)?.saldoAtual ?? 0;

    const transferencia = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-30",
        descricao: "Suprimento do cofre para o caixa 1",
        valorOriginal: 500,
        contaOrigemId: cofreId,
        contaDestinoId: destinoId,
        nLacreDoc: `D8-${Date.now()}`
      }
    });
    expect(transferencia.statusCode, transferencia.body).toBe(201);

    const lista = await saldos();
    expect(lista.find((linha) => linha.id === cofreId)?.saldoAtual).toBe(9_500);
    expect((lista.find((linha) => linha.id === destinoId)?.saldoAtual ?? 0) - destinoAntes).toBe(0);
    expect(lista.find((linha) => linha.id === cofreId)?.saldoPendente).toBe(500);

    // A coluna do fundo NAO foi tocada: ela e ponto de partida, nao saldo.
    const cofre = await consultarUm<{ saldo_inicial: string }>("select saldo_inicial from contas where id = $1", [
      cofreId
    ]);
    expect(Number(cofre?.saldo_inicial)).toBe(10_000);
  });

  it("despesa paga pela conta desconta do saldo; cancelada nao (ADR-001)", async () => {
    const contaId = await criarConta({ nome: "Conta que paga despesa", saldoInicial: 1_000 });

    const criarDespesa = async (valorOriginal: number) => {
      const resposta = await contexto.app.inject({
        method: "POST",
        url: "/api/despesas",
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: "2026-07-30",
          dataVencimento: "2026-07-30",
          descricao: "Despesa do saldo",
          valorOriginal,
          contaOrigemId: contaId,
          grupoDespesaId: idsTeste.grupoDespesaOperacional
        }
      });
      expect(resposta.statusCode, resposta.body).toBe(201);
      return json<{ data: { id: string } }>(resposta).data.id;
    };

    await criarDespesa(300);
    expect((await saldos()).find((linha) => linha.id === contaId)?.saldoAtual).toBe(700);

    // A segunda despesa e CANCELADA: sai da conta do saldo, exatamente como no saldo do caixa.
    const cancelada = await criarDespesa(200);
    expect((await saldos()).find((linha) => linha.id === contaId)?.saldoAtual).toBe(500);
    await executarSql("update despesas set status = 'cancelado' where id = $1", [cancelada]);
    expect((await saldos()).find((linha) => linha.id === contaId)?.saldoAtual).toBe(700);

    // computar = false tambem tira do saldo (mesma regra do caixa).
    await executarSql("update despesas set computar = false where conta_origem_id = $1", [contaId]);
    expect((await saldos()).find((linha) => linha.id === contaId)?.saldoAtual).toBe(1_000);
  });

  it("salva os usuarios que operam a conta no MESMO salvar do cadastro", async () => {
    const contaId = await criarConta({ nome: "Conta com operadores", saldoInicial: 0, usuariosIds: [usuarioCaixaId] });

    const vinculos = await consultarTodos<{ usuario_id: string; empresa_id: string }>(
      "select usuario_id, empresa_id from contas_usuarios where conta_id = $1",
      [contaId]
    );
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0]).toMatchObject({ usuario_id: usuarioCaixaId, empresa_id: idsTeste.empresaA });
    expect((await saldos()).find((linha) => linha.id === contaId)?.usuariosIds).toEqual([usuarioCaixaId]);

    // Lista vazia = escolha explicita de remover todos (nao e "nao mexer").
    const limpar = await contexto.app.inject({
      method: "PUT",
      url: `/api/contas/${contaId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta com operadores", saldoInicial: 0, usuariosIds: [] }
    });
    expect(limpar.statusCode).toBe(204);
    expect(await consultarTodos("select id from contas_usuarios where conta_id = $1", [contaId])).toHaveLength(0);
  });

  it("edita fundo e usuarios pelo PUT e persiste ambos no banco", async () => {
    const contaId = await criarConta({ nome: "Conta antes da edicao", saldoInicial: 100, usuariosIds: [] });

    const editar = await contexto.app.inject({
      method: "PUT",
      url: `/api/contas/${contaId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "Conta editada",
        saldoInicial: 4321.09,
        usuariosIds: [usuarioCaixaId]
      }
    });
    expect(editar.statusCode, editar.body).toBe(204);

    const conta = await consultarUm<{ nome: string; saldo_inicial: string }>(
      "select nome, saldo_inicial from contas where id = $1",
      [contaId]
    );
    const vinculos = await consultarTodos<{ usuario_id: string; empresa_id: string }>(
      "select usuario_id, empresa_id from contas_usuarios where conta_id = $1",
      [contaId]
    );
    expect(conta).toMatchObject({ nome: "Conta editada", saldo_inicial: "4321.09" });
    expect(vinculos).toEqual([{ usuario_id: usuarioCaixaId, empresa_id: idsTeste.empresaA }]);
  });

  it("editar sem mandar o fundo NAO zera o fundo ja gravado", async () => {
    const contaId = await criarConta({ nome: "Cofre a renomear", saldoInicial: 10_000 });

    const renomear = await contexto.app.inject({
      method: "PUT",
      url: `/api/contas/${contaId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Cofre renomeado" }
    });
    expect(renomear.statusCode).toBe(204);

    const conta = await consultarUm<{ nome: string; saldo_inicial: string }>(
      "select nome, saldo_inicial from contas where id = $1",
      [contaId]
    );
    expect(conta?.nome).toBe("Cofre renomeado");
    expect(Number(conta?.saldo_inicial)).toBe(10_000);
  });

  it("fundo negativo e recusado (CHECK >= 0)", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta com fundo negativo", saldoInicial: -1 }
    });
    expect(resposta.statusCode).toBe(400);
  });

  it("ajuste auditado leva o saldo atual ao alvo sem reescrever o fundo", async () => {
    const contaId = await criarConta({ nome: "Conta para ajuste", saldoInicial: 100 });
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/contas/${contaId}/ajustes`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, saldoDesejado: 0, motivo: "Zeragem inicial de teste" }
    });
    assertOk(resposta);
    expect((await saldos()).find((linha) => linha.id === contaId)).toMatchObject({ saldoInicial: 100, saldoAtual: 0 });
    const ajuste = await consultarUm<{
      valor: string;
      saldo_anterior: string;
      saldo_posterior: string;
      motivo: string;
    }>("select valor, saldo_anterior, saldo_posterior, motivo from ajustes_contas where conta_id = $1", [contaId]);
    expect(ajuste).toMatchObject({ valor: "-100.00", saldo_anterior: "100.00", saldo_posterior: "0.00" });
    expect(ajuste?.motivo).toBe("Zeragem inicial de teste");
  });

  it("somente Tesouraria e Administrador total podem ajustar saldo", async () => {
    const contaId = await criarConta({ nome: "Conta de escopo do ajuste", saldoInicial: 50 });
    const tesouraria = await contexto.app.inject({
      method: "POST",
      url: `/api/contas/${contaId}/ajustes`,
      headers: { cookie: cookieTesouraria },
      payload: { empresaId: idsTeste.empresaA, saldoDesejado: 25, motivo: "Ajuste autorizado da tesouraria" }
    });
    assertOk(tesouraria);

    const gerente = await contexto.app.inject({
      method: "POST",
      url: `/api/contas/${contaId}/ajustes`,
      headers: { cookie: cookieGerente },
      payload: { empresaId: idsTeste.empresaA, saldoDesejado: 0, motivo: "Tentativa sem autoridade" }
    });
    expect(gerente.statusCode).toBe(403);
    expect((await saldos()).find((linha) => linha.id === contaId)?.saldoAtual).toBe(25);
  });

  it("contas existentes seguem com fundo 0 (migration aditiva, sem backfill)", async () => {
    // `contaEntradas`, e nao mais `contaCaixa`: a prova aqui e que conta nascida SEM fundo declarado
    // continua em 0 (a migration nao fez backfill), e `contaEntradas` e exatamente essa conta — so
    // recebe entradas, nunca paga, entao nao precisa de fundo (R-165). `contaCaixa` deixou de servir
    // porque agora nasce com fundo, por PAGAR saidas em varios arquivos.
    const conta = (await saldos()).find((linha) => linha.id === idsTeste.contaEntradas);
    expect(conta?.saldoInicial).toBe(0);
  });
});
