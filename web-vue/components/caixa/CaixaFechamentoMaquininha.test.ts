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
  template:
    '<label>{{ label }}<input :value="modelValue" :readonly="readonly" :data-teste="$attrs[\'data-teste\']" /><small>{{ hint }}</small></label>'
};

function montar() {
  return mount(CaixaFechamentoMaquininha, {
    props: { caixa: { id: "cx-1" } as CaixaOperacional },
    global: {
      stubs: {
        CapturaCameraDialog: true,
        "v-text-field": campo,
        "v-chip": { template: "<span><slot /></span>" },
        "v-alert": { template: "<div><slot /></div>" },
        "v-btn": { template: "<button><slot /></button>" },
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
});
