import { describe, expect, it } from "vitest";
import { motivoFechamentoTravado } from "~/utils/fechamento-travas";

// G1/R-171 · a tela precisa dizer POR QUE nao fecha, e o texto muda conforme o que falta.
//
// R-179/Fatia 3 · havia uma segunda trava aqui, a da ordem `agendada` que a Tesouraria programava
// pelo painel "Programar entrega ao cofre". O painel e as rotas dele sairam; sem produtor de ordem,
// o segundo argumento deixou de existir em vez de virar um `0` fixo que ninguem mais explica.
describe("fechamento - motivo da trava", () => {
  it("sem entrega em transito, nada trava", () => {
    expect(motivoFechamentoTravado(0)).toBeNull();
  });

  it("entrega aguardando conferencia trava e cita o cofre", () => {
    const motivo = motivoFechamentoTravado(2);
    expect(motivo).toMatch(/confer[eê]ncia no cofre/u);
    expect(motivo).not.toMatch(/Tesouraria/u);
  });

  // R-183 · entrega ja contada pelo cofre manda o operador para OUTRO lugar: nao adianta pedir
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
