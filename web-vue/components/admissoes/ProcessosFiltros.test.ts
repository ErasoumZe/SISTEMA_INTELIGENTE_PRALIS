// ADM-003 V6 — o recorte da lista, e o atalho da fila do DP.
//
// O que este arquivo protege: que o atalho e o MESMO filtro (nao um segundo parametro), que ele
// se anuncia como interruptor, e que a pagina so recebe recorte quando alguem pede.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mount } from "@vue/test-utils";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import ProcessosFiltros from "~/components/admissoes/ProcessosFiltros.vue";

const PASTA = dirname(fileURLToPath(import.meta.url));

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

function montar() {
  const vuetify = createVuetify({ components, directives });
  return mount(ProcessosFiltros, { global: { plugins: [vuetify] }, props: { carregando: false } });
}

function pilula(wrapper: ReturnType<typeof montar>) {
  return wrapper.find(".filtro-fila");
}

describe("o atalho da fila", () => {
  it("Deve_AbrirDesligado_Porque_A_ListaEhOCadastro", () => {
    // A tela de processos e o cadastro: quem entra por ela quer ver todo mundo. A fila e um gesto.
    const wrapper = montar();
    expect(pilula(wrapper).attributes("aria-pressed")).toBe("false");
    expect(wrapper.emitted("aplicar")).toBeUndefined();
  });

  it("Deve_LigarEDesligarOMesmoFiltro", async () => {
    // Atalho e preset do MESMO parametro. Um `aguardandoRevisao=true` convivendo com `ficha` seriam
    // duas formas de pedir a mesma coisa, capazes de divergir.
    const wrapper = montar();
    await pilula(wrapper).trigger("click");
    expect(wrapper.emitted("aplicar")?.[0]).toEqual([{ ficha: "enviada" }]);
    expect(pilula(wrapper).attributes("aria-pressed")).toBe("true");

    // Clicar de novo na pilula marcada volta para "qualquer ficha".
    await pilula(wrapper).trigger("click");
    expect(wrapper.emitted("aplicar")?.[1]).toEqual([{ ficha: "" }]);
    expect(pilula(wrapper).attributes("aria-pressed")).toBe("false");
  });

  it("Deve_SeAnunciarComoInterruptor", () => {
    // `aria-pressed` e o que diz ao leitor de tela que o recorte esta ligado. Sem ele, o botao
    // anuncia so "botao" e o estado fica invisivel para quem nao ve a cor.
    const botao = pilula(montar());
    expect(botao.attributes("aria-pressed")).toBeDefined();
    expect(botao.text()).toContain("Aguardando revisão");
  });
});

describe("limpar volta ao padrao e aplica", () => {
  it("Deve_LimparEmitirORecorteVazio", async () => {
    const wrapper = montar();
    await pilula(wrapper).trigger("click");
    const limpar = wrapper.findAll("button").find((b) => b.text() === "Limpar");
    expect(limpar).toBeDefined();
    await limpar?.trigger("click");
    // Limpar APLICA: um "limpar" que so mexe no formulario deixa a tela mostrando o recorte antigo.
    expect(wrapper.emitted("aplicar")?.at(-1)).toEqual([{ ficha: "" }]);
    expect(pilula(wrapper).attributes("aria-pressed")).toBe("false");
  });
});

describe("o filtro nao carrega documento", () => {
  it("Deve_NaoTerCampoDeBuscaPorNomeOuCpf", () => {
    // CPF nunca entra em query string — ela vai para log de acesso, historico e cabecalho referer.
    // Nome tambem nao: a lista de processos nao tem busca textual, e nao e esta entrega que a cria.
    //
    // A varredura e na FONTE, e nao no DOM: o `v-select` do Vuetify renderiza um `input` proprio, e
    // contar `input` acusaria um campo de texto que nao existe.
    const fonte = readFileSync(join(PASTA, "ProcessosFiltros.vue"), "utf8");
    expect(fonte).not.toContain("v-text-field");
    expect(fonte.toLowerCase()).not.toContain("cpf");
    expect(montar().html().toLowerCase()).not.toContain("buscar");
  });
});
