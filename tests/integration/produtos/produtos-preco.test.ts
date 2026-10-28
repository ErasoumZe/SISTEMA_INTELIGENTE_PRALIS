import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("produtos preco autoritativo integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_IgnorarPrecoDoCliente_Quando_CalculoAutomatico", async () => {
    // ADR-002: com auto=true o cliente pode "mentir" o preco a vontade —
    // o servidor recalcula pela regra oficial: (50 / 10) * (1 + 0.3) = 6.50.
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      descricao: "Produto preco automatico",
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      conversoes: [],
      auto: true,
      custo: 50,
      quantidadeCaixa: 10,
      margem: 0.3,
      precoVenda: 999.99
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const produtoId = json<{ data: { id: string } }>(criado).data.id;

    const linha = await consultarUm<{ preco_venda: string }>("select preco_venda from produtos where id = $1", [
      produtoId
    ]);
    expect(linha?.preco_venda).toBe("6.50");
  });

  it("Deve_AceitarPrecoManual_Quando_AutoDesligado", async () => {
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      descricao: "Produto preco manual",
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      conversoes: [],
      auto: false,
      custo: 50,
      quantidadeCaixa: 10,
      margem: 0.3,
      precoVenda: 12.34
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const produtoId = json<{ data: { id: string } }>(criado).data.id;

    const linha = await consultarUm<{ preco_venda: string }>("select preco_venda from produtos where id = $1", [
      produtoId
    ]);
    expect(linha?.preco_venda).toBe("12.34");
  });

  it("Deve_GravarPrecoNulo_Quando_AutomaticoSemCusto", async () => {
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      descricao: "Produto sem custo",
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      conversoes: [],
      auto: true,
      precoVenda: 999.99
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const produtoId = json<{ data: { id: string } }>(criado).data.id;

    const linha = await consultarUm<{ preco_venda: string | null }>("select preco_venda from produtos where id = $1", [
      produtoId
    ]);
    expect(linha?.preco_venda).toBeNull();
  });

  it("Deve_DerivarPrecoVendaAtualNoServidor_Quando_PromocaoAtiva", async () => {
    // ADR-003: o preco vigente e derivado na LEITURA pelo servidor (nunca persistido).
    const comPromocao = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      descricao: "Produto com promocao sempre ativa",
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      conversoes: [],
      auto: false,
      precoVenda: 10,
      promocoes: [
        { tipo: "valor", valor: 8, seg: true, ter: true, qua: true, qui: true, sex: true, sab: true, dom: true }
      ]
    });
    expect(comPromocao.statusCode, comPromocao.body).toBe(201);
    const comPromocaoId = json<{ data: { id: string } }>(comPromocao).data.id;

    const semPromocao = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      descricao: "Produto sem promocao",
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      conversoes: [],
      auto: false,
      precoVenda: 10
    });
    expect(semPromocao.statusCode, semPromocao.body).toBe(201);
    const semPromocaoId = json<{ data: { id: string } }>(semPromocao).data.id;

    const lista = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieAdmin }
    });
    expect(lista.statusCode).toBe(200);
    const itens = json<{ data: { id: string; precoVendaAtual: number | null }[] }>(lista).data;
    expect(itens.find((item) => item.id === comPromocaoId)?.precoVendaAtual).toBe(8);
    expect(itens.find((item) => item.id === semPromocaoId)?.precoVendaAtual).toBe(10);
  });
});
