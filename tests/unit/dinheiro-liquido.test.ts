import { describe, expect, it } from "vitest";
import { deCentavos, liquidoCentavos, liquidoDeSomasCentavos, paraCentavos } from "@padaria/shared/dinheiro";

// valor_original guarda o SUBTOTAL (na venda integrada, o VALOR_SUBTOTAL do CREARE). O liquido —
// o que de fato entrou — e original - desconto + acrescimo, e e ele que tem de bater com o
// VALOR_TOTAL do CREARE. Somar valor_original puro era o BUG A.
describe("liquidoCentavos", () => {
  it("desconta o desconto (venda que o subtotal superestima)", () => {
    // CREARE: subtotal 100,00 - desconto 10,00 = VALOR_TOTAL 90,00
    expect(liquidoCentavos({ valorOriginal: "100.00", valorDesconto: "10.00", valorAcrescimo: "0" })).toBe(9000);
  });

  it("soma o acrescimo (venda que o subtotal subestima)", () => {
    // CREARE: subtotal 100,00 + acrescimo 5,50 = VALOR_TOTAL 105,50
    expect(liquidoCentavos({ valorOriginal: "100.00", valorDesconto: "0", valorAcrescimo: "5.50" })).toBe(10550);
  });

  it("aplica desconto e acrescimo na mesma venda", () => {
    expect(liquidoCentavos({ valorOriginal: "100.00", valorDesconto: "10.00", valorAcrescimo: "5.50" })).toBe(9550);
  });

  it("sem desconto/acrescimo o liquido e o proprio valor original", () => {
    expect(liquidoCentavos({ valorOriginal: "42.00" })).toBe(4200);
    expect(liquidoCentavos({ valorOriginal: "42.00", valorDesconto: null, valorAcrescimo: undefined })).toBe(4200);
  });

  it("nao perde centavo em aritmetica inteira", () => {
    // 0.1 + 0.2 em float daria 0.30000000000000004; aqui e centavo inteiro.
    expect(liquidoCentavos({ valorOriginal: "0.10", valorDesconto: "0", valorAcrescimo: "0.20" })).toBe(30);
    expect(deCentavos(liquidoCentavos({ valorOriginal: "0.10", valorDesconto: "0", valorAcrescimo: "0.20" }))).toBe(
      0.3
    );
  });
});

describe("liquidoDeSomasCentavos", () => {
  it("combinar somas por coluna equivale a somar o liquido linha a linha", () => {
    // Soma e linear: SUM(o) - SUM(d) + SUM(a) === SUM(o - d + a). E o que permite agregar no SQL
    // sem expressao aritmetica (proibida pelo verificador de arquitetura).
    const linhas = [
      { valorOriginal: "100.00", valorDesconto: "10.00", valorAcrescimo: "0" },
      { valorOriginal: "50.00", valorDesconto: "0", valorAcrescimo: "5.50" },
      { valorOriginal: "7.25", valorDesconto: "1.25", valorAcrescimo: "0.10" }
    ];
    const linhaALinha = linhas.reduce((total, linha) => total + liquidoCentavos(linha), 0);
    const porSomas = liquidoDeSomasCentavos({
      somaOriginal: linhas.reduce((total, linha) => total + paraCentavos(linha.valorOriginal), 0) / 100,
      somaDesconto: linhas.reduce((total, linha) => total + paraCentavos(linha.valorDesconto), 0) / 100,
      somaAcrescimo: linhas.reduce((total, linha) => total + paraCentavos(linha.valorAcrescimo), 0) / 100
    });

    expect(porSomas).toBe(linhaALinha);
    expect(porSomas).toBe(15160); // 90,00 + 55,50 + 6,10
  });

  it("trata somas nulas (nenhuma linha no filtro)", () => {
    expect(liquidoDeSomasCentavos({ somaOriginal: null, somaDesconto: null, somaAcrescimo: null })).toBe(0);
  });
});
