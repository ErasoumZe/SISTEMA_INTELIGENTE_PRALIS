import { describe, expect, it } from "vitest";
import { registrarIndisponibilidadeCaixaPayloadSchema } from "@padaria/shared/caixa";

describe("contrato de indisponibilidade do computador do PDV", () => {
  it("aceita um ou mais motivos predefinidos", () => {
    expect(
      registrarIndisponibilidadeCaixaPayloadSchema.safeParse({
        motivos: ["falta_energia", "internet_caiu"],
        motivoOutro: null
      }).success
    ).toBe(true);
  });

  it("exige o detalhe quando o motivo for Outro", () => {
    expect(
      registrarIndisponibilidadeCaixaPayloadSchema.safeParse({
        motivos: ["outro"]
      }).success
    ).toBe(false);
    expect(
      registrarIndisponibilidadeCaixaPayloadSchema.safeParse({
        motivos: ["outro"],
        motivoOutro: "Reinicialização do equipamento"
      }).success
    ).toBe(true);
  });

  it("não permite detalhe avulso sem selecionar Outro", () => {
    expect(
      registrarIndisponibilidadeCaixaPayloadSchema.safeParse({
        motivos: ["computador_travou"],
        motivoOutro: "Não deveria ser enviado"
      }).success
    ).toBe(false);
  });
});
