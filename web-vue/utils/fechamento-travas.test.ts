import { describe, expect, it } from "vitest";
import { motivoFechamentoTravado } from "~/utils/fechamento-travas";

// G1/R-171 · a tela precisa dizer POR QUE nao fecha, e as duas travas sao diferentes: uma e
// dinheiro na rua, a outra e ordem nao cumprida. Trocar os textos entre si mandaria o operador
// para o lugar errado no fim do expediente.
describe("fechamento - motivo da trava", () => {
  it("sem entrega em transito e sem ordem programada, nada trava", () => {
    expect(motivoFechamentoTravado(0, 0)).toBeNull();
  });

  it("entrega aguardando conferencia trava e cita o cofre", () => {
    const motivo = motivoFechamentoTravado(2, 0);
    expect(motivo).toMatch(/confer[eê]ncia no cofre/u);
    expect(motivo).not.toMatch(/Tesouraria/u);
  });

  it("ordem programada trava e cita a saida (executar ou cancelar)", () => {
    const motivo = motivoFechamentoTravado(0, 1);
    expect(motivo).toMatch(/Tesouraria/u);
    expect(motivo).toMatch(/execute|cancelamento/u);
  });

  // R-183 · entrega ja contada pelo cofre manda o operador para OUTRO lugar: nao adianta pedir
  // conferencia de novo, o que falta e o cofre encerrar a divergencia.
  it("entrega ja contada cobra o encerramento, e nao uma nova conferencia", () => {
    const motivo = motivoFechamentoTravado(1, 0, 1);
    expect(motivo).toMatch(/encerrou a diverg[eê]ncia/iu);
    expect(motivo).not.toMatch(/aguardando confer[eê]ncia/iu);
  });

  it("as duas juntas aparecem na mesma frase — esconder uma faria o operador resolver so metade", () => {
    const motivo = motivoFechamentoTravado(1, 1);
    expect(motivo).toMatch(/confer[eê]ncia no cofre/u);
    expect(motivo).toMatch(/Tesouraria/u);
  });
});
