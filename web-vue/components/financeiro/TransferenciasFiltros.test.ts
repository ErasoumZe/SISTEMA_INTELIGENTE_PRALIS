import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TransferenciasFiltros from "./TransferenciasFiltros.vue";

const filtros = {
  dataInicio: "2026-10-01",
  dataFim: "",
  pdvId: "",
  usuario: "",
  contaOrigemId: "",
  contaDestinoId: "",
  lacre: ""
};

function montar() {
  return shallowMount(TransferenciasFiltros, {
    props: {
      status: "pendente",
      filtros,
      opcoesStatus: [
        { title: "Todos os status", value: "" },
        { title: "Pendente", value: "pendente" }
      ],
      pdvs: [],
      contas: []
    },
    global: {
      stubs: {
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-select": true,
        "v-text-field": true,
        "v-chip": { template: "<span><slot /></span>" }
      }
    }
  });
}

describe("TransferenciasFiltros", () => {
  it("mantém status e período visíveis e mostra os filtros aplicados", () => {
    const wrapper = montar();

    expect(wrapper.text()).toContain("Aplicados");
    expect(wrapper.text()).toContain("Pendente");
    expect(wrapper.text()).toContain("De 2026-10-01");
  });

  it("abre os filtros complementares no mesmo painel", async () => {
    const wrapper = montar();

    await wrapper.get(".filtros-transferencias__mais").trigger("click");

    expect(wrapper.html()).toContain("Criado por");
    expect(wrapper.html()).toContain("Conta de origem");
    expect(wrapper.html()).toContain("Conta de destino");
    expect(wrapper.html()).toContain("Lacre");
  });
});
