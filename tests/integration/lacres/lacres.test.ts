import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("lacres integration", () => {
  let contexto: ContextoApiTeste;
  let cookieTesouraria: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieTesouraria = await cookieSessao(contexto.app, "tesouraria");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarEListarLacre_Quando_TesourariaComPermissao", async () => {
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/lacres",
      headers: { cookie: cookieTesouraria },
      payload: { empresaId: idsTeste.empresaA, numero: "LACRE-INT-001", origem: "saida" }
    });
    expect(criar.statusCode).toBe(201);

    const corpo = json<{ data: { id: string } }>(criar);
    const registro = await consultarUm<{ numero: string; empresa_id: string; origem: string; rompido: boolean }>(
      "select numero, empresa_id, origem, rompido from lacres where id = $1",
      [corpo.data.id]
    );
    expect(registro).toMatchObject({
      numero: "LACRE-INT-001",
      empresa_id: idsTeste.empresaA,
      origem: "saida",
      rompido: false
    });

    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/lacres?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieTesouraria }
    });
    assertOk(listar);
    expect(JSON.stringify(listar.json())).toContain("LACRE-INT-001");
  });

  it("Deve_Retornar400_Quando_LacreDuplicadoNaMesmaEmpresa", async () => {
    const payload = { empresaId: idsTeste.empresaA, numero: "LACRE-INT-DUP", origem: "saida" };
    const primeiro = await contexto.app.inject({
      method: "POST",
      url: "/api/lacres",
      headers: { cookie: cookieTesouraria },
      payload
    });
    expect(primeiro.statusCode).toBe(201);

    const segundo = await contexto.app.inject({
      method: "POST",
      url: "/api/lacres",
      headers: { cookie: cookieTesouraria },
      payload
    });
    assertProblem(segundo, 400, "LACRE_DUPLICADO");
  });

  it("Deve_Retornar403_Quando_UsuarioSemPermissaoDeCadastroLacre", async () => {
    const cookie = await cookieSessao(contexto.app, "caixa");

    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/lacres?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });
    assertProblem(listar, 403, "INSUFFICIENT_PERMISSION");

    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/lacres",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, numero: "LACRE-NEG-001", origem: "saida" }
    });
    assertProblem(criar, 403, "INSUFFICIENT_PERMISSION");
  });

  it("Deve_Retornar403_Quando_EmpresaNaoPermitida", async () => {
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/lacres",
      headers: { cookie: cookieTesouraria },
      payload: { empresaId: idsTeste.empresaB, numero: "LACRE-EMPRESA-B", origem: "saida" }
    });
    assertProblem(criar, 403, "FORBIDDEN_COMPANY");
  });
});
