import { describe, expect, it } from "vitest";
import {
  agruparProdutosCentral,
  chaveForteCentral,
  normalizarNomeCentral,
  type ItemFonteCentral
} from "@padaria/shared/produtos";

function item(
  overrides: Partial<ItemFonteCentral> & Pick<ItemFonteCentral, "id" | "fonte" | "loja" | "nome">
): ItemFonteCentral {
  return {
    idSistema: undefined,
    codigoInterno: "",
    codigoBarras: "",
    ativo: null,
    grupo: null,
    custo: null,
    venda: null,
    fiscal: null,
    raw: {},
    ...overrides
  };
}

describe("reconciliação da Central de Produtos", () => {
  it("normaliza nome removendo acentos, formatação invisível e pontuação", () => {
    expect(normalizarNomeCentral("Pão\u2060 de Queijo — 100 g")).toBe("PAO DE QUEIJO 100 G");
  });

  it("agrupa código de barras entre lojas e sinaliza nomes divergentes sem escolher equivalência", () => {
    const itens = [
      item({ id: "li-1", fonte: "sia_li", loja: "LI", nome: "CAFÉ TORRADO 500G", codigoBarras: "000789123" }),
      item({
        id: "tnp-1",
        fonte: "compilart_tnp",
        loja: "TNP",
        nome: "CAFÉ MOÍDO 500G",
        codigoBarras: "789123",
        custo: "18.40"
      })
    ];

    const [grupo] = agruparProdutosCentral(itens);
    expect(grupo?.itens).toHaveLength(2);
    expect(grupo?.motivo).toBe("mesmo_cod_barras");
    expect(grupo?.alertas.nomesDivergentes).toBe(true);
    expect(grupo?.candidato.custo).toBe("18.40");
    expect(grupo?.candidato.custoDe).toBe("compilart_tnp");
  });

  it("não usa código interno igual para unir lojas diferentes", () => {
    const itens = [
      item({ id: "li-1", fonte: "sia_li", loja: "LI", nome: "FARINHA A", codigoInterno: "00123" }),
      item({ id: "tnp-1", fonte: "compilart_tnp", loja: "TNP", nome: "FARINHA B", codigoInterno: "123" })
    ];

    expect(agruparProdutosCentral(itens)).toHaveLength(2);
  });

  it("usa código interno somente dentro da mesma loja", () => {
    const itens = [
      item({ id: "base-1", fonte: "pralis", loja: "BASE", nome: "ITEM ANTIGO", codigoInterno: "00123" }),
      item({ id: "base-2", fonte: "pralis", loja: "BASE", nome: "ITEM NOVO", codigoInterno: "123" })
    ];

    const [grupo] = agruparProdutosCentral(itens);
    expect(grupo?.motivo).toBe("mesmo_cod_interno");
    expect(grupo?.alertas.nomesDivergentes).toBe(true);
  });

  it("reconhece código CREARE armazenado como interno na fonte fiscal TNP", () => {
    const fiscal = { ncm: "19059090" } as ItemFonteCentral["fiscal"];
    const itens = [
      item({ id: "comp-1", fonte: "compilart_tnp", loja: "TNP", nome: "BISCOITO 200G", codigoBarras: "000000456" }),
      item({ id: "fiscal-1", fonte: "fiscal_tnp", loja: "TNP", nome: "BISCOITO 200G", codigoInterno: "456", fiscal })
    ];

    expect(chaveForteCentral(itens[1]!)).toBe("456");
    // O nome igual também aproxima os dois registros, sem reescrever o fiscal.
    const [grupo] = agruparProdutosCentral(itens);
    expect(grupo?.itens).toHaveLength(2);
    expect(grupo?.candidato.fiscal.TNP).toEqual(fiscal);
  });

  it("preserva fiscal ausente e identifica conflito de código de barras", () => {
    const itens = [
      item({ id: "a", fonte: "sia_li", loja: "LI", nome: "PRODUTO A", codigoBarras: "7890", ativo: true }),
      item({ id: "b", fonte: "compilart_tnp", loja: "TNP", nome: "PRODUTO B", codigoBarras: "7890", ativo: false })
    ];

    const [grupo] = agruparProdutosCentral(itens, new Set(["7890"]));
    expect(grupo?.candidato.fiscal).toEqual({ LI: null, TNP: null });
    expect(grupo?.alertas.codigoBarrasConflitante).toBe(true);
    expect(grupo?.alertas.nomesDivergentes).toBe(true);
    expect(grupo?.candidato.ativo).toBe(true);
  });
});
