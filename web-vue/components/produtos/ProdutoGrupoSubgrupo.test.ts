// R-241 — o campo Grupo + Subgrupo que o cadastro de produto, o Agendamento de pedidos e o Agendamento de
// conferência usam. O registro gravado continua sendo UM grupo ("MER BEBIDAS - SUCOS"); o teste prova a ida e a
// volta entre o registro e o par Grupo/Subgrupo, com o Vuetify real.
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { VAutocomplete } from "vuetify/components";
import ProdutoGrupoSubgrupo from "~/components/produtos/ProdutoGrupoSubgrupo.vue";

beforeAll(() => {
  class ObservadorInerte {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("ResizeObserver", ObservadorInerte);
  vi.stubGlobal("IntersectionObserver", ObservadorInerte);
});

const GRUPOS = [
  { id: "sucos", nome: "MER BEBIDAS - SUCOS" },
  { id: "cervejas", nome: "MER BEBIDAS - CERVEJAS" },
  { id: "insumos", nome: "Insumos" }
];

function montar(grupoMercadoriaId: string | null) {
  const vuetify = createVuetify({ components, directives });
  return mount(ProdutoGrupoSubgrupo, {
    props: { grupos: GRUPOS, obrigatorio: true, modelValue: grupoMercadoriaId, grupo: null },
    global: { plugins: [vuetify] }
  });
}

const campos = (tela: ReturnType<typeof montar>) => tela.findAllComponents(VAutocomplete);
const ultimo = (tela: ReturnType<typeof montar>, evento: string) => tela.emitted(evento)?.at(-1)?.[0];

describe("ProdutoGrupoSubgrupo", () => {
  it("registro gravado abre dividido: Grupo BEBIDAS e Subgrupo SUCOS", async () => {
    const tela = montar("sucos");
    await nextTick();
    expect(ultimo(tela, "update:grupo")).toBe("BEBIDAS");
    const [grupo, subgrupo] = campos(tela);
    expect(grupo!.props("items")).toEqual([
      { value: "BEBIDAS", title: "BEBIDAS" },
      { value: "INSUMOS", title: "Insumos" }
    ]);
    await tela.setProps({ grupo: "BEBIDAS" });
    expect(subgrupo!.props("items")).toEqual([
      { value: "cervejas", title: "CERVEJAS" },
      { value: "sucos", title: "SUCOS" }
    ]);
  });

  it("Grupo com vários subgrupos não escolhe sozinho: o Subgrupo fica pendente", async () => {
    const tela = montar("insumos");
    campos(tela)[0]!.vm.$emit("update:modelValue", "BEBIDAS");
    await nextTick();
    expect(ultimo(tela, "update:grupo")).toBe("BEBIDAS");
    expect(ultimo(tela, "update:modelValue")).toBeNull();
  });

  it("Grupo sem subgrupo já é a escolha", async () => {
    const tela = montar(null);
    campos(tela)[0]!.vm.$emit("update:modelValue", "INSUMOS");
    await nextTick();
    expect(ultimo(tela, "update:modelValue")).toBe("insumos");
  });

  it("trocar de Grupo descarta o Subgrupo do grupo anterior", async () => {
    const tela = montar("sucos");
    await tela.setProps({ grupo: "BEBIDAS" });
    campos(tela)[0]!.vm.$emit("update:modelValue", "INSUMOS");
    await nextTick();
    expect(ultimo(tela, "update:modelValue")).toBe("insumos");
  });
});
