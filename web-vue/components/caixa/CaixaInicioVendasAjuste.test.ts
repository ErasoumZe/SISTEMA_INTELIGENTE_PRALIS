import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CaixaInicioVendasAjuste from "./CaixaInicioVendasAjuste.vue";

const apiPost = vi.fn();
const OFICIAL = new Date(2026, 9, 28, 13, 18, 0).toISOString();

beforeEach(() => {
  apiPost.mockReset();
  vi.stubGlobal("useApi", () => ({ apiPost }));
});
afterEach(() => vi.unstubAllGlobals());

const campo = {
  inheritAttrs: false,
  props: ["modelValue", "label"],
  emits: ["update:modelValue"],
  template:
    '<label>{{ label }}<input :value="modelValue" :data-teste="$attrs[\'data-teste\']" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>'
};

function montar(inicio = OFICIAL, sugestao: { inicio: string; periodoTexto: string } | null = null) {
  return mount(CaixaInicioVendasAjuste, {
    props: { caixaId: "cx-1", aberturaOficial: OFICIAL, inicioVendas: inicio, sugestao },
    global: {
      stubs: {
        "v-dialog": { props: ["modelValue"], template: '<div v-if="modelValue"><slot /></div>' },
        "v-card": { template: "<div><slot /></div>" },
        "v-card-title": { template: "<h2><slot /></h2>" },
        "v-card-text": { template: "<div><slot /></div>" },
        "v-card-actions": { template: "<div><slot /></div>" },
        "v-spacer": true,
        "v-alert": { template: '<div v-bind="$attrs"><slot /></div>' },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-text-field": campo,
        "v-textarea": { ...campo, template: campo.template.replace("input", "textarea").replace("/>", "></textarea>") }
      }
    }
  });
}

async function preencher(wrapper: ReturnType<typeof montar>, hora: string, motivo: string) {
  await wrapper.get('[data-teste="botao-ajustar-inicio"]').trigger("click");
  await wrapper.get('[data-teste="campo-hora-inicio"]').setValue(hora);
  await wrapper.get('[data-teste="campo-motivo-inicio"]').setValue(motivo);
}

describe("CaixaInicioVendasAjuste", () => {
  it("sem ajuste mostra que as vendas contam desde a abertura do sistema", () => {
    const wrapper = montar();
    expect(wrapper.text()).toContain("É a hora em que o caixa foi aberto no sistema");
    expect(wrapper.find('[data-teste="inicio-vendas-oficial"]').exists()).toBe(false);
  });

  it("com ajuste mostra a abertura oficial, que fica no registro", () => {
    const wrapper = montar(new Date(2026, 9, 28, 13, 0, 0).toISOString());
    expect(wrapper.get('[data-teste="inicio-vendas-oficial"]').text()).toContain("Abertura oficial");
  });

  it("nao deixa passar de 60 minutos antes da abertura oficial", async () => {
    const wrapper = montar();
    await preencher(wrapper, "12:10", "Comecei a vender antes");
    expect(wrapper.text()).toContain("No máximo 60 minutos");
    expect(wrapper.get('[data-teste="confirmar-inicio-vendas"]').attributes("disabled")).toBeDefined();
  });

  it("nao aceita hora depois da abertura oficial", async () => {
    const wrapper = montar();
    await preencher(wrapper, "13:30", "Motivo qualquer");
    expect(wrapper.text()).toContain("antes da abertura oficial");
  });

  it("exige motivo", async () => {
    const wrapper = montar();
    await preencher(wrapper, "13:00", "");
    expect(wrapper.text()).toContain("Escreva o motivo");
    expect(wrapper.get('[data-teste="confirmar-inicio-vendas"]').attributes("disabled")).toBeDefined();
  });

  it("confirma: manda a hora escolhida e o motivo, e avisa o pai", async () => {
    apiPost.mockResolvedValue({
      inicioVendas: new Date(2026, 9, 28, 13, 0, 0).toISOString(),
      aberturaOficial: OFICIAL,
      vendasAnexadas: 3,
      relatorioVendasInvalidado: true
    });
    const wrapper = montar();
    await preencher(wrapper, "13:00", "Abri o caixa no sistema depois de começar a vender");
    await wrapper.get('[data-teste="confirmar-inicio-vendas"]').trigger("click");
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith("/api/caixa/cx-1/inicio-vendas", {
      inicio: new Date(2026, 9, 28, 13, 0, 0).toISOString(),
      motivo: "Abri o caixa no sistema depois de começar a vender"
    });
    expect(wrapper.emitted("ajustado")?.[0]?.[0]).toMatchObject({ vendasAnexadas: 3 });
    expect(wrapper.find('[data-teste="inicio-vendas-oficial"]').exists()).toBe(true);
  });

  it("com a folha do CREARE comecando antes, destaca e ja preenche a hora e o motivo", async () => {
    const wrapper = montar(OFICIAL, {
      inicio: new Date(2026, 9, 28, 13, 1, 0).toISOString(),
      periodoTexto: "28/10/2026 13:01:30"
    });
    expect(wrapper.get('[data-teste="inicio-vendas-sugerido"]').text()).toContain("28/10/2026 13:01:30");
    expect(wrapper.get('[data-teste="inicio-vendas"]').classes()).toContain("inicio-vendas--sugerido");
    await wrapper.get('[data-teste="botao-ajustar-inicio"]').trigger("click");
    expect((wrapper.get('[data-teste="campo-hora-inicio"]').element as HTMLInputElement).value).toBe("13:01");
    expect((wrapper.get('[data-teste="campo-motivo-inicio"]').element as HTMLTextAreaElement).value).toContain(
      "folha do CREARE"
    );
  });

  it("mostra o erro do servidor", async () => {
    apiPost.mockRejectedValue(new Error("O inicio nao pode ser antes do fechamento do caixa anterior deste PDV."));
    const wrapper = montar();
    await preencher(wrapper, "13:00", "Motivo valido");
    await wrapper.get('[data-teste="confirmar-inicio-vendas"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("caixa anterior");
  });
});
