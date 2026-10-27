import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("Central de produtos integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  // A copia BASE->loja mira a empresaB: so o usuario multiempresa tem acesso as duas empresas.
  let cookieMultiempresa: string;
  let cookieCaixa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  function arquivoCsv(nome: string, conteudo: string) {
    const boundary = `----central-produtos-${randomUUID()}`;
    const corpo = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="${nome}"\r\n` +
        "Content-Type: text/csv; charset=utf-8\r\n\r\n" +
        `${conteudo}\r\n--${boundary}--\r\n`,
      "utf8"
    );
    return { boundary, corpo };
  }

  it("Deve_ValidarFontesEPaginarGrupos_SemEscreverNoCatalogo", async () => {
    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade Colisão Central", sigla: "ucc" }
    });
    expect(unidade.statusCode, unidade.body).toBe(201);
    const unidadeId = json<{ data: { id: string } }>(unidade).data.id;
    const unidadeDestino = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaId: idsTeste.empresaB, nome: "Grama BASE import", sigla: "g" }
    });
    expect(unidadeDestino.statusCode, unidadeDestino.body).toBe(201);
    const produtoComEanEquivalente = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        codigo: "PROD-CENTRAL-EAN",
        codigoBarras: "789123",
        descricao: "Colisão de EAN com zero à esquerda",
        nomeCatalogo: "Colisão EAN Central",
        unidadeIndividualId: unidadeId,
        quantidadeIndividual: 1,
        conversoes: []
      }
    });
    expect(produtoComEanEquivalente.statusCode, produtoComEanEquivalente.body).toBe(201);
    const antes = await consultarUm<{ total: number }>("select count(*)::int as total from produtos");
    const criada = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/central/cargas",
      headers: { cookie: cookieAdmin }
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const cargaId = json<{ data: { id: string } }>(criada).data.id;

    const { boundary, corpo } = arquivoCsv(
      "compilart.csv",
      "COD_INTERNO;COD_BARRAS;NOME;CUSTO;VENDA;ATIVO\n100;000789123;CAFÉ;2,50;4,00;Sim\n101;789124;BOLO;3,00;5,00;Sim"
    );
    const anexada = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/central/cargas/${cargaId}/fontes?fonte=compilart_tnp`,
      headers: { cookie: cookieAdmin, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: corpo
    });
    expect(anexada.statusCode, anexada.body).toBe(200);
    expect(json<{ data: { linhas: number } }>(anexada).data.linhas).toBe(2);

    const repetida = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/central/cargas/${cargaId}/fontes?fonte=compilart_tnp`,
      headers: { cookie: cookieAdmin, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: corpo
    });
    expect(repetida.statusCode).toBe(409);

    await executarSql(
      `insert into produtos_central_fontes
         (carga_id, fonte, loja_fonte, chave_linha_fonte, id_sistema, codigo_interno, codigo_barras,
          chave_barras, nome, nome_normalizado, ativo, dados_originais)
       values ($1, 'pralis', 'BASE', 'pralis:base-1', 'base-1', '00131', '000789123',
               '789123', 'CAFÉ', 'cafe', true, $2::jsonb)`,
      [
        cargaId,
        JSON.stringify({
          id: "base-1",
          nome: "CAFÉ",
          quantidade: "500",
          medida_base: "g",
          tipo: "revenda",
          status: "ativo",
          ncm: "12345678",
          aliquota_pis: "1.6500",
          cst_pis_cofins: "01"
        })
      ]
    );

    const validada = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/central/cargas/${cargaId}/validar`,
      headers: { cookie: cookieAdmin }
    });
    expect(validada.statusCode, validada.body).toBe(200);
    // 2 linhas do Compilart + 1 do Pralis; o CAFE das duas fontes cai no mesmo grupo pelo codigo de barras.
    expect(json<{ data: { linhas: number; grupos: number } }>(validada).data).toMatchObject({ linhas: 3, grupos: 2 });

    const previaComBase = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/central/cargas/${cargaId}/catalogo-base/previa`,
      headers: { cookie: cookieAdmin }
    });
    expect(previaComBase.statusCode, previaComBase.body).toBe(200);
    expect(
      json<{
        data: {
          total: number;
          novos: number;
          semNcm: number;
          semCst: number;
          eansEmProdutos: number;
          amostra: Array<{ acao: string; conflitoEan: boolean }>;
        };
      }>(previaComBase).data
    ).toMatchObject({
      total: 1,
      novos: 1,
      // A linha do Pralis traz NCM e CST (o fiscal copiado e conferido mais abaixo): nada fica sem fiscal.
      semNcm: 0,
      semCst: 0,
      eansEmProdutos: 1,
      amostra: [{ acao: "incluir", conflitoEan: true }]
    });
    const baseSemEscrita = await consultarUm<{ total: number }>(
      "select count(*)::int as total from produtos_catalogo_base"
    );
    expect(baseSemEscrita?.total).toBe(0);

    const importacaoBase = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/central/cargas/${cargaId}/catalogo-base/importar`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });
    expect(importacaoBase.statusCode, importacaoBase.body).toBe(200);
    expect(json<{ data: { total: number; novos: number; atualizados: number } }>(importacaoBase).data).toEqual({
      estado: "ok",
      total: 1,
      novos: 1,
      atualizados: 0
    });
    const baseImportada = await consultarUm<{
      id_origem: string;
      nome: string;
      codigo_interno: string;
      dados_oficiais: { ncm: string | null };
    }>("select id_origem, nome, codigo_interno, dados_oficiais from produtos_catalogo_base where id_origem = 'base-1'");
    expect(baseImportada).toMatchObject({
      id_origem: "base-1",
      nome: "CAFÉ",
      codigo_interno: "00131",
      // Fiscal literal (R-222): o NCM da fonte vai como veio.
      dados_oficiais: { ncm: "12345678" }
    });
    const reimportacaoBase = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/central/cargas/${cargaId}/catalogo-base/importar`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });
    expect(json<{ data: { total: number; novos: number; atualizados: number } }>(reimportacaoBase).data).toEqual({
      estado: "ok",
      total: 1,
      novos: 0,
      atualizados: 0
    });

    const baseId = await consultarUm<{ id: string }>(
      "select id from produtos_catalogo_base where id_origem = 'base-1'"
    );
    expect(baseId?.id).toBeTruthy();
    const copiaBase = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/catalogo-base/${baseId!.id}/importar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaId: idsTeste.empresaB }
    });
    expect(copiaBase.statusCode, copiaBase.body).toBe(200);
    expect(json<{ data: { estado: string; produtoId: string } }>(copiaBase).data.estado).toBe("importado");
    const produtoCopiado = await consultarUm<{
      codigo_interno: string;
      quantidade_estoque: string;
      quantidade_individual: string;
      produto_base_id: string;
    }>(
      "select codigo_interno, quantidade_estoque, quantidade_individual, produto_base_id from produtos where produto_base_id = $1 and empresa_id = $2",
      [baseId!.id, idsTeste.empresaB]
    );
    expect(produtoCopiado).toMatchObject({
      quantidade_estoque: "0.000",
      quantidade_individual: "500.000",
      produto_base_id: baseId!.id
    });
    expect(produtoCopiado?.codigo_interno).not.toBe("00131");
    const fiscalCopiado = await consultarUm<{ ncm: string; aliquota_pis: string; cst_pis_cofins: string }>(
      "select ncm, aliquota_pis, cst_pis_cofins from produtos_fiscal where produto_id = (select id from produtos where produto_base_id = $1 and empresa_id = $2)",
      [baseId!.id, idsTeste.empresaB]
    );
    expect(fiscalCopiado).toMatchObject({ ncm: "12345678", aliquota_pis: "1.6500", cst_pis_cofins: "01" });

    const copiaRepetida = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/catalogo-base/${baseId!.id}/importar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaId: idsTeste.empresaB }
    });
    expect(json<{ data: { estado: string } }>(copiaRepetida).data.estado).toBe("ja_importado");

    await executarSql(
      `insert into produtos_catalogo_base (id_origem, nome, status, dados_oficiais)
       values ('base-com-foto', 'PRODUTO COM FOTO', 'ativo', $1::jsonb)`,
      [
        JSON.stringify({
          quantidade: "1",
          medida_base: "un",
          status: "ativo",
          tipo: "revenda",
          foto_url: "/storage/produtos/origem.jpg"
        })
      ]
    );
    const produtoBaseComFoto = await consultarUm<{ id: string }>(
      "select id from produtos_catalogo_base where id_origem = 'base-com-foto'"
    );
    const copiaComFoto = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/catalogo-base/${produtoBaseComFoto!.id}/importar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaId: idsTeste.empresaB }
    });
    expect(copiaComFoto.statusCode).toBe(422);
    expect(copiaComFoto.body).toContain("transfira o arquivo para o storage do ERP");

    const copiaEmLote = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/catalogo-base/importar",
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaB,
        produtoBaseIds: [baseId!.id, baseId!.id, "00000000-0000-4000-8000-000000000001"]
      }
    });
    expect(copiaEmLote.statusCode, copiaEmLote.body).toBe(200);
    expect(json<{ data: Record<string, unknown> }>(copiaEmLote).data).toMatchObject({
      total: 2,
      importados: 0,
      jaImportados: 1,
      ignorados: 0,
      bloqueados: 0,
      naoEncontrados: 1,
      erros: 0
    });

    const pagina = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/central/cargas/${cargaId}/grupos?page=1&pageSize=1`,
      headers: { cookie: cookieAdmin }
    });
    expect(pagina.statusCode, pagina.body).toBe(200);
    const gruposDaPagina = json<{ data: { grupos: Array<{ id: string }>; total: number; page: number } }>(pagina).data;
    expect(gruposDaPagina).toMatchObject({
      total: 2,
      page: 1
    });
    expect(gruposDaPagina.grupos).toHaveLength(1);

    const decisao = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/central/cargas/${cargaId}/grupos/${gruposDaPagina.grupos[0]!.id}/decisao`,
      headers: { cookie: cookieAdmin },
      payload: { acao: "ignorado", observacao: "Registro de teste auditável" }
    });
    expect(decisao.statusCode, decisao.body).toBe(201);
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/central/cargas/${cargaId}/grupos/${gruposDaPagina.grupos[0]!.id}`,
      headers: { cookie: cookieAdmin }
    });
    expect(json<{ data: { decisao: { acao: string; usuarioNome: string } } }>(detalhe).data.decisao).toMatchObject({
      acao: "ignorado",
      usuarioNome: "Admin Integracao"
    });

    const decisaoRepetida = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/central/cargas/${cargaId}/grupos/${gruposDaPagina.grupos[0]!.id}/decisao`,
      headers: { cookie: cookieAdmin },
      payload: { acao: "nao_e_o_mesmo" }
    });
    expect(decisaoRepetida.statusCode, decisaoRepetida.body).toBe(409);

    const depois = await consultarUm<{ total: number }>("select count(*)::int as total from produtos");
    // A Central (carga, validacao, previa, decisao) nao grava produto; a unica gravacao e a copia BASE->loja
    // pedida explicitamente acima (1 produto na empresaB; a repetida e a em lote nao criam outro).
    expect(depois?.total).toBe((antes?.total ?? 0) + 1);
  }, 60_000);

  it("Deve_RestringirAcesso_AdminDaCentral", async () => {
    const anonima = await contexto.app.inject({ method: "GET", url: "/api/produtos/central/cargas" });
    expect(anonima.statusCode).toBe(401);

    const semPapelAdmin = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/central/cargas",
      headers: { cookie: cookieCaixa }
    });
    expect(semPapelAdmin.statusCode).toBe(403);

    const catalogoBase = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/catalogo-base?page=1&pageSize=10",
      headers: { cookie: cookieAdmin }
    });
    expect(catalogoBase.statusCode, catalogoBase.body).toBe(200);
    // Este caso prova o ACESSO; o conteudo depende do caso anterior, que importa para a BASE.
    const listagem = json<{ data: { itens: unknown[]; total: number } }>(catalogoBase).data;
    expect(Array.isArray(listagem.itens)).toBe(true);
    expect(typeof listagem.total).toBe("number");

    const semPermissao = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/catalogo-base",
      headers: { cookie: cookieCaixa }
    });
    expect(semPermissao.statusCode).toBe(403);
  });
});
