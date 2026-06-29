function dinheiro(valor) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? Number(numero.toFixed(2)) : 0;
}

function texto(valor, fallback) {
  const normalizado = valor == null ? "" : String(valor).trim();
  return normalizado || fallback;
}

function dataHojeLocal() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function trocarDataPreservandoHora(dataHoraOrigem, dataDestino) {
  const hora = String(dataHoraOrigem).split(" ")[1] ?? "00:00:00";
  return `${dataDestino}T${hora}.000Z`;
}

function vendaCancelada(status) {
  return String(status ?? "").trim().toUpperCase() === "C";
}

function itemCancelado(valor) {
  return ["1", "C", "S", "SIM", "TRUE"].includes(String(valor ?? "").trim().toUpperCase());
}

function agruparPorVenda(linhas) {
  const grupos = new Map();
  for (const linha of linhas) {
    const chave = String(linha.idVendaBalcao);
    const grupo = grupos.get(chave) ?? [];
    grupo.push(linha);
    grupos.set(chave, grupo);
  }
  return grupos;
}

export function montarPayloadsTeste({ vendas, itens, pagamentos, dataOrigem, dataDestino = dataHojeLocal() }) {
  const itensPorVenda = agruparPorVenda(itens);
  const pagamentosPorVenda = agruparPorVenda(pagamentos);

  return vendas.map((venda) => {
    const idVendaOriginal = String(venda.idVendaBalcao);
    const idVenda = `CREARE:${idVendaOriginal}:TESTE:${dataDestino}`;
    const idCaixa = texto(venda.idDispositivo, `SEM_CAIXA_${idVendaOriginal}`);
    const nomeCaixa = texto(venda.nomeCaixa, `PDV ${idCaixa}`);
    const idCliente = venda.idCliente == null ? null : String(venda.idCliente);

    return {
      DadosIntegracao: {
        origem: "CREARE_COMPILART",
        modo: "teste_integracao",
        dataOrigem,
        dataDestino,
        idVendaOriginal
      },
      Venda: {
        idVenda,
        idCaixa,
        nomeCaixa,
        idCliente,
        nomeCliente: venda.nomeCliente ?? null,
        documentoCliente: venda.documentoCliente ?? null,
        dataHoraVenda: trocarDataPreservandoHora(venda.dataHoraVenda, dataDestino),
        valorOriginal: dinheiro(venda.valorSubtotal ?? venda.valorTotal),
        desconto: dinheiro(venda.valorDesconto),
        acrescimo: dinheiro(venda.valorAcrescimo),
        valorTotal: dinheiro(venda.valorTotal),
        statusVenda: vendaCancelada(venda.statusVenda) ? "CANCELADA" : "FINALIZADA",
        numeroNotaFiscal: venda.numeroNotaFiscal == null ? null : String(venda.numeroNotaFiscal)
      },
      ItensVenda: (itensPorVenda.get(idVendaOriginal) ?? []).map((item) => ({
        idRegistro: `CREARE_ITEM:${item.idItemVendaBalcao}`,
        idProduto: texto(item.codigoProduto, `PRODUTO_${item.idProduto ?? item.idItemVendaBalcao}`),
        descricaoProduto: texto(item.descricaoProduto, "Produto sem descricao"),
        dataHoraItem: trocarDataPreservandoHora(item.dataHoraItem ?? venda.dataHoraVenda, dataDestino),
        quantidade: Number(item.quantidade ?? 0),
        valorUnitario: dinheiro(item.valorUnitario),
        desconto: dinheiro(item.desconto),
        acrescimo: dinheiro(item.acrescimo),
        total: dinheiro(item.total),
        itemCancelado: itemCancelado(item.itemCancelado)
      })),
      PagamentosVenda: (pagamentosPorVenda.get(idVendaOriginal) ?? []).map((pagamento) => ({
        idVenda,
        idFormaPagamento: texto(pagamento.idFormaPagamento, `FORMA_${pagamento.idFormaPgtoVendaBalcao}`),
        descricaoFormaPagamento: texto(pagamento.descricaoFormaPagamento, "Forma sem descricao"),
        valor: dinheiro(pagamento.valor)
      }))
    };
  });
}
