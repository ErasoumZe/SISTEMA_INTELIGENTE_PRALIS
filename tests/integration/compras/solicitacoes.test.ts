import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// Produtos dedicados a estes testes, para nao mexer no retrato de estoque do produto compartilhado.
const PRODUTO_TETO = "11111111-1111-4111-8111-1111111117a1";
const PRODUTO_EMPRESA_B = "33333333-3333-4333-8333-3333333337a2";
const GRUPO_EMPRESA_B = "33333333-3333-4333-8333-3333333337b1";
const UNIDADE_EMPRESA_B = "33333333-3333-4333-8333-3333333337c1";

describe("compras solicitacoes integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");

    // Produto de empresaA com teto configurado (estoque 0, maximo 10): pedir 20 estoura o teto.
    await executarSql(
      `insert into produtos (id, empresa_id, grupo_mercadoria_id, unidade_medida_id, codigo, descricao, quantidade_estoque, estoque_max, liberado_compra)
       values ($1, $2, $3, $4, $5, $6, '0', '10', true) on conflict (id) do nothing`,
      [
        PRODUTO_TETO,
        idsTeste.empresaA,
        idsTeste.grupoMercadoriaInsumos,
        idsTeste.unidade,
        "PROD-SOL-TETO",
        "Produto com teto"
      ]
    );

    // Produto de empresaB (com grupo e unidade proprios): serve para provar o isolamento por empresa.
    await executarSql(
      "insert into grupos_mercadorias (id, empresa_id, nome) values ($1, $2, $3) on conflict (id) do nothing",
      [GRUPO_EMPRESA_B, idsTeste.empresaB, "Insumos B"]
    );
    await executarSql(
      "insert into unidades_medida (id, empresa_id, nome, sigla) values ($1, $2, $3, $4) on conflict (id) do nothing",
      [UNIDADE_EMPRESA_B, idsTeste.empresaB, "Unidade B", "unb"]
    );
    await executarSql(
      `insert into produtos (id, empresa_id, grupo_mercadoria_id, unidade_medida_id, codigo, descricao, liberado_compra)
       values ($1, $2, $3, $4, $5, $6, true) on conflict (id) do nothing`,
      [
        PRODUTO_EMPRESA_B,
        idsTeste.empresaB,
        GRUPO_EMPRESA_B,
        UNIDADE_EMPRESA_B,
        "PROD-SOL-B",
        "Produto de outra empresa"
      ]
    );
  }, 120_000);

  afterAll(async () => {
    await executarSql("delete from compras_solicitacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from produtos where id = any($1)", [[PRODUTO_TETO, PRODUTO_EMPRESA_B]]);
    await executarSql("delete from grupos_mercadorias where id = $1", [GRUPO_EMPRESA_B]);
    await executarSql("delete from unidades_medida where id = $1", [UNIDADE_EMPRESA_B]);
    await contexto.fechar();
  });

  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }
  function put(url: string, payload: object) {
    return contexto.app.inject({ method: "PUT", url, headers: { cookie: cookieAdmin }, payload });
  }
  function get(url: string) {
    return contexto.app.inject({ method: "GET", url, headers: { cookie: cookieAdmin } });
  }

  // Fio de edicao: o que foi salvo reaparece no GET e a edicao substitui os itens (sem campo fantasma).
  it("cria, le e edita uma solicitacao em rascunho", async () => {
    const criar = await post("/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [{ produtoId: idsTeste.produto, quantidade: 5 }]
    });
    expect(criar.statusCode, criar.body).toBe(201);
    const id = json<{ data: { id: string } }>(criar).data.id;

    const detalhe = json<{
      data: {
        status: string;
        origem: string;
        totalItens: number;
        itens: Array<{ produtoId: string; quantidade: string }>;
      };
    }>(await get(`/api/compras/solicitacoes/${id}`)).data;
    expect(detalhe).toMatchObject({ status: "rascunho", origem: "manual", totalItens: 1 });
    expect(detalhe.itens[0]).toMatchObject({ produtoId: idsTeste.produto, quantidade: "5.000" });

    const editar = await put(`/api/compras/solicitacoes/${id}`, {
      empresaId: idsTeste.empresaA,
      observacao: "Revisada",
      itens: [{ produtoId: idsTeste.produto, quantidade: 8 }]
    });
    expect(editar.statusCode, editar.body).toBe(204);

    const reaberta = json<{ data: { observacao: string; itens: Array<{ quantidade: string }> } }>(
      await get(`/api/compras/solicitacoes/${id}`)
    ).data;
    expect(reaberta.observacao).toBe("Revisada");
    expect(reaberta.itens[0]?.quantidade).toBe("8.000");

    const listada = json<{ data: Array<{ id: string; totalItens: number }> }>(
      await get(`/api/compras/solicitacoes?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(listada.find((item) => item.id === id)?.totalItens).toBe(1);
  });

  it("recusa produto repetido na mesma solicitacao", async () => {
    const resposta = await post("/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [
        { produtoId: idsTeste.produto, quantidade: 1 },
        { produtoId: idsTeste.produto, quantidade: 2 }
      ]
    });
    expect(resposta.statusCode).toBe(400);
    expect(json<{ code?: string }>(resposta).code).toBe("PRODUTO_DUPLICADO");
  });

  it("recusa quantidade acima do teto pelo conjunto (422)", async () => {
    const resposta = await post("/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [{ produtoId: PRODUTO_TETO, quantidade: 20 }]
    });
    expect(resposta.statusCode, resposta.body).toBe(422);
    expect(json<{ code?: string }>(resposta).code).toBe("ESTOQUE_MAXIMO_ULTRAPASSADO");
    // Nada foi gravado.
    await expect(
      consultarUm("select id from compras_solicitacoes_itens where produto_id = $1", [PRODUTO_TETO])
    ).resolves.toBeNull();
  });

  it("recusa produto de outra empresa (isolamento)", async () => {
    const resposta = await post("/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [{ produtoId: PRODUTO_EMPRESA_B, quantidade: 1 }]
    });
    expect(resposta.statusCode).toBe(400);
    expect(json<{ code?: string }>(resposta).code).toBe("INVALID_PRODUCT");
  });
});
