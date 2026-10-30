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
    global: { stubs: { AppLogoAnimada: true, "v-icon": true, Transition: false } }
  });
}

async function abrir(tela: ReturnType<typeof montar>) {
  await tela.get("[data-teste='duvidas-abrir']").trigger("click");
}

async function perguntar(tela: ReturnType<typeof montar>, texto: string) {
  await tela.get("[data-teste='duvidas-busca']").setValue(texto);
  await tela.get("form").trigger("submit");
}

describe("AppDuvidas", () => {
  beforeEach(() => estados.clear());

  it("a bolinha abre o chat já no assunto da etapa em que o operador está", async () => {
    useDuvidasContexto().marcar("maquininha");
    const tela = montar();
    expect(tela.find("[data-teste='duvidas-painel']").exists()).toBe(false);
    await abrir(tela);
    expect(tela.find("[data-teste='duvida-m1']").exists()).toBe(true);
    expect(tela.find("[data-teste='duvida-v1']").exists()).toBe(false);
  });

  it("fora do fechamento, na tela do caixa, começa em Durante o turno", async () => {
    const tela = montar();
    await abrir(tela);
    expect(tela.find("[data-teste='duvida-t1']").exists()).toBe(true);
    expect(tela.find("[data-teste='duvida-m1']").exists()).toBe(false);
  });

  it("tocar na pergunta mostra a pergunta como sua e a resposta como da Cicluz", async () => {
    const tela = montar();
    await abrir(tela);
    await tela.get("[data-teste='duvida-t1']").trigger("click");
    const minhas = tela.findAll("[data-de='voce']");
    expect(minhas.at(-1)?.text()).toContain("Como faço sangria?");
    expect(tela.findAll("[data-de='cicluz']").at(-1)?.text()).toContain("Pela aba Retorno / sangria.");
  });

  it("escrever procura em todos os assuntos, pelo jeito que a pessoa fala", async () => {
    useDuvidasContexto().marcar("maquininha");
    const tela = montar();
    await abrir(tela);
    await perguntar(tela, "contei errado");
    const resposta = tela.findAll("[data-de='cicluz']").at(-1)?.text() ?? "";
    expect(resposta).toContain("Errei a contagem");
    expect(resposta).toContain("Use Corrigir contagem.");
  });

  it("sem resultado, manda chamar o gerente", async () => {
    const tela = montar();
    await abrir(tela);
    await perguntar(tela, "xyz inexistente");
    expect(tela.findAll("[data-de='cicluz']").at(-1)?.text()).toContain("chame o gerente");
  });

  it("assuntos: escolher um assunto lista as perguntas dele", async () => {
    const tela = montar();
    await abrir(tela);
    await tela.get("[aria-label='Ver os assuntos']").trigger("click");
    await tela.get("[data-teste='duvidas-tema-vendas']").trigger("click");
    expect(tela.find("[data-teste='duvida-v1']").exists()).toBe(true);
  });
});
