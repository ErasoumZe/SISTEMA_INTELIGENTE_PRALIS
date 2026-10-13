import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, criarRetornoValido, prepararFechamentoValido } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm } from "../../setup/integracao.js";

describe("caixa - fechamento B1 vertical", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieCaixa = "";
  let cookieGerente = "";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa, cookieGerente] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa"),
      cookieSessao(contexto.app, "gerente")
    ]);
  }, 120_000);

  afterAll(async () => contexto.fechar());

  it("fecha somente depois de conferir o malote, os relatórios e o retorno", async () => {
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Fluxo B1"
    });

    const retorno = await criarRetornoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: caixa.caixaId,
      valor: 100
    });
    const transferencia = await consultarUm<{ id: string }>(
      "select id from transferencias where caixa_id = $1 and tipo = 'retorno' order by criado_em desc limit 1",
      [caixa.caixaId]
    );
    if (!transferencia) throw new Error("Retorno da fixture nao encontrado");

    const conferencia = await contexto.app.inject({
      method: "POST",
      url: `/api/transferencias/${transferencia.id}/confirmar`,
      headers: { cookie: cookieGerente },
      payload: {
        contaDestinoId: idsTeste.contaCofre,
        nLacreDoc: retorno.lacre.numero,
        valorRecebido: 100,
        valorEspecieContado: 100,
        valorMoedasContado: 0
      }
    });
    expect(conferencia.statusCode, conferencia.body).toBe(200);

    await prepararFechamentoValido(contexto.app, { cookieOperador: cookieCaixa, caixaId: caixa.caixaId });
    const fechamento = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/fechar`,
      headers: { cookie: cookieCaixa },
      payload: {
        lacreFechamento: caixa.lacreFechamento,
        caixaResponsavelNome: "Fluxo B1",
        supervisorResponsavelNome: "Supervisor de teste",
        valorEspecieFechamento: 0,
        valorMoedasFechamento: 0
      }
    });
    expect(fechamento.statusCode, fechamento.body).toBe(204);
  });
});
