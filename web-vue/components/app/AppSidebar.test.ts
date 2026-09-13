import { shallowMount } from "@vue/test-utils";
import { computed, defineComponent, h, ref, watch } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppSidebar from "./AppSidebar.vue";

const DrawerStub = defineComponent({
  setup(_, { slots }) {
    return () => h("aside", slots.default?.());
  }
});

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useGruposAbertos", () => ({ abertos: ref({}), hidratado: ref(true) }));
  vi.stubGlobal("useItemAtivoVisivel", vi.fn());
});

function montar({ rail = false, mobile = false, aberto = true } = {}) {
  return shallowMount(AppSidebar, {
    props: {
      telas: [],
      telaAtiva: "",
      escuro: true,
      aberto,
      rail,
      mobile
    },
    global: {
      stubs: {
        "v-navigation-drawer": DrawerStub,
        "v-icon": { template: '<i :data-icon="$attrs.icon" />' },
        AppMarcaCicluz: { template: '<span data-teste="marca-completa">Cicluz</span>' },
        AppLogoAnimada: { template: '<span data-teste="marca-simbolo" />' }
      }
    }
  });
}

describe("AppSidebar - controle unico da gaveta", () => {
  it.each([
    { largura: 1440, rail: false, mobile: false, acao: "recolher", icone: "mdi-chevron-left" },
    { largura: 1024, rail: true, mobile: false, acao: "expandir", icone: "mdi-chevron-right" },
    { largura: 768, rail: false, mobile: true, acao: "fechar", icone: "mdi-arrow-left" },
    { largura: 390, rail: false, mobile: true, acao: "fechar", icone: "mdi-arrow-left" }
  ])("mantem uma unica acao clara em $largura px", async ({ rail, mobile, acao, icone }) => {
    const wrapper = montar({ rail, mobile });
    const botoesDoTopo = wrapper.findAll(".sidebar-logo-row button");

    expect(botoesDoTopo).toHaveLength(1);
    expect(botoesDoTopo[0]?.attributes("aria-label")).toContain(`${acao} menu`);
    expect(botoesDoTopo[0]?.get(".sidebar-toggle-icon").attributes("data-icon")).toBe(icone);
    expect(wrapper.find(".sidebar-recolher").exists()).toBe(false);
    expect(wrapper.find(rail ? '[data-teste="marca-simbolo"]' : '[data-teste="marca-completa"]').exists()).toBe(true);

    await botoesDoTopo[0]?.trigger("click");
    expect(wrapper.emitted("alternar")).toHaveLength(1);
  });
});
