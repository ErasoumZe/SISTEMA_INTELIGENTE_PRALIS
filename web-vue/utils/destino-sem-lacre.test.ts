import { describe, expect, it } from "vitest";
import { rotuloDestinoSemLacre } from "./destino-sem-lacre";

const contaId = "01a1d027-a146-7644-81ca-b85f417df441";

describe("rotulo do destino sem lacre (R-238)", () => {
  it("mostra posto, turno e quem abriu o caixa", () => {
    expect(rotuloDestinoSemLacre({ contaId, pdvNome: "PDV 1", turno: "manha", responsavelNome: "Maria" })).toBe(
      "PDV 1 · Manhã · Maria"
    );
  });

  it("sem turno ou sem nome, mostra so o que tem", () => {
    expect(rotuloDestinoSemLacre({ contaId, pdvNome: "PDV 2", turno: "tarde", responsavelNome: "  " })).toBe(
      "PDV 2 · Tarde"
    );
    expect(rotuloDestinoSemLacre({ contaId, pdvNome: "PDV 3", turno: null, responsavelNome: null })).toBe("PDV 3");
  });
});
