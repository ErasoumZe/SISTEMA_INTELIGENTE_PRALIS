import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CaixaFechamentoResumo from "./CaixaFechamentoResumo.vue";
import type { CaixaOperacional } from "~/types/padaria";

const campo = {
  inheritAttrs: false,
  props: ["modelValue", "label", "readonly", "hint"],
  template:
    '<label>{{ label }}<input :value="modelValue" :readonly="readonly" :data-teste="$attrs[\'data-teste\']" /><small>{{ hint }}</small></label>'
};

function montar(nomeAbertura: string | null = "Maria da abertura") {
  return mount(CaixaFechamentoResumo, {
    props: {
      caixa: {
        pdvNome: "PDV 1",
        dataHoraAbertura: "2026-10-28T09:00:00.000Z",
        caixaResponsavelNomeAbertura: nomeAbertura
      } as CaixaOperacional,
      fechamento: { caixaResponsavelNome: nomeAbertura ?? "", supervisorResponsavelNome: "" },
      responsaveisPendentes: true
    },
    global: {
      stubs: {
        "v-text-field": campo,
        "v-icon": true,
        "v-row": { template: "<div><slot /></div>" },
        "v-col": { template: "<div><slot /></div>" }
      }
    }
  });
}

// R-226: o responsavel pelo caixa no fechamento e quem abriu; so o supervisor e informado.
describe("CaixaFechamentoResumo", () => {
  it("mostra o responsavel da abertura travado e pede so o supervisor", () => {
    const wrapper = montar();
    const responsavel = wrapper.get('[data-teste="responsavel-fechamento-wizard"]');
    expect((responsavel.element as HTMLInputElement).value).toBe("Maria da abertura");
    expect(responsavel.attributes("readonly")).toBeDefined();
    expect(wrapper.get('[data-teste="supervisor-fechamento-wizard"]').attributes("readonly")).toBeUndefined();
    expect(wrapper.text()).toContain("Quem abriu o caixa. Não muda no fechamento.");
    expect(wrapper.text()).toContain("Informe o supervisor responsável para continuar.");
  });

  it("caixa antigo sem nome na abertura deixa o responsavel livre para preencher", () => {
    const wrapper = montar(null);
    expect(wrapper.get('[data-teste="responsavel-fechamento-wizard"]').attributes("readonly")).toBeUndefined();
    expect(wrapper.text()).toContain("Este caixa não registrou quem abriu");
  });
});
