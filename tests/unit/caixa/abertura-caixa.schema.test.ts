import { describe, expect, it } from "vitest";
import { abrirCaixaPayloadSchema } from "@padaria/shared/caixa";

const aberturaComLacre = {
  empresaId: "11111111-1111-4111-8111-111111111111",
  pdvId: "22222222-2222-4222-8222-222222222222",
  usuarioCaixaId: "usuario-caixa",
  maquininhaId: "33333333-3333-4333-8333-333333333333",
  lacreAbertura: "MALOTE-001",
  caixaResponsavelNome: "Mariana",
  supervisorResponsavelNome: "Silvana"
};

describe("contrato de abertura com malote", () => {
  it("aceita confirmar a composição declarada sem redigitar espécie e moedas", () => {
    expect(abrirCaixaPayloadSchema.safeParse(aberturaComLacre).success).toBe(true);
  });

  it("exige a maquininha que será conferida no relatório final", () => {
    const { maquininhaId: _maquininhaId, ...semMaquininha } = aberturaComLacre;
    expect(abrirCaixaPayloadSchema.safeParse(semMaquininha).success).toBe(false);
  });

  it("exige a composição completa quando o Caixa informar uma divergência", () => {
    expect(
      abrirCaixaPayloadSchema.safeParse({
        ...aberturaComLacre,
        valorEspecieContado: 400
      }).success
    ).toBe(false);
    expect(
      abrirCaixaPayloadSchema.safeParse({
        ...aberturaComLacre,
        valorEspecieContado: 400,
        valorMoedasContado: 100,
        observacaoDivergencia: "Conferência física do malote"
      }).success
    ).toBe(true);
  });
});
