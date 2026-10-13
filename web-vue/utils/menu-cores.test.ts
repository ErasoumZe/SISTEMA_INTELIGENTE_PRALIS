import { describe, expect, it } from "vitest";
import { normalizarEstrutura, type EstruturaMenu } from "./menu-estrutura";

describe("cores e categorias do menu montado", () => {
  it("mantem a cor escolhida e preserva Lancamentos como um unico submenu", () => {
    const estrutura: EstruturaMenu = {
      versao: 1,
      idsOcultos: [],
      secoes: [
        { id: "a", titulo: "Financeiro", cor: "transferencias", ids: ["despesas"] },
        { id: "b", titulo: "Saidas", cor: "retiradas", ids: ["lancamentos"] }
      ]
    };

    expect(normalizarEstrutura(estrutura)).toEqual({
      versao: 1,
      idsOcultos: [],
      secoes: [{ id: "b", titulo: "Saidas", cor: "retiradas", ids: ["lancamentos"] }]
    });
  });
});
