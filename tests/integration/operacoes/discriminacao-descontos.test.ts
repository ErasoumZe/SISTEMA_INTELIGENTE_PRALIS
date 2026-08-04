import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, json } from "../../setup/integracao.js";

// PROJECT_BRAIN/17 §5: descontos em 3 niveis com rateio (D4) e validacao bloqueante (D5), ponta a
// ponta contra o banco real — o que o servidor GRAVA, nao o que o front calcula.
describe("discriminacao: descontos por nivel, rateio e D5", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  function criarMercadoria(valorOriginal: number) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/mercadorias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-07-10",
        descricao: "Nota com desconto geral",
        valorOriginal,
        contaOrigemId: idsTeste.contaCaixa,
        fornecedorId: idsTeste.fornecedor,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        temNotaFiscal: false
      }
    });
  }

  function discriminar(mercadoriaId: string, corpo: Record<string, unknown>) {
    return contexto.app.inject({
      method: "PATCH",
      url: `/api/mercadorias/${mercadoriaId}/discriminar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, ...corpo }
    });
  }

  type LinhaItem = {
    descricao: string;
    valor_total: string;
    valor_unitario_com_desconto: string;
    valor_total_com_desconto: string;
  };

  function itensGravados(mercadoriaId: string) {
    return consultarTodos<LinhaItem>(
      `select descricao, valor_total, valor_unitario_com_desconto, valor_total_com_desconto
         from mercadorias_itens where mercadoria_id = $1 order by descricao`,
      [mercadoriaId]
    );
  }

  // FOTO 3 do Rodrigo: nota de 40,00 com 17,5% de desconto geral.
  it("nota de 40,00 com 17,5% rateia como na FOTO 3 (0,83 / 1,65 / 2,48 e total 33,00)", async () => {
    const criada = await criarMercadoria(40);
    expect(criada.statusCode, criada.body).toBe(201);
    const mercadoriaId = json<{ data: { id: string } }>(criada).data.id;

    const resposta = await discriminar(mercadoriaId, {
      descontoGeralTipo: "percentual",
      descontoGeralValor: 17.5,
      itensMercadoria: [
        { descricao: "A item um", quantidade: 4, valorUnitario: 1, valorTotal: 4 },
        { descricao: "B item dois", quantidade: 3, valorUnitario: 2, valorTotal: 6 },
        { descricao: "C item tres", quantidade: 10, valorUnitario: 3, valorTotal: 30 }
      ]
    });
    assertOk(resposta);

    const itens = await itensGravados(mercadoriaId);
    expect(itens.map((item) => Number(item.valor_total))).toEqual([4, 6, 30]);
    expect(itens.map((item) => Number(item.valor_total_com_desconto))).toEqual([3.3, 4.95, 24.75]);
    expect(itens.map((item) => Number(item.valor_unitario_com_desconto))).toEqual([0.83, 1.65, 2.48]);

    // O total com desconto fecha em 33,00 e o desconto resolvido (7,00) vai para valor_desconto,
    // que e quem alimenta os agregados de dinheiro.
    const soma = itens.reduce((total, item) => total + Number(item.valor_total_com_desconto), 0);
    expect(soma).toBeCloseTo(33, 2);
    const [cabecalho] = await consultarTodos<{ valor_desconto: string; desconto_geral_valor: string }>(
      "select valor_desconto, desconto_geral_valor from mercadorias where id = $1",
      [mercadoriaId]
    );
    expect(Number(cabecalho?.valor_desconto)).toBe(7);
    expect(Number(cabecalho?.desconto_geral_valor)).toBe(17.5);
  });

  // O caso da FOTO divide exato; este exercita a regra "sobra no ultimo item" (D4).
  it("rateio que nao divide exato poe a sobra no ULTIMO item (10,00 sobre 3 itens de 10,00)", async () => {
    const criada = await criarMercadoria(30);
    const mercadoriaId = json<{ data: { id: string } }>(criada).data.id;

    const resposta = await discriminar(mercadoriaId, {
      descontoGeralTipo: "valor",
      descontoGeralValor: 10,
      itensMercadoria: [
        { descricao: "A dez", quantidade: 1, valorUnitario: 10, valorTotal: 10 },
        { descricao: "B dez", quantidade: 1, valorUnitario: 10, valorTotal: 10 },
        { descricao: "C dez", quantidade: 1, valorUnitario: 10, valorTotal: 10 }
      ]
    });
    assertOk(resposta);

    const itens = await itensGravados(mercadoriaId);
    // Descontos 3,33 / 3,33 / 3,34 -> restam 6,67 / 6,67 / 6,66.
    expect(itens.map((item) => Number(item.valor_total_com_desconto))).toEqual([6.67, 6.67, 6.66]);
    const soma = itens.reduce((total, item) => total + Number(item.valor_total_com_desconto), 0);
    expect(soma).toBeCloseTo(20, 2);
  });

  it("desconto no V.TOTAL do item (nivel 2) recalcula o unitario daquele item", async () => {
    const criada = await criarMercadoria(32);
    const mercadoriaId = json<{ data: { id: string } }>(criada).data.id;

    const resposta = await discriminar(mercadoriaId, {
      itensMercadoria: [
        {
          descricao: "A com desconto no total",
          quantidade: 4,
          valorUnitario: 10,
          descontoTotalTipo: "valor",
          descontoTotalValor: 8,
          valorTotal: 32
        }
      ]
    });
    assertOk(resposta);

    const itens = await itensGravados(mercadoriaId);
    // 40,00 - 8,00 = 32,00 em 4 unidades = 8,00 por unidade.
    expect(Number(itens[0]?.valor_total)).toBe(32);
    expect(Number(itens[0]?.valor_unitario_com_desconto)).toBe(8);
  });

  // D5: divergencia BLOQUEIA (422) e a resposta diz onde.
  it("divergencia entre a discriminacao e o valor do lancamento retorna 422 com detalhe", async () => {
    const criada = await criarMercadoria(30);
    const mercadoriaId = json<{ data: { id: string } }>(criada).data.id;

    const resposta = await discriminar(mercadoriaId, {
      itensMercadoria: [
        { descricao: "A dez", quantidade: 1, valorUnitario: 10, valorTotal: 10 },
        { descricao: "B vinte e cinco", quantidade: 1, valorUnitario: 25, valorTotal: 25 }
      ]
    });

    assertProblem(resposta, 422);
    const corpo = json<{ code?: string; title?: string; details?: Record<string, unknown> }>(resposta);
    expect(corpo.code ?? "").toBe("DISCRIMINACAO_DIVERGENTE");
    expect(corpo.details).toMatchObject({
      diferenca: 5,
      totalItens: 35,
      valorLancamento: 30,
      linhaProvavel: 2,
      campoProvavel: "valorTotal"
    });

    // NAO SALVA: o cabecalho continua sem item nenhum.
    const itens = await itensGravados(mercadoriaId);
    expect(itens).toHaveLength(0);
  });

  it("um centavo de diferenca ja bloqueia (D5 nao tem tolerancia)", async () => {
    const criada = await criarMercadoria(10);
    const mercadoriaId = json<{ data: { id: string } }>(criada).data.id;

    const resposta = await discriminar(mercadoriaId, {
      itensMercadoria: [{ descricao: "A quase dez", quantidade: 1, valorUnitario: 9.99, valorTotal: 9.99 }]
    });

    assertProblem(resposta, 422);
    expect(json<{ details?: { diferenca?: number } }>(resposta).details?.diferenca).toBe(-0.01);
  });
});
