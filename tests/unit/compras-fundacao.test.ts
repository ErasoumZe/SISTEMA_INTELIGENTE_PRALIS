import { describe, expect, it } from "vitest";
import {
  analisarImportacaoPrecoBaseSchema,
  catalogoFornecedorPayloadSchema,
  normalizarDescricaoPrecoBase
} from "@padaria/shared/compras";
import { produtoPayloadSchema } from "@padaria/shared/produtos";

const empresaId = "019a0000-0000-7000-8000-000000000001";
const fornecedorId = "019a0000-0000-7000-8000-000000000002";
const produtoId = "019a0000-0000-7000-8000-000000000003";

describe("fundacao do novo Compras", () => {
  it("normaliza acentos, pontuacao e espacos para o pareamento por descricao", () => {
    expect(normalizarDescricaoPrecoBase("  Açúcar   cristal - 5kg  ")).toBe("ACUCAR CRISTAL 5KG");
  });

  it("recusa preço negativo no catálogo do fornecedor", () => {
    expect(() =>
      catalogoFornecedorPayloadSchema.parse({ empresaId, fornecedorId, produtoId, precoOfertado: -0.01 })
    ).toThrow();
  });

  it("exige linhas na análise da importação inicial", () => {
    expect(() =>
      analisarImportacaoPrecoBaseSchema.parse({
        empresaId,
        nomeArquivo: "base.xlsx",
        hashArquivo: "a".repeat(64),
        linhas: []
      })
    ).toThrow();
  });

  it("limita tolerância de peso a 30 por cento", () => {
    const base = {
      empresaId,
      descricao: "Queijo",
      unidadeIndividualId: produtoId,
      quantidadeIndividual: 1,
      conversoes: [],
      promocoes: []
    };
    expect(() =>
      produtoPayloadSchema.parse({
        ...base,
        quantidadeVariavel: true,
        toleranciaQuantidadePercentual: 30.01
      })
    ).toThrow();
    expect(
      produtoPayloadSchema.parse({ ...base, quantidadeVariavel: true, toleranciaQuantidadePercentual: 30 })
        .toleranciaQuantidadePercentual
    ).toBe(30);
  });
});
