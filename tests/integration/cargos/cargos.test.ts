import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("cargos integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ListarCriarEAtualizarCargo_Quando_EmpresaPermitida", async () => {
    const listagem = await contexto.app.inject({
      method: "GET",
      url: `/api/cargos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(listagem);
    expect(JSON.stringify(listagem.json())).toContain("Admin Integracao");

    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/cargos",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Cargo criado por integracao" }
    });
    expect(criado.statusCode).toBe(201);
    const cargoId = json<{ data: { id: string } }>(criado).data.id;

    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/cargos/${cargoId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Cargo editado por integracao" }
    });
    expect(editado.statusCode).toBe(204);
    await expect(consultarUm("select id from cargos where id = $1 and nome = $2", [cargoId, "Cargo editado por integracao"])).resolves.toBeTruthy();
  });

  it("Deve_ImportarCargosEntreEmpresasPermitidas", async () => {
    await executarSql("delete from cargos where empresa_id = $1 and importado_de = $2", [idsTeste.empresaB, idsTeste.empresaA]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/cargos/importar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBeGreaterThan(0);
    await expect(consultarUm("select id from cargos where empresa_id = $1 and importado_de = $2", [idsTeste.empresaB, idsTeste.empresaA])).resolves.toBeTruthy();
  });

  it("Deve_ExportarCargoParaEmpresaPermitida", async () => {
    await executarSql("delete from cargos where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
      idsTeste.empresaB,
      idsTeste.empresaA,
      idsTeste.cargoGerente
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/cargos/${idsTeste.cargoGerente}/exportar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBe(1);
    await expect(consultarUm("select id from cargos where empresa_id = $1 and importado_de = $2 and id_importado = $3", [idsTeste.empresaB, idsTeste.empresaA, idsTeste.cargoGerente])).resolves.toBeTruthy();
  });
});
