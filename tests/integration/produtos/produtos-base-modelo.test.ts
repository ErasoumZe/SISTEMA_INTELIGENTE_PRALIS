import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

type RespostaId = { data: { id: string } };

/**
 * Modelo BASE igual ao app oficial (R-222): produto novo so o admin cria, sempre na BASE; a loja
 * recebe a copia por importacao; a edicao da BASE desce campo a campo para quem ainda segue.
 */
describe("produtos - modelo BASE (igual ao app oficial)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieGerente: string;
  let gerenteId = "";
  let regrasOriginaisGerente = "{}";
  const referencia: Record<string, { unidade: string; grupo: string }> = {};
  const basesCriadas: string[] = [];

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    // Administrador com as DUAS lojas (o "admin" do seed so tem a loja A).
    cookieAdmin = await cookieSessao(contexto.app, "multiempresa");
    // Mesma sigla e mesmo grupo nas duas lojas: e assim que a copia casa unidade e grupo pelo nome.
    for (const empresaId of [idsTeste.empresaA, idsTeste.empresaB]) {
      const unidade = await contexto.app.inject({
        method: "POST",
        url: "/api/unidades-medida",
        headers: { cookie: cookieAdmin },
        payload: { empresaId, nome: "Pacote base", sigla: "pctb" }
      });
      expect(unidade.statusCode, unidade.body).toBe(201);
      const grupo = await contexto.app.inject({
        method: "POST",
        url: "/api/grupos-mercadorias",
        headers: { cookie: cookieAdmin },
        payload: { empresaId, tipoGrupo: "mercadoria", nome: "MER BASE TESTE" }
      });
      expect(grupo.statusCode, grupo.body).toBe(201);
      referencia[empresaId] = { unidade: json<RespostaId>(unidade).data.id, grupo: json<RespostaId>(grupo).data.id };
    }
    const gerente = await consultarUm<{ id: string; regras: object }>(
      `select u.id, p.regras from "user" u join permissoes_usuarios p on p.usuario_id = u.id where u.email = $1`,
      ["gerente.integracao@padaria.local"]
    );
    gerenteId = gerente?.id ?? "";
    regrasOriginaisGerente = JSON.stringify(gerente?.regras ?? {});
    // O gerente TEM a permissao de produto: quem barra e a regra do modelo BASE, nao a guarda de rota.
    await executarSql(
      `update permissoes_usuarios set regras = regras || '{"cadastro_produtos_visualizar":true,"cadastro_produtos_criar":true,"cadastro_produtos_editar":true}'::jsonb where usuario_id = $1`,
      [gerenteId]
    );
    cookieGerente = await cookieSessao(contexto.app, "gerente");
  }, 180_000);

  afterAll(async () => {
    if (gerenteId) {
      await executarSql("update permissoes_usuarios set regras = $2::jsonb where usuario_id = $1", [
        gerenteId,
        regrasOriginaisGerente
      ]);
    }
    await executarSql("delete from produtos where produto_base_id = any($1::uuid[])", [basesCriadas]);
    await executarSql("delete from produtos_catalogo_base where id = any($1::uuid[])", [basesCriadas]);
    await executarSql("delete from unidades_medida where sigla = 'pctb'");
    await executarSql("delete from grupos_mercadorias where nome = 'MER BASE TESTE'");
    await contexto.fechar();
  });

  const payloadBase = (extra: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    grupoMercadoriaId: referencia[idsTeste.empresaA]!.grupo,
    unidadeIndividualId: referencia[idsTeste.empresaA]!.unidade,
    descricao: "BISCOITO BASE 200 PCTB",
    nomeCatalogo: "BISCOITO BASE",
    quantidadeIndividual: 200,
    marca: "MARCA A",
    conversoes: [],
    ...extra
  });

  async function criarNaBase(extra: Record<string, unknown> = {}) {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/base",
      headers: { cookie: cookieAdmin },
      payload: payloadBase(extra)
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const id = json<RespostaId>(criado).data.id;
    basesCriadas.push(id);
    return id;
  }

  async function importar(produtoBaseId: string, empresaId: string) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/catalogo-base/${produtoBaseId}/importar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const dados = json<{ data: { estado: string; produtoId: string } }>(resposta).data;
    expect(dados.estado, resposta.body).toBe("importado");
    return dados.produtoId;
  }

  it("Deve_CriarNaBase_ComCodigoInterno_EAN_DoCodigo_E_FiscalPeloGrupo", async () => {
    const id = await criarNaBase({ nomeCatalogo: "biscoito minusculo", descricao: "biscoito minusculo" });
    const linha = await consultarUm<{
      codigo_interno: string;
      codigo_barras: string;
      nome: string;
      dados_oficiais: Record<string, string | number | null>;
    }>("select codigo_interno, codigo_barras, nome, dados_oficiais from produtos_catalogo_base where id = $1", [id]);
    expect(linha?.codigo_interno).toMatch(/^\d{5,6}$/u);
    // EAN vazio recebe o proprio codigo interno; texto em maiusculas (oficial).
    expect(linha?.codigo_barras).toBe(linha?.codigo_interno);
    expect(linha?.nome).toBe("BISCOITO MINUSCULO");
    expect(linha?.dados_oficiais).toMatchObject({
      grupo: "MER BASE TESTE",
      medida_base: "pctb",
      marca: "MARCA A",
      pesavel: "N",
      area_venda: null,
      promocoes: [],
      // Sem planilha no teste: a tentativa fica registrada, o cadastro nao cai.
      estado_fiscal: "fonte_indisponivel"
    });
  });

  it("Deve_RecusarCadastroNovo_De_QuemNaoEAdministrador", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/base",
      headers: { cookie: cookieGerente },
      payload: payloadBase({ nomeCatalogo: "GERENTE NAO CRIA", descricao: "GERENTE NAO CRIA" })
    });
    assertProblem(resposta, 403, "ONLY_ADMIN_CREATE");
  });

  it("Deve_NaoExistirMaisCadastroDiretoNaLoja", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: payloadBase({ nomeCatalogo: "DIRETO NA LOJA", descricao: "DIRETO NA LOJA" })
    });
    expect(resposta.statusCode).toBe(404);
  });

  it("Deve_RecusarAreaDeVendaNaBase_E_DuplicadoSemConfirmacao", async () => {
    const comArea = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/base",
      headers: { cookie: cookieAdmin },
      payload: payloadBase({ nomeCatalogo: "COM AREA", descricao: "COM AREA", areaVenda: "vitrine" })
    });
    assertProblem(comArea, 422, "AREA_STORE_MISMATCH");

    await criarNaBase({ nomeCatalogo: "REPETIDO NA BASE", descricao: "REPETIDO NA BASE" });
    const repetido = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/base",
      headers: { cookie: cookieAdmin },
      payload: payloadBase({ nomeCatalogo: "repetido na base", descricao: "repetido na base" })
    });
    assertProblem(repetido, 409, "DUPLICATE_PRODUCT");
    // "Cadastrar mesmo assim" passa por cima (oficial `forcar`).
    await criarNaBase({ nomeCatalogo: "REPETIDO NA BASE", descricao: "REPETIDO NA BASE", forcar: true });
  });

  it("Deve_ImportarCopia_ComMesmoCodigoInterno_E_DescricaoComGramatura", async () => {
    const baseId = await criarNaBase({ nomeCatalogo: "BOLACHA COPIA", descricao: "BOLACHA COPIA", marca: "M" });
    const copiaId = await importar(baseId, idsTeste.empresaA);
    const base = await consultarUm<{ codigo_interno: string }>(
      "select codigo_interno from produtos_catalogo_base where id = $1",
      [baseId]
    );
    const copia = await consultarUm<{ codigo_interno: string; descricao: string; nome_catalogo: string }>(
      "select codigo_interno, descricao, nome_catalogo from produtos where id = $1",
      [copiaId]
    );
    expect(copia).toMatchObject({
      codigo_interno: base?.codigo_interno,
      nome_catalogo: "BOLACHA COPIA",
      // Oficial: descricao = nome + quantidade + medida.
      descricao: "BOLACHA COPIA 200 PCTB"
    });
  });

  it("Deve_PropagarEdicaoDaBase_SoNosCamposQueALojaSegue", async () => {
    const baseId = await criarNaBase({ nomeCatalogo: "WAFER HERANCA", descricao: "WAFER HERANCA" });
    const copiaA = await importar(baseId, idsTeste.empresaA);
    const copiaB = await importar(baseId, idsTeste.empresaB);
    // A loja B escolheu a propria marca: deixou de seguir a BASE nesse campo.
    await executarSql("update produtos set marca = 'MARCA PROPRIA' where id = $1", [copiaB]);

    const edicao = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/base/${baseId}`,
      headers: { cookie: cookieAdmin },
      payload: payloadBase({ nomeCatalogo: "WAFER HERANCA NOVO", descricao: "WAFER HERANCA NOVO", marca: "MARCA B" })
    });
    expect(edicao.statusCode, edicao.body).toBe(200);
    expect(json<{ data: { lojasAtualizadas: number } }>(edicao).data.lojasAtualizadas).toBe(2);

    const linhaA = await consultarUm<{ marca: string; nome_catalogo: string; descricao: string }>(
      "select marca, nome_catalogo, descricao from produtos where id = $1",
      [copiaA]
    );
    const linhaB = await consultarUm<{ marca: string; nome_catalogo: string }>(
      "select marca, nome_catalogo from produtos where id = $1",
      [copiaB]
    );
    expect(linhaA).toEqual({
      marca: "MARCA B",
      nome_catalogo: "WAFER HERANCA NOVO",
      descricao: "WAFER HERANCA NOVO 200 PCTB"
    });
    expect(linhaB).toEqual({ marca: "MARCA PROPRIA", nome_catalogo: "WAFER HERANCA NOVO" });

    // O selo de heranca da tela: a copia B nao segue mais a marca da BASE.
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${copiaB}`,
      headers: { cookie: cookieAdmin }
    });
    expect(detalhe.statusCode, detalhe.body).toBe(200);
    const heranca = json<{
      data: { produtoBaseId: string; heranca: { naoSeguem: string[]; base: { marca: string } } };
    }>(detalhe).data;
    expect(heranca.produtoBaseId).toBe(baseId);
    expect(heranca.heranca.naoSeguem).toEqual(["Marca"]);
    expect(heranca.heranca.base.marca).toBe("MARCA B");
  });

  it("Deve_SoAdministradorEditarABase_E_DevolverODetalheNoFormatoDoFormulario", async () => {
    const baseId = await criarNaBase({ nomeCatalogo: "ROSQUINHA DETALHE", descricao: "ROSQUINHA DETALHE" });
    const gerente = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/base/${baseId}`,
      headers: { cookie: cookieGerente },
      payload: payloadBase({ nomeCatalogo: "ROSQUINHA DETALHE", descricao: "ROSQUINHA DETALHE", marca: "X" })
    });
    assertProblem(gerente, 403, "FORBIDDEN");

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/base/${baseId}?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    expect(detalhe.statusCode, detalhe.body).toBe(200);
    expect(json<{ data: Record<string, string | null> }>(detalhe).data).toMatchObject({
      id: baseId,
      loja: "BASE",
      nomeCatalogo: "ROSQUINHA DETALHE",
      unidadeIndividualId: referencia[idsTeste.empresaA]!.unidade,
      grupoMercadoriaId: referencia[idsTeste.empresaA]!.grupo,
      marca: "MARCA A"
    });
  });
  it("Deve_GuardarAFotoNaBase_E_ACopiaQueSegueRecebeAMesma", async () => {
    const limite = "----limitefotobase";
    const png = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex");
    const corpo = Buffer.concat([
      Buffer.from(
        `--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="foto.png"\r\nContent-Type: image/png\r\n\r\n`,
        "utf8"
      ),
      png,
      Buffer.from(`\r\n--${limite}--\r\n`, "utf8")
    ]);
    const enviar = (baseId: string, cookie: string) =>
      contexto.app.inject({
        method: "POST",
        url: `/api/produtos/base/${baseId}/foto`,
        headers: { cookie, "content-type": `multipart/form-data; boundary=${limite}` },
        payload: corpo
      });

    const baseId = await criarNaBase({ nomeCatalogo: "BOLO FOTO BASE", descricao: "BOLO FOTO BASE" });
    const copia = await importar(baseId, idsTeste.empresaA);

    assertProblem(await enviar(baseId, cookieGerente), 403, "FORBIDDEN");

    const enviada = await enviar(baseId, cookieAdmin);
    expect(enviada.statusCode, enviada.body).toBe(201);
    const { fotoUrl, lojasAtualizadas } = json<{ data: { fotoUrl: string; lojasAtualizadas: number } }>(enviada).data;
    // Pasta da BASE no storage do ERP: e o caminho que a loja herda.
    expect(fotoUrl).toMatch(new RegExp(`^produtos-base/${baseId}/[0-9a-f-]{36}\\.png$`));
    expect(lojasAtualizadas).toBe(1);
    const linha = await consultarUm<{ foto_url: string }>("select foto_url from produtos where id = $1", [copia]);
    expect(linha?.foto_url).toBe(fotoUrl);

    const daBase = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/base/${baseId}/foto`,
      headers: { cookie: cookieAdmin }
    });
    expect(daBase.statusCode).toBe(200);
    const daLoja = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${copia}/foto`,
      headers: { cookie: cookieAdmin }
    });
    expect(daLoja.statusCode).toBe(200);
  });
});
