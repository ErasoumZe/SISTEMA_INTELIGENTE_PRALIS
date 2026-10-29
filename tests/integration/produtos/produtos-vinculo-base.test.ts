import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

/**
 * Ligar os produtos da loja a BASE (passo da virada, R-222): pelo codigo interno, so o inequivoco, com
 * frase e hash da previa; barras que se contradizem ficam soltos.
 */
const FRASE = "LIGAR PRODUTOS A BASE";

describe("produtos - ligar produtos da loja a BASE", () => {
  let contexto: ContextoApiTeste;
  let cookie: string;
  const prefixos = new Map<string, string>();
  const ids: Record<string, string> = {};

  const base = async (idOrigem: string, nome: string, codigo: string, barras: string | null) =>
    (await consultarUm<{ id: string }>(
      `insert into produtos_catalogo_base (id_origem, nome, codigo_interno, codigo_barras, dados_oficiais)
         values ($1, $2, $3, $4, '{}'::jsonb) returning id`,
      [idOrigem, nome, codigo, barras]
    ))!.id;
  const produto = async (nome: string, codigo: string, barras: string | null) =>
    (await consultarUm<{ id: string }>(
      "insert into produtos (empresa_id, descricao, codigo_interno, codigo_barras) values ($1, $2, $3, $4) returning id",
      [idsTeste.empresaA, nome, codigo, barras]
    ))!.id;
  const baseDe = async (id: string) =>
    (await consultarUm<{ b: string | null }>("select produto_base_id as b from produtos where id = $1", [id]))?.b ??
    null;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookie = await cookieSessao(contexto.app, "multiempresa");
    for (const e of await consultarTodos<{ id: string; p: string }>(
      "select id, matricula_prefixo as p from empresas"
    )) {
      prefixos.set(e.id, e.p);
    }
    await executarSql("update empresas set matricula_prefixo = 'OUTRA' where id <> $1", [idsTeste.empresaA]);
    await executarSql("update empresas set matricula_prefixo = 'TNP' where id = $1", [idsTeste.empresaA]);
    ids["baseUm"] = await base("vinculo-um", "VINCULO PAO", "00951", "7891234500011");
    ids["baseDois"] = await base("vinculo-dois", "VINCULO BOLO", "00952", "7891234500028");
    ids["um"] = await produto("VINCULO PAO", "951", "07891234500011");
    ids["dois"] = await produto("VINCULO BOLO OUTRO", "00952", "7899999999999");
    ids["semBase"] = await produto("VINCULO SEM BASE", "00959", null);
  }, 180_000);

  afterAll(async () => {
    for (const [id, p] of prefixos)
      await executarSql("update empresas set matricula_prefixo = $2 where id = $1", [id, p]);
    await executarSql("delete from produtos where descricao like 'VINCULO %'");
    await executarSql("delete from produtos_catalogo_base where id_origem like 'vinculo-%'");
    await contexto.fechar();
  });

  it("Deve_LigarSoOInequivoco_ComFraseEHashDaPrevia", async () => {
    const previa = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/vinculo-base/previa?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });
    expect(previa.statusCode, previa.body).toBe(200);
    const dados = json<{
      data: {
        amostra: Array<{ produtoId: string }>;
        motivos: Record<string, number>;
        exemplosSemVinculo: Array<{ produtoId: string; motivo: string }>;
        hashPlano: string;
      };
    }>(previa).data;
    // "951" e "00951" sao o mesmo codigo; barras iguais sem zeros a esquerda.
    expect(dados.amostra.some((p) => p.produtoId === ids["um"])).toBe(true);
    expect(dados.exemplosSemVinculo.find((p) => p.produtoId === ids["dois"])?.motivo).toBe("barras-divergem");
    expect(dados.exemplosSemVinculo.find((p) => p.produtoId === ids["semBase"])?.motivo).toBe("sem-base");
    expect(await baseDe(ids["um"]!)).toBeNull();

    const aplicar = (confirmacao: string, hashPlano: string) =>
      contexto.app.inject({
        method: "POST",
        url: "/api/produtos/vinculo-base",
        headers: { cookie },
        payload: { empresaId: idsTeste.empresaA, confirmacao, hashPlano }
      });
    assertProblem(await aplicar("SIM", dados.hashPlano), 400, "CONFIRMACAO_INVALIDA");
    assertProblem(await aplicar(FRASE, "f".repeat(64)), 409, "PREVIA_DESATUALIZADA");
    const aplicado = await aplicar(FRASE, dados.hashPlano);
    expect(aplicado.statusCode, aplicado.body).toBe(200);
    expect(await baseDe(ids["um"]!)).toBe(ids["baseUm"]);
    expect(await baseDe(ids["dois"]!)).toBeNull();
    expect(await baseDe(ids["semBase"]!)).toBeNull();
  });

  // 29/10/2026 (fase A): os produtos que a integracao do PDV criou so tem `codigo` (o codigo do PDV:
  // EAN ou codigo interno, com zeros a esquerda). Eles passam a ligar pela BASE e a receber dela o
  // codigo interno, o codigo de barras e o nome — sem mexer em preco, grupo ou fiscal.
  it("Deve_LigarPeloCodigoDoPdv_ETrazerCodigosENomeDaBase", async () => {
    const doPdv = async (nome: string, codigo: string) =>
      (await consultarUm<{ id: string }>(
        "insert into produtos (empresa_id, descricao, codigo) values ($1, $2, $3) returning id",
        [idsTeste.empresaA, nome, codigo]
      ))!.id;
    const kapoBase = await base("vinculo-kapo", "VINCULO KAPO OFICIAL", "13995", "7894900573799");
    const boloBase = await base("vinculo-bolo-pdv", "VINCULO BOLO OFICIAL", "13996", "13996");
    await base("vinculo-dup", "VINCULO DUP OFICIAL", "13997", null);
    const ocupadaBase = await base("vinculo-ocupada", "VINCULO OCUPADA OFICIAL", "13998", "7891230000098");
    const outraBase = await base("vinculo-outra", "VINCULO OUTRA OFICIAL", "13999", null);
    const kapo = await doPdv("VINCULO KAPO MARAC UN", "07894900573799");
    const bolo = await doPdv("VINCULO BOLO UN", "00000000013996");
    const dupA = await doPdv("VINCULO DUP A", "13997");
    const dupB = await doPdv("VINCULO DUP B", "00000000013997");
    const ocupa = await doPdv("VINCULO OCUPA PDV", "7891230000098");
    // Outro produto da loja, ja ligado, segura o codigo interno 13998 (unico por loja no banco).
    await executarSql(
      "insert into produtos (empresa_id, descricao, codigo_interno, produto_base_id) values ($1, $2, '13998', $3)",
      [idsTeste.empresaA, "VINCULO JA TEM 13998", outraBase]
    );

    const previa = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/vinculo-base/previa?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });
    expect(previa.statusCode, previa.body).toBe(200);
    const dados = json<{
      data: {
        amostra: Array<{ produtoId: string; codigoInterno: string | null; codigoBarras: string | null }>;
        exemplosSemVinculo: Array<{ produtoId: string; motivo: string }>;
        hashPlano: string;
      };
    }>(previa).data;
    const motivo = (id: string) => dados.exemplosSemVinculo.find((p) => p.produtoId === id)?.motivo;
    expect(dados.amostra.find((p) => p.produtoId === kapo)).toMatchObject({
      codigoInterno: "13995",
      codigoBarras: "7894900573799"
    });
    expect(dados.amostra.some((p) => p.produtoId === bolo)).toBe(true);
    expect(motivo(dupA)).toBe("codigo-disputado");
    expect(motivo(dupB)).toBe("codigo-disputado");
    expect(motivo(ocupa)).toBe("codigo-ocupado");

    const aplicado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/vinculo-base",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, confirmacao: FRASE, hashPlano: dados.hashPlano }
    });
    expect(aplicado.statusCode, aplicado.body).toBe(200);
    const linha = (id: string) =>
      consultarUm<{
        b: string | null;
        ci: string | null;
        cb: string | null;
        nome: string | null;
        descricao: string;
        codigo: string | null;
      }>(
        `select produto_base_id as b, codigo_interno as ci, codigo_barras as cb, nome_catalogo as nome, descricao, codigo
           from produtos where id = $1`,
        [id]
      );
    expect(await linha(kapo)).toEqual({
      b: kapoBase,
      ci: "13995",
      cb: "7894900573799",
      nome: "VINCULO KAPO OFICIAL",
      // O que veio do PDV fica como estava: a venda continua achando o produto pelo vinculo salvo.
      descricao: "VINCULO KAPO MARAC UN",
      codigo: "07894900573799"
    });
    expect((await linha(bolo))?.b).toBe(boloBase);
    expect((await linha(dupA))?.b).toBeNull();
    expect((await linha(dupB))?.b).toBeNull();
    expect((await linha(ocupa))?.b).toBeNull();
    expect(ocupadaBase).toBeTruthy();
  });
});
