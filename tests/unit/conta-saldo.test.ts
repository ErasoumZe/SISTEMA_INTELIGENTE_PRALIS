// Saldo da CONTA (PROJECT_BRAIN/17, D8): "saldo = fundo + entradas - saidas", derivado dos
// movimentos. O fundo e so o ponto de partida e nunca e reescrito.
import { describe, expect, it } from "vitest";
import { saldoContaCentavos, type TotaisContaCentavos } from "@padaria/shared/caixa";
import { deCentavos, paraCentavos } from "@padaria/shared/dinheiro";

function totais(parcial: Partial<TotaisContaCentavos> = {}): TotaisContaCentavos {
  return {
    vendas: 0,
    transferenciasEntrada: 0,
    transferenciasSaida: 0,
    despesas: 0,
    retiradas: 0,
    mercadorias: 0,
    ...parcial
  };
}

describe("saldoContaCentavos (D8)", () => {
  // O exemplo que o Jose escreveu na spec, em teste: se este quebrar, a regra mudou.
  it("exemplo do Jose: cofre 10.000, transferencia de 500 -> exibe 9.500", () => {
    const cofre = saldoContaCentavos(paraCentavos(10_000), totais({ transferenciasSaida: paraCentavos(500) }));
    expect(deCentavos(cofre)).toBe(9_500);

    // E o outro lado: o caixa 1 recebe os mesmos 500 (aqui sem fundo proprio).
    const caixa1 = saldoContaCentavos(0, totais({ transferenciasEntrada: paraCentavos(500) }));
    expect(deCentavos(caixa1)).toBe(500);
  });

  it("sem nenhum movimento, o saldo e o proprio fundo", () => {
    expect(deCentavos(saldoContaCentavos(paraCentavos(10_000), totais()))).toBe(10_000);
  });

  it("conta sem fundo declarado comeca em zero", () => {
    expect(saldoContaCentavos(0, totais())).toBe(0);
  });

  it("soma as entradas e subtrai as saidas de todas as origens", () => {
    const saldo = saldoContaCentavos(
      paraCentavos(1_000),
      totais({
        vendas: paraCentavos(500),
        transferenciasEntrada: paraCentavos(200),
        transferenciasSaida: paraCentavos(100),
        despesas: paraCentavos(50),
        retiradas: paraCentavos(30),
        mercadorias: paraCentavos(20)
      })
    );
    // 1000 + 500 + 200 - 100 - 50 - 30 - 20
    expect(deCentavos(saldo)).toBe(1_500);
  });

  it("o saldo pode ficar NEGATIVO — o fundo tem CHECK >= 0, o derivado nao", () => {
    // Gastar mais do que a conta tem e um fato a mostrar, nao um erro a esconder: travar em zero
    // faria a tela mentir justamente no caso em que a pessoa precisa enxergar o rombo.
    const saldo = saldoContaCentavos(paraCentavos(100), totais({ despesas: paraCentavos(250) }));
    expect(deCentavos(saldo)).toBe(-150);
  });

  it("trabalha em centavos inteiros (nao acumula erro de ponto flutuante)", () => {
    const saldo = saldoContaCentavos(
      paraCentavos(0.1),
      totais({ vendas: paraCentavos(0.2), despesas: paraCentavos(0.3) })
    );
    expect(saldo).toBe(0);
    expect(deCentavos(saldo)).toBe(0);
  });
});
