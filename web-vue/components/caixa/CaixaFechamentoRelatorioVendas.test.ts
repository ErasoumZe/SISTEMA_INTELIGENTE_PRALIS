import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref, useTemplateRef, watch } from "vue";
import CaixaFechamentoRelatorioVendas from "./CaixaFechamentoRelatorioVendas.vue";

const apiGet = vi.fn();
const apiPost = vi.fn();

const sugestao = {
  documentoLegivel: true,
  nomeLoja: "PADARIA LISBOA 2",
  dataEmissao: "26/10/2026 13:58:46",
  periodoInicio: "26/10/2026 06:14:58",
  periodoFim: "26/10/2026 23:59:59",
  trocoInicial: 243.2,
  saldoInicial: 0,
  clientes: 148.81,
  credito: 947.05,
  debito: 779.72,
  dinheiro: 972.85,
  pix: 601.68,
  voucher: 224.16,
  total: 3674.27,
  despesas: 0,
  sangria: 600,
  saldoFinalDinheiro: 840.21,
  camposDuvidosos: [],
  observacoes: []
};

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useTemplateRef", useTemplateRef);
  vi.stubGlobal("useApi", () => ({ apiUrl: "", apiGet, apiPost }));
});
afterEach(() => vi.unstubAllGlobals());

function montar() {
  return mount(CaixaFechamentoRelatorioVendas, {
    props: { caixaId: "cx-1" },
    global: {
      stubs: {
        CapturaCameraDialog: true,
        CaixaFechamentoRelatorioVendasDetalhes: true,
        "v-alert": { template: "<div><slot /></div>" },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-dialog": true,
        "v-text-field": {
          props: ["modelValue", "label"],
          template: "<label>{{ label }}<input :value='modelValue' /></label>"
        }
      }
    }
  });
}

describe("CaixaFechamentoRelatorioVendas · folha do CREARE", () => {
  it("sem folha anexada nao mostra nenhum campo da folha", async () => {
    apiGet.mockImplementation(async (url: string) => (url.endsWith("/anexos") ? [] : null));
    const wrapper = montar();
    await flushPromises();
    expect(wrapper.find('[data-teste="folha-creare"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("CREDITO (VND/TRANS)");
  });

  it("com a folha anexada e lida mostra os valores e avisa que o periodo sera o da folha (R-244)", async () => {
    apiGet.mockImplementation(async (url: string) =>
      url.endsWith("/anexos") ? [{ id: "anexo-1", tipo: "relatorio_vendas_creare" }] : null
    );
    apiPost.mockResolvedValue({ sugestao });
    const wrapper = montar();
    await flushPromises();
    expect(wrapper.find('[data-teste="folha-creare"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("CREDITO (VND/TRANS)");
    // Ao gerar, o periodo do caixa passa a ser o da folha: do "Periodo de" ate a "Data da emissao".
    const periodo = wrapper.get('[data-teste="periodo-da-folha"]').text();
    expect(periodo).toContain("26/10/2026 06:14:58");
    expect(periodo).toContain("26/10/2026 13:58:46");
    expect(wrapper.find('[data-teste="botao-ajustar-inicio"]').exists()).toBe(false);
    // A comparacao com o Pralis fica no Relatorio final, nao aqui.
    expect(wrapper.text()).not.toContain("Confere");
  });

  it("com o relatorio gerado, avisa o lado do periodo que ficou no horario do sistema", async () => {
    const relatorio = {
      periodoInicio: "2026-10-26T09:14:58.000Z",
      periodoFim: "2026-10-26T16:40:00.000Z",
      geradoEm: "2026-10-26T16:41:00.000Z",
      dados: {
        versao: 5,
        contagemFisica: null,
        vendas: { quantidade: 0 },
        canceladas: [],
        creare: {
          anexoId: "anexo-1",
          leitura: sugestao,
          alinhamento: {
            inicio: {
              antes: "2026-10-26T09:30:00.000Z",
              depois: "2026-10-26T09:14:58.000Z",
              daFolha: true,
              motivo: null
            },
            fim: {
              antes: "2026-10-26T16:40:00.000Z",
              depois: "2026-10-26T16:40:00.000Z",
              daFolha: false,
              motivo: "depois_do_proximo_caixa"
            }
          }
        }
      }
    };
    apiGet.mockImplementation(async (url: string) =>
      url.endsWith("/anexos") ? [{ id: "anexo-1", tipo: "relatorio_vendas_creare" }] : relatorio
    );
    apiPost.mockResolvedValue({ sugestao });
    const wrapper = montar();
    await flushPromises();
    expect(wrapper.get('[data-teste="aviso-periodo"]').text()).toBe(
      "O fim ficou no horário do sistema: invadiria o próximo caixa deste PDV."
    );
  });
});
