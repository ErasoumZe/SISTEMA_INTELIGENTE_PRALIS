import { describe, expect, it } from "vitest";
import { motivoFechamentoTravado } from "~/utils/fechamento-travas";

// G1/R-171 · a tela precisa dizer POR QUE nao fecha, e o texto muda conforme o que falta.
//
// R-185/R-187 · planejamentos nascem no modal de transferencia e retornos executados continuam
// travando ate a conta destino encerrar a conferencia.
describe("fechamento - motivo da trava", () => {
  it("sem entrega em transito, nada trava", () => {
    expect(motivoFechamentoTravado(0)).toBeNull();
  });

  it("retorno aguardando conferencia trava e cita o destino", () => {
    const motivo = motivoFechamentoTravado(2);
    expect(motivo).toMatch(/transfer[eê]ncia de retorno/iu);
    expect(motivo).toMatch(/confer[eê]ncia no destino/iu);
    expect(motivo).not.toMatch(/Tesouraria/u);
  });

  // R-183 · entrega ja contada pelo destino manda o operador para OUTRO lugar: nao adianta pedir
  // conferencia de novo, o que falta e o cofre encerrar a divergencia.
  it("entrega ja contada cobra o encerramento, e nao uma nova conferencia", () => {
    const motivo = motivoFechamentoTravado(1, 1);
    expect(motivo).toMatch(/encerrou a diverg[eê]ncia/iu);
    expect(motivo).not.toMatch(/aguardando confer[eê]ncia/iu);
  });

  // A contagem de contadas nunca ultrapassa a de pendentes (as duas saem da MESMA lista), mas o
  // texto tem de continuar sendo o do transito enquanto houver transito.
  it("com varias em transito e uma ja contada, o texto e o do encerramento", () => {
    expect(motivoFechamentoTravado(3, 1)).toMatch(/encerrou a diverg[eê]ncia/iu);
  });
});
