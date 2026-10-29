import { flushPromises, shallowMount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { CaixaStatus, EntidadeOperacional } from "~/types/padaria";
import { WORKSPACE_CONTEXT } from "~/components/workspace/workspace-context";
import TransferenciasHost from "./TransferenciasHost.vue";

vi.mock("~/composables/useApi", () => ({
  useApi: () => ({ apiGet: vi.fn(async () => [{ id: "lacre-1", numero: "S-001" }]) })
}));

function criarStatusCaixaAberto(): CaixaStatus {
  return {
    caixaAberto: {
      id: "cx-1",
      empresaId: "emp-1",
      pdvId: "pdv-1",
      pdvNome: "PDV 01",
      pdvContaId: "conta-pdv-1",
      usuarioId: "usuario-1",
      usuarioCaixaId: "usuario-caixa-1",
      usuarioCaixaNome: "Operadora",
      colaboradorId: "colaborador-1",
      dataMovimento: "2026-10-02",
      dataHoraAbertura: "2026-10-02T08:00:00.000Z",
      abertoEm: "2026-10-02T08:00:00.000Z",
      dataHoraFechamento: null,
      fechadoEm: null,
      tokenEdicao: null,
      turnoId: null,
      turnoNome: null,
      maquininhaId: null,
      maquininhaApelido: null,
      maquininhaNumeroSerie: null,
      caixaResponsavelNomeAbertura: "Operadora",
      supervisorResponsavelNomeAbertura: null,
      observacao: null,
      status: "aberto"
    },
    resumo: {
      totalEntradas: 0,
      totalTransferencias: 0,
      totalDespesas: 0,
      totalRetiradas: 0,
      saldo: 100
    },
    lacreFechamentoReservado: null,
    entregasPendentes: [],
    planejamentosPendentes: [],
    recebimentosSemLacre: []
  };
}

function montar(criar: boolean, operar: boolean, caixaAberto: boolean) {
  const modalOperacaoAberto = ref(true);
  const caixaStatus = ref<CaixaStatus | null>(caixaAberto ? criarStatusCaixaAberto() : null);
  const empresaId = ref("emp-1");
  const wrapper = shallowMount(TransferenciasHost, {
    global: {
      provide: {
        [WORKSPACE_CONTEXT]: {
          modalOperacaoAberto,
          entidadeNova: ref<EntidadeOperacional>("transferencia"),
          empresaId,
          operacaoEditandoId: ref(""),
          caixaStatus,
          podeCriarTransferencia: computed(() => criar),
          podeEditarTransferencia: computed(() => criar),
          podeOperarCaixa: computed(() => operar),
          podeOperarTransferenciaSemCaixa: computed(() => !operar),
          caixaSalvando: ref(false),
          salvandoOperacao: ref(false),
          carregarStatusCaixa: vi.fn(async () => undefined),
          retornarSaldoOperacional: vi.fn(async () => false)
        }
      },
      renderStubDefaultSlot: true,
      stubs: {
        "v-dialog": { name: "VDialog", props: ["modelValue"], template: '<div v-if="modelValue"><slot /></div>' },
        "v-btn": { template: "<button><slot /></button>" },
        "v-alert": { template: "<aside><slot /></aside>" },
        "v-progress-linear": true
      }
    }
  });
  return { wrapper, modalOperacaoAberto, caixaStatus, empresaId };
}

describe("host único +Novo / Transferências", () => {
  it("mantém a faixa de transferência e suas duas ações no mesmo modal", () => {
    const { wrapper } = montar(true, true, true);
    expect(wrapper.get("h2").text()).toBe("Nova transferência");
    expect(wrapper.get('[data-tab="nova"] span').text()).toBe("Nova transferência");
    expect(wrapper.get('[data-tab="retorno"] span').text()).toBe("Retorno / sangria");
    wrapper.unmount();
  });

  it("operador com Caixa aberto entra no retorno, sem montar formulário contábil", async () => {
    const { wrapper } = montar(false, true, true);
    await flushPromises();
    expect(wrapper.findAllComponents({ name: "VDialog" })).toHaveLength(1);
    expect(wrapper.get('[data-tab="nova"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-tab="retorno"]').attributes("disabled")).toBeUndefined();
    expect(wrapper.findComponent({ name: "OperacaoTransferenciaForm" }).exists()).toBe(false);
    expect(wrapper.getComponent({ name: "CaixaRetornoSangriaForm" }).props("responsavelNome")).toBe("Operadora");
    wrapper.unmount();
  });

  it.each([
    [true, false, true],
    [true, true, false]
  ])(
    "retaguarda conserva comum e retorno fica bloqueado quando falta Caixa/permissão",
    async (criar, operar, aberto) => {
      const { wrapper } = montar(criar, operar, aberto);
      await flushPromises();
      expect(wrapper.findComponent({ name: "OperacaoTransferenciaForm" }).exists()).toBe(true);
      expect(wrapper.get('[data-tab="retorno"]').attributes("disabled")).toBeDefined();
      expect(wrapper.findComponent({ name: "CaixaRetornoSangriaForm" }).exists()).toBe(false);
      wrapper.unmount();
    }
  );

  it("troca a aba no mesmo host e não mantém comum visível sobre retorno", async () => {
    const { wrapper, empresaId, modalOperacaoAberto } = montar(true, true, true);
    await wrapper.get('[data-tab="retorno"]').trigger("click");
    await flushPromises();
    expect(wrapper.get(".transferencias-host__comum").attributes("style")).toContain("display: none");
    expect(wrapper.findComponent({ name: "CaixaRetornoSangriaForm" }).exists()).toBe(true);
    empresaId.value = "emp-2";
    await flushPromises();
    expect(modalOperacaoAberto.value).toBe(false);
    wrapper.unmount();
  });

  it("mantém a transferência da retaguarda disponível quando o Caixa está em fechamento", async () => {
    const { wrapper, caixaStatus } = montar(true, false, true);
    caixaStatus.value!.caixaAberto!.status = "em_fechamento";
    await flushPromises();
    expect(wrapper.findComponent({ name: "OperacaoTransferenciaForm" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "CaixaRetornoSangriaForm" }).exists()).toBe(false);
    wrapper.unmount();
  });
});
