import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import VendasCanceladasBotao from "./VendasCanceladasBotao.vue";

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

function montar(vendas: unknown[]) {
  return shallowMount(VendasCanceladasBotao, {
    props: { vendas, dinheiro, numero, texto } as never,
    global: {
      stubs: {
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-dialog": { template: "<div><slot /></div>" },
        "v-card": { template: "<div><slot /></div>" },
        "v-card-text": { template: "<div><slot /></div>" },
        "v-toolbar": { template: "<div><slot /></div>" },
        "v-toolbar-title": { template: "<div><slot /></div>" }
      }
    }
  });
}

describe("VendasCanceladasBotao", () => {
  it("mostra o botao com a quantidade e o total das vendas canceladas", () => {
    const wrapper = montar([venda]);
    const botao = wrapper.get('[data-teste="botao-vendas-canceladas"]');
    expect(botao.text()).toContain("Vendas canceladas");
    expect(botao.text()).toContain("1");
    expect(botao.text()).toContain("R$ 35,50");
  });

  it("o popup lista cada venda com justificativa, motivo, produtos e pagamento", () => {
    const conteudo = montar([venda]).text();
    expect(conteudo).toContain("Justificativa: Troco errado");
    expect(conteudo).toContain("motivo: Cliente desistiu");
    expect(conteudo).toContain("Pao frances");
    expect(conteudo).toContain("Dinheiro");
    expect(conteudo).toContain("venda 7788");
    expect(conteudo).toContain("fora dos totais do caixa");
  });

  it("sem cancelamento o botao continua ativo e o popup diz que nao ha venda cancelada", () => {
    const wrapper = montar([]);
    expect(wrapper.get('[data-teste="botao-vendas-canceladas"]').attributes("disabled")).toBeUndefined();
    expect(wrapper.get('[data-teste="sem-vendas-canceladas"]').text()).toContain("Nenhuma venda cancelada neste caixa");
  });
});
