import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RelatorioFechamentoTransferencias from "./RelatorioFechamentoTransferencias.vue";

const itens = [
  {
    id: "t-2",
    status: "pendente",
    tipoMovimento: "retorno",
    situacaoMalote: null,
    valorOriginal: "180.00",
    valorEspecieDeclarado: 150,
    valorMoedasDeclarado: 30,
    nLacreDoc: null,
    criadoEm: "2026-10-27T17:14:54.000Z"
  },
  {
    id: "t-1",
    status: "recebido",
    tipoMovimento: "abertura",
    situacaoMalote: "usado",
    valorOriginal: "300.00",
    valorEspecieDeclarado: 250,
    valorMoedasDeclarado: 50,
    nLacreDoc: "A-1001",
    criadoEm: "2026-10-27T14:13:01.000Z"
  }
];
const apiGetPaginado = vi.fn();

beforeEach(() => {
  apiGetPaginado.mockReset();
  apiGetPaginado.mockResolvedValue({ itens, total: 2 });
  vi.stubGlobal("useApi", () => ({ apiGetPaginado }));
});

function montar(podeConferir: boolean) {
  return shallowMount(RelatorioFechamentoTransferencias, {
    props: { empresaId: "e-1", caixaId: "cx-1", podeConferir },
    global: {
      stubs: {
        SituacaoMalote: true,
        TransferenciaConferenciaDialog: { props: ["operacao"], template: '<i :data-op="operacao?.id" />' },
        "v-chip": { template: "<span><slot /></span>" },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-alert": { template: "<div><slot /></div>" },
        "v-progress-linear": true
      }
    }
  });
}

describe("RelatorioFechamentoTransferencias", () => {
  it("busca as transferencias deste caixa e lista em ordem cronologica", async () => {
    const wrapper = montar(true);
    await flushPromises();
    expect(apiGetPaginado).toHaveBeenCalledWith(expect.stringContaining("caixaId=cx-1"));
    const ids = wrapper.findAll("[data-transferencia-id]").map((linha) => linha.attributes("data-transferencia-id"));
    expect(ids).toEqual(["t-1", "t-2"]);
    expect(wrapper.text()).toContain("1 para conferir");
  });

  it("so oferece Conferir para pendente e para quem tem a permissao", async () => {
    const com = montar(true);
    await com.vm.$nextTick();
    await flushPromises();
    expect(com.findAll('[data-teste="botao-conferir-transferencia"]')).toHaveLength(1);

    const sem = montar(false);
    await flushPromises();
    expect(sem.find('[data-teste="botao-conferir-transferencia"]').exists()).toBe(false);
  });

  it("clicar em Conferir entrega a transferencia ao dialogo", async () => {
    const wrapper = montar(true);
    await flushPromises();
    await wrapper.get('[data-teste="botao-conferir-transferencia"]').trigger("click");
    expect(wrapper.get("[data-op]").attributes("data-op")).toBe("t-2");
  });
});
