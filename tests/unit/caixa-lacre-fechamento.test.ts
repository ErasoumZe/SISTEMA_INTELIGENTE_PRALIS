import { describe, expect, it } from "vitest";
import { fecharCaixaPayloadSchema } from "@padaria/shared/caixa";

describe("contrato de lacre de fechamento do caixa", () => {
  it("recusa fechamento sem o lacre físico", () => {
    expect(fecharCaixaPayloadSchema.safeParse({ observacao: "Turno encerrado" }).success).toBe(false);
  });

  it("exige lacre e os dois responsáveis declarados", () => {
    expect(
      fecharCaixaPayloadSchema.parse({
        lacreFechamento: "FCH-001",
        caixaResponsavelNome: "Caixa teste",
        supervisorResponsavelNome: "Supervisor teste",
        valorEspecieFechamento: 0,
        valorMoedasFechamento: 0
      })
    ).toEqual({
      lacreFechamento: "FCH-001",
      caixaResponsavelNome: "Caixa teste",
      supervisorResponsavelNome: "Supervisor teste",
      valorEspecieFechamento: 0,
      valorMoedasFechamento: 0
    });
  });
});
