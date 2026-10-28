import { describe, expect, it } from "vitest";
import type { OfertaDoProdutoDto } from "@padaria/shared";
import {
  cotacoesDoProduto,
  grupoDaOferta,
  itensComprados,
  ofertasAgrupadas,
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
  abertaEm: "2026-10-23T12:00:00.000Z",
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

  it("agrupa pelo que o comprador faz: decidir, aguardando, sem oferta, comprado", () => {
    const vazio = new Set<string>();
    expect(grupoDaOferta(oferta(), vazio)).toBe("decidir");
    expect(grupoDaOferta(oferta({ situacao: "cotado", propostaItemId: null }), vazio)).toBe("aguardando");
    expect(grupoDaOferta(oferta({ situacao: "retornado", indisponivel: true }), vazio)).toBe("sem_oferta");
    // Perdeu: o item ja foi comprado de outro.
    expect(grupoDaOferta(oferta({ situacao: "retornado" }), new Set(["i1"]))).toBe("sem_oferta");
    expect(grupoDaOferta(oferta({ situacao: "comprado" }), vazio)).toBe("comprado");
  });

  it("o grupo de decisao vem primeiro, com a oferta mais barata no topo; grupo vazio some", () => {
    const grupos = ofertasAgrupadas([
      oferta({ situacao: "enviado", fornecedorId: "f3", propostaItemId: null, custoFinalUnitario: null }),
      oferta({ fornecedorId: "f4", fornecedorNome: "Caro", custoFinalUnitario: "15.0000" }),
      oferta({ fornecedorId: "f5", fornecedorNome: "Barato", custoFinalUnitario: "11.0000" })
    ]);
    expect(grupos.map((grupo) => grupo.grupo)).toEqual(["decidir", "aguardando"]);
    expect(grupos[0]!.ofertas.map((linha) => linha.fornecedorNome)).toEqual(["Barato", "Caro"]);
  });

  it("lista cada cotacao uma vez, da mais nova para a mais antiga", () => {
    const cotacoes = cotacoesDoProduto([
      oferta(),
      oferta({ fornecedorId: "f2" }),
      oferta({ rodadaId: "r2", abertaEm: "2026-10-23T15:00:00.000Z" })
    ]);
    expect(cotacoes.map((cotacao) => cotacao.rodadaId)).toEqual(["r2", "r1"]);
  });
});
