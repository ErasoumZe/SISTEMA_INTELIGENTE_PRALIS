import { describe, expect, it } from "vitest";
import { faixasNaoVazias, intervaloAfetaFaixas, mesmaLinha } from "../../api/src/google/google-sheet-move.js";

describe("movimentacao segura de linhas do Google Sheets", () => {
  it("separa somente as faixas realmente preenchidas", () => {
    expect(faixasNaoVazias(["id", null, null, "nome", null, "link"])).toEqual([
      [0, 0],
      [3, 3],
      [5, 5]
    ]);
  });

  it("nao considera mesclagem de coluna nao utilizada", () => {
    const faixas = faixasNaoVazias(["id", null, null, "nome"]);
    expect(intervaloAfetaFaixas({ startColumnIndex: 1, endColumnIndex: 2 }, faixas)).toBe(false);
    expect(intervaloAfetaFaixas({ startColumnIndex: 3, endColumnIndex: 4 }, faixas)).toBe(true);
  });

  it("detecta divergencia antes de limpar a origem", () => {
    expect(mesmaLinha(["a", "b"], ["a", "b"])).toBe(true);
    expect(mesmaLinha(["a", "b"], ["a", "c"])).toBe(false);
  });
});
