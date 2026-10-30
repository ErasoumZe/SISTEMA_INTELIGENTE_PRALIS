import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

/**
 * Doc 59 (Rodrigo, 29/10/2026): o Compras so funciona com o cadastro completo. Cada produto tem "liberado para
 * compra" (comeca desligado; nao liberado continua vendendo, so nao e pedido) e a lista de produtos mostra os
 * liberados com o cadastro de compra incompleto. O fornecedor ganha categoria.
 */
describe("produto liberado para compra e categoria do fornecedor (doc 59)", () => {
  let contexto: ContextoApiTeste;
  let cookie: string;
  let naoLiberado = "";
  let pendente = "";
  let completo = "";
  const FORNECEDOR = "11111111-1111-4111-8111-1111111159a1";

  const pedir = (method: "GET" | "POST" | "PUT", url: string, payload?: object) =>
    contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const produto = async (codigo: string, liberado: boolean, extra = "") =>
    (await consultarUm<{ id: string }>(
      `insert into produtos (empresa_id, grupo_mercadoria_id, unidade_medida_id, codigo, descricao, liberado_compra${
        extra ? ", quantidade_caixa, estoque_min, estoque_max" : ""
      })
       values ($1, $2, $3, $4, $5, $6${extra}) returning id`,
      [idsTeste.empresaA, idsTeste.grupoMercadoriaInsumos, idsTeste.unidade, codigo, `Doc59 ${codigo}`, liberado]
    ))!.id;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookie = await cookieSessao(contexto.app, "admin");
    naoLiberado = await produto("D59-NAO", false);
    pendente = await produto("D59-PEND", true);
    completo = await produto("D59-OK", true, ", 24, '2', '10'");
    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1, $2, 'Doc59 Fornecedor', '11999990059', 'ativo')",
      [FORNECEDOR, idsTeste.empresaA]
    );
    await executarSql(
      "insert into fornecedores_produtos (empresa_id, fornecedor_id, produto_id, status, origem) values ($1, $2, $3, 'aprovado', 'compras')",
      [idsTeste.empresaA, FORNECEDOR, completo]
    );
  }, 120_000);

  afterAll(async () => {
    await executarSql("delete from compras_solicitacoes where empresa_id = $1 and observacao = 'doc59'", [
      idsTeste.empresaA
    ]);
    await executarSql("delete from fornecedores_produtos where fornecedor_id = $1", [FORNECEDOR]);
    await executarSql("delete from fornecedores where id = $1", [FORNECEDOR]);
    await executarSql("delete from produtos where id = any($1)", [[naoLiberado, pendente, completo]]);
    await contexto.fechar();
  });

  it("recusa o produto nao liberado no pedido e aceita o liberado", async () => {
    const recusa = await pedir("POST", "/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      observacao: "doc59",
      itens: [{ produtoId: naoLiberado, quantidade: 2 }]
    });
    expect(recusa.statusCode, recusa.body).toBe(400);
    expect(json<{ code?: string }>(recusa).code).toBe("PRODUCT_NOT_RELEASED_FOR_PURCHASE");

    const aceita = await pedir("POST", "/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      observacao: "doc59",
      itens: [{ produtoId: completo, quantidade: 2 }]
    });
    expect(aceita.statusCode, aceita.body).toBe(201);
  });

  it("filtra a lista de produtos por liberados, nao liberados e pendentes", async () => {
    const ids = async (compra: string) =>
      json<{ data: Array<{ id: string; liberadoCompra: boolean }> }>(
        await pedir("GET", `/api/produtos?empresaId=${idsTeste.empresaA}&busca=Doc59&compra=${compra}&pageSize=100`)
      ).data.map((linha) => linha.id);
    expect((await ids("nao_liberados")).sort()).toEqual([naoLiberado]);
    expect((await ids("liberados")).sort()).toEqual([completo, pendente].sort());
    // Pendente: liberado sem como se compra, sem minimo/maximo e sem fornecedor. O completo tem tudo.
    expect(await ids("pendentes")).toEqual([pendente]);
  });

  it("o seletor do Compras so oferece o liberado", async () => {
    const opcoes = json<{ data: Array<{ id: string }> }>(
      await pedir("GET", `/api/produtos/opcoes?empresaId=${idsTeste.empresaA}&busca=Doc59&liberadoCompra=true`)
    ).data.map((linha) => linha.id);
    expect(opcoes).toContain(completo);
    expect(opcoes).not.toContain(naoLiberado);
  });

  it("regravar o produto sem o campo nao desliga a liberacao; o formulario desliga", async () => {
    const detalhe = json<{ data: { liberadoCompra: boolean } }>(await pedir("GET", `/api/produtos/${pendente}`)).data;
    expect(detalhe.liberadoCompra).toBe(true);
    const payload = {
      empresaId: idsTeste.empresaA,
      descricao: "Doc59 D59-PEND",
      codigo: "D59-PEND",
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1
    };
    const liberado = async () =>
      (
        await consultarUm<{ liberado: boolean }>("select liberado_compra as liberado from produtos where id = $1", [
          pendente
        ])
      )?.liberado;

    // Como a copia da BASE e a fase B2 regravam: sem o campo, a liberacao fica.
    const semCampo = await pedir("PUT", `/api/produtos/${pendente}`, payload);
    expect(semCampo.statusCode, semCampo.body).toBe(204);
    expect(await liberado()).toBe(true);

    const desligado = await pedir("PUT", `/api/produtos/${pendente}`, { ...payload, liberadoCompra: false });
    expect(desligado.statusCode, desligado.body).toBe(204);
    expect(await liberado()).toBe(false);
  });

  it("salva a categoria do fornecedor e nao a perde quando ela nao vem", async () => {
    const base = { empresaId: idsTeste.empresaA, nome: "Doc59 Fornecedor", whatsapp: "11999990059" };
    expect((await pedir("PUT", `/api/fornecedores/${FORNECEDOR}`, { ...base, categoria: "Bebidas" })).statusCode).toBe(
      204
    );
    expect((await pedir("PUT", `/api/fornecedores/${FORNECEDOR}`, base)).statusCode).toBe(204);
    const linha = await consultarUm<{ categoria: string | null }>("select categoria from fornecedores where id = $1", [
      FORNECEDOR
    ]);
    expect(linha?.categoria).toBe("Bebidas");
  });
});
