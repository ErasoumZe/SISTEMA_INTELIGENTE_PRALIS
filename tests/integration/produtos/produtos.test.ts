import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("produtos integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieSemPermissao: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarEAtualizarProduto_Quando_EmpresaPermitida", async () => {
    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade Produto CRUD", sigla: "ucr" }
    });
    expect(unidade.statusCode).toBe(201);
    const unidadeId = json<{ data: { id: string } }>(unidade).data.id;

    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      codigo: "PROD-CRUD",
      descricao: "Produto criado por integracao",
      nomeCatalogo: "Produto CRUD",
      pesavel: false,
      unidadeIndividualId: unidadeId,
      quantidadeIndividual: 1,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      conversoes: []
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
        nomeCatalogo: "Produto CRUD renomeado",
        unidadeIndividualId: unidadeId,
        quantidadeIndividual: 1,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        conversoes: []
      }
    });
    expect(editado.statusCode).toBe(204);
    await expect(
      consultarUm<{ id: string; nome_catalogo: string; pesavel: boolean }>(
        "select id, nome_catalogo, pesavel from produtos where id = $1 and descricao = $2",
        // O cadastro grava nome e descricao em maiusculas (regra do app oficial).
        [produtoId, "PRODUTO EDITADO POR INTEGRACAO"]
      )
    ).resolves.toMatchObject({ nome_catalogo: "PRODUTO CRUD RENOMEADO", pesavel: false });

    const exportacao = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/export.csv",
      headers: { cookie: cookieAdmin }
    });
    expect(exportacao.statusCode, exportacao.body).toBe(200);
    expect(exportacao.headers["content-type"]).toContain("text/csv");
    expect(exportacao.headers["content-disposition"]).toContain("produtos-pralis.csv");
    expect(exportacao.body).toContain("codigo_interno");
    expect(exportacao.body).toContain("PRODUTO CRUD RENOMEADO");

    const exportacaoSemPermissao = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/export.csv",
      headers: { cookie: cookieSemPermissao }
    });
    expect(exportacaoSemPermissao.statusCode).toBe(403);

    const backup = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/backup.xlsx",
      headers: { cookie: cookieAdmin }
    });
    expect(backup.statusCode, backup.body).toBe(200);
    expect(backup.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(backup.headers["content-disposition"]).toContain("backup-produtos-pralis.xlsx");

    const backupSemPermissao = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/backup.xlsx",
      headers: { cookie: cookieSemPermissao }
    });
    expect(backupSemPermissao.statusCode).toBe(403);

    const panoramaFiscal = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/fiscal/panorama",
      headers: { cookie: cookieAdmin }
    });
    expect(panoramaFiscal.statusCode, panoramaFiscal.body).toBe(200);
    expect(json<{ data: Record<string, number> }>(panoramaFiscal).data).toEqual(expect.any(Object));

    const panoramaFiscalSemPermissao = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/fiscal/panorama",
      headers: { cookie: cookieSemPermissao }
    });
    expect(panoramaFiscalSemPermissao.statusCode).toBe(403);

    const historico = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${produtoId}/historico-nomes?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    expect(historico.statusCode).toBe(200);
    expect(
      json<{ data: Array<{ nomeAnterior: string; nomeNovo: string; alteradoPor: string }> }>(historico).data
    ).toEqual([
      expect.objectContaining({
        nomeAnterior: "PRODUTO CRUD",
        nomeNovo: "PRODUTO CRUD RENOMEADO",
        alteradoPor: "Admin Integracao"
      })
    ]);

    const semAcesso = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${produtoId}/historico-nomes?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieSemPermissao }
    });
    expect(semAcesso.statusCode).toBe(403);

    const outraEmpresa = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${produtoId}/historico-nomes?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });
    expect(outraEmpresa.statusCode).toBe(404);
  });

  it("Deve_PersistirCamposComerciais_Quando_CriarProduto", async () => {
    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade Comercial", sigla: "cx" }
    });
    const unidadeId = json<{ data: { id: string } }>(unidade).data.id;
    // Embalagem e medida de compra sao siglas de unidade da loja: a copia da BASE as resolve por sigla.
    for (const [nome, sigla] of [
      ["Saco comercial", "SACO"],
      ["Quilo comercial", "KGC"]
    ] as const) {
      const extra = await contexto.app.inject({
        method: "POST",
        url: "/api/unidades-medida",
        headers: { cookie: cookieAdmin },
        payload: { empresaId: idsTeste.empresaA, nome, sigla }
      });
      expect(extra.statusCode, extra.body).toBe(201);
    }

    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      descricao: "Produto comercial integracao",
      unidadeIndividualId: unidadeId,
      quantidadeIndividual: 1,
      embalagem: "SACO",
      cDe: "DE",
      quantidadeCaixa: 30,
      medidaCompra: "KGC",
      custo: 84.9,
      margem: 0.7,
      precoVenda: 4.81,
      auto: true,
      status: "ativo",
      tipo: "revenda",
      quantidadeEstoque: 12,
      // Caixa de 30: minimo e maximo em embalagem fechada (regra do app oficial).
      estoqueMin: 30,
      estoqueMax: 60,
      setorEstoque: "LJ - CAIXAS",
      localVenda1: "PDV1",
      fotoUrl: "https://exemplo.test/foto.png",
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
      quantidade_estoque: string;
      estoque_min: string;
      setor_estoque: string;
      local_venda_1: string;
      foto_url: string;
    }>(
      "select codigo, codigo_interno, custo, margem, preco_venda, auto, status, tipo, embalagem, c_de, quantidade_caixa, medida_compra, quantidade_estoque, estoque_min, setor_estoque, local_venda_1, foto_url from produtos where id = $1",
      [produtoId]
    );
    expect(linha?.codigo).toMatch(/^PR-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(linha?.codigo_interno).toMatch(/^\d{5}$/);
    expect(linha).toMatchObject({
      setor_estoque: "LJ - CAIXAS",
      local_venda_1: "PDV1",
      foto_url: "https://exemplo.test/foto.png"
    });
    // O saldo informado por um cliente antigo/malicioso e ignorado. Somente movimentos auditados alteram estoque.
    expect(Number(linha?.quantidade_estoque)).toBe(0);
    expect(Number(linha?.estoque_min)).toBe(30);
    expect(linha).toMatchObject({
      auto: true,
      status: "ativo",
      tipo: "revenda",
      embalagem: "SACO",
      c_de: "DE",
      medida_compra: "KGC"
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

    const tentativaAlterarSaldo = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${produtoId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        descricao: "Produto comercial integracao",
        unidadeIndividualId: unidadeId,
        quantidadeIndividual: 1,
        quantidadeEstoque: 99,
        conversoes: []
      }
    });
    expect(tentativaAlterarSaldo.statusCode).toBe(204);
    const saldoAposEdicao = await consultarUm<{ quantidade_estoque: string }>(
      "select quantidade_estoque from produtos where id = $1",
      [produtoId]
    );
    expect(Number(saldoAposEdicao?.quantidade_estoque)).toBe(0);
  });

  it("Deve_PersistirTransformacao_Quando_TipoTransformacao", async () => {
    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade Transformacao", sigla: "g" }
    });
    const unidadeId = json<{ data: { id: string } }>(unidade).data.id;

    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      descricao: "Massa transformacao integracao",
      unidadeIndividualId: unidadeId,
      quantidadeIndividual: 1,
      tipo: "transformacao",
      transformacao: { precisao: "EXATOS", quantidade: 500, unidade: "G", produtoReceituario: "MASSA BASE" },
      conversoes: []
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
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      descricao: "Produto Duplicado Teste",
      unidadeIndividualId: unidadeId,
      quantidadeIndividual: 1,
      conversoes: []
    };

    const naBase = (payload: Record<string, unknown>) =>
      contexto.app.inject({ method: "POST", url: "/api/produtos/base", headers: { cookie: cookieAdmin }, payload });
    const importar = async (resposta: { json: () => unknown }) =>
      json<{ data: { estado: string } }>(
        await contexto.app.inject({
          method: "POST",
          url: `/api/produtos/catalogo-base/${json<{ data: { id: string } }>(resposta).data.id}/importar`,
          headers: { cookie: cookieAdmin },
          payload: { empresaId: idsTeste.empresaA }
        })
      ).data.estado;

    const primeiro = await naBase(base);
    expect(primeiro.statusCode, primeiro.body).toBe(201);
    expect(await importar(primeiro)).toBe("importado");

    assertProblem(await naBase(base), 409, "DUPLICATE_PRODUCT");

    // "Cadastrar mesmo assim" grava na BASE; a loja que ja tem o produto nao recebe a segunda copia
    // (oficial `importFromBase`: duplicado na loja e pulado).
    const forcado = await naBase({ ...base, forcar: true });
    expect(forcado.statusCode, forcado.body).toBe(201);
    expect(await importar(forcado)).toBe("ignorado");
  });

  // R1 (doc 56): o paralelo so confere nome/EAN repetido na CRIACAO. Na edicao a loja mexia so no preco de
  // um produto de nome repetido (ha 246 no catalogo) e caia em "Cadastrar mesmo assim".
  it("Deve_SalvarEdicao_Quando_NomeRepeteOutroProdutoDaLoja", async () => {
    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade R1", sigla: "ur" }
    });
    const unidadeId = json<{ data: { id: string } }>(unidade).data.id;
    const produto = (descricao: string) => ({
      empresaId: idsTeste.empresaA,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      descricao,
      unidadeIndividualId: unidadeId,
      quantidadeIndividual: 1,
      conversoes: []
    });

    const primeiro = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, produto("PRODUTO NOME R1 ORIGINAL"));
    expect(primeiro.statusCode, primeiro.body).toBe(201);
    const segundo = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, produto("PRODUTO NOME R1 OUTRO"));
    expect(segundo.statusCode, segundo.body).toBe(201);
    const segundoId = json<{ data: { id: string } }>(segundo).data.id;
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${segundoId}`,
      headers: { cookie: cookieAdmin }
    });
    const { codigo, codigoBarras } = json<{ data: { codigo: string | null; codigoBarras: string | null } }>(
      detalhe
    ).data;

    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${segundoId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        ...produto("PRODUTO NOME R1 ORIGINAL"),
        nomeCatalogo: "PRODUTO NOME R1 ORIGINAL",
        codigo,
        codigoBarras
      }
    });
    expect(editado.statusCode, editado.body).toBe(204);
  });

  it("Deve_Retornar403_Quando_CriarProdutoEmEmpresaNaoPermitida", async () => {
    const resposta = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaB,
      grupoMercadoriaId: idsTeste.grupoMercadoriaB,
      descricao: "Produto proibido",
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });
});

// Oficial: a loja so recebe produto pela BASE. A copia loja -> loja deixou de existir (R-222).
describe("produtos - sem copia entre lojas", () => {
  let contexto: ContextoApiTeste;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_NaoExistirImportarNemExportarProdutoEntreEmpresas", async () => {
    const importar = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/importar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });
    expect(importar.statusCode).toBe(404);
    const exportar = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/${idsTeste.produto}/exportar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });
    expect(exportar.statusCode).toBe(404);
  });
});
