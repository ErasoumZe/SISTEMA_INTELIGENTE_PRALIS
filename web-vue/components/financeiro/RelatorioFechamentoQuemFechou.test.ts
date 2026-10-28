import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelatorioFechamentoQuemFechou from "./RelatorioFechamentoQuemFechou.vue";

const texto = (valor: unknown) => (valor ? String(valor) : "--");
const dataHora = (valor: unknown) => String(valor);

function montar(caixa: Record<string, unknown>, resumo: Record<string, unknown> | null) {
  return shallowMount(RelatorioFechamentoQuemFechou, { props: { caixa, resumo, texto, dataHora } });
}

describe("RelatorioFechamentoQuemFechou", () => {
  const caixa = {
    pdvNome: "TNP-PC-CXPDV-1",
    turnoNome: "MANHA",
    usuarioCaixaNome: "Conta Posto",
    dataHoraAbertura: "2026-09-22T10:00:00.000Z",
    caixaResponsavelNomeAbertura: "mariana",
    supervisorResponsavelNomeAbertura: "peterson"
  };

  it("mostra quem fechou, supervisor, horario, abertura e duracao", () => {
    const wrapper = montar(caixa, {
      caixaResponsavelNomeFechamento: "mariana",
      supervisorResponsavelNomeFechamento: "peterson",
      fechadoEm: "2026-09-22T17:30:00.000Z",
      fechadoPorNome: "Tesouraria"
    });
    const conteudo = wrapper.text();
    expect(conteudo).toContain("TNP-PC-CXPDV-1");
    expect(wrapper.get('[data-teste="qf-operador"]').text()).toBe("mariana");
    expect(conteudo).toContain("peterson");
    expect(conteudo).toContain("2026-09-22T17:30:00.000Z");
    expect(conteudo).toContain("mariana · supervisor peterson");
    expect(conteudo).toContain("Conta do posto");
    expect(conteudo).toContain("Turno de 7h30");
    expect(conteudo).toContain("Registrado por");
  });

  it("caixa ainda sem fechamento nao inventa dados", () => {
    const wrapper = montar({ pdvNome: "PDV", turnoNome: "TARDE" }, null);
    expect(wrapper.get('[data-teste="qf-operador"]').text()).toBe("Não informado");
    expect(wrapper.text()).not.toContain("Turno de");
  });
});
