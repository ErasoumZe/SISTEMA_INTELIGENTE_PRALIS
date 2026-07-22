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
    expect(corpo).toContain("MALOTE-A");
    expect(corpo).not.toContain("MALOTE-B");
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
    expect(resposta.json()).toMatchObject({ ok: true, data: { existe: true, disponivel: true, numero: "LACRE-A" } });
  });

  it("Deve_ListarLacresDoMalote_Quando_MaloteEstiverNoEscopo", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/malotes/${idsTeste.maloteA}/lacres?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain("LACRE-A");
  });

  it("Deve_CriarMalote_Quando_LacresForemValidosEEmpresaPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");
    const payload = { empresaId: idsTeste.empresaA, codigo: "MALOTE-NOVO", lacres: ["LACRE-NOVO"] };

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/malotes",
      headers: { cookie },
      payload
    });

    expect(resposta.statusCode).toBe(201);
    const malote = await consultarUm<{ codigo: string }>("select codigo from malotes where codigo = $1", [
      payload.codigo
    ]);
    expect(malote?.codigo).toBe(payload.codigo);
  });

  it("Deve_UsarOLacreComoCodigo_Quando_CriarMaloteSemInformarCodigo", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");
    // "So lacre": sem codigo, o malote e identificado pelo proprio lacre (nada de "Malote 0001").
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/malotes",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, lacres: ["LACRE-AUTOGEN"] }
    });

    expect(resposta.statusCode).toBe(201);
    const malote = await consultarUm<{ codigo: string }>(
      "select m.codigo from malotes m join lacres_malotes l on l.malote_id = m.id where l.numero = $1",
      ["LACRE-AUTOGEN"]
    );
    expect(malote?.codigo).toBe("LACRE-AUTOGEN");
  });

  it("Deve_ExcluirMaloteELacres_Quando_TiverPermissao", async () => {
    // Excluir malote exige cadastro_malotes_excluir (admin tem). Pedido do Ze: excluir no user admin.
    const cookie = await cookieSessao(contexto.app, "admin");
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/malotes",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, lacres: ["LACRE-EXCLUIR"] }
    });
    expect(criado.statusCode).toBe(201);
    const maloteId = criado.json().data.id as string;

    const excluir = await contexto.app.inject({
      method: "DELETE",
      url: `/api/malotes/${maloteId}`,
      headers: { cookie }
    });

    expect(excluir.statusCode).toBe(204);
    await expect(consultarUm("select id from malotes where id = $1", [maloteId])).resolves.toBeNull();
    // Os lacres saem em cascata junto com o malote.
    await expect(consultarUm("select id from lacres_malotes where numero = $1", ["LACRE-EXCLUIR"])).resolves.toBeNull();
  });

  it("Deve_Retornar403_Quando_ExcluirMaloteDeEmpresaNaoPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "admin");
    const resposta = await contexto.app.inject({
      method: "DELETE",
      url: `/api/malotes/${idsTeste.maloteB}`,
      headers: { cookie }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_Retornar400_Quando_CriarMaloteComLacreDuplicadoNoPayload", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/malotes",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, codigo: "MALOTE-DUP", lacres: ["DUP-1", "dup-1"] }
    });

    assertProblem(resposta, 400);
    expect(JSON.stringify(resposta.json())).toContain("Lacre duplicado");
  });

  it("Deve_Retornar403_Quando_CriarOuEditarMaloteDeEmpresaNaoPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/malotes",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaB, codigo: "MALOTE-PROIBIDO", lacres: ["LACRE-PROIBIDO"] }
    });
    const editar = await contexto.app.inject({
      method: "PUT",
      url: `/api/malotes/${idsTeste.maloteB}`,
      headers: { cookie },
      payload: { codigo: "MALOTE-B-PROIBIDO", lacres: ["LACRE-B-PROIBIDO"] }
    });

    assertProblem(criar, 403, "FORBIDDEN_COMPANY");
    assertProblem(editar, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_AtualizarMaloteNoEscopoPermitido_Quando_PayloadValido", async () => {
    const cookie = await cookieSessao(contexto.app, "tesouraria");
    const payload = { codigo: "MALOTE-EDITADO", lacres: ["LACRE-EDITADO"] };

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/malotes/${idsTeste.maloteA}`,
      headers: { cookie },
      payload
    });

    expect(resposta.statusCode).toBe(204);
    const malote = await consultarUm<{ codigo: string }>("select codigo from malotes where id = $1", [
      idsTeste.maloteA
    ]);
    expect(malote?.codigo).toBe(payload.codigo);
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
