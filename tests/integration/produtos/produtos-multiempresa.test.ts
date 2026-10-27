import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

/**
 * Isolamento entre empresas e concorrencia no cadastro de produtos (P-04, ETAPA 2).
 *
 * O defeito que estes testes prendem: o `PUT` gravava sem NUNCA carregar o produto alvo. O
 * `UPDATE` casava por (id, empresa) e simplesmente afetava zero linhas — 204 mentiroso —, mas as
 * quatro satelites eram apagadas SO por `produto_id`, sem empresa nenhuma. Um ator da empresa A
 * apagava as promocoes, o fiscal, a transformacao e as conversoes de um produto da empresa B.
 */

interface RespostaId {
  data: { id: string };
}

describe("produtos - isolamento entre empresas", () => {
  let contexto: ContextoApiTeste;
  let cookieAdminA: string;
  let cookieMultiempresa: string;
  let unidadeA: string;
  let unidadeB: string;
  let produtoDaEmpresaB: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdminA = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");

    unidadeA = await criarUnidade(cookieMultiempresa, idsTeste.empresaA, "Unidade Cross A", "cra");
    unidadeB = await criarUnidade(cookieMultiempresa, idsTeste.empresaB, "Unidade Cross B", "crb");

    // Vitima: produto da empresa B COM as quatro satelites preenchidas.
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaB,
        descricao: "Produto vitima da empresa B",
        unidadeIndividualId: unidadeB,
        quantidadeIndividual: 1,
        conversoes: [{ unidadeMedidaId: unidadeB, quantidade: 2, unidadesIndividuais: 4 }],
        fiscal: { ncm: "19059090", categoriaFiscal: "REVENDA" },
        promocoes: [{ tipo: "desconto", descontoFracao: 0.2, seg: true }]
      }
    });
    expect(criado.statusCode).toBe(201);
    produtoDaEmpresaB = json<RespostaId>(criado).data.id;
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criarUnidade(cookie: string, empresaId: string, nome: string, sigla: string) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie },
      payload: { empresaId, nome, sigla }
    });
    expect(resposta.statusCode).toBe(201);
    return json<RespostaId>(resposta).data.id;
  }

  async function contarSatelites(produtoId: string) {
    const linha = await consultarUm<{ conversoes: string; fiscal: string; promocoes: string }>(
      `select
         (select count(*) from produtos_conversoes where produto_id = $1) as conversoes,
         (select count(*) from produtos_fiscal where produto_id = $1) as fiscal,
         (select count(*) from produtos_promocoes where produto_id = $1) as promocoes`,
      [produtoId]
    );
    return {
      conversoes: Number(linha?.conversoes ?? 0),
      fiscal: Number(linha?.fiscal ?? 0),
      promocoes: Number(linha?.promocoes ?? 0)
    };
  }

  it("Deve_Retornar404SemApagarSatelites_Quando_EditarProdutoDeOutraEmpresa", async () => {
    const antes = await contarSatelites(produtoDaEmpresaB);
    expect(antes).toEqual({ conversoes: 1, fiscal: 1, promocoes: 1 });

    // O ator so acessa a empresa A e manda `empresaId: A` — o alvo, porem, e da empresa B.
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${produtoDaEmpresaB}`,
      headers: { cookie: cookieAdminA },
      payload: {
        empresaId: idsTeste.empresaA,
        descricao: "Sequestrado pela empresa A",
        unidadeIndividualId: unidadeA,
        quantidadeIndividual: 1,
        conversoes: []
      }
    });

    assertProblem(resposta, 404, "NOT_FOUND");
    expect(await contarSatelites(produtoDaEmpresaB)).toEqual(antes);
    await expect(
      consultarUm("select id from produtos where id = $1 and descricao = $2", [
        produtoDaEmpresaB,
        "Produto vitima da empresa B"
      ])
    ).resolves.toBeTruthy();
  });

  it("Deve_Recusar_Quando_PayloadTentaMoverProdutoDeEmpresa", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaA,
        descricao: "Produto que nao muda de loja",
        unidadeIndividualId: unidadeA,
        quantidadeIndividual: 1,
        conversoes: []
      }
    });
    const produtoId = json<RespostaId>(criado).data.id;

    // O ator acessa as DUAS empresas — mesmo assim, produto nao migra de loja.
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${produtoId}`,
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaB,
        descricao: "Produto que nao muda de loja",
        unidadeIndividualId: unidadeB,
        quantidadeIndividual: 1,
        conversoes: []
      }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
    const linha = await consultarUm<{ empresa_id: string }>("select empresa_id from produtos where id = $1", [
      produtoId
    ]);
    expect(linha?.empresa_id).toBe(idsTeste.empresaA);
  });

  it("Deve_Retornar404_Quando_EditarProdutoInexistente", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: "/api/produtos/99999999-9999-4999-8999-999999999999",
      headers: { cookie: cookieAdminA },
      payload: {
        empresaId: idsTeste.empresaA,
        descricao: "Produto fantasma",
        unidadeIndividualId: unidadeA,
        quantidadeIndividual: 1,
        conversoes: []
      }
    });

    assertProblem(resposta, 404, "NOT_FOUND");
  });

  it("Deve_Recusar_Quando_UnidadeIndividualEDeOutraEmpresa", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaA,
        descricao: "Produto com unidade alheia",
        unidadeIndividualId: unidadeB,
        quantidadeIndividual: 1,
        conversoes: []
      }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
    await expect(
      consultarUm("select id from produtos where descricao = $1", ["Produto com unidade alheia"])
    ).resolves.toBeFalsy();
  });

  it("Deve_Recusar_Quando_UnidadeDeConversaoEDeOutraEmpresa", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaA,
        descricao: "Produto com conversao alheia",
        unidadeIndividualId: unidadeA,
        quantidadeIndividual: 1,
        conversoes: [{ unidadeMedidaId: unidadeB, quantidade: 1, unidadesIndividuais: 1 }]
      }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_GerarCodigosInternosGlobaisUnicos_EmCadastrosConcorrentesDeLojasDiferentes", async () => {
    const criar = (empresaId: string, unidadeIndividualId: string, descricao: string) =>
      contexto.app.inject({
        method: "POST",
        url: "/api/produtos",
        headers: { cookie: cookieMultiempresa },
        payload: { empresaId, descricao, unidadeIndividualId, quantidadeIndividual: 1, conversoes: [] }
      });

    const [respostaA, respostaB] = await Promise.all([
      criar(idsTeste.empresaA, unidadeA, "Código global concorrente loja A"),
      criar(idsTeste.empresaB, unidadeB, "Código global concorrente loja B")
    ]);
    expect(respostaA.statusCode).toBe(201);
    expect(respostaB.statusCode).toBe(201);

    const idA = json<RespostaId>(respostaA).data.id;
    const idB = json<RespostaId>(respostaB).data.id;
    const codigos = await consultarUm<{ codigo_a: string; codigo_b: string }>(
      "select a.codigo_interno as codigo_a, b.codigo_interno as codigo_b from produtos a cross join produtos b where a.id = $1 and b.id = $2",
      [idA, idB]
    );
    expect(codigos).toBeTruthy();
    expect(Number(codigos?.codigo_a)).toBeGreaterThanOrEqual(13_130);
    expect(Number(codigos?.codigo_b)).toBeGreaterThanOrEqual(13_130);
    expect(codigos?.codigo_a).not.toBe(codigos?.codigo_b);
  });

  it("Deve_Recusar_Quando_GrupoDeMercadoriaEDeOutraEmpresa", async () => {
    const grupoB = await contexto.app.inject({
      method: "POST",
      url: "/api/grupos-mercadorias",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaId: idsTeste.empresaB, tipoGrupo: "mercadoria", nome: "Grupo cross tenant B" }
    });
    expect(grupoB.statusCode).toBe(201);
    const grupoBId = json<RespostaId>(grupoB).data.id;

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaA,
        descricao: "Produto com grupo alheio",
        unidadeIndividualId: unidadeA,
        quantidadeIndividual: 1,
        grupoMercadoriaId: grupoBId,
        conversoes: []
      }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_Retornar404_Quando_ExportarProdutoForaDoEscopo", async () => {
    // `admin` so acessa a empresa A; o produto e da empresa B. Sucesso com "0 inseridos" seria
    // sucesso falso — e a diferenca entre 404 e 200 permitiria enumerar o cadastro alheio.
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/produtos/${produtoDaEmpresaB}/exportar`,
      headers: { cookie: cookieAdminA },
      payload: { empresaDestinoId: idsTeste.empresaA, modo: "simples" }
    });

    assertProblem(resposta, 404, "NOT_FOUND");
  });

  it("Deve_Retornar404_Quando_ExportarProdutoInexistente", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/99999999-9999-4999-8999-999999999998/exportar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "simples" }
    });

    assertProblem(resposta, 404, "NOT_FOUND");
  });
});

describe("produtos - duplicidade e concorrencia", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let unidade: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade Concorrencia", sigla: "cnc" }
    });
    unidade = json<RespostaId>(resposta).data.id;
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_BloquearCodigoBarrasRepetido_MesmoComForcar", async () => {
    const base = {
      empresaId: idsTeste.empresaA,
      unidadeIndividualId: unidade,
      quantidadeIndividual: 1,
      codigoBarras: "7891234567895",
      conversoes: []
    };

    const primeiro = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: { ...base, descricao: "EAN unico primeiro" }
    });
    expect(primeiro.statusCode).toBe(201);

    // Descricao diferente, EAN igual, e com o "cadastrar mesmo assim" ligado: continua bloqueado.
    const segundo = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: { ...base, descricao: "EAN unico segundo", forcar: true }
    });

    assertProblem(segundo, 409, "DUPLICATE_BARCODE");
  });

  it("Deve_PermitirDescricaoRepetida_Quando_Forcar", async () => {
    const base = {
      empresaId: idsTeste.empresaA,
      unidadeIndividualId: unidade,
      quantidadeIndividual: 1,
      descricao: "Descricao repetida com confirmacao",
      conversoes: []
    };

    expect(
      (
        await contexto.app.inject({
          method: "POST",
          url: "/api/produtos",
          headers: { cookie: cookieAdmin },
          payload: base
        })
      ).statusCode
    ).toBe(201);

    const semForcar = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: base
    });
    assertProblem(semForcar, 409, "DUPLICATE_PRODUCT");

    const comForcar = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieAdmin },
      payload: { ...base, forcar: true }
    });
    expect(comForcar.statusCode).toBe(201);
  });

  it("Deve_GerarCodigosInternosDistintos_Quando_CadastrosSimultaneos", async () => {
    // Sem a trava por empresa, `max(codigo_interno) + 1` roda em READ COMMITTED e as seis
    // requisicoes leem o MESMO maximo: o unique estoura e o cadastro em massa quebra.
    const respostas = await Promise.all(
      Array.from({ length: 6 }, (_, indice) =>
        contexto.app.inject({
          method: "POST",
          url: "/api/produtos",
          headers: { cookie: cookieAdmin },
          payload: {
            empresaId: idsTeste.empresaA,
            descricao: `Produto simultaneo ${indice}`,
            unidadeIndividualId: unidade,
            quantidadeIndividual: 1,
            conversoes: []
          }
        })
      )
    );

    expect(respostas.map((resposta) => resposta.statusCode)).toEqual([201, 201, 201, 201, 201, 201]);

    const ids = respostas.map((resposta) => json<RespostaId>(resposta).data.id);
    const codigos = await Promise.all(
      ids.map(async (id) => {
        const linha = await consultarUm<{ codigo_interno: string }>(
          "select codigo_interno from produtos where id = $1",
          [id]
        );
        return linha?.codigo_interno ?? "";
      })
    );
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(codigos.every((codigo) => /^\d{5}$/.test(codigo))).toBe(true);
  });

  it("Deve_ContinuarAcimaDoCatalogoBase_Quando_GerarCodigoInterno", async () => {
    // Regressao (R-222): a sequencia e global e inclui o catalogo mestre BASE. A consulta antiga abria um
    // parentese sem fechar (todo cadastro dava 500) e, com a tabela de produtos vazia, ignorava a BASE.
    await executarSql(
      `insert into produtos_catalogo_base (id_origem, nome, status, codigo_interno, dados_oficiais)
       values ('regressao-codigo-base', 'REGRESSAO CODIGO BASE', 'ativo', '650000', '{}'::jsonb)`
    );
    let produtoId = "";
    try {
      const criado = await contexto.app.inject({
        method: "POST",
        url: "/api/produtos",
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          descricao: "Produto depois da BASE",
          unidadeIndividualId: unidade,
          quantidadeIndividual: 1,
          conversoes: []
        }
      });
      expect(criado.statusCode, criado.body).toBe(201);
      produtoId = json<RespostaId>(criado).data.id;
      const linha = await consultarUm<{ codigo_interno: string }>("select codigo_interno from produtos where id = $1", [
        produtoId
      ]);
      expect(linha?.codigo_interno).toBe("650001");
    } finally {
      // Volta a sequencia ao normal para os demais casos (os arquivos rodam em sequencia).
      if (produtoId) await executarSql("delete from produtos where id = $1", [produtoId]);
      await executarSql("delete from produtos_catalogo_base where id_origem = 'regressao-codigo-base'");
    }
  });

  it("Deve_DeixarPassarUmSo_Quando_DuplicadosSimultaneos", async () => {
    const payload = {
      empresaId: idsTeste.empresaA,
      descricao: "Corrida de duplicidade",
      unidadeIndividualId: unidade,
      quantidadeIndividual: 1,
      conversoes: []
    };

    const respostas = await Promise.all(
      Array.from({ length: 4 }, () =>
        contexto.app.inject({ method: "POST", url: "/api/produtos", headers: { cookie: cookieAdmin }, payload })
      )
    );

    const criados = respostas.filter((resposta) => resposta.statusCode === 201);
    const recusados = respostas.filter((resposta) => resposta.statusCode === 409);
    expect(criados).toHaveLength(1);
    expect(recusados).toHaveLength(3);
  });
});
