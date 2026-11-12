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
    expect(wrapper.text()).toContain("preencha os valores do comprovante");
    for (const forma of ["credito", "debito", "pix", "voucher"]) {
      expect(wrapper.get(`[data-teste="maquininha-campo-${forma}"]`).attributes("readonly")).toBeUndefined();
    }
  });
});

// Marco, 11/11: nao existe botao "Salvar leitura". Leitura completa (IA, campo completado, justificativa ou foto nova)
// grava sozinha; foto nova substitui a leitura salva pela mesma regra.
const esperarSalvamento = async () => {
  await flushPromises();
  await new Promise((resolver) => setTimeout(resolver, 900));
  await flushPromises();
};

describe("CaixaFechamentoMaquininha · salvar automatico", () => {
  let proximoAnexo = 1;
  async function anexarFoto(wrapper: ReturnType<typeof montar>) {
    const input = wrapper.findAll('input[type="file"]')[1]!;
    Object.defineProperty(input.element, "files", {
      value: [new File(["x"], "cupom.png", { type: "image/png" })],
      configurable: true
    });
    await input.trigger("change");
    await esperarSalvamento();
  }
  async function enviarFoto(sugestao: Record<string, unknown>) {
    proximoAnexo = 1;
    apiGet.mockResolvedValue({ etapaDia: "manha", leituraReferencia: null, relatorio: null });
    apiPost.mockResolvedValue({ sugestao });
    const apiPut = vi.fn().mockResolvedValue({});
    vi.stubGlobal("useApi", () => ({ apiUrl: "", apiGet, apiPost, apiPut }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { id: `anexo-${proximoAnexo++}` } }), { status: 201 }))
    );
    const wrapper = montar();
    await flushPromises();
    await anexarFoto(wrapper);
    return { wrapper, apiPut };
  }

  it("a IA leu as 4 formas e a conta fechou: salva sem clicar", async () => {
    const { wrapper, apiPut } = await enviarFoto({
      documentoLegivel: true,
      credito: 707.21,
      debito: 1059.6,
      pix: 791.8,
      voucher: 449.83,
      camposDuvidosos: [],
      observacoes: []
    });
    expect(apiPut).toHaveBeenCalledTimes(1);
    expect(apiPut.mock.calls[0]?.[1]).toMatchObject({ anexoId: "anexo-1", leituraAcumulada: { credito: 707.21 } });
    expect(wrapper.text()).toContain("a leitura foi salva");
  });

  it("a conta nao fechou (credito duvidoso): nao salva e mostra o motivo", async () => {
    const { wrapper, apiPut } = await enviarFoto({
      documentoLegivel: true,
      credito: null,
      debito: 1059.6,
      pix: 791.8,
      voucher: 449.83,
      camposDuvidosos: ["credito"],
      observacoes: ["Crédito: o total lido (R$ 787,21) não bate com a soma das linhas (R$ 707,21)."]
    });
    expect(apiPut).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("não bate com a soma das linhas");
    expect(wrapper.get('[data-teste="maquininha-campo-credito"]').attributes("readonly")).toBeUndefined();

    // O operador completa o credito olhando a foto: salva sozinho, sem botao.
    await wrapper.get('[data-teste="maquininha-campo-credito"]').setValue("707,21");
    await esperarSalvamento();
    expect(apiPut).toHaveBeenCalledTimes(1);
    expect(apiPut.mock.calls[0]?.[1]).toMatchObject({ leituraAcumulada: { credito: 707.21 } });
  });

  it("nao existe mais botao de salvar", async () => {
    const { wrapper } = await enviarFoto({ documentoLegivel: true, credito: 1, debito: 1, pix: 1, voucher: 1 });
    expect(wrapper.findAll("button").some((botao) => botao.text().includes("Salvar leitura"))).toBe(false);
  });

  it("foto nova substitui a leitura salva, pela mesma regra", async () => {
    const leitura = { documentoLegivel: true, credito: 707.21, debito: 1059.6, pix: 791.8, voucher: 449.83 };
    const { wrapper, apiPut } = await enviarFoto(leitura);
    expect(apiPut.mock.calls[0]?.[1]).toMatchObject({ anexoId: "anexo-1" });
    await anexarFoto(wrapper);
    expect(apiPut).toHaveBeenCalledTimes(2);
    expect(apiPut.mock.calls[1]?.[1]).toMatchObject({ anexoId: "anexo-2", leituraAcumulada: { credito: 707.21 } });
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

  // Marco, 29/10: o que a IA leu nao se corrige mais (sem "Corrigir manualmente"); so o que ela nao leu e digitado.
  it("valor lido pela IA fica travado e não há como corrigir", async () => {
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
    const wrapper = montar();
    await flushPromises();
    for (const forma of ["credito", "debito", "pix", "voucher"]) {
      expect(wrapper.get(`[data-teste="maquininha-campo-${forma}"]`).attributes("readonly")).toBeDefined();
    }
    expect(wrapper.find('[data-teste="botao-corrigir-manualmente"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Corrigir manualmente");
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
  it("avisa e so salva sozinho depois da justificativa, que vai no envio", async () => {
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
    await wrapper.get('[data-teste="justificativa-sem-manha"]').setValue("A");
    await esperarSalvamento();
    expect(apiPut).not.toHaveBeenCalled();
    await wrapper.get('[data-teste="justificativa-sem-manha"]').setValue("A manhã não abriu caixa hoje");
    await esperarSalvamento();
    expect(apiPut).toHaveBeenCalledTimes(1);
    expect(apiPut.mock.calls[0]?.[1]).toMatchObject({ justificativaSemManha: "A manhã não abriu caixa hoje" });
  });
});
