import { describe, expect, it } from "vitest";
import { calcularDiscriminacao, conferirDiscriminacao } from "@padaria/shared/discriminacao";

// PROJECT_BRAIN/17 §5 + D4: descontos cumulativos em 3 niveis, rateio proporcional ao valor, em
// centavos, com a SOBRA NO ULTIMO item, recalculando o unitario. Tudo em centavos inteiros.

const totais = (calculo: ReturnType<typeof calcularDiscriminacao>) =>
  calculo.itens.map((item) => item.valorTotalComDescontoCentavos);
const unitarios = (calculo: ReturnType<typeof calcularDiscriminacao>) =>
  calculo.itens.map((item) => item.valorUnitarioComDescontoCentavos);
const rateios = (calculo: ReturnType<typeof calcularDiscriminacao>) =>
  calculo.itens.map((item) => item.rateioDescontoGeralCentavos);

describe("nivel 3 — desconto geral com rateio (D4)", () => {
  // FOTO 3 do Rodrigo: nota de 40,00 com 17,5% de desconto geral.
  it("rateia a nota de 40,00 com 17,5% como na FOTO 3 (0,83 / 1,65 / 2,48 e total 33,00)", () => {
    const calculo = calcularDiscriminacao({
      itens: [
        { quantidade: 4, valorUnitario: 1 },
        { quantidade: 3, valorUnitario: 2 },
        { quantidade: 10, valorUnitario: 3 }
      ],
      descontoGeralTipo: "percentual",
      descontoGeralValor: 17.5
    });

    expect(calculo.totalItensCentavos).toBe(4000);
    expect(calculo.descontoGeralCentavos).toBe(700);
    expect(rateios(calculo)).toEqual([70, 105, 525]);
    expect(totais(calculo)).toEqual([330, 495, 2475]);
    expect(unitarios(calculo)).toEqual([83, 165, 248]);
    expect(calculo.totalComDescontoCentavos).toBe(3300);
  });

  // O caso da FOTO divide exato e NAO exercita a sobra. Este exercita.
  it("sobra no ULTIMO item quando o rateio nao divide exato (10,00 sobre 3 itens de 10,00)", () => {
    const calculo = calcularDiscriminacao({
      itens: [
        { quantidade: 1, valorUnitario: 10 },
        { quantidade: 1, valorUnitario: 10 },
        { quantidade: 1, valorUnitario: 10 }
      ],
      descontoGeralTipo: "valor",
      descontoGeralValor: 10
    });

    expect(rateios(calculo)).toEqual([333, 333, 334]);
    // A soma das partes e EXATAMENTE o desconto: nenhum centavo aparece nem some.
    expect(rateios(calculo).reduce((soma, parte) => soma + parte, 0)).toBe(1000);
    expect(totais(calculo)).toEqual([667, 667, 666]);
    expect(calculo.totalComDescontoCentavos).toBe(2000);
  });

  it("sobra no ULTIMO item com percentual quebrado (7,77% sobre 10,00 / 20,00 / 30,00)", () => {
    const calculo = calcularDiscriminacao({
      itens: [
        { quantidade: 1, valorUnitario: 10 },
        { quantidade: 1, valorUnitario: 20 },
        { quantidade: 1, valorUnitario: 30 }
      ],
      descontoGeralTipo: "percentual",
      descontoGeralValor: 7.77
    });

    // 6000 x 7,77% = 466,2 -> 466 centavos. Partes justas: 77,67 / 155,33 / 233,0.
    expect(calculo.descontoGeralCentavos).toBe(466);
    expect(rateios(calculo)).toEqual([77, 155, 234]);
    expect(rateios(calculo).reduce((soma, parte) => soma + parte, 0)).toBe(466);
    expect(totais(calculo)).toEqual([923, 1845, 2766]);
    expect(calculo.totalComDescontoCentavos).toBe(5534);
  });

  it("um centavo de desconto vai inteiro para o ultimo item, sem sumir no arredondamento", () => {
    const calculo = calcularDiscriminacao({
      itens: [
        { quantidade: 1, valorUnitario: 10 },
        { quantidade: 1, valorUnitario: 10 }
      ],
      descontoGeralTipo: "valor",
      descontoGeralValor: 0.01
    });

    expect(rateios(calculo)).toEqual([0, 1]);
    expect(calculo.totalComDescontoCentavos).toBe(1999);
  });

  it("recalcula o unitario a partir do total rateado (afeta custo)", () => {
    const calculo = calcularDiscriminacao({
      itens: [{ quantidade: 3, valorUnitario: 10 }],
      descontoGeralTipo: "valor",
      descontoGeralValor: 10
    });

    // 30,00 - 10,00 = 20,00 em 3 unidades = 6,6667 -> 6,67 (derivado, arredondado em centavos).
    expect(totais(calculo)).toEqual([2000]);
    expect(unitarios(calculo)).toEqual([667]);
  });

  it("nao desconta mais do que existe: desconto geral maior que o total zera em vez de negativar", () => {
    const calculo = calcularDiscriminacao({
      itens: [{ quantidade: 1, valorUnitario: 10 }],
      descontoGeralTipo: "valor",
      descontoGeralValor: 999
    });

    expect(calculo.descontoGeralCentavos).toBe(1000);
    expect(calculo.totalComDescontoCentavos).toBe(0);
    expect(totais(calculo)).toEqual([0]);
  });
});

describe("nivel 1 — desconto no V.Unit (nao rateia)", () => {
  it("percentual no unitario reduz o total do item proporcionalmente", () => {
    const calculo = calcularDiscriminacao({
      itens: [{ quantidade: 2, valorUnitario: 10, descontoTipo: "percentual", descontoValor: 10 }]
    });

    expect(calculo.itens[0]?.valorBrutoCentavos).toBe(2000);
    expect(calculo.totalItensCentavos).toBe(1800);
    expect(unitarios(calculo)).toEqual([900]);
  });

  it("em 'valor' o desconto e R$ POR UNIDADE", () => {
    const calculo = calcularDiscriminacao({
      itens: [{ quantidade: 3, valorUnitario: 10, descontoTipo: "valor", descontoValor: 1 }]
    });

    // 3 unidades x (10,00 - 1,00) = 27,00
    expect(calculo.totalItensCentavos).toBe(2700);
    expect(unitarios(calculo)).toEqual([900]);
  });
});

describe("nivel 2 — desconto no V.Total do item", () => {
  it("em 'valor' incide sobre o total daquele item e recalcula o unitario", () => {
    const calculo = calcularDiscriminacao({
      itens: [{ quantidade: 4, valorUnitario: 10, descontoTotalTipo: "valor", descontoTotalValor: 8 }]
    });

    // 40,00 - 8,00 = 32,00 em 4 unidades = 8,00
    expect(calculo.totalItensCentavos).toBe(3200);
    expect(unitarios(calculo)).toEqual([800]);
  });
});

describe("os 3 niveis sao cumulativos", () => {
  it("aplica V.Unit, depois V.Total do item, depois o geral", () => {
    const calculo = calcularDiscriminacao({
      itens: [
        {
          quantidade: 2,
          valorUnitario: 10,
          descontoTipo: "percentual",
          descontoValor: 10, // 20,00 -> 18,00
          descontoTotalTipo: "valor",
          descontoTotalValor: 3 // 18,00 -> 15,00
        }
      ],
      descontoGeralTipo: "percentual",
      descontoGeralValor: 10 // 15,00 -> 13,50
    });

    expect(calculo.totalItensCentavos).toBe(1500);
    expect(calculo.descontoGeralCentavos).toBe(150);
    expect(calculo.totalComDescontoCentavos).toBe(1350);
    expect(unitarios(calculo)).toEqual([675]);
  });
});

describe("conferirDiscriminacao (D5) — bloqueia e aponta onde diverge", () => {
  it("nao acusa nada quando a soma bate com o valor do lancamento", () => {
    const divergencia = conferirDiscriminacao(
      [
        { quantidade: 4, valorUnitario: 1 },
        { quantidade: 3, valorUnitario: 2 },
        { quantidade: 10, valorUnitario: 3 }
      ],
      "40.00"
    );
    expect(divergencia).toBeNull();
  });

  it("aponta a diferenca e a linha provavel (a de maior valor)", () => {
    const divergencia = conferirDiscriminacao(
      [
        { quantidade: 1, valorUnitario: 10 },
        { quantidade: 1, valorUnitario: 25 }
      ],
      "30.00"
    );

    expect(divergencia).toMatchObject({
      totalItensCentavos: 3500,
      valorLancamentoCentavos: 3000,
      diferencaCentavos: 500,
      linhaProvavel: 2,
      campoProvavel: "valorTotal"
    });
  });

  it("diferenca NEGATIVA quando os itens somam menos que o lancamento", () => {
    const divergencia = conferirDiscriminacao([{ quantidade: 1, valorUnitario: 10 }], "30.00");
    expect(divergencia?.diferencaCentavos).toBe(-2000);
  });

  it("um centavo de diferenca ja bloqueia (D5 nao tem tolerancia)", () => {
    const divergencia = conferirDiscriminacao([{ quantidade: 1, valorUnitario: "9.99" }], "10.00");
    expect(divergencia?.diferencaCentavos).toBe(-1);
  });

  // A D5 confere o BRUTO da discriminacao contra o Valor do lancamento; o desconto geral entra
  // depois, sobre esse total (por isso ele nao participa da conferencia).
  it("confere os itens liquidos dos descontos DE ITEM, nao o desconto geral", () => {
    const divergencia = conferirDiscriminacao(
      [{ quantidade: 2, valorUnitario: 10, descontoTotalTipo: "valor", descontoTotalValor: 5 }],
      "15.00"
    );
    expect(divergencia).toBeNull();
  });
});
