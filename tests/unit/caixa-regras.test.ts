import { describe, expect, it } from "vitest";
import {
  montarResumoCaixa,
  saldoCaixaCentavos,
  saldoProprioCentavos,
  type TotaisCaixaCentavos
} from "@padaria/shared/caixa";
import { centavosParaDecimalBanco, deCentavos, paraCentavos, somarCentavos } from "@padaria/shared/dinheiro";

function totais(parcial: Partial<TotaisCaixaCentavos> = {}): TotaisCaixaCentavos {
  return {
    entradas: 0,
    transferencias: 0,
    transferenciasEntrada: 0,
    transferenciasSaida: 0,
    despesas: 0,
    retiradas: 0,
    mercadorias: 0,
    ...parcial
  };
}

describe("saldoCaixaCentavos", () => {
  it("Deve_AplicarFormulaOficial_Quando_TodosOsComponentesPresentes", () => {
    // 100.00 + 50.00 - 30.00 - 20.00 - 10.00 - 15.00 = 75.00
    const saldo = saldoCaixaCentavos(
      totais({
        entradas: 10000,
        transferenciasEntrada: 5000,
        transferenciasSaida: 3000,
        despesas: 2000,
        retiradas: 1000,
        mercadorias: 1500
      })
    );
    expect(saldo).toBe(7500);
  });

  it("Deve_SomarTransferenciaDeEntrada_E_SubtrairTransferenciaDeSaida", () => {
    expect(saldoCaixaCentavos(totais({ transferenciasEntrada: 1234 }))).toBe(1234);
    expect(saldoCaixaCentavos(totais({ transferenciasSaida: 1234 }))).toBe(-1234);
  });

  it("Deve_RetornarZero_Quando_CaixaFechaExato", () => {
    expect(saldoCaixaCentavos(totais({ entradas: 5000, despesas: 3000, retiradas: 2000 }))).toBe(0);
  });

  it("Deve_RetornarNegativo_Quando_HaSobraDeSaida", () => {
    expect(saldoCaixaCentavos(totais({ entradas: 1000, despesas: 1001 }))).toBe(-1);
  });

  it("Deve_SomarSemDriftDeFloat_Quando_ValoresQuebrados", () => {
    // Em float, 0.10 + 0.20 = 0.30000000000000004; em centavos e exato.
    const centavos = somarCentavos(0.1, 0.2);
    expect(centavos).toBe(30);
    expect(saldoCaixaCentavos(totais({ entradas: centavos, despesas: 30 }))).toBe(0);
  });

  it("Deve_ManterPrecisao_Quando_ValoresGrandes", () => {
    const saldo = saldoCaixaCentavos(totais({ entradas: 999_999_999_99, despesas: 1 }));
    expect(saldo).toBe(999_999_999_98);
  });
});

describe("montarResumoCaixa", () => {
  it("Deve_ConverterParaReais_E_CalcularSaldoPelaFormulaOficial", () => {
    const resumo = montarResumoCaixa(
      totais({
        entradas: 10000,
        transferencias: 8000,
        transferenciasEntrada: 5000,
        transferenciasSaida: 3000,
        despesas: 2000,
        retiradas: 1000,
        mercadorias: 1500
      })
    );
    expect(resumo).toEqual({
      totalEntradas: 100,
      totalTransferencias: 80,
      totalTransferenciasEntrada: 50,
      totalTransferenciasSaida: 30,
      totalDespesas: 20,
      totalRetiradas: 10,
      totalMercadorias: 15,
      dividaCofre: 0,
      // saldoProprio e OPERACIONAL (exclui transferencias): 100 - 20 - 10 - 15 = 55. O saldo fisico
      // (75) inclui o liquido das transferencias (+50 -30); saldoProprio nao.
      saldoProprio: 55,
      propostaRetorno: 75, // sobra em especie a devolver = saldo fisico (> 0)
      saldo: 75
    });
  });

  it("Deve_ManterDividaCofreZero_Quando_OFundoChegaPorTransferencia (R-001/R-040)", () => {
    // Fundo de 490 recebido na abertura pelo lacre: entra como transferenciasEntrada (dinheiro na
    // gaveta). R-001 revogou a R8 — o fundo NAO e emprestimo, entao nao nasce divida nenhuma.
    const resumo = montarResumoCaixa(totais({ transferenciasEntrada: 49000 }), 0);
    expect(resumo.dividaCofre).toBe(0);
    expect(resumo.saldo).toBe(490); // saldo fisico (formula canonica intacta)
    expect(resumo.saldoProprio).toBe(0); // operacional: nao ha venda nem despesa ainda
  });
});

// `saldoProprioCentavos` continua recebendo a divida como parametro, mas desde a R-001/R-040 a
// producao SEMPRE passa 0 (a coluna divida_cofre e legado — ver 18 D-08). Os casos com divida > 0
// ficam como guarda da funcao pura; nenhum fluxo do sistema os alcanca.
describe("saldoProprioCentavos (divida sempre 0 na producao; parametro legado)", () => {
  it("Deve_IgualarOperacional_Quando_FundoEntraSemDivida", () => {
    // Fundo de 490 na gaveta, sem venda: o operacional e 0 (transferencia nao e resultado).
    expect(saldoProprioCentavos(totais({ transferenciasEntrada: 49000 }), 0)).toBe(0);
  });

  it("Deve_ContarSomenteOOperacional_Quando_HaVendasSobreOFundo", () => {
    // 490 de venda sobre 490 de fundo: o resultado do caixa e a venda, nao o fundo.
    expect(saldoProprioCentavos(totais({ entradas: 49000, transferenciasEntrada: 49000 }), 0)).toBe(49000);
  });

  it("Deve_IgualarSaldoFisico_Quando_SemDivida_E_SemTransferencias", () => {
    const semFundo = totais({ entradas: 30000, despesas: 5000 });
    expect(saldoProprioCentavos(semFundo, 0)).toBe(saldoCaixaCentavos(semFundo));
  });

  it("Deve_NaoSerAfetado_Quando_HaSangria_ou_Retorno (M2)", () => {
    // Sangria/retorno so MOVEM dinheiro: nao entram no resultado operacional do caixa.
    const comSangria = totais({ entradas: 49000, transferenciasEntrada: 49000, transferenciasSaida: 20000 });
    expect(saldoProprioCentavos(comSangria, 0)).toBe(49000);
  });
});

describe("dinheiro em centavos", () => {
  it("Deve_ConverterEntreRepresentacoes_Quando_ValoresValidos", () => {
    expect(paraCentavos(75.5)).toBe(7550);
    expect(paraCentavos("75.50")).toBe(7550);
    expect(paraCentavos("75,50")).toBe(7550);
    expect(paraCentavos(-3.05)).toBe(-305);
    expect(paraCentavos(null)).toBe(0);
    expect(deCentavos(7550)).toBe(75.5);
  });

  it("Deve_TruncarNaSegundaCasa_Quando_ValorTemSubcentavo", () => {
    expect(paraCentavos("1.999")).toBe(199);
  });

  it("Deve_GerarDecimalExatoDoBanco_Quando_ConverterCentavos", () => {
    expect(centavosParaDecimalBanco(7550)).toBe("75.50");
    expect(centavosParaDecimalBanco(0)).toBe("0.00");
    expect(centavosParaDecimalBanco(1)).toBe("0.01");
    expect(centavosParaDecimalBanco(-305)).toBe("-3.05");
    expect(centavosParaDecimalBanco(100)).toBe("1.00");
    expect(centavosParaDecimalBanco(999_999_999_99)).toBe("999999999.99");
  });
});
