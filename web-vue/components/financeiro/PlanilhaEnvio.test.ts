import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviaPlanilha } from "@padaria/shared/planilha-tesouraria";
import PlanilhaEnvioCartao from "./PlanilhaEnvioCartao.vue";
import PlanilhaEnvioPdv from "./PlanilhaEnvioPdv.vue";

let apiPost = vi.fn();
vi.mock("~/composables/useApi", () => ({ useApi: () => ({ apiPost: (...args: unknown[]) => apiPost(...args) }) }));
enableAutoUnmount(afterEach);

const stubs = {
  "v-chip": { template: "<span><slot /></span>" },
  "v-alert": { template: "<div class='alerta'><slot /></div>" },
  "v-table": { template: "<table><slot /></table>" },
  "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
  "v-checkbox": {
    props: ["modelValue", "label"],
    emits: ["update:modelValue"],
    template:
      '<label><input type="checkbox" :data-teste="$attrs[\'data-teste\']" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>'
  }
};

const conferencia = { status: "CONCILIADO" as const, avisos: [] };
const cartao: NonNullable<PreviaPlanilha["cartao"]> = {
  totalEfetivado: 492.99,
  conferencia,
  linhas: [
    {
      data: "10/11/2026",
      numeroSerie: "J9BB07936155",
      pdv: "VND CAIXA PDV - 1M",
      modalidade: "CRÉDITO",
      bandeira: "ELO",
      transacoes: 6,
      valor: 96.22
    },
    {
      data: "10/11/2026",
      numeroSerie: "J9BB07936155",
      pdv: "VND CAIXA PDV - 1M",
      modalidade: "CRÉDITO",
      bandeira: "MASTER",
      transacoes: 34,
      valor: 396.77
    }
  ]
};
const relatorioPdv: NonNullable<PreviaPlanilha["relatorioPdv"]> = {
  totalImpresso: 4403.09,
  conferencia,
  linha: {
    data: "10/11/2026",
    pdv: "VND CAIXA PDV - 1M",
    operador: "liliane",
    credito: 707.21,
    debito: 1059.5,
    voucher: 449.83,
    pix: 791.8,
    dinheiro: 1197.4,
    clientes: 197.35
  }
};

describe("Planilha da Tesouraria · dois envios separados (19/11/2026)", () => {
  beforeEach(() => {
    apiPost = vi.fn();
  });

  it("cartão: só exporta depois de conferir e manda apenas a aba de cartões", async () => {
    apiPost.mockResolvedValue({
      cartao: { aba: "API - CARTÕES", gravado: true, linhaInicial: 5, linhas: 2, mensagem: "GRAVADO" },
      relatorioPdv: null
    });
    const tela = mount(PlanilhaEnvioCartao, { props: { caixaId: "cx-1", cartao, enviado: null }, global: { stubs } });
    expect(tela.text()).toContain("VND CAIXA PDV - 1M");
    expect(tela.text()).toContain("492,99");
    const botao = tela.find("[data-teste='planilha-cartao-exportar']");
    expect(botao.attributes("disabled")).toBeDefined();

    await tela.find("input[data-teste='planilha-cartao-confirmar']").setValue(true);
    await botao.trigger("click");
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith("/api/caixa/cx-1/planilha-tesouraria/enviar", {
      cartao: cartao.linhas,
      relatorioPdv: null
    });
    expect(tela.text()).toContain("GRAVADO");
  });

  it("folha de caixa: manda apenas a aba do PDV, com o operador em maiúsculas", async () => {
    apiPost.mockResolvedValue({
      cartao: null,
      relatorioPdv: { aba: "API - PDV", gravado: true, linhaInicial: 3, linhas: 1, mensagem: "GRAVADO" }
    });
    const tela = mount(PlanilhaEnvioPdv, {
      props: { caixaId: "cx-1", relatorioPdv, enviado: null },
      global: { stubs }
    });
    await tela.find("input[data-teste='planilha-pdv-confirmar']").setValue(true);
    await tela.find("[data-teste='planilha-pdv-gerar']").trigger("click");
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith("/api/caixa/cx-1/planilha-tesouraria/enviar", {
      cartao: null,
      relatorioPdv: { ...relatorioPdv.linha, operador: "LILIANE" }
    });
  });

  it("aba já enviada: mostra quando e por quem e não oferece o botão", () => {
    const enviado = { enviadoEm: "2026-11-19T13:00:00.000Z", enviadoPor: "Leo", linhaInicial: 7 };
    const tela = mount(PlanilhaEnvioPdv, { props: { caixaId: "cx-1", relatorioPdv, enviado }, global: { stubs } });
    expect(tela.find("[data-teste='planilha-pdv-enviado']").text()).toContain("por Leo (a partir da linha 7)");
    expect(tela.find("[data-teste='planilha-pdv-gerar']").exists()).toBe(false);
  });
});
