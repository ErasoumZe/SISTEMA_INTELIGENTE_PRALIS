import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelatorioFechamentoCartaoCaixa from "./RelatorioFechamentoCartaoCaixa.vue";

const linha = {
  id: "cx-1",
  dataMovimento: "2026-10-27",
  pdvNome: "PDV 1",
  turnoNome: "Manhã",
  colaboradorNome: "Ana",
  dataHoraAbertura: "2026-10-27T10:00:00.000Z",
  dataHoraFechamento: null,
  saldo: 120,
  temAjuste: true,
  situacaoTesouraria: "com_quebra"
};

function montar(propsLinha: Record<string, unknown> = {}) {
  return shallowMount(RelatorioFechamentoCartaoCaixa, {
    props: { linha: { ...linha, ...propsLinha } } as never,
    global: {
      stubs: {
        "v-card": { template: "<div><slot /></div>" },
        "v-card-text": { template: "<div><slot /></div>" },
        "v-card-actions": { template: "<div><slot /></div>" },
        "v-divider": true,
        "v-chip": { template: "<span><slot /></span>" },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' }
      }
    }
  });
}

describe("RelatorioFechamentoCartaoCaixa", () => {
  it("mostra PDV, turno, operador, situacao e saldo", () => {
    const texto = montar().text();
    expect(texto).toContain("PDV 1");
    expect(texto).toContain("Manhã");
    expect(texto).toContain("Ana");
    expect(texto).toContain("Com quebra");
    expect(texto).toContain("120,00");
    expect(texto).toContain("Ajuste / diferença registrado");
  });

  it("caixa sem fechamento mostra Em curso", () => {
    expect(montar().text()).toContain("Em curso");
  });

  it("Conferir caixa entrega a linha ao pai", async () => {
    const wrapper = montar();
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("abrir")?.[0]?.[0]).toMatchObject({ id: "cx-1" });
  });
});
