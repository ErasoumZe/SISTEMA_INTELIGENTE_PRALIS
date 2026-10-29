import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CaixaFolhaCreareLeitura from "./CaixaFolhaCreareLeitura.vue";
import { leituraFolhaCreareVazia, rotuloCampoFolha } from "~/utils/folha-creare";

function montar() {
  const leitura = { ...leituraFolhaCreareVazia(), periodoInicio: "26/10/2026 06:14:58", total: "3.674,27" };
  return mount(CaixaFolhaCreareLeitura, {
    props: { modelValue: leitura },
    global: { stubs: { "v-text-field": { props: ["label"], template: "<label>{{ label }}</label>" } } }
  });
}

function telaCelular(celular: boolean) {
  vi.stubGlobal("matchMedia", (consulta: string) => ({ matches: celular, media: consulta }));
}
afterEach(() => vi.unstubAllGlobals());

describe("CaixaFolhaCreareLeitura", () => {
  it("no celular comeca fechada e mostra Periodo e Total no cabecalho", async () => {
    telaCelular(true);
    const wrapper = montar();
    await flushPromises();
    const folha = wrapper.get('[data-teste="folha-creare"]');
    expect((folha.element as HTMLDetailsElement).open).toBe(false);
    expect(folha.get("summary").text()).toContain("Período 26/10/2026 06:14:58 · Total R$ 3.674,27");
    expect(folha.get("summary").text()).toContain("Mostrar");
  });

  it("no computador comeca aberta com os rotulos do cupom", async () => {
    telaCelular(false);
    const wrapper = montar();
    await flushPromises();
    expect((wrapper.get('[data-teste="folha-creare"]').element as HTMLDetailsElement).open).toBe(true);
    expect(wrapper.text()).toContain("DINHEIRO (VND)");
    expect(wrapper.text()).toContain("Ocultar");
  });

  it("aviso de revisao usa o rotulo do cupom, nao o nome interno", () => {
    expect(rotuloCampoFolha("saldoFinalDinheiro")).toBe("Saldo Final Dinheiro");
    expect(rotuloCampoFolha("periodoInicio")).toBe("Período de");
  });
});
