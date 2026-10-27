import { describe, expect, it } from "vitest";
import {
  codigoBarrasNaCriacao,
  fracaoParaMargemPercentual,
  margemPercentualParaFracao,
  montarDescricao,
  normalizarTextosProduto,
  TECLA_BALANCA_FIXA,
  validarBalanca,
  validarEstoquePorEmbalagem
} from "@padaria/shared/produtos";

// Regras de cadastro portadas do app oficial (R-222): mesmas mensagens e mesmos limites.
describe("produtos/regras-cadastro — estoque por embalagem", () => {
  it("aceita minimo e maximo multiplos da embalagem, com maximo acima do minimo", () => {
    expect(validarEstoquePorEmbalagem({ quantidadeCaixa: 10, estoqueMin: 10, estoqueMax: 30 })).toEqual([]);
  });

  it("recusa minimo menor que uma embalagem inteira", () => {
    expect(validarEstoquePorEmbalagem({ quantidadeCaixa: 10, estoqueMin: 5, estoqueMax: 20 })).toEqual([
      { campo: "estoqueMin", mensagem: "Estoque mínimo não pode ser menor que a Qt. embalagem (10). Use 10 ou mais." }
    ]);
  });

  it("recusa minimo e maximo fora do multiplo", () => {
    expect(validarEstoquePorEmbalagem({ quantidadeCaixa: 10, estoqueMin: 15, estoqueMax: 25 })).toEqual([
      { campo: "estoqueMin", mensagem: "Estoque mínimo deve ser múltiplo da Qt. embalagem (10). Ex.: 10, 20, 30." },
      { campo: "estoqueMax", mensagem: "Estoque máximo deve ser múltiplo da Qt. embalagem (10). Ex.: 20, 30, 40." }
    ]);
  });

  it("maximo igual ao minimo nao e faixa, mesmo sem embalagem", () => {
    expect(validarEstoquePorEmbalagem({ quantidadeCaixa: 1, estoqueMin: 4, estoqueMax: 4 })).toEqual([
      { campo: "estoqueMax", mensagem: "Estoque máximo deve ser maior que o mínimo (4)." }
    ]);
  });

  it("campos vazios ou zero nao sao validados", () => {
    expect(validarEstoquePorEmbalagem({ quantidadeCaixa: 12, estoqueMin: null, estoqueMax: 0 })).toEqual([]);
  });
});

describe("produtos/regras-cadastro — balanca", () => {
  it("tecla fixa e 000", () => {
    expect(TECLA_BALANCA_FIXA).toBe(0);
  });

  it("pesavel exige validade inteira de 0 a 999", () => {
    expect(validarBalanca({ pesavel: true, validadeBalanca: null })).toEqual([
      "Informe a validade da balança em dias (0 a 999)."
    ]);
    expect(validarBalanca({ pesavel: true, validadeBalanca: 1000 })).toHaveLength(1);
    expect(validarBalanca({ pesavel: true, validadeBalanca: 2.5 })).toHaveLength(1);
    expect(validarBalanca({ pesavel: true, validadeBalanca: 0 })).toEqual([]);
    expect(validarBalanca({ pesavel: false, validadeBalanca: null })).toEqual([]);
  });
});

describe("produtos/regras-cadastro — codigo de barras na criacao", () => {
  it("EAN vazio recebe o codigo interno; EAN informado fica como veio", () => {
    expect(codigoBarrasNaCriacao(null, "13167")).toBe("13167");
    expect(codigoBarrasNaCriacao("   ", "13167")).toBe("13167");
    expect(codigoBarrasNaCriacao("7894900060010", "13167")).toBe("7894900060010");
    expect(codigoBarrasNaCriacao(null, null)).toBeNull();
  });
});

describe("produtos/regras-cadastro — maiusculas", () => {
  it("so os textos descritivos viram maiusculas; codigos ficam intactos", () => {
    const resultado = normalizarTextosProduto({
      descricao: "pão de queijo 1 kg",
      nomeCatalogo: "pão de queijo",
      marca: "forno de minas",
      setorEstoque: "congelados",
      setorVenda1: "padaria",
      setorVenda2: null,
      localVenda1: "vitrine",
      localVenda2: undefined,
      codigoBarras: "abc123",
      transformacao: { produtoReceituario: "massa base", refReceituario: "r-1" },
      fiscal: { categoriaFiscal: "alimentos", ncm: "1905" }
    });
    expect(resultado).toEqual({
      descricao: "PÃO DE QUEIJO 1 KG",
      nomeCatalogo: "PÃO DE QUEIJO",
      marca: "FORNO DE MINAS",
      setorEstoque: "CONGELADOS",
      setorVenda1: "PADARIA",
      setorVenda2: null,
      localVenda1: "VITRINE",
      localVenda2: undefined,
      codigoBarras: "abc123",
      transformacao: { produtoReceituario: "MASSA BASE", refReceituario: "r-1" },
      fiscal: { categoriaFiscal: "ALIMENTOS", ncm: "1905" }
    });
  });
});

describe("produtos/regras — descricao sem gramatura", () => {
  it("quantidade 0 nao aparece na descricao (oficial)", () => {
    expect(montarDescricao("Bolo de laranja", 0, "UN")).toBe("BOLO DE LARANJA UN");
    expect(montarDescricao("Farinha", "1,5", "KG")).toBe("FARINHA 1,5 KG");
  });
});

describe("produtos/regras — margem padrao do grupo", () => {
  it("converte percentual digitado em fracao e volta", () => {
    expect(margemPercentualParaFracao("30")).toBe(0.3);
    expect(margemPercentualParaFracao("12,5")).toBe(0.125);
    expect(margemPercentualParaFracao("")).toBeNull();
    expect(fracaoParaMargemPercentual("0.4000")).toBe("40");
    expect(fracaoParaMargemPercentual(null)).toBe("");
  });
});
