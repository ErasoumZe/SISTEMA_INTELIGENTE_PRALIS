import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import type { Duvida } from "~/utils/duvidas";

const estados = new Map<string, Ref<unknown>>();
vi.stubGlobal("useRoute", () => ({ path: "/caixa" }));
vi.stubGlobal("useState", (chave: string, inicial: () => unknown) => {
  if (!estados.has(chave)) estados.set(chave, ref(inicial()));
  return estados.get(chave);
});

const { default: AppDuvidas } = await import("./AppDuvidas.vue");
const { useDuvidasContexto } = await import("~/composables/useDuvidasContexto");

const duvidas: Duvida[] = [
  {
    id: "v1",
    tema: "vendas",
    pergunta: "Errei a contagem",
    resposta: "Use Corrigir contagem.",
    palavras: ["contei errado"]
  },
  { id: "m1", tema: "maquininha", pergunta: "Qual relatório mando?", resposta: "O relatório resumido." },
  { id: "t1", tema: "turno", pergunta: "Como faço sangria?", resposta: "Pela aba Retorno / sangria." }
];

function montar() {
  return mount(AppDuvidas, {
    props: { duvidas },
    global: {
      stubs: {
        AppLogoAnimada: true,
        "v-navigation-drawer": { props: ["modelValue"], template: '<aside v-if="modelValue"><slot /></aside>' },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-chip": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-expansion-panels": { template: "<div><slot /></div>" },
        "v-expansion-panel": { template: "<div v-bind='$attrs'><slot /></div>" },
        "v-expansion-panel-title": { template: "<div><slot /></div>" },
        "v-expansion-panel-text": { template: "<div><slot /></div>" },
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

describe("AppDuvidas", () => {
  beforeEach(() => estados.clear());

  it("abre no assunto da etapa em que o operador está", async () => {
    useDuvidasContexto().marcar("maquininha");
    const tela = montar();
    await tela.get("[data-teste='duvidas-abrir']").trigger("click");
    expect(tela.find("[data-teste='duvida-m1']").exists()).toBe(true);
    expect(tela.find("[data-teste='duvida-v1']").exists()).toBe(false);
  });

  it("fora do fechamento, na tela do caixa, abre em Durante o turno", async () => {
    const tela = montar();
    await tela.get("[data-teste='duvidas-abrir']").trigger("click");
    expect(tela.find("[data-teste='duvida-t1']").exists()).toBe(true);
    expect(tela.find("[data-teste='duvida-m1']").exists()).toBe(false);
  });

  it("a busca procura em todos os assuntos, pelo jeito que a pessoa fala", async () => {
    useDuvidasContexto().marcar("maquininha");
    const tela = montar();
    await tela.get("[data-teste='duvidas-abrir']").trigger("click");
    await tela.get("[data-teste='duvidas-busca']").setValue("contei errado");
    expect(tela.find("[data-teste='duvida-v1']").exists()).toBe(true);
    expect(tela.find("[data-teste='duvida-m1']").exists()).toBe(false);
  });

  it("sem resultado, manda chamar o gerente", async () => {
    const tela = montar();
    await tela.get("[data-teste='duvidas-abrir']").trigger("click");
    await tela.get("[data-teste='duvidas-busca']").setValue("xyz inexistente");
    expect(tela.get("[data-teste='duvidas-vazio']").text()).toContain("chame o gerente");
  });
});
