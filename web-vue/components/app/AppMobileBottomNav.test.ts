import { mount } from "@vue/test-utils";
import { computed, defineComponent, h } from "vue";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ItemMenu } from "~/types/padaria";

let caminho = "/";
beforeAll(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useRoute", () => ({ path: caminho }));
});

const { default: AppMobileBottomNav } = await import("./AppMobileBottomNav.vue");

const LinkStub = defineComponent({
  props: { to: { type: String, required: true } },
  setup(props, { slots, attrs }) {
    return () => h("a", { ...attrs, href: props.to }, slots.default?.());
  }
});

const caixa: ItemMenu = { id: "caixa", titulo: "Caixa", permissao: "caixa_operar", icone: "mdi-cash-register" };

function montar(telas: ItemMenu[], telaAtiva = "") {
  return mount(AppMobileBottomNav, {
    props: { telas, telaAtiva, acoesNovoIds: ["saidas", "transferencias"] },
    global: { stubs: { NuxtLink: LinkStub, "v-icon": true } }
  });
}

const rotulos = (tela: ReturnType<typeof montar>) => tela.findAll(".navegacao-mobile-item").map((item) => item.text());

describe("AppMobileBottomNav", () => {
  it("Treinamento fica no meio: Inicio, Caixa, Treinamento, Saidas, Transferencias", () => {
    caminho = "/";
    expect(rotulos(montar([caixa]))).toEqual(["Início", "Caixa", "Treinamento", "Saídas", "Transferências"]);
  });

  it("sem grupo de video liberado (sem a tela Caixa), o Treinamento nao aparece", () => {
    caminho = "/";
    expect(rotulos(montar([]))).toEqual(["Início", "Saídas", "Transferências"]);
  });

  it("na pagina /treinamento o atalho fica marcado como a pagina atual", () => {
    caminho = "/treinamento";
    const tela = montar([caixa]);
    const treinamento = tela.get("a[href='/treinamento']");
    expect(treinamento.attributes("aria-current")).toBe("page");
    expect(tela.get("a[href='/']").attributes("aria-current")).toBeUndefined();
  });
});
