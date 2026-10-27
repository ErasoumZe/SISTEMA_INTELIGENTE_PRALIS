import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { executarSql, json } from "../../setup/integracao.js";

/**
 * Listagem, busca, filtros, ordenacao, detalhe e projecao reduzida (P-04, ETAPA 3).
 *
 * O defeito que estes testes prendem: `GET /api/produtos` paginava com `pageSize` DEFAULT 10 e os
 * seis consumidores chamavam `apiGet` (que descarta `meta.pagination`). Resultado: a tela e todos
 * os seletores do sistema enxergavam apenas os 10 primeiros produtos — com 11 cadastrados ja
 * faltava um. E o repositorio carregava as quatro satelites de TODAS as empresas antes de paginar.
 */

interface RespostaId {
  data: { id: string };
}
interface Pagina {
  data: Array<{
    id: string;
    descricao: string;
    codigoInterno: string | null;
    marca: string | null;
    status: string;
    tipo: string;
    grupoNome: string | null;
    precoVendaAtual: number | null;
  }>;
  meta: { pagination: { total: number; totalPages: number; page: number; pageSize: number } };
}

const MARCA = "MARCA-LISTAGEM-P04";
const TOTAL = 14;

describe("produtos - listagem paginada no banco", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let unidadeId: string;
  let grupoId: string;
  const criados: string[] = [];
  const linhasDeVendaTeste: string[] = [];

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");

    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Unidade Listagem", sigla: "ul" }
    });
    unidadeId = json<RespostaId>(unidade).data.id;

    const grupo = await contexto.app.inject({
      method: "POST",
      url: "/api/grupos-mercadorias",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, tipoGrupo: "mercadoria", nome: "Grupo Listagem P04" }
    });
    grupoId = json<RespostaId>(grupo).data.id;

    // 14 produtos: mais do que o `pageSize` default de 10, que era exatamente o teto do defeito.
    for (let indice = 0; indice < TOTAL; indice += 1) {
      const resposta = await contexto.app.inject({
        method: "POST",
        url: "/api/produtos",
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          descricao: `Listagem P04 item ${String(indice).padStart(2, "0")}`,
          marca: MARCA,
          unidadeIndividualId: unidadeId,
          quantidadeIndividual: 1,
          grupoMercadoriaId: grupoId,
          setorEstoque: indice % 2 === 0 ? "LJ - CAIXAS" : "PROD. - PANIFICACAO",
          status: indice % 3 === 0 ? "inativo" : "ativo",
          tipo: indice % 4 === 0 ? "transformacao" : "revenda",
          conversoes: []
        }
      });
      expect(resposta.statusCode).toBe(201);
      criados.push(json<RespostaId>(resposta).data.id);
    }

    // Reproduz os dois vínculos reconhecidos pela fonte oficial: produto_id e EAN do PDV,
    // incluindo zeros à esquerda. A linha cancelada não deve contar como venda.
    const linhaProduto = randomUUID();
    const linhaEan = randomUUID();
    const linhaCancelada = randomUUID();
    linhasDeVendaTeste.push(linhaProduto, linhaEan, linhaCancelada);
    await executarSql("UPDATE produtos SET codigo_barras = $2 WHERE id = $1", [criados[1], "0009876543210"]);
    await executarSql(
      `INSERT INTO vendas_produtos (id, venda_id, produto_id, descricao_produto)
       VALUES ($1, $2, $3, 'Listagem produto vinculado')`,
      [linhaProduto, idsTeste.vendaSeed, criados[4]]
    );
    await executarSql(
      `INSERT INTO vendas_produtos (id, venda_id, produto_automacao_codigo, descricao_produto)
       VALUES ($1, $2, '9876543210', 'Listagem por EAN do PDV')`,
      [linhaEan, idsTeste.vendaSeed]
    );
    await executarSql(
      `INSERT INTO vendas_produtos (id, venda_id, produto_id, descricao_produto, cancelado)
       VALUES ($1, $2, $3, 'Listagem item cancelado', true)`,
      [linhaCancelada, idsTeste.vendaSeed, criados[2]]
    );
  }, 240_000);

  afterAll(async () => {
    if (linhasDeVendaTeste.length) {
      await executarSql("DELETE FROM vendas_produtos WHERE id = ANY($1::uuid[])", [linhasDeVendaTeste]);
    }
    await contexto.fechar();
  });

  async function listar(parametros: Record<string, string | number>) {
    const busca = new URLSearchParams({ empresaId: idsTeste.empresaA, busca: MARCA });
    for (const [chave, valor] of Object.entries(parametros)) busca.set(chave, String(valor));
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos?${busca.toString()}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    return json<Pagina>(resposta);
  }

  it("Deve_ContarTodosEPaginarNoBanco_Quando_MaisQueUmaPagina", async () => {
    const primeira = await listar({ pageSize: 10, page: 1 });
    expect(primeira.data).toHaveLength(10);
    expect(primeira.meta.pagination.total).toBe(TOTAL);
    expect(primeira.meta.pagination.totalPages).toBe(2);

    // A segunda pagina existe DE VERDADE: era ela que nunca chegava a tela.
    const segunda = await listar({ pageSize: 10, page: 2 });
    expect(segunda.data).toHaveLength(TOTAL - 10);

    const idsDaPrimeira = new Set(primeira.data.map((item) => item.id));
    expect(segunda.data.every((item) => !idsDaPrimeira.has(item.id))).toBe(true);
  });

  it("Deve_BuscarPorDescricaoCodigoInternoEMarca", async () => {
    const porDescricao = await listar({ busca: "Listagem P04 item 03", pageSize: 50 });
    expect(porDescricao.data).toHaveLength(1);
    // O cadastro grava a descricao em maiusculas (oficial); a busca continua sem diferenciar caixa.
    expect(porDescricao.data[0]?.descricao).toBe("LISTAGEM P04 ITEM 03");

    const codigo = porDescricao.data[0]?.codigoInterno ?? "";
    expect(codigo).toMatch(/^\d{5}$/);
    const porCodigo = await listar({ busca: codigo, pageSize: 50 });
    expect(porCodigo.data.some((item) => item.codigoInterno === codigo)).toBe(true);

    const porMarca = await listar({ busca: MARCA, pageSize: 50 });
    expect(porMarca.meta.pagination.total).toBe(TOTAL);
  });

  it("Deve_FiltrarPorStatusTipoGrupoESetor", async () => {
    const ativos = await listar({ status: "ativo", pageSize: 50 });
    expect(ativos.data.every((item) => item.status === "ativo")).toBe(true);
    expect(ativos.meta.pagination.total).toBeLessThan(TOTAL);

    const transformacao = await listar({ tipo: "transformacao", pageSize: 50 });
    expect(transformacao.data.every((item) => item.tipo === "transformacao")).toBe(true);

    const porGrupo = await listar({ grupoMercadoriaId: grupoId, pageSize: 50 });
    expect(porGrupo.meta.pagination.total).toBe(TOTAL);
    expect(porGrupo.data.every((item) => item.grupoNome === "Grupo Listagem P04")).toBe(true);

    const porSetor = await listar({ setorEstoque: "LJ - CAIXAS", pageSize: 50 });
    expect(porSetor.meta.pagination.total).toBe(Math.ceil(TOTAL / 2));
  });

  it("Deve_FiltrarProdutosJaVendidosPorVinculoOuEAN_EIgnorarCancelados", async () => {
    const vendidos = await listar({ somenteVendidos: "true", status: "ativo", pageSize: 50 });
    const idsVendidos = new Set(vendidos.data.map((item) => item.id));

    expect(idsVendidos.has(criados[4] ?? "")).toBe(true);
    expect(idsVendidos.has(criados[1] ?? "")).toBe(true);
    expect(idsVendidos.has(criados[2] ?? "")).toBe(false);
    expect(vendidos.meta.pagination.total).toBe(2);

    const todos = await listar({ somenteVendidos: "false", status: "ativo", pageSize: 50 });
    expect(todos.meta.pagination.total).toBeGreaterThan(vendidos.meta.pagination.total);
  });

  it("Deve_AplicarAsSeisOrdenacoes", async () => {
    const az = await listar({ ordenar: "az", pageSize: 50 });
    const za = await listar({ ordenar: "za", pageSize: 50 });
    expect(az.data[0]?.descricao).toBe("LISTAGEM P04 ITEM 00");
    expect(za.data[0]?.descricao).toBe(`LISTAGEM P04 ITEM ${String(TOTAL - 1).padStart(2, "0")}`);

    const codigoAsc = await listar({ ordenar: "codigo_asc", pageSize: 50 });
    const codigoDesc = await listar({ ordenar: "codigo_desc", pageSize: 50 });
    const codigos = codigoAsc.data.map((item) => item.codigoInterno ?? "");
    expect([...codigos].sort()).toEqual(codigos);
    expect(codigoDesc.data.map((item) => item.codigoInterno)).toEqual([...codigos].reverse());

    // recentes/antigos sao inversos um do outro dentro do mesmo recorte.
    const recentes = await listar({ ordenar: "recentes", pageSize: 50 });
    const antigos = await listar({ ordenar: "antigos", pageSize: 50 });
    expect(recentes.data[0]?.id).toBe(antigos.data[antigos.data.length - 1]?.id);
  });

  it("Deve_DevolverDetalheCompleto_Quando_ConsultarPorId", async () => {
    const id = criados[0] ?? "";
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${id}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    const detalhe = json<{
      data: { id: string; descricao: string; conversoes: unknown[]; fiscal: unknown; promocoes: unknown[] };
    }>(resposta);
    expect(detalhe.data.id).toBe(id);
    expect(detalhe.data).toHaveProperty("conversoes");
    expect(detalhe.data).toHaveProperty("fiscal");
    expect(detalhe.data).toHaveProperty("promocoes");
  });

  it("Deve_RegistrarRotasEstaticasAntesDoId", async () => {
    // Se `/:id` viesse antes, "opcoes" seria lido como um id e a rota morreria em 400.
    const opcoes = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/opcoes?empresaId=${idsTeste.empresaA}&busca=${encodeURIComponent(MARCA)}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(opcoes);

    const filtros = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/filtros?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(filtros);
    const dados = json<{ data: { setores: string[]; grupos: Array<{ id: string; nome: string }> } }>(filtros);
    expect(dados.data.setores).toContain("LJ - CAIXAS");
    expect(dados.data.grupos.some((grupo) => grupo.id === grupoId)).toBe(true);
  });

  it("Deve_OmitirFiscalCustoMargemEPreco_Na_ProjecaoReduzida", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/opcoes?empresaId=${idsTeste.empresaA}&busca=${encodeURIComponent(MARCA)}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    const opcoes = json<{ data: Array<Record<string, unknown>> }>(resposta).data;
    expect(opcoes.length).toBeGreaterThan(0);
    for (const opcao of opcoes) {
      expect(Object.keys(opcao).sort()).toEqual(
        ["codigoBarras", "codigoInterno", "descricao", "id", "marca", "status"].sort()
      );
    }
  });

  it("Deve_HidratarSelecionado_Quando_IdsForInformado", async () => {
    const id = criados[TOTAL - 1] ?? "";
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/opcoes?empresaId=${idsTeste.empresaA}&ids=${id}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    const opcoes = json<{ data: Array<{ id: string }> }>(resposta).data;
    expect(opcoes.some((opcao) => opcao.id === id)).toBe(true);
  });
});

describe("produtos - listagem e isolamento entre empresas", () => {
  let contexto: ContextoApiTeste;
  let cookieAdminA: string;
  let cookieMultiempresa: string;
  let produtoDaB = "";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdminA = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");

    const unidadeB = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaId: idsTeste.empresaB, nome: "Unidade Listagem B", sigla: "ulb" }
    });
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos",
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaB,
        grupoMercadoriaId: idsTeste.grupoMercadoriaB,
        descricao: "SO DA EMPRESA B P04",
        unidadeIndividualId: json<RespostaId>(unidadeB).data.id,
        quantidadeIndividual: 1,
        conversoes: []
      }
    });
    produtoDaB = json<RespostaId>(criado).data.id;
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_NaoListarProdutoDeOutraEmpresa", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos?empresaId=${idsTeste.empresaA}&busca=${encodeURIComponent("SO DA EMPRESA B P04")}&pageSize=50`,
      headers: { cookie: cookieAdminA }
    });
    assertOk(resposta);
    expect(json<Pagina>(resposta).meta.pagination.total).toBe(0);
  });

  it("Deve_NaoOferecerProdutoDeOutraEmpresa_Na_ProjecaoReduzida", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/opcoes?empresaId=${idsTeste.empresaA}&ids=${produtoDaB}`,
      headers: { cookie: cookieAdminA }
    });
    assertOk(resposta);
    expect(json<{ data: unknown[] }>(resposta).data).toHaveLength(0);
  });

  it("Deve_Retornar404_Quando_DetalharProdutoDeOutraEmpresa", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${produtoDaB}`,
      headers: { cookie: cookieAdminA }
    });
    assertProblem(resposta, 404, "NOT_FOUND");
  });

  it("Deve_Retornar403_Quando_EmpresaNaoPermitidaNaListagem", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdminA }
    });
    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });
});
