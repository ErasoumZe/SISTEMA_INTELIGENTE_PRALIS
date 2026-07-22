import { describe, expect, it } from "vitest";
import type { LinhaHistoricoCaixa, TotaisHistoricoCaixa } from "@padaria/shared";
import { agruparDre, resultadoDoPeriodo } from "./dre";

function linha(over: Partial<LinhaHistoricoCaixa>): LinhaHistoricoCaixa {
  return {
    id: "cx",
    empresaId: "e",
    dataMovimento: "2026-07-20",
    pdvId: "p1",
    pdvNome: "PDV 1",
    usuarioCaixaId: "u",
    usuarioCaixaNome: "Ana",
    colaboradorId: "c",
    colaboradorNome: "Ana",
    turnoId: "t1",
    turnoNome: "Manha",
    dataHoraAbertura: null,
    dataHoraFechamento: null,
    totalEntradas: 0,
    totalTransferencias: 0,
    totalTransferenciasEntrada: 0,
    totalTransferenciasSaida: 0,
    totalDespesas: 0,
    totalRetiradas: 0,
    totalMercadorias: 0,
    saldo: 0,
    status: "fechado",
    temAjuste: false,
    observacao: null,
    ...over
  };
}

describe("agruparDre", () => {
  it("agrupa por PDV somando os totais persistidos", () => {
    const linhas = [
      linha({ pdvId: "p1", pdvNome: "PDV 1", totalEntradas: 100, saldo: 80 }),
      linha({ pdvId: "p1", pdvNome: "PDV 1", totalEntradas: 50, saldo: 40 }),
      linha({ pdvId: "p2", pdvNome: "PDV 2", totalEntradas: 30, saldo: 20 })
    ];
    const grupos = agruparDre(linhas, "pdv");
    const p1 = grupos.find((g) => g.chave === "p1");
    expect(p1?.entradas).toBe(150);
    expect(p1?.saldo).toBe(120);
    expect(p1?.caixas).toBe(2);
    // Ordena por saldo desc: p1 (120) antes de p2 (20).
    expect(grupos.map((g) => g.chave)).toEqual(["p1", "p2"]);
  });

  it("agrupa por turno e rotula 'Sem turno' quando nulo", () => {
    const grupos = agruparDre([linha({ turnoId: null, turnoNome: null, saldo: 5 })], "turno");
    expect(grupos[0]?.chave).toBe("sem-turno");
    expect(grupos[0]?.rotulo).toBe("Sem turno");
  });
});

describe("resultadoDoPeriodo", () => {
  it("usa o meta.totais do servidor (transferencias = entrada - saida)", () => {
    const totais: TotaisHistoricoCaixa = {
      totalEntradas: 200,
      totalTransferenciasEntrada: 30,
      totalTransferenciasSaida: 10,
      totalDespesas: 40,
      totalRetiradas: 15,
      totalMercadorias: 25,
      saldo: 140,
      caixas: 3
    };
    const resultado = resultadoDoPeriodo(totais);
    expect(resultado.entradas).toBe(200);
    expect(resultado.transferencias).toBe(20);
    expect(resultado.saldo).toBe(140);
    expect(resultado.caixas).toBe(3);
  });

  it("devolve zeros quando nao ha totais", () => {
    expect(resultadoDoPeriodo(null).saldo).toBe(0);
  });
});
