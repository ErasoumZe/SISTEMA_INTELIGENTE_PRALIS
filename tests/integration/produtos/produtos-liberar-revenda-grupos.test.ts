import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, executarSql, json } from "../../setup/integracao.js";

/**
 * Decisões do José (13/11/2026, igual ao S2):
 * - "Liberar a revenda para compra": prévia + frase + hash; só revenda ATIVA; transformação e inativo ficam fora;
 * - inativar desliga a liberação;
 * - o filtro de grupo da lista aceita vários grupos (o Grupo inteiro = todos os subgrupos).
 */
const FRASE = "LIBERAR REVENDA PARA COMPRA";
const PREFIXO = "LIBREV13 ";

type Previa = { data: { total: number; amostra: Array<{ descricao: string }>; hashPlano: string } };

describe("produtos - liberar revenda para compra e grupo/subgrupo (13/11/2026)", () => {
  let contexto: ContextoApiTeste;
  let cookie: string;
  const prefixos = new Map<string, string>();
  const grupos: Record<string, string> = {};

  const previa = () =>
    contexto.app.inject({
      method: "GET",
      url: `/api/produtos/liberar-revenda/previa?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });
  const aplicar = (confirmacao: string, hashPlano: string) =>
    contexto.app.inject({
      method: "POST",
      url: "/api/produtos/liberar-revenda",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, confirmacao, hashPlano }
    });
  const liberacao = async () =>
    Object.fromEntries(
      (
        await consultarTodos<{ descricao: string; liberado_compra: boolean }>(
          "select descricao, liberado_compra from produtos where empresa_id = $1 and descricao like $2",
          [idsTeste.empresaA, `${PREFIXO}%`]
        )
      ).map((linha) => [linha.descricao.replace(PREFIXO, ""), linha.liberado_compra])
    );

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookie = await cookieSessao(contexto.app, "multiempresa");
    for (const e of await consultarTodos<{ id: string; p: string }>(
      "select id, matricula_prefixo as p from empresas"
    )) {
      prefixos.set(e.id, e.p);
    }
    await executarSql("update empresas set matricula_prefixo = 'TNP' where id = $1", [idsTeste.empresaA]);
    // Revenda ativa já liberada fora da conta da prévia: a base de testes pode trazer outros produtos da empresa.
    await executarSql(
      "update produtos set liberado_compra = true where empresa_id = $1 and status = 'ativo' and tipo = 'revenda'",
      [idsTeste.empresaA]
    );
    for (const nome of ["MER LIBREV BEBIDAS - SUCOS", "MER LIBREV BEBIDAS - ÁGUAS", "MER LIBREV CIGARROS - PALHA"]) {
      const [linha] = await consultarTodos<{ id: string }>(
        "insert into grupos_mercadorias (empresa_id, nome) values ($1, $2) returning id",
        [idsTeste.empresaA, nome]
      );
      grupos[nome] = linha!.id;
    }
    await executarSql(
      `insert into produtos (empresa_id, descricao, tipo, status, liberado_compra, grupo_mercadoria_id) values
         ($1, $2 || 'REVENDA A', 'revenda', 'ativo', false, $3),
         ($1, $2 || 'REVENDA B', 'revenda', 'ativo', false, $4),
         ($1, $2 || 'TRANSFORMACAO', 'transformacao', 'ativo', false, $3),
         ($1, $2 || 'REVENDA INATIVA', 'revenda', 'inativo', false, $5),
         ($1, $2 || 'JA LIBERADA', 'revenda', 'ativo', true, $5)`,
      [
        idsTeste.empresaA,
        PREFIXO,
        grupos["MER LIBREV BEBIDAS - SUCOS"],
        grupos["MER LIBREV BEBIDAS - ÁGUAS"],
        grupos["MER LIBREV CIGARROS - PALHA"]
      ]
    );
  }, 180_000);

  afterAll(async () => {
    await executarSql("delete from produtos where empresa_id = $1 and descricao like $2", [
      idsTeste.empresaA,
      `${PREFIXO}%`
    ]);
    await executarSql("delete from grupos_mercadorias where empresa_id = $1 and nome like 'MER LIBREV %'", [
      idsTeste.empresaA
    ]);
    for (const [id, p] of prefixos)
      await executarSql("update empresas set matricula_prefixo = $2 where id = $1", [id, p]);
    await contexto.fechar();
  });

  it("Deve_FiltrarPorVariosGrupos_QuandoEscolheSoOGrupo", async () => {
    const ids = [grupos["MER LIBREV BEBIDAS - SUCOS"], grupos["MER LIBREV BEBIDAS - ÁGUAS"]].join(",");
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos?empresaId=${idsTeste.empresaA}&status=ativo&pageSize=100&grupoMercadoriaId=${ids}`,
      headers: { cookie }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const nomes = json<{ data: Array<{ descricao: string }> }>(resposta)
      .data.map((p) => p.descricao.replace(PREFIXO, ""))
      .sort();
    expect(nomes).toEqual(["REVENDA A", "REVENDA B", "TRANSFORMACAO"]);

    const invalido = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos?empresaId=${idsTeste.empresaA}&grupoMercadoriaId=${ids},nao-e-uuid`,
      headers: { cookie }
    });
    expect(invalido.statusCode).toBe(400);
  });

  it("Deve_LiberarSoARevendaAtiva_ComFraseEHash", async () => {
    const antes = await previa();
    expect(antes.statusCode, antes.body).toBe(200);
    const plano = json<Previa>(antes).data;
    expect(plano.total).toBe(2);
    expect(plano.amostra.map((p) => p.descricao.replace(PREFIXO, ""))).toEqual(["REVENDA A", "REVENDA B"]);

    assertProblem(await aplicar("SIM", plano.hashPlano), 400, "CONFIRMACAO_INVALIDA");
    assertProblem(await aplicar(FRASE, "f".repeat(64)), 409, "PREVIA_DESATUALIZADA");
    const aplicado = await aplicar(FRASE, plano.hashPlano);
    expect(aplicado.statusCode, aplicado.body).toBe(200);
    expect(json<{ data: { liberados: number } }>(aplicado).data.liberados).toBe(2);

    expect(await liberacao()).toEqual({
      "REVENDA A": true,
      "REVENDA B": true,
      TRANSFORMACAO: false,
      "REVENDA INATIVA": false,
      "JA LIBERADA": true
    });
    expect(json<Previa>(await previa()).data.total).toBe(0);
  });

  it("Deve_DesligarALiberacao_AoInativar", async () => {
    const [produto] = await consultarTodos<{ id: string }>(
      "select id from produtos where empresa_id = $1 and descricao = $2",
      [idsTeste.empresaA, `${PREFIXO}JA LIBERADA`]
    );
    const resposta = await contexto.app.inject({
      method: "PATCH",
      url: "/api/produtos/status",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, ids: [produto!.id], status: "inativo" }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect((await liberacao())["JA LIBERADA"]).toBe(false);
  });
});
