import type { Permissao } from "@padaria/shared";
import { describe, expect, it } from "vitest";
import { categoriasDoCaixaPermitidas } from "./caixa-categorias";

const todas = ["entradas", "transferencias", "sangrias", "despesas", "mercadorias", "retiradas"].map((chave) => ({
  chave
}));
const com =
  (...permissoes: Permissao[]) =>
  (p: Permissao) =>
    permissoes.includes(p);

describe("linhas do resumo do Caixa por permissao (R-238)", () => {
  it("PDV 1-3 (sem Entradas e sem Saidas) ve so transferencias e sangrias", () => {
    expect(categoriasDoCaixaPermitidas(todas, com()).map((c) => c.chave)).toEqual(["transferencias", "sangrias"]);
  });

  it("PDV 4 (Caixa Gerente) ve todas as linhas", () => {
    const gerente = com("entradas_visualizar", "despesas_visualizar", "mercadorias_visualizar", "retiradas_visualizar");
    expect(categoriasDoCaixaPermitidas(todas, gerente)).toEqual(todas);
  });

  it("sem a checagem de permissao, nao esconde nada", () => {
    expect(categoriasDoCaixaPermitidas(todas)).toEqual(todas);
  });
});
