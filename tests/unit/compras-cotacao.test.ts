import { describe, expect, it } from "vitest";
import {
  calcularCotacao,
  dezMilesimosParaDecimal,
  expiracaoCotacao,
  pendenciasParaEnviar,
  quantidadeEmMilesimos,
  type ItemCotacaoEntrada
} from "@padaria/shared/compras";

/**
 * R-216 — numeros da cotacao conferidos a mao. Cada caso diz a conta, para que quem ler o teste
 * consiga discordar da REGRA, e nao so do resultado.
 */

const item = (sobrescrita: Partial<ItemCotacaoEntrada> & { id: string }): ItemCotacaoEntrada => ({
  quantidade: "1",
  indisponivel: false,
  valorUnitario: null,
  descontoTipo: null,
  descontoValor: null,
  ...sobrescrita
});

// A: 10 x 5,00 sem desconto = 50,00. B: 3 x 10,00 com R$ 1,00 por unidade = 3 x 9,00 = 27,00.
const A = item({ id: "a", quantidade: "10.000", valorUnitario: "5.00" });
const B = item({ id: "b", quantidade: "3.000", valorUnitario: "10.00", descontoTipo: "valor", descontoValor: "1.00" });

describe("prazo do link em dias uteis", () => {
  // Segunda 12/10/2026, 10h em Sao Paulo. Conta terca 13 (1) e quarta 14 (2): vale ate o fim da
  // quarta, ou seja, meia-noite local de quinta 15/10 = 03:00Z. (12/10 e feriado nacional: sem
  // calendario de feriados, o sistema conta como dia comum — limite registrado na R-216.)
  it("enviado na segunda vale ate o fim da quarta", () => {
    expect(expiracaoCotacao(new Date("2026-10-12T13:00:00Z")).toISOString()).toBe("2026-10-15T03:00:00.000Z");
  });

  // Sexta 16/10: sabado e domingo nao contam; segunda (1), terca (2).
  it("enviado na sexta vale ate o fim da terca", () => {
    expect(expiracaoCotacao(new Date("2026-10-16T15:00:00Z")).toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });

  it("enviado no sabado tambem vale ate o fim da terca", () => {
    expect(expiracaoCotacao(new Date("2026-10-17T15:00:00Z")).toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });

  // 23h30 de domingo em Sao Paulo ja e segunda em UTC. O dia que conta e o do negocio (domingo).
  it("usa o dia do negocio, nao o dia em UTC", () => {
    expect(expiracaoCotacao(new Date("2026-10-19T02:30:00Z")).toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });
});

describe("calculo da cotacao", () => {
  it("soma itens e aplica desconto em R$ POR UNIDADE", () => {
    const calculo = calcularCotacao([A, B], { tipo: null, valor: null });
    expect(calculo.totalBrutoCentavos).toBe(8000);
    expect(calculo.descontoItensCentavos).toBe(300);
    expect(calculo.totalItensCentavos).toBe(7700);
    expect(calculo.totalFinalCentavos).toBe(7700);
    expect(calculo.itens[1]).toMatchObject({ unitarioComDescontoCentavos: 900, totalItemCentavos: 2700 });
  });

  // Desconto geral de R$ 1,00 sobre 77,00: A leva 100 x 50/77 = 64,93 e B 100 x 27/77 = 35,06.
  // Partes inteiras 64 + 35 = 99; o centavo que sobra vai para A, que tem a maior fracao.
  it("rateia o desconto geral pelo maior resto, sem perder centavo", () => {
    const calculo = calcularCotacao([A, B], { tipo: "valor", valor: "1.00" });
    expect(calculo.itens.map((linha) => linha.rateioGeralCentavos)).toEqual([65, 35]);
    expect(calculo.totalFinalCentavos).toBe(7600);
    expect(calculo.itens.reduce((soma, linha) => soma + linha.totalFinalCentavos, 0)).toBe(7600);
    // A: 49,35 / 10 = 4,935 por unidade. B: 26,65 / 3 = 8,8833...
    expect(dezMilesimosParaDecimal(calculo.itens[0]!.unitarioFinalDezMilesimos)).toBe("4.9350");
    expect(dezMilesimosParaDecimal(calculo.itens[1]!.unitarioFinalDezMilesimos)).toBe("8.8833");
  });

  // 5% de 77,00 = 3,85. Rateio exato: A 250 (50/77) e B 135 (27/77).
  it("desconto geral percentual incide sobre os itens ja descontados", () => {
    const calculo = calcularCotacao([A, B], { tipo: "percentual", valor: "5" });
    expect(calculo.descontoGeralCentavos).toBe(385);
    expect(calculo.itens.map((linha) => linha.rateioGeralCentavos)).toEqual([250, 135]);
    expect(calculo.totalFinalCentavos).toBe(7315);
  });

  // 10% de 3,33 = 0,333 -> 0,33 por unidade, preco 3,00. 4,5 x 3,33 = 14,985 -> 14,99 de bruto.
  it("percentual por unidade e quantidade fracionada arredondam uma vez por etapa", () => {
    const calculo = calcularCotacao(
      [item({ id: "c", quantidade: "4.500", valorUnitario: "3.33", descontoTipo: "percentual", descontoValor: "10" })],
      { tipo: null, valor: null }
    );
    expect(calculo.itens[0]).toMatchObject({
      brutoCentavos: 1499,
      unitarioComDescontoCentavos: 300,
      totalItemCentavos: 1350
    });
  });

  it("item indisponivel fica fora de todos os totais", () => {
    const calculo = calcularCotacao(
      [A, item({ id: "z", quantidade: "2", valorUnitario: "99.00", indisponivel: true })],
      {
        tipo: null,
        valor: null
      }
    );
    expect(calculo.totalBrutoCentavos).toBe(5000);
    expect(calculo.itens[1]).toMatchObject({ brutoCentavos: 0, totalFinalCentavos: 0 });
  });

  it("aponta desconto maior que o valor, acima de 100% e desconto geral maior que o total", () => {
    const calculo = calcularCotacao(
      [
        item({ id: "x", valorUnitario: "5.00", descontoTipo: "valor", descontoValor: "6.00" }),
        item({ id: "y", valorUnitario: "5.00", descontoTipo: "percentual", descontoValor: "150" })
      ],
      { tipo: "valor", valor: "100.00" }
    );
    expect(calculo.itens.map((linha) => linha.erro)).toEqual([
      "Desconto maior que o valor.",
      "Desconto acima de 100%."
    ]);
    expect(calculo.erroGeral).toBe("Desconto do pedido maior que o total.");
    expect(calculo.totalFinalCentavos).toBe(0);
  });
});

describe("pendencias para enviar", () => {
  it("lista o produto sem valor pelo nome, e aceita rascunho incompleto", () => {
    const itens = [A, item({ id: "f", quantidade: "2" })];
    const pendencias = pendenciasParaEnviar(itens, calcularCotacao(itens, { tipo: null, valor: null }), {
      f: "Farinha"
    });
    expect(pendencias).toEqual(["Informe o valor de Farinha."]);
  });

  it("nao deixa enviar com todos os itens indisponiveis", () => {
    const itens = [item({ id: "g", indisponivel: true })];
    expect(pendenciasParaEnviar(itens, calcularCotacao(itens, { tipo: null, valor: null }))).toEqual([
      "Informe o valor de ao menos um item."
    ]);
  });
});

it("quantidade em milesimos aceita ponto e virgula", () => {
  expect(quantidadeEmMilesimos("4.500")).toBe(4500);
  expect(quantidadeEmMilesimos("4,5")).toBe(4500);
  expect(quantidadeEmMilesimos("40")).toBe(40000);
});
