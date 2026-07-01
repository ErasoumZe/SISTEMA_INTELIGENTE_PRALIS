import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("areas e setores integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarEAtualizarAreaESetor_Quando_EmpresaPermitida", async () => {
    const area = await contexto.app.inject({
      method: "POST",
      url: "/api/areas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Area criada por integracao" }
    });
    expect(area.statusCode).toBe(201);
    const areaId = json<{ data: { id: string } }>(area).data.id;

    const setor = await contexto.app.inject({
      method: "POST",
      url: "/api/setores",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Setor criado por integracao", areaId }
    });
    expect(setor.statusCode).toBe(201);
    const setorId = json<{ data: { id: string } }>(setor).data.id;

    const areaEditada = await contexto.app.inject({
      method: "PUT",
      url: `/api/areas/${areaId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Area editada por integracao" }
    });
    const setorEditado = await contexto.app.inject({
      method: "PUT",
      url: `/api/setores/${setorId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Setor editado por integracao", areaId }
    });

    expect(areaEditada.statusCode).toBe(204);
    expect(setorEditado.statusCode).toBe(204);
    await expect(consultarUm("select id from areas where id = $1 and nome = $2", [areaId, "Area editada por integracao"])).resolves.toBeTruthy();
    await expect(consultarUm("select id from setores where id = $1 and nome = $2", [setorId, "Setor editado por integracao"])).resolves.toBeTruthy();
  });
});

describe("areas e setores importacao/exportacao integration", () => {
  let contexto: ContextoApiTeste;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ImportarAreasESetoresEntreEmpresasPermitidas", async () => {
    await executarSql("delete from setores where empresa_id = $1 and importado_de = $2", [idsTeste.empresaB, idsTeste.empresaA]);
    await executarSql("delete from areas where empresa_id = $1 and importado_de = $2", [idsTeste.empresaB, idsTeste.empresaA]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/areas-setores/importar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBeGreaterThan(0);
    await expect(consultarUm("select id from areas where empresa_id = $1 and importado_de = $2", [idsTeste.empresaB, idsTeste.empresaA])).resolves.toBeTruthy();
  });

  it("Deve_ExportarAreaSetorParaEmpresaPermitida", async () => {
    await executarSql("delete from setores where empresa_id = $1 and importado_de = $2", [idsTeste.empresaB, idsTeste.empresaA]);
    await executarSql("delete from areas where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
      idsTeste.empresaB,
      idsTeste.empresaA,
      idsTeste.areaA
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/areas-setores/${idsTeste.areaA}/exportar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBe(1);
    await expect(consultarUm("select id from areas where empresa_id = $1 and importado_de = $2 and id_importado = $3", [idsTeste.empresaB, idsTeste.empresaA, idsTeste.areaA])).resolves.toBeTruthy();
  });
});

