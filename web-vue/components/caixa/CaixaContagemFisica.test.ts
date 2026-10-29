import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { ref } from "vue";
import CaixaContagemFisica from "./CaixaContagemFisica.vue";
import type { ContagemFisicaRelatorio } from "@padaria/shared";

const campo = {
  inheritAttrs: false,
  props: ["modelValue", "label"],
  emits: ["update:modelValue"],
  template:
    '<input :value="modelValue" :data-teste="$attrs[\'data-teste\']" @input="$emit(\'update:modelValue\', $event.target.value)" />'
};

function montar(registrada: ContagemFisicaRelatorio | null) {
  const modelo = ref({ valorEspecie: "", valorMoedas: "", justificativa: "", corrigindo: false });
  const tela = mount(CaixaContagemFisica, {
    props: {
      registrada,
      modelValue: modelo.value,
      "onUpdate:modelValue": (valor: typeof modelo.value) => {
        modelo.value = valor;
        void tela.setProps({ modelValue: valor });
      }
    },
    global: {
      stubs: {
        CampoDinheiro: campo,
        "v-icon": true,
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-textarea": {
          inheritAttrs: false,
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template:
            '<textarea :value="modelValue" :data-teste="$attrs[\'data-teste\']" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        }
      }
    }
  });
  return { tela, modelo };
}

const gravada: ContagemFisicaRelatorio = {
  valorEspecie: 90,
  valorMoedas: 5,
  total: 95,
  esperado: 100,
  diferenca: -5,
  registradaEm: "2026-10-29T18:00:00.000Z",
  registradaPor: "u-1",
  correcoes: []
};

// R-232 · contagem cega: antes de gravar, nenhum numero do sistema aparece; depois, trava e compara.
describe("CaixaContagemFisica", () => {
  it("antes de gravar: só cédulas, moedas e o total digitado — nada de esperado", async () => {
    const { tela } = montar(null);
    await tela.find("[data-teste='contagem-cedulas']").setValue("80");
    await tela.find("[data-teste='contagem-moedas']").setValue("7");
    expect(tela.text()).toContain("87,00");
    expect(tela.text()).not.toContain("Esperado");
    expect(tela.find("[data-teste='contagem-comparacao']").exists()).toBe(false);
  });

  it("depois de gravar: trava, compara com o esperado e mostra a falta", () => {
    const { tela } = montar(gravada);
    expect(tela.find("[data-teste='contagem-cedulas']").exists()).toBe(false);
    const comparacao = tela.get("[data-teste='contagem-comparacao']").text();
    expect(comparacao).toContain("95,00");
    expect(comparacao).toContain("100,00");
    expect(comparacao).toContain("Falta");
  });

  it("corrigir reabre os campos e pede justificativa", async () => {
    const { tela, modelo } = montar(gravada);
    await tela.get("[data-teste='contagem-corrigir']").trigger("click");
    expect(modelo.value).toMatchObject({ corrigindo: true, valorEspecie: "90", valorMoedas: "5" });
    expect(tela.find("[data-teste='contagem-justificativa']").exists()).toBe(true);
  });
});
