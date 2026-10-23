import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("fornecedores integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarEAtualizarFornecedor_Quando_EmpresaPermitida", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/fornecedores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "Fornecedor criado por integracao",
        documento: "11.111.111/0001-11"
      }
    });
    expect(criado.statusCode).toBe(201);
    const fornecedorId = json<{ data: { id: string } }>(criado).data.id;

    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/fornecedores/${fornecedorId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Fornecedor editado por integracao", documento: "11111111000111" }
    });
    expect(editado.statusCode).toBe(204);
    await expect(
      consultarUm("select id from fornecedores where id = $1 and nome = $2", [
        fornecedorId,
        "Fornecedor editado por integracao"
      ])
    ).resolves.toBeTruthy();
  });

  // R-219: fornecedor nasce ativo por default e a situacao faz round-trip na edicao.
  it("Deve_PersistirSituacao_Quando_InformadaNaCriacaoEEdicao", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/fornecedores",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Fornecedor situacao" }
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const id = json<{ data: { id: string } }>(criado).data.id;
    // Default: ativo.
    await expect(
      consultarUm("select id from fornecedores where id = $1 and situacao = 'ativo'", [id])
    ).resolves.toBeTruthy();

    const inativado = await contexto.app.inject({
      method: "PUT",
      url: `/api/fornecedores/${id}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Fornecedor situacao", situacao: "inativo" }
    });
    expect(inativado.statusCode).toBe(204);
    await expect(
      consultarUm("select id from fornecedores where id = $1 and situacao = 'inativo'", [id])
    ).resolves.toBeTruthy();

    await executarSql("delete from fornecedores where id = $1", [id]);
  });
});

describe("fornecedores importacao/exportacao integration", () => {
  let contexto: ContextoApiTeste;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ImportarFornecedoresEntreEmpresasPermitidas", async () => {
    await executarSql("delete from fornecedores where empresa_id = $1 and importado_de = $2", [
      idsTeste.empresaB,
      idsTeste.empresaA
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/fornecedores/importar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBeGreaterThan(0);
    await expect(
      consultarUm("select id from fornecedores where empresa_id = $1 and importado_de = $2", [
        idsTeste.empresaB,
        idsTeste.empresaA
      ])
    ).resolves.toBeTruthy();
  });

  it("Deve_ExportarFornecedorParaEmpresaPermitida", async () => {
    await executarSql("delete from fornecedores where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
      idsTeste.empresaB,
      idsTeste.empresaA,
      idsTeste.fornecedor
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/fornecedores/${idsTeste.fornecedor}/exportar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBe(1);
    await expect(
      consultarUm("select id from fornecedores where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
        idsTeste.empresaB,
        idsTeste.empresaA,
        idsTeste.fornecedor
      ])
    ).resolves.toBeTruthy();
  });
});
