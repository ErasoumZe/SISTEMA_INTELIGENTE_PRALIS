import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("produtos integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarEAtualizarProduto_Quando_EmpresaPermitida", async () => {
    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade Produto CRUD", sigla: "un" }
    });
    expect(unidade.statusCode).toBe(201);
    const unidadeId = json<{ data: { id: string } }>(unidade).data.id;

    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        codigo: "PROD-CRUD",
        descricao: "Produto criado por integracao",
        unidadeIndividualId: unidadeId,
        quantidadeIndividual: 1,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        conversoes: []
      }
    });
    expect(criado.statusCode).toBe(201);
    const produtoId = json<{ data: { id: string } }>(criado).data.id;

    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${produtoId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        codigo: "PROD-CRUD-EDIT",
        descricao: "Produto editado por integracao",
        unidadeIndividualId: unidadeId,
        quantidadeIndividual: 1,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        conversoes: []
      }
    });
    expect(editado.statusCode).toBe(204);
    await expect(
      consultarUm("select id from produtos where id = $1 and descricao = $2", [
        produtoId,
        "Produto editado por integracao"
      ])
    ).resolves.toBeTruthy();
  });

  it("Deve_PersistirCamposComerciais_Quando_CriarProduto", async () => {
    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade Comercial", sigla: "cx" }
    });
    const unidadeId = json<{ data: { id: string } }>(unidade).data.id;

    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        descricao: "Produto comercial integracao",
        unidadeIndividualId: unidadeId,
        quantidadeIndividual: 1,
        custo: 84.9,
        margem: 0.7,
        precoVenda: 4.81,
        auto: true,
        status: "ativo",
        tipo: "revenda",
        conversoes: []
      }
    });
    expect(criado.statusCode).toBe(201);
    const produtoId = json<{ data: { id: string } }>(criado).data.id;

    const linha = await consultarUm<{
      custo: string;
      margem: string;
      preco_venda: string;
      auto: boolean;
      status: string;
      tipo: string;
    }>("select custo, margem, preco_venda, auto, status, tipo from produtos where id = $1", [produtoId]);
    expect(linha).toMatchObject({ auto: true, status: "ativo", tipo: "revenda" });
    expect(Number(linha?.custo)).toBe(84.9);
    expect(Number(linha?.margem)).toBe(0.7);
    expect(Number(linha?.preco_venda)).toBe(4.81);
  });

  it("Deve_Retornar403_Quando_CriarProdutoEmEmpresaNaoPermitida", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaB,
        descricao: "Produto proibido",
        unidadeIndividualId: idsTeste.unidade,
        quantidadeIndividual: 1
      }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });
});

describe("produtos importacao/exportacao integration", () => {
  let contexto: ContextoApiTeste;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ImportarProdutosEntreEmpresasPermitidas", async () => {
    await executarSql("delete from produtos where empresa_id = $1 and importado_de = $2", [
      idsTeste.empresaB,
      idsTeste.empresaA
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/importar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBeGreaterThan(0);
    await expect(
      consultarUm("select id from produtos where empresa_id = $1 and importado_de = $2", [
        idsTeste.empresaB,
        idsTeste.empresaA
      ])
    ).resolves.toBeTruthy();
  });

  it("Deve_ExportarProdutoParaEmpresaPermitida", async () => {
    await executarSql("delete from produtos where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
      idsTeste.empresaB,
      idsTeste.empresaA,
      idsTeste.produto
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/${idsTeste.produto}/exportar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBe(1);
    await expect(
      consultarUm("select id from produtos where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
        idsTeste.empresaB,
        idsTeste.empresaA,
        idsTeste.produto
      ])
    ).resolves.toBeTruthy();
  });
});
