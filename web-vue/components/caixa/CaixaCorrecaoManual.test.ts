import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CaixaCorrecaoManual from "./CaixaCorrecaoManual.vue";

const stubs = {
  "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
  "v-textarea": {
    inheritAttrs: false,
    props: ["modelValue", "errorMessages"],
    template:
      '<label><textarea :value="modelValue" :data-teste="$attrs[\'data-teste\']" /><small>{{ errorMessages }}</small></label>'
  }
};

function montar(props: Record<string, unknown>) {
  return mount(CaixaCorrecaoManual, {
    props: { corrigindo: false, justificativa: "", temTravados: true, alterados: [], ...props },
    global: { stubs }
  });
}

describe("CaixaCorrecaoManual", () => {
  it("com numero travado mostra o botao; ao tocar avisa que destravou", async () => {
    const wrapper = montar({});
    await wrapper.get('[data-teste="botao-corrigir-manualmente"]').trigger("click");
    expect(wrapper.emitted("update:corrigindo")?.[0]).toEqual([true]);
  });

  it("valor mudado exige justificativa", () => {
    const wrapper = montar({ corrigindo: true, alterados: ["Crédito"], justificativa: "abc" });
    expect(wrapper.text()).toContain("Alterado: Crédito");
    expect(wrapper.text()).toContain("Explique por que o valor mudou");
  });

  it("mostra a correcao ja registrada", () => {
    const wrapper = montar({ salva: { justificativa: "Foto cortada no débito", campos: ["Débito"] } });
    expect(wrapper.get('[data-teste="correcao-registrada"]').text()).toContain("Débito");
    expect(wrapper.get('[data-teste="correcao-registrada"]').text()).toContain("Foto cortada no débito");
  });

  it("sem numero travado nao mostra o botao", () => {
    expect(montar({ temTravados: false }).find('[data-teste="botao-corrigir-manualmente"]').exists()).toBe(false);
  });
});
