import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelatorioFechamentoParadaComputador from "./RelatorioFechamentoParadaComputador.vue";

const parada = {
  id: "p-1",
  motivos: ["falta_energia", "outro"],
  motivoOutro: "gerador falhou",
  iniciadoEm: "2026-10-27T12:00:00.000Z",
  retornadoEm: "2026-10-27T12:25:00.000Z",
  registradoPorNome: "Ana",
  retornadoPorNome: "Marcos"
};

function montar(paradas: unknown[]) {
  return shallowMount(RelatorioFechamentoParadaComputador, { props: { paradas } as never });
}

describe("RelatorioFechamentoParadaComputador", () => {
  it("mostra motivos, quando desligou e voltou, duracao e quem registrou", () => {
    const wrapper = montar([parada]);
    const texto = wrapper.text();
    expect(texto).toContain("Falta de energia na loja");
    expect(texto).toContain("Outro: gerador falhou");
    expect(wrapper.get('[data-teste="duracao-parada"]').text()).toBe("25 min");
    expect(texto).toContain("Ana");
    expect(texto).toContain("Marcos");
    expect(wrapper.get(".pc__contagem").text()).toBe("1");
  });

  it("parada ainda sem retorno fica marcada e diz isso", () => {
    const wrapper = montar([{ ...parada, retornadoEm: null, retornadoPorNome: null }]);
    expect(wrapper.get(".pc__item").attributes("data-aberta")).toBe("true");
    expect(wrapper.text()).toContain("Ainda sem retorno");
    expect(wrapper.get('[data-teste="duracao-parada"]').text()).toBe("Sem retorno registrado");
  });

  it("sem parada diz que nao houve, em vez de sumir", () => {
    expect(montar([]).text()).toContain("Nenhuma parada do computador foi registrada neste caixa");
  });
});
