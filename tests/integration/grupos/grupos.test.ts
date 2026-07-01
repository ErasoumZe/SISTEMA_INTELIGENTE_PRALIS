import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("grupos integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarEAtualizarGrupos_Quando_EmpresaPermitida", async () => {
    const grupoDespesa = await contexto.app.inject({
      method: "POST",
      url: "/api/grupos-despesas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, tipoGrupo: "despesa", nome: "Grupo despesa criado" }
    });
    const grupoMercadoria = await contexto.app.inject({
      method: "POST",
      url: "/api/grupos-mercadorias",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, tipoGrupo: "mercadoria", nome: "Grupo mercadoria criado" }
    });
    const grupoRetirada = await contexto.app.inject({
      method: "POST",
      url: "/api/grupos-retiradas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, tipoGrupo: "retirada", nome: "Grupo retirada criado" }
    });
    const grupoVenda = await contexto.app.inject({
      method: "POST",
      url: "/api/grupos-vendas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, tipoGrupo: "vendas", nome: "Grupo venda criado" }
    });

    for (const resposta of [grupoDespesa, grupoMercadoria, grupoRetirada, grupoVenda]) expect(resposta.statusCode).toBe(201);

    const grupoId = json<{ data: { id: string } }>(grupoDespesa).data.id;
    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/grupos-despesas/${grupoId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, tipoGrupo: "despesa", nome: "Grupo despesa editado" }
    });

    expect(editado.statusCode).toBe(204);
    await expect(consultarUm("select id from grupos_despesas where id = $1 and nome = $2", [grupoId, "Grupo despesa editado"])).resolves.toBeTruthy();
  });
});

describe("grupos importacao/exportacao integration", () => {
  let contexto: ContextoApiTeste;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ImportarGruposEntreEmpresasPermitidas", async () => {
    await executarSql("delete from grupos_despesas where empresa_id = $1 and importado_de = $2", [idsTeste.empresaB, idsTeste.empresaA]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/grupos/importar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBeGreaterThan(0);
    await expect(consultarUm("select id from grupos_despesas where empresa_id = $1 and importado_de = $2", [idsTeste.empresaB, idsTeste.empresaA])).resolves.toBeTruthy();
  });

  it("Deve_ExportarGrupoParaEmpresaPermitida", async () => {
    await executarSql("delete from grupos_despesas where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
      idsTeste.empresaB,
      idsTeste.empresaA,
      idsTeste.grupoDespesaOperacional
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/grupos/${idsTeste.grupoDespesaOperacional}/exportar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBe(1);
    await expect(consultarUm("select id from grupos_despesas where empresa_id = $1 and importado_de = $2 and id_importado = $3", [idsTeste.empresaB, idsTeste.empresaA, idsTeste.grupoDespesaOperacional])).resolves.toBeTruthy();
  });
});

