import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CampoLacreFechamento from "./CampoLacreFechamento.vue";

const stubs = {
  "v-select": {
    props: ["modelValue", "items", "label", "errorMessages"],
    emits: ["update:modelValue"],
    template:
      '<div data-tipo="select"><span data-label>{{ label }}</span><span data-erro>{{ errorMessages }}</span><button v-for="item in items" :key="item" data-opcao @click="$emit(\'update:modelValue\', item)">{{ item }}</button></div>'
  },
  "v-text-field": {
    props: ["modelValue", "label", "errorMessages"],
    emits: ["update:modelValue"],
    template:
      '<div data-tipo="texto"><span data-label>{{ label }}</span><span data-erro>{{ errorMessages }}</span><input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></div>'
  }
};

function montar(props: { modelValue: string; reservado: string | null; pendente: boolean }) {
  return mount(CampoLacreFechamento, { props, global: { stubs } });
}

describe("CampoLacreFechamento", () => {
  it("com lacre reservado o operador SELECIONA, nao digita", () => {
    const wrapper = montar({ modelValue: "", reservado: "F-1002", pendente: true });
    expect(wrapper.find('[data-tipo="select"]').exists()).toBe(true);
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.findAll("[data-opcao]").map((opcao) => opcao.text())).toEqual(["F-1002"]);
  });

  it("selecionar a opcao grava o numero reservado", async () => {
    const wrapper = montar({ modelValue: "", reservado: "F-1002", pendente: true });
    await wrapper.get("[data-opcao]").trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["F-1002"]);
  });

  it("nao escolhe por ele: o campo comeca vazio e pendente ate o operador selecionar", () => {
    const wrapper = montar({ modelValue: "", reservado: "F-1002", pendente: true });
    expect(wrapper.get("[data-erro]").text()).toContain("Selecione o lacre antes de fechar o caixa");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("um numero digitado antes da reserva aparecer e descartado", () => {
    const wrapper = montar({ modelValue: "digitado-errado", reservado: "F-1002", pendente: false });
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([""]);
  });

  it("se o valor ja e o reservado, nao limpa", () => {
    const wrapper = montar({ modelValue: "F-1002", reservado: "F-1002", pendente: false });
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("sem lacre reservado segue digitado e obrigatorio (R-200)", async () => {
    const wrapper = montar({ modelValue: "", reservado: null, pendente: true });
    expect(wrapper.find('[data-tipo="texto"]').exists()).toBe(true);
    expect(wrapper.find('[data-tipo="select"]').exists()).toBe(false);
    expect(wrapper.get("[data-erro]").text()).toContain("Informe o lacre antes de fechar o caixa");
    await wrapper.get("input").setValue("FCH-9");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["FCH-9"]);
  });
});
