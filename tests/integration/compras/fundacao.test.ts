import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("fundacao do novo Compras integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await executarSql("delete from fornecedores_produtos where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from produtos_precos_base where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_importacoes_preco_base where empresa_id = $1", [idsTeste.empresaA]);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("cria catalogo aprovado com evento e impede duplicidade", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/catalogo-fornecedores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        fornecedorId: idsTeste.fornecedor,
        produtoId: idsTeste.produto,
        precoOfertado: 12.34
      }
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const id = json<{ data: { id: string } }>(criado).data.id;
    await expect(
      consultarUm(
        "select fp.id from fornecedores_produtos fp join fornecedores_produtos_eventos e on e.fornecedor_produto_id = fp.id where fp.id = $1 and fp.status = 'aprovado' and e.status_novo = 'aprovado'",
        [id]
      )
    ).resolves.toBeTruthy();

    const duplicado = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/catalogo-fornecedores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        fornecedorId: idsTeste.fornecedor,
        produtoId: idsTeste.produto
      }
    });
    expect(duplicado.statusCode).toBe(409);
  });

  it("analisa e aplica uma unica vez o preco-base inicial", async () => {
    const produto = await consultarUm<{ descricao: string; codigo: string | null }>(
      "select descricao, codigo from produtos where id = $1",
      [idsTeste.produto]
    );
    expect(produto).toBeTruthy();
    const analisada = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/precos-base/importacoes/analisar",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nomeArquivo: "base-e2e.xlsx",
        hashArquivo: "f".repeat(64),
        linhas: [
          {
            numeroLinha: 2,
            codigo: produto!.codigo,
            descricao: produto!.descricao,
            ultimoMenorCusto: 9.87
          }
        ]
      }
    });
    expect(analisada.statusCode, analisada.body).toBe(201);
    const importacaoId = json<{ data: { id: string } }>(analisada).data.id;

    const aplicada = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/${importacaoId}/aplicar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA }
    });
    expect(aplicada.statusCode, aplicada.body).toBe(200);
    const base = await consultarUm<{ valor: string }>(
      "select valor from produtos_precos_base where empresa_id = $1 and produto_id = $2 and valido_ate is null",
      [idsTeste.empresaA, idsTeste.produto]
    );
    expect(Number(base?.valor)).toBe(9.87);

    const repetida = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/${importacaoId}/aplicar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA }
    });
    expect(repetida.statusCode).toBe(409);
  });
});
