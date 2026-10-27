import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("Central de produtos integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
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
      [cargaId, JSON.stringify({ id: "base-1", nome: "CAFÉ", ncm: null, cst_pis_cofins: "" })]
    );

    const validada = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/central/cargas/${cargaId}/validar`,
      headers: { cookie: cookieAdmin }
    });
    expect(validada.statusCode, validada.body).toBe(200);
    expect(json<{ data: { linhas: number; grupos: number } }>(validada).data).toMatchObject({ linhas: 2, grupos: 2 });

    const previaComBase = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/central/cargas/${cargaId}/catalogo-base/previa`,
      headers: { cookie: cookieAdmin }
    });
    expect(previaComBase.statusCode, previaComBase.body).toBe(200);
    expect(
      json<{
        data: { total: number; novos: number; semNcm: number; semCst: number; amostra: Array<{ acao: string }> };
      }>(previaComBase).data
    ).toMatchObject({
      total: 1,
      novos: 1,
      semNcm: 1,
      semCst: 1,
      amostra: [{ acao: "incluir" }]
    });
    const baseSemEscrita = await consultarUm<{ total: number }>(
      "select count(*)::int as total from produtos_catalogo_base"
    );
    expect(baseSemEscrita?.total).toBe(0);

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
    expect(depois?.total).toBe(antes?.total);
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
    expect(json<{ data: { itens: unknown[]; total: number } }>(catalogoBase).data).toMatchObject({
      itens: [],
      total: 0
    });

    const semPermissao = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/catalogo-base",
      headers: { cookie: cookieCaixa }
    });
    expect(semPermissao.statusCode).toBe(403);
  });
});
