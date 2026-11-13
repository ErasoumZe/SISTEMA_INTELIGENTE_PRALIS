import { mount, shallowMount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref, useTemplateRef, watch } from "vue";
import CaixaFechamentoConfirmacaoDialog from "./CaixaFechamentoConfirmacaoDialog.vue";
import CaixaFechamentoEtapas from "./CaixaFechamentoEtapas.vue";
import CaixaFechamentoWizard from "./CaixaFechamentoWizard.vue";
import type { CaixaOperacional } from "~/types/padaria";

// Fechamento cego (Marco, 11/11/2026): o caixa nao ve o Relatorio final, nao volta a Vendas depois de entrar no
// Fechamento e, no fim, so ve a FALTA. Sobra ou contagem certa e sempre "Tudo certo".

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useTemplateRef", useTemplateRef);
  vi.stubGlobal("useState", (_chave: string, inicial: () => unknown) => ref(inicial()));
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

const caixa = {
  id: "cx-cego",
  pdvNome: "PDV 1",
  dataHoraAbertura: null,
  dataHoraFechamento: null
} as never as CaixaOperacional;
const fechamento = { observacao: "", lacreFechamento: "", caixaResponsavelNome: "", supervisorResponsavelNome: "" };
const contagem = (diferenca: number) =>
  ({
    valorEspecie: 600,
    valorMoedas: 14.1,
    total: 614.1,
    esperado: null,
    diferenca,
    registradaEm: "2026-11-10T17:00:00.000Z",
    registradaPor: "caixa",
    correcoes: []
  }) as const;

function montarWizard() {
  return shallowMount(CaixaFechamentoWizard, {
    props: {
      caixa,
      fechamento,
      contagemFisica: contagem(0),
      fechamentoComQuebra: false,
      observacaoObrigatoriaPendente: false,
      lacreFechamentoPendente: false,
      responsaveisFechamentoPendentes: false,
      lacreFechamentoReservado: null,
      planejamentosPendentes: [],
      saldoLivre: 0,
      totalPlanejadoCentavos: 0,
      fechamentoTravado: false,
      motivoTravado: null,
      folhaFechamentoEnviada: false
    },
    global: { renderStubDefaultSlot: true }
  });
}

describe("fechamento cego · etapas do caixa", () => {
  it("sao 3 etapas: Vendas, Maquininha e Fechamento (o Relatorio final saiu)", () => {
    const wrapper = montarWizard();
    expect(wrapper.text()).toContain("Etapa 1 de 3");
    expect(wrapper.text()).not.toContain("Relatório final");
  });

  it("depois de entrar no Fechamento, volta so ate a Maquininha, nunca a Vendas", async () => {
    const wrapper = montarWizard();
    await wrapper.get('[data-teste="avancar-vendas-fechamento"]').trigger("click");
    expect(wrapper.text()).toContain("Etapa 2 de 3");
    expect(wrapper.find('[data-teste="voltar-etapa-fechamento"]').exists()).toBe(true);

    await wrapper.get('[data-teste="avancar-maquininha-fechamento"]').trigger("click");
    expect(wrapper.text()).toContain("Etapa 3 de 3");

    await wrapper.get('[data-teste="voltar-maquininha-fechamento"]').trigger("click");
    expect(wrapper.text()).toContain("Etapa 2 de 3");
    expect(wrapper.find('[data-teste="voltar-etapa-fechamento"]').exists()).toBe(false);
  });

  it("recarregar a tela depois de entrar no Fechamento reabre direto nele", () => {
    sessionStorage.setItem("cicluz:fechamento:chegou:cx-cego", "1");
    expect(montarWizard().text()).toContain("Etapa 3 de 3");
  });
});

describe("fechamento cego · resultado da contagem", () => {
  function montarEtapas(diferenca: number) {
    return shallowMount(CaixaFechamentoEtapas, {
      props: {
        caixa,
        fechamento,
        contagemFisica: contagem(diferenca),
        fechamentoComQuebra: diferenca < 0,
        observacaoObrigatoriaPendente: diferenca < 0,
        lacreFechamentoPendente: false,
        responsaveisFechamentoPendentes: false,
        lacreFechamentoReservado: null,
        planejamentosPendentes: [],
        fechamentoTravado: false,
        motivoTravado: null,
        folhaFechamentoEnviada: false,
        modoWizard: true
      },
      global: { renderStubDefaultSlot: true }
    });
  }

  it("falta: mostra so a falta, sem contado nem esperado", () => {
    const alerta = montarEtapas(-0.05).get('[data-teste="alerta-quebra"]').text();
    expect(alerta).toContain("Falta de");
    expect(alerta).toContain("0,05");
    expect(alerta).not.toContain("esperado");
    expect(alerta).not.toContain("614");
  });

  it("sobra ou contagem certa: sempre Tudo certo, sem valor", () => {
    for (const diferenca of [0, 0.15]) {
      const alerta = montarEtapas(diferenca).get('[data-teste="alerta-quebra"]').text();
      expect(alerta).toContain("Tudo certo");
      expect(alerta).not.toContain("R$");
    }
  });

  it("a revisao antes de fechar mostra a falta ou tudo certo, nunca o esperado", () => {
    const base = {
      aberto: true,
      observacao: "",
      lacreFechamento: "4283",
      caixaResponsavelNome: "Luciany A",
      supervisorResponsavelNome: "Supervisora",
      valorTotal: 614.3,
      valorEspecie: 572,
      valorMoedas: 42.3,
      anexos: []
    };
    const stubs = { "v-dialog": { template: "<div><slot /></div>" } };
    const certo = mount(CaixaFechamentoConfirmacaoDialog, {
      props: { ...base, falta: 0 },
      global: { stubs, renderStubDefaultSlot: true }
    });
    expect(certo.get('[data-teste="confirmacao-resultado"]').text()).toContain("tudo certo");
    const falta = mount(CaixaFechamentoConfirmacaoDialog, {
      props: { ...base, falta: 0.05 },
      global: { stubs, renderStubDefaultSlot: true }
    });
    expect(falta.get('[data-teste="confirmacao-resultado"]').text()).toContain("Falta");
  });
});
