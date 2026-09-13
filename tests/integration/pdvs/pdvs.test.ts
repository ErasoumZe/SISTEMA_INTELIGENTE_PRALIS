import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("pdvs integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieTesouraria: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieTesouraria = await cookieSessao(contexto.app, "tesouraria");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ListarECriarPdv_Quando_ContaPertenceAEmpresa", async () => {
    const listagem = await contexto.app.inject({
      method: "GET",
      url: `/api/pdvs?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(listagem);
    expect(JSON.stringify(listagem.json())).toContain("PDV Integracao");

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "PDV criado por integracao",
        contaId: idsTeste.contaBanco,
        ativo: true
      }
    });

    expect(resposta.statusCode).toBe(201);
    const corpo = json<{ data: { id: string } }>(resposta);
    const pdv = await consultarUm<{ nome: string; conta_id: string }>("select nome, conta_id from pdvs where id = $1", [
      corpo.data.id
    ]);
    expect(pdv).toMatchObject({ nome: "PDV criado por integracao", conta_id: idsTeste.contaBanco });
  });

  it("Deve_ListarPdvs_Quando_TesourariaPodeCriarTransferencia", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/pdvs?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieTesouraria }
    });
    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain("PDV Integracao");
  });
});
