import { describe, expect, it } from "vitest";
import type { OfertaDoProdutoDto } from "@padaria/shared";
import {
  cotacoesDoProduto,
  itensComprados,
  ofertasPorSituacao,
  podeAceitarOferta,
  podeContraproporOferta
} from "./cotacao-produto";

const oferta = (sobrescrita: Partial<OfertaDoProdutoDto> = {}): OfertaDoProdutoDto => ({
  rodadaId: "r1",
  rodadaItemId: "i1",
  conviteId: "c1",
  rodadaNumero: 1,
  solicitacaoId: "s1",
  rodadaAberta: true,
  expiraEm: "2026-10-24T12:00:00.000Z",
  fornecedorId: "f1",
  fornecedorNome: "Moinho",
  situacao: "com_aumento",
  quantidadePedida: "10.000",
  quantidadeDisponivel: null,
  valorUnitario: "12.00",
  custoFinalUnitario: "12.0000",
  indisponivel: false,
  propostaItemId: "p1",
  contrapropostaUnitario: null,
  ...sobrescrita
});

describe("cotacao-produto", () => {
  it("aceita oferta com preco enquanto ninguem ganhou o item", () => {
    expect(podeAceitarOferta(oferta(), new Set())).toBe(true);
    expect(podeAceitarOferta(oferta({ situacao: "retornado" }), new Set())).toBe(true);
  });

  it("nao aceita sem resposta, sem custo, indisponivel ou item ja comprado", () => {
    expect(podeAceitarOferta(oferta({ propostaItemId: null, situacao: "enviado" }), new Set())).toBe(false);
    expect(podeAceitarOferta(oferta({ custoFinalUnitario: null }), new Set())).toBe(false);
    expect(podeAceitarOferta(oferta({ indisponivel: true, situacao: "retornado" }), new Set())).toBe(false);
    expect(podeAceitarOferta(oferta(), new Set(["i1"]))).toBe(false);
    expect(podeAceitarOferta(oferta({ situacao: "comprado" }), new Set())).toBe(false);
  });

  it("contrapropoe so com a cotacao aberta e para quem respondeu com preco", () => {
    expect(podeContraproporOferta(oferta(), new Set())).toBe(true);
    expect(podeContraproporOferta(oferta({ rodadaAberta: false }), new Set())).toBe(false);
    expect(podeContraproporOferta(oferta({ propostaItemId: null }), new Set())).toBe(false);
    expect(podeContraproporOferta(oferta({ indisponivel: true }), new Set())).toBe(false);
    expect(podeContraproporOferta(oferta(), new Set(["i1"]))).toBe(false);
  });

  it("marca o item comprado pela oferta vencedora", () => {
    const ofertas = [oferta({ situacao: "comprado", fornecedorId: "f2" }), oferta({ rodadaItemId: "i2" })];
    expect([...itensComprados(ofertas)]).toEqual(["i1"]);
  });

  it("agrupa com o que pede decisao primeiro e some com grupo vazio", () => {
    const grupos = ofertasPorSituacao([
      oferta({ situacao: "enviado", fornecedorId: "f3" }),
      oferta({ situacao: "comprado", fornecedorId: "f2" }),
      oferta()
    ]);
    expect(grupos.map((grupo) => grupo.situacao)).toEqual(["com_aumento", "enviado", "comprado"]);
  });

  it("lista cada cotacao uma vez", () => {
    const cotacoes = cotacoesDoProduto([
      oferta(),
      oferta({ fornecedorId: "f2" }),
      oferta({ rodadaId: "r2", rodadaNumero: 2 })
    ]);
    expect(cotacoes.map((cotacao) => cotacao.rodadaNumero)).toEqual([1, 2]);
  });
});
