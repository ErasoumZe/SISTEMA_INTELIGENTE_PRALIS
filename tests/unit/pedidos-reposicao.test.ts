import { describe, expect, it } from "vitest";
import { gerarItensReposicao, type ProdutoEstoque } from "@padaria/shared/pedidos";

function produto(over: Partial<ProdutoEstoque> = {}): ProdutoEstoque {
  return { id: "p1", descricao: "Produto", quantidadeEstoque: 0, estoqueMin: 10, estoqueMax: 100, ...over };
}

describe("gerarItensReposicao", () => {
  it("produto NO minimo gera item com quantidade que enche ate o maximo", () => {
    const itens = gerarItensReposicao([produto({ quantidadeEstoque: 10, estoqueMin: 10, estoqueMax: 100 })]);
    expect(itens).toEqual([
      {
        produtoId: "p1",
        descricao: "Produto",
        quantidadeAtual: 10,
        estoqueMin: 10,
        estoqueMax: 100,
        quantidadeSugerida: 90
      }
    ]);
  });

  it("produto ABAIXO do minimo tambem entra (sugestao = max - atual)", () => {
    const itens = gerarItensReposicao([produto({ id: "p2", quantidadeEstoque: 3, estoqueMin: 10, estoqueMax: 50 })]);
    expect(itens[0]).toMatchObject({ produtoId: "p2", quantidadeSugerida: 47 });
  });

  it("produto ACIMA do minimo e ignorado", () => {
    expect(gerarItensReposicao([produto({ quantidadeEstoque: 40, estoqueMin: 10, estoqueMax: 100 })])).toEqual([]);
  });

  it("produto sem estoque min/max definido e ignorado", () => {
    expect(gerarItensReposicao([produto({ estoqueMin: null })])).toEqual([]);
    expect(gerarItensReposicao([produto({ estoqueMax: null })])).toEqual([]);
  });

  it("produto ja no maximo (sugestao <= 0) e ignorado", () => {
    expect(gerarItensReposicao([produto({ quantidadeEstoque: 100, estoqueMin: 100, estoqueMax: 100 })])).toEqual([]);
  });

  it("processa varios produtos, retornando so os que precisam repor", () => {
    const itens = gerarItensReposicao([
      produto({ id: "a", quantidadeEstoque: 5, estoqueMin: 10, estoqueMax: 100 }), // repoe (95)
      produto({ id: "b", quantidadeEstoque: 80, estoqueMin: 10, estoqueMax: 100 }), // acima do min, ignora
      produto({ id: "c", quantidadeEstoque: 0, estoqueMin: null, estoqueMax: 100 }) // sem min, ignora
    ]);
    expect(itens.map((item) => item.produtoId)).toEqual(["a"]);
    expect(itens[0]?.quantidadeSugerida).toBe(95);
  });
});
