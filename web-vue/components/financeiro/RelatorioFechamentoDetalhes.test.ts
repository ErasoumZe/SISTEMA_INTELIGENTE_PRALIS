import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelatorioFechamentoDetalhes from "./RelatorioFechamentoDetalhes.vue";

const dinheiro = (valor: number) => `R$ ${valor.toFixed(2).replace(".", ",")}`;
const numero = (valor: unknown) => Number(valor ?? 0);
const texto = (valor: unknown) => (valor ? String(valor) : "--");

function montar(props: Record<string, unknown> = {}) {
  return shallowMount(RelatorioFechamentoDetalhes, {
    props: {
      conferencias: [],
      quebras: [],
      decisoes: [],
      anexos: [],
      anexoUrl: () => "/anexo",
      dinheiro,
      numero,
      texto,
      ...props
    } as never,
    global: { stubs: { "v-alert": { template: "<div><slot /></div>" } } }
  });
}

describe("RelatorioFechamentoDetalhes", () => {
  it("lista decisoes da Tesouraria e anexos, ou diz que nao ha", () => {
    expect(montar().text()).toContain("Nenhuma decisão final registrada");
    expect(montar().text()).toContain("Nenhum anexo foi enviado");
    const com = montar({
      decisoes: [
        {
          id: "x",
          resultado: "divergente",
          observacao: "falta",
          conferidoPor: "u",
          conferidoPorNome: "Rodrigo",
          conferidoEm: null
        }
      ]
    });
    expect(com.text()).toContain("Quebra / divergência");
    expect(com.text()).toContain("Rodrigo");
  });
});
