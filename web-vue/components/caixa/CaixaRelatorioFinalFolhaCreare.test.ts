import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CaixaRelatorioFinalFolhaCreare from "./CaixaRelatorioFinalFolhaCreare.vue";
import { leituraFolhaCreareVazia } from "~/utils/folha-creare";

const creare = {
  leitura: {
    periodoInicio: "26/10/2026 06:14:58",
    dataEmissao: "26/10/2026 13:58:46",
    credito: 947.05,
    debito: 779.72,
    total: 3674.28,
    clientes: 148.81,
    sangria: 600,
    saldoFinalDinheiro: 840.21
  },
  comparacao: { credito: "ok", debito: "ok", total: "divergente", sangria: "ok" } as const,
  pralis: { credito: 947.05, debito: 779.72, total: 3674.27, sangria: 600 },
  somaFormasConfereTotal: false,
  horario: {
    inicio: { situacao: "divergente", diferencaMinutos: -15, sugestaoInicio: null, motivoSemSugestao: null },
    emissao: { situacao: "ok", diferencaMinutos: 0 }
  } as const
};
const props = {
  creare,
  versao: 4,
  maquininha: { credito: 947.05, debito: 770, pix: null, voucher: null },
  periodo: { inicio: "2026-10-26T09:30:00.000Z", fim: "2026-10-26T17:00:00.000Z" }
};

// O formato de moeda usa espaco nao separavel ("R$ 0,01"): normaliza para comparar o texto.
const texto = (elemento: { text(): string }) => elemento.text().replace(/\s/gu, " ");

describe("CaixaRelatorioFinalFolhaCreare · conferencia do turno", () => {
  it("uma tabela: folha, Pralis e maquininha por linha, com o sentido da diferenca", () => {
    const wrapper = mount(CaixaRelatorioFinalFolhaCreare, { props });
    expect(texto(wrapper.get('[data-teste="final-linha-credito"]'))).toContain("Confere");
    expect(texto(wrapper.get('[data-teste="final-linha-total"]'))).toContain("Folha R$ 0,01 a mais que o Pralis");
    expect(texto(wrapper.get('[data-teste="final-linha-debito"]'))).toContain(
      "Maquininha R$ 9,72 a menos que o Pralis"
    );
    expect(texto(wrapper.get('[data-teste="final-linha-pix"]'))).toContain("Sem valor na folha");
    expect(texto(wrapper.get('[data-teste="final-linha-pix"]'))).toContain("Maquininha sem leitura");
    expect(texto(wrapper.get('[data-teste="final-linha-sangria"]'))).toContain("-R$");
    // So na folha (sem comparar) vai para o rodape, nao vira linha.
    expect(wrapper.find('[data-teste="final-linha-clientes"]').exists()).toBe(false);
    expect(texto(wrapper)).toContain("CLIENTES (VND/TRANS): R$ 148,81");
  });

  it("cada linha e um cartao que abre e fecha sozinho, com o selo da situacao", async () => {
    const wrapper = mount(CaixaRelatorioFinalFolhaCreare, { props });
    const credito = wrapper.get('[data-teste="final-linha-credito"]');
    const total = wrapper.get('[data-teste="final-linha-total"]');
    expect(credito.element.tagName).toBe("DETAILS");
    expect(credito.get("summary").text()).toContain("Confere");
    expect(total.get("summary").text()).toContain("Diferença");
    expect(wrapper.get('[data-teste="final-linha-pix"]').get("summary").text()).toContain("Sem valor");
    (total.element as HTMLDetailsElement).open = true;
    expect((credito.element as HTMLDetailsElement).open).toBe(false);
  });

  it("horario em datas, nunca em minutos", () => {
    const conteudo = texto(mount(CaixaRelatorioFinalFolhaCreare, { props }));
    expect(conteudo).toContain("Folha 26/10/2026 06:14:58");
    expect(conteudo).toContain("Não bate");
    expect(conteudo).not.toContain(" min ");
    expect(conteudo).toContain("não dá o Total impresso");
  });

  it("relatorio do modelo antigo pede para gerar de novo", () => {
    const wrapper = mount(CaixaRelatorioFinalFolhaCreare, {
      props: { ...props, creare: { comparacao: { total: "ok" } }, versao: 3 }
    });
    expect(texto(wrapper)).toContain("modelo antigo");
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
