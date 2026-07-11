import test from "node:test";
import assert from "node:assert/strict";
import { dataHoraParaIso, montarPayloads } from "../src/payload.js";

test("montarPayloads: idVenda estavel CREARE:<id> (sem TESTE) e data real preservada", () => {
  const dados = {
    vendas: [
      {
        idVendaBalcao: 42,
        idDispositivo: "PDV1",
        nomeCaixa: "Caixa 1",
        idCliente: 7,
        nomeCliente: "Joao",
        documentoCliente: "123",
        dataHoraVenda: "2026-07-05 14:30:00",
        valorSubtotal: 10,
        valorDesconto: 1,
        valorAcrescimo: 0,
        valorTotal: 9,
        statusVenda: "F",
        numeroNotaFiscal: 55
      }
    ],
    itens: [
      {
        idItemVendaBalcao: 100,
        idVendaBalcao: 42,
        codigoProduto: "P1",
        descricaoProduto: "Pao",
        dataHoraItem: "2026-07-05 14:30:01",
        quantidade: 2,
        valorUnitario: 5,
        total: 10,
        itemCancelado: "0"
      }
    ],
    pagamentos: [
      {
        idFormaPgtoVendaBalcao: 9,
        idVendaBalcao: 42,
        idFormaPagamento: "DIN",
        descricaoFormaPagamento: "Dinheiro",
        valor: 9
      }
    ]
  };

  const [payload] = montarPayloads(dados);
  assert.equal(payload.Venda.idVenda, "CREARE:42");
  assert.ok(!payload.Venda.idVenda.includes("TESTE"));
  assert.equal(payload.Venda.dataHoraVenda, "2026-07-05T14:30:00.000Z");
  assert.equal(payload.DadosIntegracao.modo, "producao");
  assert.equal(payload.Venda.statusVenda, "FINALIZADA");
  assert.equal(payload.ItensVenda.length, 1);
  assert.equal(payload.ItensVenda[0].idRegistro, "CREARE_ITEM:100");
  assert.equal(payload.PagamentosVenda[0].idVenda, "CREARE:42");
});

test("montarPayloads: venda cancelada vira CANCELADA", () => {
  const [payload] = montarPayloads({
    vendas: [{ idVendaBalcao: 1, dataHoraVenda: "2026-07-05 10:00:00", statusVenda: "C", valorTotal: 5 }],
    itens: [],
    pagamentos: []
  });
  assert.equal(payload.Venda.statusVenda, "CANCELADA");
});

test("dataHoraParaIso: default rotula Z (naive); offset gera UTC real", () => {
  assert.equal(dataHoraParaIso("2026-07-05 14:30:00"), "2026-07-05T14:30:00.000Z");
  assert.equal(dataHoraParaIso("2026-07-05 14:30:00", "-03:00"), "2026-07-05T17:30:00.000Z");
});
