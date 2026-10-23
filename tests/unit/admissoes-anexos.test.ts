import { describe, expect, it } from "vitest";
import { tipoAnexoAdmissaoSchema, tiposAnexoAdmissao } from "@padaria/shared/admissoes";

describe("anexos da ficha de admissao", () => {
  it("mantem a lista fechada dos 12 documentos", () => {
    expect(tiposAnexoAdmissao).toHaveLength(12);
    expect(tiposAnexoAdmissao).toContain("rg");
    expect(tiposAnexoAdmissao).toContain("aso_admissional");
    expect(tiposAnexoAdmissao).not.toContain("banco");
    expect(tiposAnexoAdmissao).not.toContain("agencia");
    expect(tipoAnexoAdmissaoSchema.safeParse("conta").success).toBe(false);
  });
});
