import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperacaoResumo } from "~/types/padaria";
import TransferenciaConferenciaDialog from "./TransferenciaConferenciaDialog.vue";

const base: OperacaoResumo = {
  id: "comum",
  empresaId: "empresa-1",
  dataReferencia: "2026-09-12",
  descricao: "Transferência",
  valorOriginal: "100.00",
  computar: true,
  status: "pendente",
  contaOrigemId: "origem",
  contaDestinoId: "destino",
  contaOrigemNome: "Cofre",
  contaDestinoNome: "PDV",
  nLacreDoc: "L-1",
  valorEspecieDeclarado: 80,
  valorMoedasDeclarado: 20,
  criadoEm: "2026-09-12T21:45:44.000Z",
  criadoPorNome: "Tesoureiro"
};

const apiGet = vi.fn();
beforeEach(() => {
  apiGet.mockReset();
  vi.stubGlobal("useApi", () => ({ apiGet, apiPost: vi.fn(), apiUrl: "http://localhost:4100" }));
});

function montar(operacao: OperacaoResumo | null) {
  return shallowMount(TransferenciaConferenciaDialog, {
    props: { operacao },
    global: {
      stubs: {
        "v-dialog": { template: "<div><slot /></div>" },
        "v-card": { template: "<section><slot /></section>" },
        "v-card-title": { template: "<header><slot /></header>" },
        "v-card-actions": { template: "<footer><slot /></footer>" },
        "v-card-text": { template: "<div><slot /></div>" },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-alert": { template: "<div><slot /></div>" },
        "v-progress-linear": true,
        "v-text-field": true,
        "v-checkbox": true,
        "v-row": { template: "<div><slot /></div>" },
        "v-col": { template: "<div><slot /></div>" },
        "v-spacer": true
      }
    }
  });
}

describe("TransferenciaConferenciaDialog", () => {
  it("exibe o resumo completo antes de aceitar uma transferencia", () => {
    const resumo = montar(base).get('[data-teste="conferencia-resumo"]');
    expect(resumo.text()).toContain("Total enviado");
    expect(resumo.text()).toContain("100,00");
    expect(resumo.text()).toContain("Dinheiro fisico");
    expect(resumo.text()).toContain("Moedas");
    expect(resumo.text()).toContain("Tesoureiro");
    expect(resumo.text()).toContain("L-1");
  });

  it("sem transferencia selecionada nao mostra nada", () => {
    expect(montar(null).find('[data-teste="conferencia-resumo"]').exists()).toBe(false);
  });

  it("mostra observacao e provas do fechamento vinculadas a sangria", async () => {
    apiGet.mockImplementation((url: string) =>
      url.includes("fechamento-conferencia")
        ? {
            status: "fechado",
            dataHoraFechamento: "2026-09-23T23:30:00.000Z",
            fechadoEm: "2026-09-23T23:30:05.000Z",
            fechadoPorNome: "Diretor",
            usuarioCaixaNome: "Operador Caixa",
            colaboradorNome: "Operador Caixa",
            lacreFechamento: "FCH-789",
            caixaResponsavelNomeFechamento: "Responsável Caixa",
            supervisorResponsavelNomeFechamento: "Supervisor",
            valorEspecieFechamento: 80,
            valorMoedasFechamento: 20,
            observacao: "Fechamento conferido"
          }
        : [
            { id: "folha-1", tipo: "folha_fechamento", nomeOriginal: "folha.jpg", mimeType: "image/jpeg" },
            { id: "cartao-1", tipo: "comprovante_cartao", nomeOriginal: "cartao.jpg", mimeType: "image/jpeg" }
          ]
    );
    const wrapper = montar({ ...base, caixaId: "caixa-1", ehCaixaParaCofre: true, observacao: "Sangria do turno" });
    await flushPromises();

    expect(apiGet).toHaveBeenCalledWith("/api/transferencias/comum/anexos-fechamento");
    expect(apiGet).toHaveBeenCalledWith("/api/transferencias/comum/fechamento-conferencia");
    expect(wrapper.get('[data-teste="conferencia-observacao"]').text()).toContain("Sangria do turno");
    expect(wrapper.get('[data-teste="fechamento-resumo"]').text()).toContain("FCH-789");
    expect(wrapper.get('[data-teste="fechamento-resumo"]').text()).toContain("Operador Caixa");
    const anexos = wrapper.get('[data-teste="conferencia-anexos"]');
    expect(anexos.text()).toContain("Folha de fechamento (1)");
    expect(anexos.text()).toContain("Comprovantes de cartão (1)");
    expect(anexos.findAll("a").map((link) => link.attributes("href"))).toEqual([
      "http://localhost:4100/api/transferencias/comum/anexos-fechamento/folha-1",
      "http://localhost:4100/api/transferencias/comum/anexos-fechamento/cartao-1"
    ]);
  });

  it("fechar emite 'fechar' para quem abriu limpar a selecao", async () => {
    const wrapper = montar(base);
    await wrapper.get("button[aria-label='Fechar conferência']").trigger("click");
    expect(wrapper.emitted("fechar")).toHaveLength(1);
  });
});
