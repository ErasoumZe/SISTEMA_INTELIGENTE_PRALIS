import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CaixaRecebimentosSemLacre from "./CaixaRecebimentosSemLacre.vue";
import type { RecebimentoSemLacrePendente } from "~/types/padaria";

const apiPost = vi.fn();
vi.mock("~/composables/useApi", () => ({ useApi: () => ({ apiPost }) }));

const recebimento: RecebimentoSemLacrePendente = {
  id: "tr-1",
  valor: 30,
  valorEspecie: 25,
  valorMoedas: 5,
  origemNome: "Cofre",
  enviadoPorNome: "Gerência",
  enviadoEm: "2026-10-29T15:00:00.000Z",
  observacao: "Reforço de troco"
};

function montar(recebimentos: RecebimentoSemLacrePendente[] = [recebimento]) {
  return mount(CaixaRecebimentosSemLacre, {
    props: { caixaId: "cx-1", recebimentos },
    global: {
      stubs: {
        "v-icon": true,
        "v-spacer": true,
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-dialog": { props: ["modelValue"], template: '<div v-if="modelValue"><slot /></div>' },
        "v-card": { template: "<div><slot /></div>" },
        "v-card-title": { template: "<div><slot /></div>" },
        "v-card-text": { template: "<div><slot /></div>" },
        "v-card-actions": { template: "<div><slot /></div>" }
      }
    }
  });
}

// R-231 · o operador confirma o dinheiro sem lacre ou marca "Nao recebi"; so depois o caixa fecha.
describe("CaixaRecebimentosSemLacre", () => {
  beforeEach(() => apiPost.mockReset());

  it("nada aparece quando não há recebimento pendente", () => {
    expect(montar([]).find("[data-teste='recebimentos-sem-lacre']").exists()).toBe(false);
  });

  it("mostra valor, composição e origem, e confirma pelo caixa", async () => {
    apiPost.mockResolvedValue({});
    const tela = montar();
    expect(tela.text()).toContain("Recebimentos pendentes");
    expect(tela.text()).toContain("De Cofre");
    expect(tela.text()).toContain("Reforço de troco");

    await tela.find("[data-teste='recebimento-confirmar']").trigger("click");
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith("/api/caixa/cx-1/recebimentos-sem-lacre/tr-1/confirmar", {});
    expect(tela.emitted("resolvido")).toHaveLength(1);
  });

  it("Não recebi pede confirmação antes de cancelar", async () => {
    apiPost.mockResolvedValue({});
    const tela = montar();
    await tela.find("[data-teste='recebimento-nao-recebi']").trigger("click");
    expect(apiPost).not.toHaveBeenCalled();
    expect(tela.text()).toContain("a Tesouraria é avisada");

    await tela.find("[data-teste='recebimento-nao-recebi-confirmar']").trigger("click");
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith("/api/caixa/cx-1/recebimentos-sem-lacre/tr-1/nao-recebi", {});
    expect(tela.emitted("resolvido")).toHaveLength(1);
  });

  it("erro da API aparece e não some com o pendente", async () => {
    apiPost.mockRejectedValue(new Error("Este recebimento já foi resolvido."));
    const tela = montar();
    await tela.find("[data-teste='recebimento-confirmar']").trigger("click");
    await flushPromises();
    expect(tela.find("[role='alert']").text()).toContain("já foi resolvido");
    expect(tela.emitted("resolvido")).toBeUndefined();
  });
});
