import { describe, expect, it } from "vitest";
import { permissoes } from "@padaria/shared";
import { vendaIntegracaoAgregadaSchema } from "../../shared/src/integracoes/index.js";

describe("integracoes shared contracts", () => {
  it("inclui permissao de integracoes", () => {
    expect(permissoes).toContain("integracoes_visualizar");
  });

  it("valida payload agregado de venda", () => {
    const payload = vendaIntegracaoAgregadaSchema.parse({
      DadosIntegracao: { origem: "pdv" },
      Venda: {
        idVenda: "VENDA-1",
        idCaixa: "PDV-1",
        nomeCaixa: "PDV 1",
        idCliente: "CLI-1",
        nomeCliente: "Cliente",
        documentoCliente: "123",
        dataHoraVenda: "2026-06-28T10:00:00.000Z",
        valorOriginal: 100,
        desconto: 5,
        acrescimo: 2,
        valorTotal: 97,
        statusVenda: "finalizada",
        numeroNotaFiscal: "NF-1"
      },
      ItensVenda: [
        {
          idRegistro: "ITEM-1",
          idProduto: "PROD-1",
          descricaoProduto: "Pao",
          dataHoraItem: "2026-06-28T10:00:00.000Z",
          quantidade: 2,
          valorUnitario: 10,
          desconto: 0,
          acrescimo: 0,
          total: 20,
          itemCancelado: false
        }
      ],
      PagamentosVenda: [
        {
          idVenda: "VENDA-1",
          idFormaPagamento: "DIN",
          descricaoFormaPagamento: "Dinheiro",
          valor: 97
        }
      ]
    });

    expect(payload.Venda.idVenda).toBe("VENDA-1");
    expect(payload.Venda.dataHoraVenda).toBeInstanceOf(Date);
    expect(payload.ItensVenda[0]?.dataHoraItem).toBeInstanceOf(Date);
  });
});

