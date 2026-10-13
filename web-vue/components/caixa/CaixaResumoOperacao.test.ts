import { shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CaixaResumoOperacao from "./CaixaResumoOperacao.vue";

vi.stubGlobal("useRoute", () => ({ query: {} }));

function montar() {
  return shallowMount(CaixaResumoOperacao, {
    props: {
      caixaId: "caixa-1",
      saldo: 500,
      vendasCanceladasQuantidade: 2,
      categorias: [
        { chave: "entradas", titulo: "Entradas", icone: "mdi-cash", valor: 100 },
        { chave: "transferencias", titulo: "Transferencias", icone: "mdi-bank-transfer", valor: 50 }
      ],
      formasPagamento: [{ chave: "pix", titulo: "PIX", icone: "mdi-qrcode", valor: 100, quantidade: 3 }]
    },
    global: {
      stubs: {
        "v-icon": true,
        "v-btn": { template: "<button v-bind='$attrs'><slot /></button>" },
        CaixaResumoMaloteAbertura: true
      }
    }
  });
}

describe("CaixaResumoOperacao", () => {
  it("mantem saldo e entradas como destaques separados", () => {
    const wrapper = montar();

    expect(wrapper.get('[data-teste="resumo-saldo-caixa"]').text()).toContain("500");
    expect(wrapper.get('[aria-label^="Consultar vendas nas Entradas"]').text()).toContain("Entradas");
    expect(wrapper.get('[aria-controls="movimentacoes-lista"]').text()).toContain("Ocultar");
    expect(wrapper.text()).toContain("Vendas por forma de pagamento");
    expect(wrapper.text()).toContain("Vendas canceladas");
  });

  it("permite recolher formas e o restante das movimentacoes", async () => {
    const wrapper = montar();

    await wrapper.get('[aria-controls="formas-pagamento-lista"]').trigger("click");
    await wrapper.get('[aria-controls="movimentacoes-lista"]').trigger("click");

    expect(wrapper.get('[aria-controls="formas-pagamento-lista"]').attributes("aria-expanded")).toBe("false");
    expect(wrapper.get('[aria-controls="movimentacoes-lista"]').attributes("aria-expanded")).toBe("false");
    expect(wrapper.get('[data-teste="resumo-saldo-caixa"]').text()).toContain("500");
    expect(wrapper.get('[aria-label^="Consultar vendas nas Entradas"]').text()).toContain("Entradas");
  });

  it("abre a consulta de vendas somente pelas entradas e preserva canceladas", async () => {
    const wrapper = montar();

    await wrapper.get('[aria-label^="Consultar vendas nas Entradas"]').trigger("click");
    await wrapper.get('[aria-label^="Ver 2 vendas canceladas"]').trigger("click");

    expect(wrapper.emitted("selecionarCategoria")).toEqual([["entradas", 100]]);
    expect(wrapper.emitted("verVendasCanceladas")).toHaveLength(1);
  });
});
