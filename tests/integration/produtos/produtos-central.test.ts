import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { consultarUm, json } from "../../setup/integracao.js";

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

    const validada = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/central/cargas/${cargaId}/validar`,
      headers: { cookie: cookieAdmin }
    });
    expect(validada.statusCode, validada.body).toBe(200);
    expect(json<{ data: { linhas: number; grupos: number } }>(validada).data).toMatchObject({ linhas: 2, grupos: 2 });

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
  });
});
