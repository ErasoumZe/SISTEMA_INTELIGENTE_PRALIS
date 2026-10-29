import { describe, expect, it } from "vitest";
import { margensPorGrupo, precoCalculadoDoProduto } from "./produto-preco-card";

const regras = [
  {
    // U+2060 invisivel no fim, como os nomes da planilha: a margem tem de casar mesmo assim.
    grupo: `LEITE${String.fromCharCode(0x2060)}`,
    cstPisCofins: "",
    tributacaoSimples: "",
    aliquotaSimples: 0,
    icmsRe: 0,
    baseFiscal: "",
    margemPadrao: 0.3
  },
  {
    grupo: "PAO",
    cstPisCofins: "",
    tributacaoSimples: "",
    aliquotaSimples: 0,
    icmsRe: 0,
    baseFiscal: "",
    margemPadrao: null
  }
];
const base = { auto: true, custo: "12.00", quantidadeCaixa: 6, margem: null, precoVenda: null, grupoNome: "Leite" };

describe("preco do card (mesma conta do formulario)", () => {
  it("sem margem propria usa a margem do grupo, casada pelo nome normalizado", () => {
    // 12 / 6 = 2 por unidade; + 30% = 2,60
    expect(precoCalculadoDoProduto(base, margensPorGrupo(regras))).toBe(2.6);
  });

  it("margem propria vence a do grupo; 0 vende pelo custo", () => {
    expect(precoCalculadoDoProduto({ ...base, margem: "0.5000" }, margensPorGrupo(regras))).toBe(3);
    expect(precoCalculadoDoProduto({ ...base, margem: "0" }, margensPorGrupo(regras))).toBe(2);
  });

  it("calculo manual mostra o preco digitado; sem preco nenhum devolve null", () => {
    expect(precoCalculadoDoProduto({ ...base, auto: false, precoVenda: "9.90" }, new Map())).toBe(9.9);
    expect(precoCalculadoDoProduto({ ...base, custo: null }, new Map())).toBeNull();
  });
});
