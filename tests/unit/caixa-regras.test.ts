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

  it("Deve_ExporDividaCofre_E_SaldoProprioNegativo_Quando_AberturaComMalote", () => {
    // Malote de 490: a transferencia de abertura entra como transferenciasEntrada (dinheiro na
    // gaveta) e dividaCofre = 490. Sem vendas, o saldo proprio nasce em -490 (deficit).
    const resumo = montarResumoCaixa(totais({ transferenciasEntrada: 49000 }), 49000);
    expect(resumo.dividaCofre).toBe(490);
    expect(resumo.saldo).toBe(490); // saldo fisico (formula canonica intacta)
    expect(resumo.saldoProprio).toBe(-490); // deficit com o cofre
  });
});

describe("saldoProprioCentavos (R8 — deficit do malote, Opcao A/Lente B)", () => {
  it("Deve_NascerEmDeficit_Quando_AberturaComMalote490SemVendas", () => {
    // Abertura: transferencia cofre->caixa de 490 (transferenciasEntrada) e divida 490.
    const saldoProprio = saldoProprioCentavos(totais({ transferenciasEntrada: 49000 }), 49000);
    expect(saldoProprio).toBe(-49000);
  });

  it("Deve_QuitarDivida_Quando_VendasEmDinheiroIgualamOMalote", () => {
    // 490 em vendas dinheiro sobre o malote de 490: deficit zerado.
    const saldoProprio = saldoProprioCentavos(totais({ entradas: 49000, transferenciasEntrada: 49000 }), 49000);
    expect(saldoProprio).toBe(0);
  });

  it("Deve_VirarResultado_Quando_VendasSuperamOMalote", () => {
    // 600 em vendas sobre malote de 490: 110 de resultado do caixa.
    const saldoProprio = saldoProprioCentavos(totais({ entradas: 60000, transferenciasEntrada: 49000 }), 49000);
    expect(saldoProprio).toBe(11000);
  });

  it("Deve_IgualarSaldoFisico_Quando_SemMalote_E_SemTransferencias", () => {
    // Retrocompat: sem malote (divida 0) e sem transferencias, saldo proprio == saldo canonico.
    const semMalote = totais({ entradas: 30000, despesas: 5000 });
    expect(saldoProprioCentavos(semMalote, 0)).toBe(saldoCaixaCentavos(semMalote));
  });

  it("Deve_NaoDescontarEmDobro_Quando_HaSangria_ou_Retorno (M2)", () => {
    // Malote 490, 490 em vendas dinheiro e uma sangria de 200 (caixa->cofre, transferenciasSaida).
    // A sangria so MOVE dinheiro: nao pode mexer no rastreador de deficit -> continua 0 (divida quitada).
    const comSangria = totais({ entradas: 49000, transferenciasEntrada: 49000, transferenciasSaida: 20000 });
    expect(saldoProprioCentavos(comSangria, 49000)).toBe(0);
    // Prova do bug antigo: a formula errada (saldo fisico - 2*divida) daria -20000 aqui.
    expect(saldoCaixaCentavos(comSangria) - 2 * 49000).toBe(-20000);
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
