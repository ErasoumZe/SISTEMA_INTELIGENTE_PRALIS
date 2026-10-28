import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelatorioFechamentoQuebraDialog from "./RelatorioFechamentoQuebraDialog.vue";

function montar(props: Record<string, unknown> = {}) {
  return mount(RelatorioFechamentoQuebraDialog, {
    props: { modelValue: true, resultado: "divergente", revisao: false, enviando: false, erro: "", ...props } as never,
    global: {
      stubs: {
        "v-dialog": { template: "<div><slot /></div>" },
        "v-card": { template: "<div><slot /></div>" },
        "v-card-title": { template: "<h2><slot /></h2>" },
        "v-card-text": { template: "<div><slot /></div>" },
        "v-card-actions": { template: "<div><slot /></div>" },
        "v-spacer": true,
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-textarea": {
          props: ["modelValue", "label", "errorMessages"],
          emits: ["update:modelValue"],
          template:
            '<label>{{ label }}<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><i data-erro>{{ errorMessages }}</i></label>'
        }
      }
    }
  });
}

describe("RelatorioFechamentoQuebraDialog", () => {
  it("Teve quebra exige o motivo antes de confirmar", async () => {
    const wrapper = montar();
    await wrapper.get('[data-teste="confirmar-quebra"]').trigger("click");
    expect(wrapper.emitted("confirmar")).toBeUndefined();
    expect(wrapper.get("[data-erro]").text()).toContain("Informe o motivo da quebra");
  });

  it("confirma devolvendo o motivo aparado", async () => {
    const wrapper = montar();
    await wrapper.get("textarea").setValue("  faltou uma nota de 50  ");
    await wrapper.get('[data-teste="confirmar-quebra"]').trigger("click");
    expect(wrapper.emitted("confirmar")?.[0]).toEqual(["faltou uma nota de 50"]);
  });

  it("Alterar status diz de qual status para qual e tambem exige motivo", async () => {
    const wrapper = montar({ revisao: true, resultado: "conferido" });
    expect(wrapper.text()).toContain("Alterar status da conferência");
    expect(wrapper.text()).toContain("passa de Quebra / divergência para Conferido");
    await wrapper.get('[data-teste="confirmar-quebra"]').trigger("click");
    expect(wrapper.get("[data-erro]").text()).toContain("motivo da alteração");
    expect(wrapper.emitted("confirmar")).toBeUndefined();
  });

  it("mostra o erro do servidor", () => {
    expect(montar({ erro: "Caixa nao encontrado" }).get("[data-erro]").text()).toContain("Caixa nao encontrado");
  });

  it("o motivo da abertura anterior nao vaza para a proxima", async () => {
    const wrapper = montar();
    await wrapper.get("textarea").setValue("motivo antigo");
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("");
  });
});
