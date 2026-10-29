import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref, useTemplateRef, watch } from "vue";
import CaixaFechamentoMaquininha from "./CaixaFechamentoMaquininha.vue";
import type { CaixaOperacional } from "~/types/padaria";

const apiGet = vi.fn();
const apiPost = vi.fn();

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useTemplateRef", useTemplateRef);
  vi.stubGlobal("useApi", () => ({ apiUrl: "", apiGet, apiPost, apiPut: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

const campo = {
  inheritAttrs: false,
  props: ["modelValue", "label", "readonly", "hint"],
  emits: ["update:modelValue"],
  template:
    '<label>{{ label }}<input :value="modelValue" :readonly="readonly" :data-teste="$attrs[\'data-teste\']" @input="$emit(\'update:modelValue\', $event.target.value)" /><small>{{ hint }}</small></label>'
};

function montar() {
  return mount(CaixaFechamentoMaquininha, {
    props: { caixa: { id: "cx-1", pdvNome: "PDV 1" } as CaixaOperacional },
    global: {
      stubs: {
        CapturaCameraDialog: true,
        "v-text-field": campo,
        "v-chip": { template: "<span><slot /></span>" },
        "v-alert": { template: "<div><slot /></div>" },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-textarea": {
          inheritAttrs: false,
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template:
            '<textarea :value="modelValue" :data-teste="$attrs[\'data-teste\']" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        "v-icon": true,
        "v-expansion-panels": { template: "<div><slot /></div>" },
        "v-expansion-panel": { template: "<div><slot /></div>" },
        "v-expansion-panel-title": { template: "<div><slot /></div>" },
        "v-expansion-panel-text": { template: "<div><slot /></div>" }
      }
    }
  });
}

describe("CaixaFechamentoMaquininha · IA fora do ar", () => {
  it("anexa a foto, avisa e libera todos os campos para preencher manualmente", async () => {
    apiGet.mockResolvedValue({ etapaDia: "manha", leituraReferencia: null, relatorio: null });
    apiPost.mockRejectedValue(new Error("A leitura por IA ainda nao foi configurada."));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { id: "anexo-1" } }), { status: 201 }))
    );
    const wrapper = montar();
    await flushPromises();
    const input = wrapper.findAll('input[type="file"]')[1]!;
    Object.defineProperty(input.element, "files", { value: [new File(["x"], "cupom.png", { type: "image/png" })] });
    await input.trigger("change");
    await flushPromises();
    expect(wrapper.text()).toContain("preencha os valores do comprovante manualmente");
    for (const forma of ["credito", "debito", "pix", "voucher"]) {
      expect(wrapper.get(`[data-teste="maquininha-campo-${forma}"]`).attributes("readonly")).toBeUndefined();
    }
  });
});

describe("CaixaFechamentoMaquininha · leitura salva", () => {
  it("mostra os valores com virgula e trava o que a IA leu; o duvidoso continua editavel", async () => {
    apiGet.mockResolvedValue({
      etapaDia: "manha",
      leituraReferencia: null,
      relatorio: {
        dadosRevisados: {
          anexoId: "anexo-1",
          leituraAcumulada: {
            documentoLegivel: true,
            credito: 947.05,
            debito: 779.72,
            pix: 601.68,
            voucher: 2552.61,
            camposDuvidosos: ["voucher"]
          }
        }
      }
    });
    const wrapper = montar();
    await flushPromises();
    const credito = wrapper.get('[data-teste="maquininha-campo-credito"]');
    expect((credito.element as HTMLInputElement).value).toBe("947,05");
    expect(credito.attributes("readonly")).toBeDefined();
    const voucher = wrapper.get('[data-teste="maquininha-campo-voucher"]');
    expect((voucher.element as HTMLInputElement).value).toBe("2.552,61");
    expect(voucher.attributes("readonly")).toBeUndefined();
  });

  it("corrigir manualmente: destrava, exige justificativa se mudar e envia os campos alterados", async () => {
    apiGet.mockResolvedValue({
      etapaDia: "manha",
      leituraReferencia: null,
      relatorio: {
        dadosRevisados: {
          anexoId: "anexo-1",
          leituraAcumulada: { documentoLegivel: true, credito: 947.05, debito: 779.72, pix: 601.68, voucher: 224.16 }
        }
      }
    });
    const apiPut = vi.fn().mockResolvedValue({});
    vi.stubGlobal("useApi", () => ({ apiUrl: "", apiGet, apiPost, apiPut }));
    const wrapper = montar();
    await flushPromises();
    await wrapper.get('[data-teste="botao-corrigir-manualmente"]').trigger("click");
    const credito = wrapper.get('[data-teste="maquininha-campo-credito"]');
    expect(credito.attributes("readonly")).toBeUndefined();
    await credito.setValue("947,50");
    const salvar = wrapper.findAll("button").find((botao) => botao.text().includes("Salvar leitura"))!;
    expect(salvar.attributes("disabled")).toBeDefined();
    await wrapper.get('[data-teste="justificativa-correcao"]').setValue("IA leu 947,05 mas o cupom mostra 947,50");
    expect(salvar.attributes("disabled")).toBeUndefined();
    await salvar.trigger("click");
    await flushPromises();
    expect(apiPut.mock.calls[0]?.[1]).toMatchObject({
      leituraAcumulada: {
        credito: 947.5,
        correcaoManual: { justificativa: "IA leu 947,05 mas o cupom mostra 947,50", campos: ["Crédito"] }
      }
    });
  });
});

describe("CaixaFechamentoMaquininha · manha e tarde (R-227)", () => {
  it("manha: os dois paineis abertos e o da tarde avisa que so vem depois que a manha fechar", async () => {
    apiGet.mockResolvedValue({ etapaDia: "manha", leituraReferencia: null, relatorio: null });
    const wrapper = montar();
    await flushPromises();
    expect(wrapper.get('[data-teste="maquininha-aviso-turno"]').text()).toContain("relatório da manhã do PDV 1");
    expect(wrapper.get('[data-teste="maquininha-aviso-tarde"]').text()).toContain(
      "só pode ser feito depois que o caixa da manhã deste PDV fechar"
    );
  });

  it("tarde: diz que desconta sozinho a manha deste PDV e mostra a leitura da manha", async () => {
    apiGet.mockResolvedValue({
      etapaDia: "tarde",
      leituraReferencia: {
        leitura: { documentoLegivel: true, credito: 100, debito: 50, pix: 20, voucher: 10 },
        fechadoEm: "2026-10-29T16:00:00.000Z"
      },
      relatorio: null
    });
    const wrapper = montar();
    await flushPromises();
    const aviso = wrapper.get('[data-teste="maquininha-aviso-turno"]').text();
    expect(aviso).toContain("relatório da tarde do PDV 1");
    expect(aviso).toContain("desconta sozinho a leitura da manhã");
    expect(wrapper.text()).toContain("Leitura acumulada da manhã");
    expect(wrapper.find('[data-teste="maquininha-aviso-tarde"]').exists()).toBe(false);
  });
});

describe("CaixaFechamentoMaquininha · tarde sem manha (R-229)", () => {
  it("avisa e so libera salvar com a justificativa, que vai no envio", async () => {
    apiGet.mockResolvedValue({
      etapaDia: "tarde",
      semManha: true,
      leituraReferencia: null,
      relatorio: {
        dadosRevisados: {
          anexoId: "anexo-1",
          leituraAcumulada: { documentoLegivel: false, credito: 160, debito: 80, pix: 45, voucher: 25 }
        }
      }
    });
    const apiPut = vi.fn().mockResolvedValue({});
    vi.stubGlobal("useApi", () => ({ apiUrl: "", apiGet, apiPost, apiPut }));
    const wrapper = montar();
    await flushPromises();
    expect(wrapper.get('[data-teste="maquininha-sem-manha"]').text()).toContain("caixa da manhã do PDV 1");
    const salvar = wrapper.findAll("button").find((botao) => botao.text().includes("Salvar leitura"))!;
    expect(salvar.attributes("disabled")).toBeDefined();
    await wrapper.get('[data-teste="justificativa-sem-manha"]').setValue("A manhã não abriu caixa hoje");
    expect(salvar.attributes("disabled")).toBeUndefined();
    await salvar.trigger("click");
    await flushPromises();
    expect(apiPut.mock.calls[0]?.[1]).toMatchObject({ justificativaSemManha: "A manhã não abriu caixa hoje" });
  });
});
