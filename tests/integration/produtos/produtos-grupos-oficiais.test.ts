import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { definirLeitorDeGrupoIdsParaTeste } from "../../../api/src/produtos/produtos-grupo-id.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, executarSql, json } from "../../setup/integracao.js";

/**
 * Fase B1 da virada (29/10/2026): a loja recebe os grupos oficiais da planilha (faixa AC5:AD, leitor falso
 * aqui) e as unidades que os produtos da BASE usam e ela ainda nao tem. So cria o que falta, com previa,
 * frase e hash.
 */
const FRASE = "CRIAR GRUPOS E UNIDADES";

type Previa = {
  data: {
    grupos: Array<{ nome: string; id: string }>;
    unidades: Array<{ sigla: string; nome: string }>;
    hashPlano: string;
  };
};

describe("produtos - grupos oficiais e unidades da loja (fase B1)", () => {
  let contexto: ContextoApiTeste;
  let cookie: string;
  const prefixos = new Map<string, string>();

  const previa = () =>
    contexto.app.inject({
      method: "GET",
      url: `/api/produtos/grupos-oficiais/previa?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });
  const aplicar = (confirmacao: string, hashPlano: string) =>
    contexto.app.inject({
      method: "POST",
      url: "/api/produtos/grupos-oficiais",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, confirmacao, hashPlano }
    });

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookie = await cookieSessao(contexto.app, "multiempresa");
    for (const e of await consultarTodos<{ id: string; p: string }>(
      "select id, matricula_prefixo as p from empresas"
    )) {
      prefixos.set(e.id, e.p);
    }
    await executarSql("update empresas set matricula_prefixo = 'TNP' where id = $1", [idsTeste.empresaA]);
    await executarSql("insert into grupos_mercadorias (empresa_id, nome) values ($1, 'mer grupo oficial ja existe')", [
      idsTeste.empresaA
    ]);
    // Produtos da BASE que usam unidades que a loja ainda nao tem.
    await executarSql(
      `insert into produtos_catalogo_base (id_origem, nome, codigo_interno, codigo_barras, dados_oficiais)
         values ('grupos-oficiais-1', 'OFICIAL GRAMA', '93001', null, '{"medida_base": "G", "embalagem": "CX"}'::jsonb),
                ('grupos-oficiais-2', 'OFICIAL FARDO', '93002', null, '{"medida_base": "UN", "medida_compra": "fd"}'::jsonb)`
    );
  }, 180_000);

  afterAll(async () => {
    definirLeitorDeGrupoIdsParaTeste(null);
    for (const [id, p] of prefixos)
      await executarSql("update empresas set matricula_prefixo = $2 where id = $1", [id, p]);
    await executarSql("delete from produtos_catalogo_base where id_origem like 'grupos-oficiais-%'");
    await contexto.fechar();
  });

  it("Deve_RecusarSemAPlanilha", async () => {
    definirLeitorDeGrupoIdsParaTeste(null);
    assertProblem(await previa(), 422, "GRUPOS_OFICIAIS_INDISPONIVEIS");
  });

  it("Deve_CriarSoOQueFalta_ComNomeLimpo_EUnidadesDaBase", async () => {
    definirLeitorDeGrupoIdsParaTeste({
      async lerFaixasEmLote() {
        return [
          [
            ["NOME GRUPO", "ID GRUPO"],
            ["MER ⁠OFICIAL - ⁠ÁGUAS", "38"],
            ["MER OFICIAL  - CERVEJAS", "35"],
            ["MER GRUPO OFICIAL JA EXISTE", "40"]
          ]
        ];
      }
    });
    const antes = await previa();
    expect(antes.statusCode, antes.body).toBe(200);
    const plano = json<Previa>(antes).data;
    expect(plano.grupos.map((g) => g.nome)).toEqual(["MER OFICIAL - ÁGUAS", "MER OFICIAL - CERVEJAS"]);
    expect(plano.unidades).toEqual(
      expect.arrayContaining([
        { sigla: "G", nome: "Grama" },
        { sigla: "CX", nome: "Caixa" },
        { sigla: "FD", nome: "Fardo" }
      ])
    );

    assertProblem(await aplicar("SIM", plano.hashPlano), 400, "CONFIRMACAO_INVALIDA");
    assertProblem(await aplicar(FRASE, "f".repeat(64)), 409, "PREVIA_DESATUALIZADA");
    const aplicado = await aplicar(FRASE, plano.hashPlano);
    expect(aplicado.statusCode, aplicado.body).toBe(200);
    expect(json<{ data: { gruposCriados: number; unidadesCriadas: number } }>(aplicado).data).toMatchObject({
      gruposCriados: 2,
      unidadesCriadas: plano.unidades.length
    });

    const grupos = await consultarTodos<{ nome: string }>(
      "select nome from grupos_mercadorias where empresa_id = $1 and nome like 'MER OFICIAL%'",
      [idsTeste.empresaA]
    );
    // Gravado como a pessoa le: sem o U+2060 e sem espaco duplo (a ordem do banco depende da collation).
    expect(grupos.map((g) => g.nome).sort()).toEqual(["MER OFICIAL - CERVEJAS", "MER OFICIAL - ÁGUAS"]);

    // Rodar de novo nao recria nada.
    const depois = json<Previa>(await previa()).data;
    expect(depois.grupos).toEqual([]);
    expect(depois.unidades).toEqual([]);
  });
});
