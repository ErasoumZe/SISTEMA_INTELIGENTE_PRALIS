import { describe, expect, it } from "vitest";
import { formatarCampoDinheiro, limparDigitacaoDinheiro, numeroDoCampo } from "./campo-dinheiro";

// O campo de dinheiro tem DOIS mundos: o que a pessoa digita (pt-BR, virgula) e o que vai no payload
// (decimal com ponto, que o `z.coerce.number()` do contrato espera). Estes testes prendem a
// conversao entre os dois — e, principalmente, a diferenca entre VAZIO e ZERO.

describe("numeroDoCampo", () => {
  it("le o formato brasileiro, com e sem separador de milhar", () => {
    expect(numeroDoCampo("50")).toBe(50);
    expect(numeroDoCampo("1234,5")).toBe(1234.5);
    expect(numeroDoCampo("1.234,56")).toBe(1234.56);
    expect(numeroDoCampo("1.234.567,89")).toBe(1234567.89);
  });

  it("le tambem o formato do payload (ponto decimal), que e o que volta do servidor", () => {
    expect(numeroDoCampo("1234.56")).toBe(1234.56);
    expect(numeroDoCampo(1234.56)).toBe(1234.56);
  });

  it("vazio e vazio — nao vira zero", () => {
    expect(numeroDoCampo("")).toBeNull();
    expect(numeroDoCampo("   ")).toBeNull();
    expect(numeroDoCampo(null)).toBeNull();
    expect(numeroDoCampo(undefined)).toBeNull();
  });

  it("zero digitado E zero — a diferenca para o vazio precisa sobreviver", () => {
    expect(numeroDoCampo("0")).toBe(0);
    expect(numeroDoCampo("0,00")).toBe(0);
  });

  it("devolve null para o que nao e numero, em vez de NaN no payload", () => {
    expect(numeroDoCampo(",")).toBeNull();
    expect(numeroDoCampo("abc")).toBeNull();
  });

  it("aceita a digitacao no meio do caminho, com o separador ainda sem decimal", () => {
    expect(numeroDoCampo("1234,")).toBe(1234);
  });
});

describe("formatarCampoDinheiro", () => {
  it("sempre mostra no minimo duas casas", () => {
    expect(formatarCampoDinheiro(50)).toBe("50,00");
    expect(formatarCampoDinheiro(0)).toBe("0,00");
    expect(formatarCampoDinheiro(1234.5)).toBe("1.234,50");
  });

  it("arredonda para duas casas quando o campo e dinheiro de verdade", () => {
    expect(formatarCampoDinheiro(1234.567)).toBe("1.234,57");
  });

  it("com `casas` maior, preserva o que a pessoa digitou (colunas scale 4)", () => {
    // Valor unitario, desconto e juros sao numeric(14,4): cortar em 2 casas na tela apagaria dado.
    expect(formatarCampoDinheiro(4.4, 4)).toBe("4,40");
    expect(formatarCampoDinheiro(0.3333, 4)).toBe("0,3333");
    expect(formatarCampoDinheiro(7.125, 4)).toBe("7,125");
  });
});

describe("limparDigitacaoDinheiro", () => {
  it("descarta letra e simbolo, mantendo digito e separador", () => {
    expect(limparDigitacaoDinheiro("R$ 1.234,56abc")).toBe("1234,56");
  });

  it("colar valor de planilha funciona: com virgula, o ponto e milhar e cai fora", () => {
    expect(numeroDoCampo(limparDigitacaoDinheiro("R$ 1.234,56"))).toBe(1234.56);
    expect(numeroDoCampo(limparDigitacaoDinheiro("1.234.567,89"))).toBe(1234567.89);
  });

  it("sem virgula, o ponto e o decimal — e o que o teclado numerico manda", () => {
    expect(limparDigitacaoDinheiro("1.5")).toBe("1.5");
    expect(numeroDoCampo(limparDigitacaoDinheiro("1.5"))).toBe(1.5);
  });

  it("sobra UM separador so — o campo nunca chega a '1,2,3'", () => {
    expect(limparDigitacaoDinheiro("1,2,3")).toBe("1,23");
    expect(limparDigitacaoDinheiro("1.2.3")).toBe("1.23");
  });

  it("nao atrapalha quem ainda nao digitou separador nenhum", () => {
    expect(limparDigitacaoDinheiro("50")).toBe("50");
    expect(limparDigitacaoDinheiro("")).toBe("");
  });
});
