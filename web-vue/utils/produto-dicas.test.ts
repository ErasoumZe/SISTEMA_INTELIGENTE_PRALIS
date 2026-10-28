import { describe, expect, it } from "vitest";
import { dicaProduto } from "./produto-dicas";

describe("dicaProduto", () => {
  it("só exibe a dica padrão quando habilitarAjuda está ativo", () => {
    expect(dicaProduto("compraAproximada", false)).toBeUndefined();
    expect(dicaProduto("compraAproximada", true)).toContain("aproximadamente");
  });

  it("prioriza a dica personalizada existente", () => {
    expect(dicaProduto("ncm", true, () => "Dica personalizada")).toBe("Dica personalizada");
  });

  it("não inventa dicas para campos desconhecidos", () => {
    expect(dicaProduto("campoDesconhecido", true)).toBeUndefined();
  });
});
