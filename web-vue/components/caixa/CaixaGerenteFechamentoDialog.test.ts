import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import CaixaGerenteFechamentoDialog from "./CaixaGerenteFechamentoDialog.vue";

function montar(fechamento: { caixaResponsavelNome: string; supervisorResponsavelNome: string }) {
  return mount(CaixaGerenteFechamentoDialog, {
    props: { modelValue: true, fechamento },
    global: {
      stubs: {
        "v-dialog": { props: ["modelValue"], template: '<div v-if="modelValue"><slot /></div>' },
        "v-card": { template: "<div v-bind='$attrs'><slot /></div>" },
        "v-card-title": { template: "<h2><slot /></h2>" },
        "v-card-text": { template: "<div><slot /></div>" },
        "v-card-actions": { template: "<div><slot /></div>" },
        "v-spacer": true,
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-text-field": {
          inheritAttrs: false,
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template:
            '<input :value="modelValue" :data-teste="$attrs[\'data-teste\']" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        }
      }
    }
  });
}

// R-232 · a etapa "Resumo" virou um popup rapido: confirma o gerente da abertura ou digita outro.
describe("CaixaGerenteFechamentoDialog", () => {
  it("é o mesmo gerente: confirma sem digitar", async () => {
    const fechamento = reactive({ caixaResponsavelNome: "Marco", supervisorResponsavelNome: "Silvana" });
    const tela = montar(fechamento);
    expect(tela.text()).toContain("Silvana");
    await tela.get("[data-teste='popup-gerente-confirmar']").trigger("click");
    expect(tela.emitted("confirmado")).toHaveLength(1);
    expect(fechamento.supervisorResponsavelNome).toBe("Silvana");
  });

  it("é outro gerente: digita o nome e confirma", async () => {
    const fechamento = reactive({ caixaResponsavelNome: "Marco", supervisorResponsavelNome: "Silvana" });
    const tela = montar(fechamento);
    await tela.get("[data-teste='popup-gerente-trocar']").trigger("click");
    await tela.get("[data-teste='popup-gerente-nome']").setValue("Rodrigo");
    await tela.get("[data-teste='popup-gerente-confirmar']").trigger("click");
    expect(fechamento.supervisorResponsavelNome).toBe("Rodrigo");
    expect(tela.emitted("confirmado")).toHaveLength(1);
  });

  it("o responsável pelo caixa é quem abriu e não aparece para editar (R-226)", () => {
    const tela = montar(reactive({ caixaResponsavelNome: "Marco", supervisorResponsavelNome: "Silvana" }));
    expect(tela.find("[data-teste='popup-gerente-responsavel']").exists()).toBe(false);
  });
});
