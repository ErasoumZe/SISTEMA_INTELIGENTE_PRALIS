// R-041 (juros em % ou R$) e R-042 (Valor Total = Valor + Juros).
//
// Estas regras existiam so como expressao inline dentro de um .vue — sem funcao, sem teste, sem
// persistencia. Foi assim que morreram: nada quebrava quando o comportamento mudava. O teste aqui
// e o antidoto que o PROJECT_BRAIN/19 pede na coluna `Teste`.
import { describe, expect, it } from "vitest";
import { centavosParaDecimalBanco, jurosCentavos, valorTotalCentavos } from "@padaria/shared";

describe("jurosCentavos (R-041)", () => {
  it("sem tipo, nao ha juros — o historico inteiro e assim", () => {
    expect(jurosCentavos({ valorOriginal: 1000, jurosValorInformado: 50 })).toBe(0);
    expect(jurosCentavos({ valorOriginal: 1000, jurosValorInformado: 50, jurosTipo: null })).toBe(0);
  });

  it("tipo 'valor': o informado JA e o R$", () => {
    expect(jurosCentavos({ valorOriginal: 1000, jurosValorInformado: 20, jurosTipo: "valor" })).toBe(2000);
    expect(jurosCentavos({ valorOriginal: 1000, jurosValorInformado: "20,50", jurosTipo: "valor" })).toBe(2050);
  });

  it("tipo 'percentual': incide sobre o VALOR, nunca sobre o total", () => {
    // O caso que o Jose pediu explicitamente: 1000 a 2% = R$ 20,00.
    expect(jurosCentavos({ valorOriginal: 1000, jurosValorInformado: 2, jurosTipo: "percentual" })).toBe(2000);
    expect(jurosCentavos({ valorOriginal: 500, jurosValorInformado: 10, jurosTipo: "percentual" })).toBe(5000);
  });

  it("percentual NAO e lido como dinheiro — 2.5% e dois e meio por cento, nao R$ 2,50", () => {
    // Se o percentual passasse por paraCentavos, "2.5" viraria 250 e o juros sairia 100x maior.
    expect(jurosCentavos({ valorOriginal: 1000, jurosValorInformado: "2.5", jurosTipo: "percentual" })).toBe(2500);
    expect(jurosCentavos({ valorOriginal: 1000, jurosValorInformado: "2,5", jurosTipo: "percentual" })).toBe(2500);
  });

  it("arredonda no centavo, uma vez so", () => {
    // 333,33 a 2% = 6,6666 -> 6,67. Arredondar antes daria 6,66.
    expect(jurosCentavos({ valorOriginal: "333,33", jurosValorInformado: 2, jurosTipo: "percentual" })).toBe(667);
    // 0,01 a 1% = 0,0001 -> 0 centavo.
    expect(jurosCentavos({ valorOriginal: "0,01", jurosValorInformado: 1, jurosTipo: "percentual" })).toBe(0);
  });

  it("zero e valores ausentes nao viram NaN", () => {
    expect(jurosCentavos({ valorOriginal: 0, jurosValorInformado: 10, jurosTipo: "percentual" })).toBe(0);
    expect(jurosCentavos({ valorOriginal: 1000, jurosValorInformado: 0, jurosTipo: "percentual" })).toBe(0);
    expect(jurosCentavos({ valorOriginal: 1000, jurosTipo: "valor" })).toBe(0);
    expect(jurosCentavos({ valorOriginal: null, jurosValorInformado: undefined, jurosTipo: "percentual" })).toBe(0);
  });

  it("juros negativo nao existe — desconto tem campo proprio", () => {
    expect(jurosCentavos({ valorOriginal: 1000, jurosValorInformado: -5, jurosTipo: "valor" })).toBe(0);
    expect(jurosCentavos({ valorOriginal: 1000, jurosValorInformado: -5, jurosTipo: "percentual" })).toBe(0);
  });
});

describe("valorTotalCentavos (R-042)", () => {
  it("o caso do Jose: 1000 com 2% -> juros 20,00 e total 1020,00", () => {
    const juros = jurosCentavos({ valorOriginal: 1000, jurosValorInformado: 2, jurosTipo: "percentual" });
    const total = valorTotalCentavos({ valorOriginal: 1000, jurosValorInformado: 2, jurosTipo: "percentual" });
    expect(centavosParaDecimalBanco(juros)).toBe("20.00");
    expect(centavosParaDecimalBanco(total)).toBe("1020.00");
  });

  it("sem juros, total = valor", () => {
    expect(valorTotalCentavos({ valorOriginal: "1500,75" })).toBe(150075);
  });

  it("desconto entra na conta quando existe", () => {
    expect(
      valorTotalCentavos({ valorOriginal: 1000, jurosValorInformado: 2, jurosTipo: "percentual", valorDesconto: 100 })
    ).toBe(92000);
  });

  it("nunca devolve total negativo", () => {
    expect(valorTotalCentavos({ valorOriginal: 100, valorDesconto: 500 })).toBe(0);
  });
});
