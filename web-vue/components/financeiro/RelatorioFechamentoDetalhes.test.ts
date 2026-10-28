import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelatorioFechamentoDetalhes from "./RelatorioFechamentoDetalhes.vue";

const dinheiro = (valor: number) => `R$ ${valor.toFixed(2).replace(".", ",")}`;
const numero = (valor: unknown) => Number(valor ?? 0);
const texto = (valor: unknown) => (valor ? String(valor) : "--");

const venda = {
  id: "v-1",
  descricao: "Venda PDV",
  identificadorExterno: "7788",
  valorOriginal: "35.50",
  dataHora: "2026-10-27T14:00:00.000Z",
  cancelamentoMotivo: "Cliente desistiu",
  cancelamentoJustificativa: "Troco errado",
  cancelamentoAutorizadoPorAutomacao: null,
  produtos: [{ id: "p-1", quantidade: 2, descricao: "Pao frances", valorTotal: "35.50" }],
  pagamentos: [{ id: "g-1", formaPagamento: "Dinheiro", valor: "35.50" }]
};

function montar(props: Record<string, unknown> = {}) {
  return shallowMount(RelatorioFechamentoDetalhes, {
    props: {
      conferencias: [],
      quebras: [],
      vendasCanceladas: [],
      decisoes: [],
      anexos: [],
      anexoUrl: () => "/anexo",
      dinheiro,
      numero,
      texto,
      ...props
    } as never,
    global: { stubs: { "v-alert": { template: "<div><slot /></div>" } } }
  });
}

describe("RelatorioFechamentoDetalhes", () => {
  it("mostra as vendas canceladas na tela principal com motivo, produtos e pagamento", () => {
    const wrapper = montar({ vendasCanceladas: [venda] });
    const bloco = wrapper.get('[data-teste="vendas-canceladas"]').text();
    expect(bloco).toContain("R$ 35,50 em vendas canceladas, fora dos totais do caixa");
    expect(bloco).toContain("Cliente desistiu");
    expect(bloco).toContain("Troco errado");
    expect(bloco).toContain("Pao frances");
    expect(bloco).toContain("Dinheiro");
    expect(bloco).toContain("venda 7788");
  });

  it("sem cancelamento diz que nao ha venda cancelada", () => {
    expect(montar().get('[data-teste="vendas-canceladas"]').text()).toContain("Nenhuma venda cancelada");
  });

  it("lista decisoes da Tesouraria e anexos, ou diz que nao ha", () => {
    expect(montar().text()).toContain("Nenhuma decisão final registrada");
    expect(montar().text()).toContain("Nenhum anexo foi enviado");
    const com = montar({
      decisoes: [
        {
          id: "x",
          resultado: "divergente",
          observacao: "falta",
          conferidoPor: "u",
          conferidoPorNome: "Rodrigo",
          conferidoEm: null
        }
      ]
    });
    expect(com.text()).toContain("Quebra / divergência");
    expect(com.text()).toContain("Rodrigo");
  });
});
