import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CaixaRelatorioFinalFolhaCreare from "./CaixaRelatorioFinalFolhaCreare.vue";
import { leituraFolhaCreareVazia } from "~/utils/folha-creare";

const creare = {
  leitura: { credito: 947.05, total: 3674.28, clientes: 148.81, sangria: 600, saldoFinalDinheiro: 840.21 },
  comparacao: { credito: "ok", total: "divergente", sangria: "ok" } as const,
  pralis: { credito: 947.05, total: 3674.27, sangria: 600 },
  somaFormasConfereTotal: false,
  horario: {
    inicio: { situacao: "divergente", diferencaMinutos: -15, sugestaoInicio: null, motivoSemSugestao: null },
    emissao: { situacao: "antes_do_corte", diferencaMinutos: -20 }
  } as const
};

describe("CaixaRelatorioFinalFolhaCreare", () => {
  it("compara linha a linha na ordem do cupom, com folha, Pralis e situacao", () => {
    const wrapper = mount(CaixaRelatorioFinalFolhaCreare, { props: { creare, versao: 4 } });
    const texto = wrapper.text();
    const ordem = ["Troco Inicial", "CLIENTES (VND/TRANS)", "CREDITO (VND/TRANS)", "Total", "Sangria"].map((rotulo) =>
      texto.indexOf(rotulo)
    );
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(wrapper.get('[data-teste="final-linha-credito"]').text()).toContain("Confere");
    const total = wrapper.get('[data-teste="final-linha-total"]');
    expect(total.text()).toContain("Diferença");
    expect(total.text()).toContain("0,01");
    expect(wrapper.get('[data-teste="final-linha-clientes"]').text()).toContain("Só na folha");
    expect(wrapper.get('[data-teste="final-linha-sangria"]').text()).toContain("-R$");
    expect(texto).toContain("1 linha(s) com diferença");
  });

  it("avisa formas que nao somam o Total e o horario da folha", () => {
    const texto = mount(CaixaRelatorioFinalFolhaCreare, { props: { creare, versao: 4 } }).text();
    expect(texto).toContain("não dá o Total impresso");
    expect(texto).toContain("difere 15 min");
    expect(texto).toContain("20 min antes do corte");
  });

  it("relatorio do modelo antigo pede para gerar de novo", () => {
    const wrapper = mount(CaixaRelatorioFinalFolhaCreare, {
      props: { creare: { comparacao: { total: "ok" } }, versao: 3 }
    });
    expect(wrapper.text()).toContain("modelo antigo");
    expect(wrapper.find('[data-teste="final-linha-total"]').exists()).toBe(false);
  });
});

describe("leitura vazia da folha", () => {
  it("tem todos os campos do cupom em branco", () => {
    const leitura = leituraFolhaCreareVazia();
    expect(leitura.periodoInicio).toBe("");
    expect(leitura.saldoFinalDinheiro).toBe("");
  });
});
