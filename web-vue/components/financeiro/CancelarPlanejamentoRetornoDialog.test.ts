import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it } from "vitest";
import CancelarPlanejamentoRetornoDialog from "./CancelarPlanejamentoRetornoDialog.vue";

const TextareaStub = defineComponent({
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h("textarea", {
        value: props.modelValue,
        onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLTextAreaElement).value)
      });
  }
});

function montar() {
  return mount(CancelarPlanejamentoRetornoDialog, {
    props: {
      modelValue: true,
      operacao: {
        id: "plano-1",
        empresaId: "empresa-1",
        dataReferencia: "2026-09-12",
        descricao: "Transferência de retorno",
        valorOriginal: "300.00",
        computar: true,
        status: "agendada",
        contaOrigemId: "pdv-1",
        contaDestinoId: "cofre-1",
        contaOrigemNome: "PDV 1",
        contaDestinoNome: "Cofre",
        nLacreDoc: "L-002"
      }
    },
    global: {
      stubs: {
        "v-dialog": { props: ["modelValue"], template: '<div v-if="modelValue"><slot /></div>' },
        "v-card": { template: "<section><slot /></section>" },
        "v-card-text": { template: "<div><slot /></div>" },
        "v-card-actions": { template: "<div><slot /></div>" },
        "v-spacer": true,
        "v-textarea": TextareaStub,
        "v-btn": { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>' }
      }
    }
  });
}

describe("CancelarPlanejamentoRetornoDialog", () => {
  it("exige motivo e fecha somente quando o backend confirma o cancelamento", async () => {
    const wrapper = montar();
    expect(wrapper.get('[data-teste="resumo-cancelamento-planejamento"]').text()).toContain("R$ 300,00");
    expect(wrapper.text()).toContain("L-002");
    expect(wrapper.text()).toContain("Cofre");
    await wrapper.get('[data-teste="confirmar-cancelamento"]').trigger("click");
    expect(wrapper.emitted("confirmar")).toBeUndefined();

    await wrapper.get("textarea").setValue("  Destino indisponível  ");
    await wrapper.get('[data-teste="confirmar-cancelamento"]').trigger("click");
    const payload = wrapper.emitted("confirmar")?.[0]?.[0] as {
      planejamentoId: string;
      motivo: string;
      aoConcluir: (sucesso: boolean) => void;
    };
    expect(payload).toMatchObject({ planejamentoId: "plano-1", motivo: "Destino indisponível" });

    payload.aoConcluir(false);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    payload.aoConcluir(true);
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
  });
});
