import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";
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
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieMultiempresa, {
      empresaId: idsTeste.empresaB,
      grupoMercadoriaId: idsTeste.grupoMercadoriaB,
      descricao: "Produto vitima da empresa B",
      unidadeIndividualId: unidadeB,
      quantidadeIndividual: 1,
      conversoes: [{ unidadeMedidaId: unidadeB, quantidade: 2, unidadesIndividuais: 4 }],
      fiscal: { ncm: "19059090", categoriaFiscal: "REVENDA" },
      promocoes: [{ tipo: "desconto", descontoFracao: 0.2, seg: true }]
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
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
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
        // O cadastro grava a descricao em maiusculas (regra do app oficial).
        "PRODUTO VITIMA DA EMPRESA B"
      ])
    ).resolves.toBeTruthy();
  });

  it("Deve_Recusar_Quando_PayloadTentaMoverProdutoDeEmpresa", async () => {
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieMultiempresa, {
      empresaId: idsTeste.empresaA,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      descricao: "Produto que nao muda de loja",
      unidadeIndividualId: unidadeA,
      quantidadeIndividual: 1,
      conversoes: []
    });
    const produtoId = json<RespostaId>(criado).data.id;

    // O ator acessa as DUAS empresas — mesmo assim, produto nao migra de loja.
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${produtoId}`,
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaB,
        grupoMercadoriaId: idsTeste.grupoMercadoriaB,
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
    const resposta = await cadastrarProdutoNaLoja(contexto.app, cookieMultiempresa, {
      empresaId: idsTeste.empresaA,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      descricao: "Produto com unidade alheia",
      unidadeIndividualId: unidadeB,
      quantidadeIndividual: 1,
      conversoes: []
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
    await expect(
      consultarUm("select id from produtos where descricao = $1", ["Produto com unidade alheia"])
    ).resolves.toBeFalsy();
  });

  it("Deve_Recusar_Quando_UnidadeDeConversaoEDeOutraEmpresa", async () => {
    const resposta = await cadastrarProdutoNaLoja(contexto.app, cookieMultiempresa, {
      empresaId: idsTeste.empresaA,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      descricao: "Produto com conversao alheia",
      unidadeIndividualId: unidadeA,
      quantidadeIndividual: 1,
      conversoes: [{ unidadeMedidaId: unidadeB, quantidade: 1, unidadesIndividuais: 1 }]
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_GerarCodigosInternosGlobaisUnicos_EmCadastrosConcorrentesDeLojasDiferentes", async () => {
    const criar = (empresaId: string, grupoMercadoriaId: string, unidadeIndividualId: string, descricao: string) =>
      cadastrarProdutoNaLoja(contexto.app, cookieMultiempresa, {
        empresaId,
        grupoMercadoriaId,
        descricao,
        unidadeIndividualId,
        quantidadeIndividual: 1,
        conversoes: []
      });

    const [respostaA, respostaB] = await Promise.all([
      criar(idsTeste.empresaA, idsTeste.grupoMercadoriaInsumos, unidadeA, "Código global concorrente loja A"),
      criar(idsTeste.empresaB, idsTeste.grupoMercadoriaB, unidadeB, "Código global concorrente loja B")
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

    const resposta = await cadastrarProdutoNaLoja(contexto.app, cookieMultiempresa, {
      empresaId: idsTeste.empresaA,
      descricao: "Produto com grupo alheio",
      unidadeIndividualId: unidadeA,
      quantidadeIndividual: 1,
      grupoMercadoriaId: grupoBId,
      conversoes: []
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });
});

// Produto novo nasce na BASE (modelo do app oficial): duplicidade e codigo interno se decidem la.
describe("produtos - duplicidade e concorrencia na BASE", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let unidade: string;
  const criadosNaBase: string[] = [];

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
    await executarSql("delete from produtos_catalogo_base where id = any($1::uuid[])", [criadosNaBase]);
    await contexto.fechar();
  });

  const payload = (extra: Record<string, unknown>) => ({
    empresaId: idsTeste.empresaA,
    grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
    unidadeIndividualId: unidade,
    quantidadeIndividual: 1,
    conversoes: [],
    ...extra
  });

  async function criarNaBase(extra: Record<string, unknown>) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/base",
      headers: { cookie: cookieAdmin },
      payload: payload(extra)
    });
    if (resposta.statusCode === 201) criadosNaBase.push(json<RespostaId>(resposta).data.id);
    return resposta;
  }

  const codigoNaBase = async (resposta: { json: () => unknown }) =>
    (
      await consultarUm<{ codigo_interno: string }>("select codigo_interno from produtos_catalogo_base where id = $1", [
        json<RespostaId>(resposta).data.id
      ])
    )?.codigo_interno ?? "";

  it("Deve_PedirConfirmacaoDeCodigoBarrasRepetido_E_AceitarComForcar", async () => {
    const primeiro = await criarNaBase({ descricao: "EAN unico primeiro", codigoBarras: "7891234567895" });
    expect(primeiro.statusCode, primeiro.body).toBe(201);

    // Oficial: nome OU EAN repetido na BASE pede confirmacao; sem ela, 409 com o motivo.
    const semForcar = await criarNaBase({ descricao: "EAN unico segundo", codigoBarras: "7891234567895" });
    assertProblem(semForcar, 409, "DUPLICATE_PRODUCT");

    // Com o "cadastrar mesmo assim", grava.
    const comForcar = await criarNaBase({
      descricao: "EAN unico segundo",
      codigoBarras: "7891234567895",
      forcar: true
    });
    expect(comForcar.statusCode, comForcar.body).toBe(201);
  });

  it("Deve_PermitirDescricaoRepetida_Quando_Forcar", async () => {
    expect((await criarNaBase({ descricao: "Descricao repetida com confirmacao" })).statusCode).toBe(201);
    assertProblem(await criarNaBase({ descricao: "Descricao repetida com confirmacao" }), 409, "DUPLICATE_PRODUCT");
    expect((await criarNaBase({ descricao: "Descricao repetida com confirmacao", forcar: true })).statusCode).toBe(201);
  });

  it("Deve_GerarCodigosInternosDistintos_Quando_CadastrosSimultaneos", async () => {
    // Sem a trava do cadastro, `max(codigo_interno) + 1` roda em READ COMMITTED e as seis
    // requisicoes leem o MESMO maximo.
    const respostas = await Promise.all(
      Array.from({ length: 6 }, (_, indice) => criarNaBase({ descricao: `Produto simultaneo ${indice}` }))
    );
    expect(respostas.map((resposta) => resposta.statusCode)).toEqual([201, 201, 201, 201, 201, 201]);
    const codigos = await Promise.all(respostas.map(codigoNaBase));
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(codigos.every((codigo) => /^\d{5}$/.test(codigo))).toBe(true);
  });

  it("Deve_ContinuarAcimaDoCatalogoBase_Quando_GerarCodigoInterno", async () => {
    // Regressao (R-222): a sequencia e global e inclui o catalogo mestre BASE.
    await executarSql(
      `insert into produtos_catalogo_base (id_origem, nome, status, codigo_interno, dados_oficiais)
       values ('regressao-codigo-base', 'REGRESSAO CODIGO BASE', 'ativo', '650000', '{}'::jsonb)`
    );
    try {
      const criado = await criarNaBase({ descricao: "Produto depois da BASE" });
      expect(criado.statusCode, criado.body).toBe(201);
      expect(await codigoNaBase(criado)).toBe("650001");
    } finally {
      // Volta a sequencia ao normal para os demais casos (os arquivos rodam em sequencia).
      await executarSql("delete from produtos_catalogo_base where id = any($1::uuid[])", [criadosNaBase]);
      criadosNaBase.length = 0;
      await executarSql("delete from produtos_catalogo_base where id_origem = 'regressao-codigo-base'");
    }
  });

  it("Deve_DeixarPassarUmSo_Quando_DuplicadosSimultaneos", async () => {
    const respostas = await Promise.all(
      Array.from({ length: 4 }, () => criarNaBase({ descricao: "Corrida de duplicidade" }))
    );
    expect(respostas.filter((resposta) => resposta.statusCode === 201)).toHaveLength(1);
    expect(respostas.filter((resposta) => resposta.statusCode === 409)).toHaveLength(3);
  });
});
