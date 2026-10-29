import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, prepararPayloadFechamentoValido } from "../../setup/caixa.js";
import { usuariosTeste } from "../../setup/contexto.js";
import { consultarUm } from "../../setup/integracao.js";

// R-226: o responsavel pelo caixa no fechamento e quem abriu; so o supervisor muda.
describe("Caixa - responsavel do fechamento (R-226)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
  }, 120_000);

  afterAll(async () => contexto.fechar());

  it("grava como responsavel do fechamento quem abriu o caixa, mesmo que venha outro nome", async () => {
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Maria da abertura"
    });
    const payload = await prepararPayloadFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: caixa.caixaId,
      caixaResponsavelNome: "Outra pessoa",
      supervisorResponsavelNome: "Gerente do malote"
    });
    const fechar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/fechar`,
      headers: { cookie: cookieCaixa },
      payload
    });
    expect(fechar.statusCode, fechar.body).toBe(204);
    const fechado = await consultarUm<{ caixa: string; supervisor: string }>(
      `select caixa_responsavel_nome_fechamento as caixa, supervisor_responsavel_nome_fechamento as supervisor
         from fechamentos_caixa where id = $1`,
      [caixa.caixaId]
    );
    expect(fechado).toEqual({ caixa: "Maria da abertura", supervisor: "Gerente do malote" });
  });
});
