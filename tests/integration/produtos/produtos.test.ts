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
        embalagem: "SACO",
        cDe: "DE",
        quantidadeCaixa: 30,
        medidaCompra: "KG",
        custo: 84.9,
        margem: 0.7,
        precoVenda: 4.81,
        auto: true,
        status: "ativo",
        tipo: "revenda",
        fiscal: { ncm: "19059090", categoriaFiscal: "REVENDA", aliquotaCheia: 18, icms: 18 },
        promocoes: [
          {
            tipo: "desconto",
            descontoFracao: 0.1,
            horaInicio: "08:00",
            horaFim: "12:00",
            seg: true,
            ter: false,
            qua: false,
            qui: false,
            sex: false,
            sab: false,
            dom: false
          }
        ],
        conversoes: []
      }
    });
    expect(criado.statusCode).toBe(201);
    const produtoId = json<{ data: { id: string } }>(criado).data.id;

    const linha = await consultarUm<{
      codigo: string;
      codigo_interno: string;
      custo: string;
      margem: string;
      preco_venda: string;
      auto: boolean;
      status: string;
      tipo: string;
      embalagem: string;
      c_de: string;
      quantidade_caixa: number;
      medida_compra: string;
    }>(
      "select codigo, codigo_interno, custo, margem, preco_venda, auto, status, tipo, embalagem, c_de, quantidade_caixa, medida_compra from produtos where id = $1",
      [produtoId]
    );
    expect(linha?.codigo).toMatch(/^PR-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(linha?.codigo_interno).toMatch(/^\d{5}$/);
    expect(linha).toMatchObject({
      auto: true,
      status: "ativo",
      tipo: "revenda",
      embalagem: "SACO",
      c_de: "DE",
      medida_compra: "KG"
    });
    expect(Number(linha?.custo)).toBe(84.9);
    expect(Number(linha?.margem)).toBe(0.7);
    expect(Number(linha?.preco_venda)).toBe(4.81);
    expect(Number(linha?.quantidade_caixa)).toBe(30);

    const fiscal = await consultarUm<{ ncm: string; categoria_fiscal: string; aliquota_cheia: string; icms: string }>(
      "select ncm, categoria_fiscal, aliquota_cheia, icms from produtos_fiscal where produto_id = $1",
      [produtoId]
    );
    expect(fiscal).toMatchObject({ ncm: "19059090", categoria_fiscal: "REVENDA" });
    expect(Number(fiscal?.aliquota_cheia)).toBe(18);
    expect(Number(fiscal?.icms)).toBe(18);

    const promo = await consultarUm<{ tipo: string; desconto_fracao: string; seg: boolean; ter: boolean }>(
      "select tipo, desconto_fracao, seg, ter from produtos_promocoes where produto_id = $1",
      [produtoId]
    );
    expect(promo).toMatchObject({ tipo: "desconto", seg: true, ter: false });
    expect(Number(promo?.desconto_fracao)).toBe(0.1);
  });

  it("Deve_PersistirTransformacao_Quando_TipoTransformacao", async () => {
    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade Transformacao", sigla: "g" }
    });
    const unidadeId = json<{ data: { id: string } }>(unidade).data.id;

    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        descricao: "Massa transformacao integracao",
        unidadeIndividualId: unidadeId,
        quantidadeIndividual: 1,
        tipo: "transformacao",
        transformacao: { precisao: "EXATOS", quantidade: 500, unidade: "G", produtoReceituario: "MASSA BASE" },
        conversoes: []
      }
    });
    expect(criado.statusCode).toBe(201);
    const produtoId = json<{ data: { id: string } }>(criado).data.id;

    const t = await consultarUm<{ precisao: string; quantidade: string; unidade: string; produto_receituario: string }>(
      "select precisao, quantidade, unidade, produto_receituario from produtos_transformacao where produto_id = $1",
      [produtoId]
    );
    expect(t).toMatchObject({ precisao: "EXATOS", unidade: "G", produto_receituario: "MASSA BASE" });
    expect(Number(t?.quantidade)).toBe(500);
  });

  it("Deve_BloquearProdutoDuplicado_ExcetoComForcar", async () => {
    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade Dup", sigla: "ud" }
    });
    const unidadeId = json<{ data: { id: string } }>(unidade).data.id;
    const base = {
      empresaId: idsTeste.empresaA,
      descricao: "Produto Duplicado Teste",
      unidadeIndividualId: unidadeId,
      quantidadeIndividual: 1,
      conversoes: []
    };

    const primeiro = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: base
    });
    expect(primeiro.statusCode).toBe(201);

    const segundo = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: base
    });
    assertProblem(segundo, 409, "DUPLICATE_PRODUCT");

    const forcado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: { ...base, forcar: true }
    });
    expect(forcado.statusCode).toBe(201);
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
    const copiado = await consultarUm<{ codigo: string; codigo_interno: string }>(
      "select codigo, codigo_interno from produtos where empresa_id = $1 and importado_de = $2 and id_importado = $3",
      [idsTeste.empresaB, idsTeste.empresaA, idsTeste.produto]
    );
    expect(copiado?.codigo).toMatch(/^PR-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(copiado?.codigo_interno).toMatch(/^\d{5}$/);
  });
});
