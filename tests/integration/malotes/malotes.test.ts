import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";
import { idsTeste } from "../../setup/contexto.js";

describe("malotes integration", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ListarMalotesDaEmpresa_Quando_TiverPermissao", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/malotes?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });

    assertOk(resposta);
    const corpo = JSON.stringify(resposta.json());
    expect(corpo).toContain("LACRE-A");
    expect(corpo).not.toContain("LACRE-B");
  });

  it("Deve_Retornar403_Quando_ListarMalotesDeEmpresaNaoPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/malotes?empresaId=${idsTeste.empresaB}`,
      headers: { cookie }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_ValidarLacreNoEscopoDaEmpresa_Quando_EmpresaPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/lacres/validar?numero=LACRE-A&empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });

    assertOk(resposta);
    expect(resposta.json()).toMatchObject({
      ok: true,
      data: { existe: true, disponivel: true, numeroLacre: "LACRE-A" }
    });
  });

  it("Deve_CriarMalote_Quando_LacreForValidoEEmpresaPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");
    // O malote E o lacre: so o numero do lacre + o valor. Sem codigo, sem saco.
    const payload = { empresaId: idsTeste.empresaA, numeroLacre: "LACRE-NOVO", valor: 250 };

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/malotes",
      headers: { cookie },
      payload
    });

    expect(resposta.statusCode).toBe(201);
    const malote = await consultarUm<{ numero_lacre: string; valor: string; status: string }>(
      "select numero_lacre, valor, status from malotes where numero_lacre = $1",
      [payload.numeroLacre]
    );
    expect(malote?.numero_lacre).toBe(payload.numeroLacre);
    expect(malote?.status).toBe("disponivel");
  });

  it("Deve_Retornar400_Quando_CriarMaloteComLacreJaCadastrado", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/malotes",
      headers: { cookie },
      // LACRE-A ja existe no seed da empresa A (case-insensitive).
      payload: { empresaId: idsTeste.empresaA, numeroLacre: "lacre-a", valor: 0 }
    });

    assertProblem(resposta, 400);
    expect(JSON.stringify(resposta.json())).toContain("ja cadastrado");
  });

  it("Deve_Retornar403_Quando_CriarOuEditarMaloteDeEmpresaNaoPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/malotes",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaB, numeroLacre: "LACRE-PROIBIDO", valor: 0 }
    });
    const editar = await contexto.app.inject({
      method: "PUT",
      url: `/api/malotes/${idsTeste.maloteB}`,
      headers: { cookie },
      payload: { numeroLacre: "LACRE-B-PROIBIDO", valor: 0 }
    });

    assertProblem(criar, 403, "FORBIDDEN_COMPANY");
    assertProblem(editar, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_AtualizarMaloteNoEscopoPermitido_Quando_PayloadValido", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");
    const payload = { numeroLacre: "LACRE-EDITADO", valor: 123 };

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/malotes/${idsTeste.maloteA}`,
      headers: { cookie },
      payload
    });

    expect(resposta.statusCode).toBe(204);
    const malote = await consultarUm<{ numero_lacre: string }>("select numero_lacre from malotes where id = $1", [
      idsTeste.maloteA
    ]);
    expect(malote?.numero_lacre).toBe(payload.numeroLacre);
  });
});

describe("malotes importacao/exportacao integration", () => {
  let contexto: ContextoApiTeste;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ImportarMalotesEntreEmpresasPermitidas", async () => {
    await executarSql("delete from malotes where empresa_id = $1 and importado_de = $2", [
      idsTeste.empresaB,
      idsTeste.empresaA
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/malotes/importar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBeGreaterThan(0);
    await expect(
      consultarUm("select id from malotes where empresa_id = $1 and importado_de = $2", [
        idsTeste.empresaB,
        idsTeste.empresaA
      ])
    ).resolves.toBeTruthy();
  });

  it("Deve_ExportarMaloteParaEmpresaPermitida", async () => {
    await executarSql("delete from malotes where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
      idsTeste.empresaB,
      idsTeste.empresaA,
      idsTeste.maloteA
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/malotes/${idsTeste.maloteA}/exportar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBe(1);
    await expect(
      consultarUm("select id from malotes where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
        idsTeste.empresaB,
        idsTeste.empresaA,
        idsTeste.maloteA
      ])
    ).resolves.toBeTruthy();
  });
});
