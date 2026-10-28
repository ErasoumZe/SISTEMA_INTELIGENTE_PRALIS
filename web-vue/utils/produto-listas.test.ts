import { describe, expect, it } from "vitest";
import { EMBALAGENS, MEDIDAS_BASE, opcoesComAtual, siglaCanonica, unidadesDaLista } from "./produto-listas";

const UNIDADES = [
  { id: "1", sigla: "un" },
  { id: "2", sigla: "kg" },
  { id: "3", sigla: "L" },
  { id: "4", sigla: "PCT" },
  { id: "5", sigla: "g" }
];

describe("listas fixas do cadastro de produto", () => {
  it("medida base filtra as unidades da empresa pela sigla, na ordem do paralelo", () => {
    expect(unidadesDaLista(UNIDADES, MEDIDAS_BASE).map((unidade) => unidade.sigla)).toEqual(["un", "kg", "g", "L"]);
  });

  it("a unidade que o produto ja tem continua na lista mesmo fora dela", () => {
    expect(unidadesDaLista(UNIDADES, MEDIDAS_BASE, "4").map((unidade) => unidade.id)).toEqual([
      "4",
      "1",
      "2",
      "5",
      "3"
    ]);
  });

  it("litro gravado como L conta como LT; sigla compara sem maiuscula", () => {
    expect(siglaCanonica("L")).toBe("LT");
    expect(siglaCanonica(" kg ")).toBe("KG");
  });

  it("texto livre legado nao some: entra antes da lista fixa", () => {
    expect(opcoesComAtual(EMBALAGENS, "CX")).toEqual([...EMBALAGENS]);
    expect(opcoesComAtual(EMBALAGENS, "fardo")[0]).toBe("fardo");
    expect(opcoesComAtual(EMBALAGENS, null)).toEqual([...EMBALAGENS]);
  });
});
