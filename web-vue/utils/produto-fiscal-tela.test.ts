import { describe, expect, it } from "vitest";
import { estadoFiscalNaTela, percentualFiscal, rotuloDaOrigemFiscal } from "./produto-fiscal-tela";

describe("fiscal na tela (FISCAL_NA_TELA do paralelo)", () => {
  it("completo nao mostra motivo; pendencia mostra motivo e quem resolve", () => {
    expect(estadoFiscalNaTela("completo", "qualquer coisa")).toMatchObject({ rotulo: "completo", motivo: "" });
    expect(estadoFiscalNaTela("pendente_grupo_invalido", "Grupo sem regra")).toMatchObject({
      tipo: "warning",
      motivo: "Grupo sem regra",
      quemResolve: "O grupo é definido na BASE pelo administrador."
    });
  });

  it("estado vazio ou desconhecido nao aparece", () => {
    expect(estadoFiscalNaTela("", "x")).toBeNull();
    expect(estadoFiscalNaTela("estado_novo", "x")).toBeNull();
  });

  it("resumo da regra com virgula e a fonte em portugues", () => {
    expect(percentualFiscal(4)).toBe("4,00%");
    expect(percentualFiscal(null)).toBe("0,00%");
    expect(rotuloDaOrigemFiscal("plu_balanca")).toBe("PLU do código de balança");
    expect(rotuloDaOrigemFiscal("grupo")).toBe("grupo");
  });
});
