import { describe, expect, it } from "vitest";
import type { DecisaoItemDto, DecisaoPropostaDto } from "@padaria/shared";
import { motivosDecisao } from "@padaria/shared";
import {
  AJUDA_MOTIVO,
  COR_MOTIVO,
  ROTULO_MOTIVO,
  itensParaNovaSolicitacao,
  podeAprovarProposta,
  totalDaProposta
} from "./decisao-compras";

const proposta = (sobrescrita: Partial<DecisaoPropostaDto> = {}): DecisaoPropostaDto => ({
  propostaItemId: "p1",
  fornecedorId: "f1",
  fornecedorNome: "Forn",
  versao: 1,
  indisponivel: false,
  valorUnitario: "12.00",
  freteRateado: "0.00",
  custoFinalUnitario: "12.0000",
  ...sobrescrita
});

describe("decisao-compras", () => {
  it("so aprova proposta com preco e custo final calculado", () => {
    expect(podeAprovarProposta(proposta())).toBe(true);
    expect(podeAprovarProposta(proposta({ indisponivel: true }))).toBe(false);
    expect(podeAprovarProposta(proposta({ custoFinalUnitario: null }))).toBe(false);
  });

  it("total da proposta e custo final x quantidade, em centavos exatos", () => {
    expect(totalDaProposta(proposta({ custoFinalUnitario: "10.3333" }), "3")).toBe(31);
    expect(totalDaProposta(proposta({ custoFinalUnitario: null }), "3")).toBeNull();
  });

  it("todo motivo do contrato tem rotulo, cor e ajuda (nenhum motivo novo fica sem texto na tela)", () => {
    for (const motivo of motivosDecisao) {
      expect(ROTULO_MOTIVO[motivo], motivo).toBeTruthy();
      expect(AJUDA_MOTIVO[motivo], motivo).toBeTruthy();
      expect(Object.keys(COR_MOTIVO), motivo).toContain(motivo);
    }
  });

  it("os itens que sobraram viram os itens de uma nova solicitacao", () => {
    const itens = [
      { produtoId: "a", quantidade: "2.000" },
      { produtoId: "b", quantidade: "1.000" }
    ] as DecisaoItemDto[];
    expect(itensParaNovaSolicitacao(itens)).toEqual([
      { produtoId: "a", quantidade: "2.000" },
      { produtoId: "b", quantidade: "1.000" }
    ]);
  });
});
