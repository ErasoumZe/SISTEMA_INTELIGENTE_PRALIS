// R-173, confirmada por Marco em 26/08/2026:
//
//   FORMAS DE PAGAMENTO = VALOR FINAL COBRADO DO CLIENTE
//   valor original − desconto + acréscimo
//
// Taxa de adquirente/cartão é custo financeiro separado e NÃO reduz o que o cliente precisou pagar.
//
// Estes casos existem porque a validação antiga comparava os pagamentos com o `valor_original` (o
// subtotal). Para qualquer venda com desconto ou acréscimo isso era insatisfazível contra a R-173: o
// payload correto era recusado com 400 e nada era gravado. Cada caso aqui aceita SOMENTE a soma certa
// e recusa a antiga — se alguém voltar a comparar com o subtotal, os casos de desconto e acréscimo
// ficam vermelhos na hora.
import { describe, expect, it } from "vitest";
import { validarVenda } from "../../api/src/vendas/vendas.service.js";
import { liquidoCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import type { VendaPayload } from "@padaria/shared/vendas";

const EMPRESA = "11111111-1111-4111-8111-111111111111";

function venda(parcial: {
  valorOriginal: number;
  valorDesconto?: number;
  valorAcrescimo?: number;
  pagamentos: number[];
}): VendaPayload {
  return {
    empresaId: EMPRESA,
    dataReferencia: "2026-08-12",
    descricao: "Venda de teste",
    valorOriginal: parcial.valorOriginal,
    valorDesconto: parcial.valorDesconto ?? 0,
    valorAcrescimo: parcial.valorAcrescimo ?? 0,
    computar: true,
    itensVenda: [],
    tiposPagamento: parcial.pagamentos.map((totalPago) => ({ numeroVendas: 1, totalPago }))
  };
}

function aceita(payload: VendaPayload) {
  expect(() => validarVenda(payload)).not.toThrow();
}

function recusa(payload: VendaPayload) {
  expect(() => validarVenda(payload)).toThrowError(/valor final cobrado do cliente/iu);
}

describe("liquidoCentavos é o valor final cobrado do cliente", () => {
  it("é exatamente original − desconto + acréscimo", () => {
    expect(liquidoCentavos({ valorOriginal: 100, valorDesconto: 10, valorAcrescimo: 5 })).toBe(9_500);
    expect(liquidoCentavos({ valorOriginal: 100, valorDesconto: 0, valorAcrescimo: 0 })).toBe(10_000);
    expect(liquidoCentavos({ valorOriginal: 100, valorDesconto: 100, valorAcrescimo: 0 })).toBe(0);
  });

  // A prova de que TAXA nao entra: a formula so aceita tres campos. Nao ha onde uma taxa de
  // adquirente se esconder, e passar um campo a mais nao muda o resultado.
  it("nao tem termo de taxa de adquirente — campo extra e simplesmente ignorado", () => {
    const semTaxa = liquidoCentavos({ valorOriginal: 100, valorDesconto: 10, valorAcrescimo: 5 });
    const comCampoDeTaxa = liquidoCentavos({
      valorOriginal: 100,
      valorDesconto: 10,
      valorAcrescimo: 5,
      ...({ taxaAdquirente: 3.5 } as object)
    });
    expect(comCampoDeTaxa).toBe(semTaxa);
    expect(comCampoDeTaxa).toBe(9_500);
  });

  // O CREARE manda `valorTotal` como o valor final da venda. O liquido calculado das tres colunas
  // gravadas tem de dar o MESMO numero — e o cruzamento que prova que a base esta certa.
  it("bate com o valorTotal que o CREARE envia", () => {
    const doCreare = { valorSubtotal: 100, desconto: 10, acrescimo: 5, valorTotal: 95 };
    const calculado = liquidoCentavos({
      valorOriginal: doCreare.valorSubtotal,
      valorDesconto: doCreare.desconto,
      valorAcrescimo: doCreare.acrescimo
    });
    expect(calculado).toBe(paraCentavos(doCreare.valorTotal));
  });
});

describe("validarVenda — venda SEM ajuste", () => {
  it("aceita a soma igual ao valor da venda", () => {
    aceita(venda({ valorOriginal: 100, pagamentos: [100] }));
    aceita(venda({ valorOriginal: 100, pagamentos: [40, 60] }));
  });

  it("recusa soma diferente, para mais e para menos", () => {
    recusa(venda({ valorOriginal: 100, pagamentos: [99] }));
    recusa(venda({ valorOriginal: 100, pagamentos: [101] }));
    recusa(venda({ valorOriginal: 100, pagamentos: [40, 59.99] }));
  });
});

describe("validarVenda — venda COM DESCONTO", () => {
  // Venda de 100 com 10 de desconto: o cliente pagou 90.
  const comDesconto = (pagamentos: number[]) => venda({ valorOriginal: 100, valorDesconto: 10, pagamentos });

  it("aceita a soma igual ao valor final cobrado (90), nao ao subtotal", () => {
    aceita(comDesconto([90]));
    aceita(comDesconto([50, 40]));
  });

  // ESTE e o caso que a validacao antiga quebrava: 90 era recusado e 100 era aceito — o inverso do
  // que a R-173 manda.
  it("RECUSA a soma igual ao subtotal (100), que era o comportamento antigo", () => {
    recusa(comDesconto([100]));
  });

  it("recusa qualquer outra soma", () => {
    recusa(comDesconto([89.99]));
    recusa(comDesconto([90.01]));
  });
});

describe("validarVenda — venda COM ACRÉSCIMO", () => {
  // Venda de 100 com 5 de acrescimo: o cliente pagou 105.
  const comAcrescimo = (pagamentos: number[]) => venda({ valorOriginal: 100, valorAcrescimo: 5, pagamentos });

  it("aceita a soma igual ao valor final cobrado (105)", () => {
    aceita(comAcrescimo([105]));
    aceita(comAcrescimo([100, 5]));
  });

  it("RECUSA a soma igual ao subtotal (100), que era o comportamento antigo", () => {
    recusa(comAcrescimo([100]));
  });

  it("recusa qualquer outra soma", () => {
    recusa(comAcrescimo([104.99]));
    recusa(comAcrescimo([105.01]));
  });
});

describe("validarVenda — desconto E acréscimo na mesma venda", () => {
  const ambos = (pagamentos: number[]) =>
    venda({ valorOriginal: 100, valorDesconto: 10, valorAcrescimo: 5, pagamentos });

  it("aceita 95, que é 100 − 10 + 5", () => {
    aceita(ambos([95]));
    aceita(ambos([70, 25]));
  });

  it("recusa 100, 90 e 105 — nenhum é o valor final", () => {
    recusa(ambos([100]));
    recusa(ambos([90]));
    recusa(ambos([105]));
  });

  // Tolerancia ZERO, igual à da ingestão: um centavo já é divergência.
  it("um centavo de diferença já recusa", () => {
    recusa(ambos([94.99]));
    recusa(ambos([95.01]));
  });
});

describe("validarVenda — a soma dos ITENS continua no subtotal", () => {
  // Os itens compõem o subtotal; desconto e acréscimo são da venda inteira. As duas bases são
  // diferentes de propósito, e este caso registra isso para ninguém "unificar" as duas por engano.
  it("itens batem com o valor original, mesmo havendo desconto", () => {
    const payload = {
      ...venda({ valorOriginal: 100, valorDesconto: 10, pagamentos: [90] }),
      itensVenda: [
        { descricaoProduto: "Pao", quantidade: 1, valorUnitario: 60, valorTotal: 60 },
        { descricaoProduto: "Leite", quantidade: 1, valorUnitario: 40, valorTotal: 40 }
      ]
    } as VendaPayload;
    expect(() => validarVenda(payload)).not.toThrow();
  });

  it("itens que somam o LÍQUIDO em vez do subtotal são recusados", () => {
    const payload = {
      ...venda({ valorOriginal: 100, valorDesconto: 10, pagamentos: [90] }),
      itensVenda: [{ descricaoProduto: "Pao", quantidade: 1, valorUnitario: 90, valorTotal: 90 }]
    } as VendaPayload;
    expect(() => validarVenda(payload)).toThrowError(/itens da venda/iu);
  });
});
