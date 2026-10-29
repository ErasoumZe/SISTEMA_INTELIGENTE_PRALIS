import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// R-231 (Marco, 29/10): transferencia sem lacre — suprimento no meio do turno, sem malote. Permissao propria; destino
// PDV exige caixa aberto; o dinheiro so vira entrada do caixa quando o operador confirma; "Nao recebi" cancela e
// avisa; o caixa nao inicia o fechamento com recebimento pendente; a conferencia comum nao resolve este dinheiro.
describe("transferencias - sem lacre (R-231)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let caixa: { caixaId: string; contaId: string };

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
    caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Sem lacre",
      registrarLimpeza: false
    });
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  function enviar(cookie: string, contaDestinoId: string, especie: number, moedas: number) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/transferencias/sem-lacre",
      headers: { cookie },
      payload: {
        empresaId: idsTeste.empresaA,
        contaOrigemId: idsTeste.contaCofre,
        contaDestinoId,
        valorEspecieDeclarado: especie,
        valorMoedasDeclarado: moedas
      }
    });
  }

  async function status() {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieCaixa }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    return json<{ data: { recebimentosSemLacre: Array<{ id: string; valor: number; valorEspecie: number }> } }>(
      resposta
    ).data;
  }

  function resolver(transferenciaId: string, acao: "confirmar" | "nao-recebi") {
    return contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/recebimentos-sem-lacre/${transferenciaId}/${acao}`,
      headers: { cookie: cookieCaixa },
      payload: {}
    });
  }

  async function statusDaTransferencia(id: string) {
    return (await consultarUm<{ status: string; nLacreDoc: string | null; caixaId: string | null; observacao: string }>(
      `select status, n_lacre_doc as "nLacreDoc", caixa_id as "caixaId", observacao from transferencias where id = $1`,
      [id]
    ))!;
  }

  it("quem nao tem a permissao propria nao manda dinheiro sem lacre", async () => {
    const resposta = await enviar(cookieCaixa, caixa.contaId, 10, 0);
    expect(resposta.statusCode, resposta.body).toBe(403);
  });

  it("qualquer conta de destino; dinheiro com no maximo duas casas decimais", async () => {
    // Destino que nao e PDV: sem caixa, pendente, confirmado na conferencia comum por quem opera a conta.
    const banco = await enviar(cookieAdmin, idsTeste.contaBanco, 10, 0);
    expect(banco.statusCode, banco.body).toBe(201);
    const gravada = await statusDaTransferencia(json<{ data: { id: string } }>(banco).data.id);
    expect(gravada).toMatchObject({ status: "pendente", nLacreDoc: null, caixaId: null });
    expect((await enviar(cookieAdmin, caixa.contaId, 10.999, 0)).statusCode).toBe(400);
    expect((await enviar(cookieAdmin, caixa.contaId, 0.0000001, 0)).statusCode).toBe(400);
  });

  it("quem enviou nao confirma o proprio envio (R-028)", async () => {
    const resposta = await enviar(cookieAdmin, caixa.contaId, 4, 0);
    const id = json<{ data: { id: string } }>(resposta).data.id;
    const proprio = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/recebimentos-sem-lacre/${id}/confirmar`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });
    expect(proprio.statusCode, proprio.body).toBe(409);
    expect((await statusDaTransferencia(id)).status).toBe("pendente");
    expect((await resolver(id, "confirmar")).statusCode).toBe(200);
  });

  it("sem caixa aberto no PDV de destino, recusa e manda usar o malote", async () => {
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta PDV sem caixa (sem lacre)" }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV sem caixa (sem lacre)", contaId, ativo: true }
    });
    expect(pdv.statusCode, pdv.body).toBe(201);

    const resposta = await enviar(cookieAdmin, contaId, 10, 0);
    expect(resposta.statusCode, resposta.body).toBe(409);
    expect(resposta.body).toMatch(/malote/);
  });

  it("entra pendente no caixa, trava o fechamento e vira entrada so quando o operador confirma", async () => {
    const resposta = await enviar(cookieAdmin, caixa.contaId, 25, 5);
    expect(resposta.statusCode, resposta.body).toBe(201);
    const id = json<{ data: { id: string } }>(resposta).data.id;

    const gravada = await statusDaTransferencia(id);
    expect(gravada).toMatchObject({ status: "pendente", nLacreDoc: null, caixaId: caixa.caixaId });
    expect(gravada.observacao).toMatch(/^Transferência /);
    expect((await status()).recebimentosSemLacre).toEqual([
      expect.objectContaining({ id, valor: 30, valorEspecie: 25 })
    ]);

    // A conferencia comum nao resolve este dinheiro: quem confirma e o operador, no Caixa.
    const conferencia = await contexto.app.inject({
      method: "POST",
      url: `/api/transferencias/${id}/confirmar`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });
    expect(conferencia.statusCode, conferencia.body).toBeGreaterThanOrEqual(400);
    expect((await statusDaTransferencia(id)).status).toBe("pendente");

    const fechamento = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/iniciar-fechamento`,
      headers: { cookie: cookieCaixa },
      payload: {}
    });
    expect(fechamento.statusCode, fechamento.body).toBe(409);
    expect(fechamento.body).toMatch(/sem lacre/);

    const confirmar = await resolver(id, "confirmar");
    expect(confirmar.statusCode, confirmar.body).toBe(200);
    expect((await statusDaTransferencia(id)).status).toBe("recebido");
    expect((await status()).recebimentosSemLacre).toEqual([]);

    // Segundo clique (ou "Nao recebi" depois de confirmar): ja resolvido.
    expect((await resolver(id, "nao-recebi")).statusCode).toBe(409);
  });

  it("Nao recebi cancela a transferencia e avisa a Tesouraria", async () => {
    const resposta = await enviar(cookieAdmin, caixa.contaId, 0, 7);
    expect(resposta.statusCode, resposta.body).toBe(201);
    const id = json<{ data: { id: string } }>(resposta).data.id;

    const naoRecebi = await resolver(id, "nao-recebi");
    expect(naoRecebi.statusCode, naoRecebi.body).toBe(200);
    expect((await statusDaTransferencia(id)).status).toBe("cancelada");
    const aviso = await consultarUm<{ total: number }>(
      "select count(*)::int as total from notificacoes where referencia_id = $1 and tipo = 'transferencia_divergencia'",
      [id]
    );
    expect(aviso?.total).toBeGreaterThan(0);
  });

  it("transferencia sem lacre pendente nao e editada", async () => {
    const resposta = await enviar(cookieAdmin, caixa.contaId, 3, 0);
    const id = json<{ data: { id: string } }>(resposta).data.id;
    const edicao = await contexto.app.inject({
      method: "PUT",
      url: `/api/transferencias/${id}`,
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-10",
        valorOriginal: 3,
        contaOrigemId: idsTeste.contaCofre,
        contaDestinoId: caixa.contaId,
        nLacreDoc: "EDITA-SEM-LACRE"
      }
    });
    expect(edicao.statusCode, edicao.body).toBeGreaterThanOrEqual(400);
    expect((await statusDaTransferencia(id)).nLacreDoc).toBeNull();
    await resolver(id, "confirmar");
  });
});
