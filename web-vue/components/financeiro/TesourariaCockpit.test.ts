import { shallowMount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import TesourariaCockpit from "./TesourariaCockpit.vue";
import type { OperacaoResumo } from "~/types/padaria";

const payloadCancelamento = { planejamentoId: "filha", motivo: "auditoria", aoConcluir: vi.fn() };
const DialogoCancelamentoStub = defineComponent({
  props: { modelValue: Boolean },
  emits: ["confirmar"],
  setup(props, { emit }) {
    return () =>
      h("button", {
        "data-teste": "dialogo-cancelamento-stub",
        "data-aberto": String(props.modelValue),
        onClick: () => emit("confirmar", payloadCancelamento)
      });
  }
});

const ListaTransferenciasStub = defineComponent({
  props: {
    operacoes: { type: Array as () => OperacaoResumo[], required: true },
    podeEditar: Boolean,
    podeConferir: Boolean,
    podeCancelarPlanejamento: Boolean
  },
  emits: ["editar", "conferir", "cancelar-planejamento"],
  setup(props, { emit }) {
    return () =>
      h(
        "div",
        props.operacoes.map((operacao) =>
          h("article", { "data-operacao-id": operacao.id }, [
            props.podeEditar && !operacao.possuiPlanejamentoRetorno && !operacao.ehPlanejamentoRetorno
              ? h("button", { "data-teste": "botao-editar", onClick: () => emit("editar", operacao) })
              : null,
            props.podeConferir && operacao.status === "pendente" && !operacao.possuiPlanejamentoRetorno
              ? h("button", { "data-teste": "botao-conferir", onClick: () => emit("conferir", operacao) })
              : null,
            props.podeCancelarPlanejamento && operacao.ehPlanejamentoRetorno && operacao.status === "agendada"
              ? h("button", {
                  "data-teste": "cancelar-planejamento-retorno",
                  onClick: () => emit("cancelar-planejamento", operacao)
                })
              : null
          ])
        )
      );
  }
});

const base: OperacaoResumo = {
  id: "base",
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

function montar(podeCancelarPlanejamento: boolean, comumOverrides: Partial<OperacaoResumo> = {}) {
  const operacoes: OperacaoResumo[] = [
    { ...base, id: "pai", possuiPlanejamentoRetorno: true },
    { ...base, id: "filha", status: "agendada", ehPlanejamentoRetorno: true },
    { ...base, id: "comum", ...comumOverrides }
  ];
  return shallowMount(TesourariaCockpit, {
    props: {
      resumo: null,
      telaAtual: null,
      empresaAtiva: null,
      operacoesPaginadas: operacoes,
      operacoesTela: operacoes,
      totalOperacoes: operacoes.length,
      statusFiltro: "",
      filtrosTransferencias: {
        dataInicio: "",
        dataFim: "",
        pdvId: "",
        usuario: "",
        contaOrigemId: "",
        contaDestinoId: "",
        lacre: ""
      },
      pdvs: [],
      contas: [],
      pagina: 1,
      totalPaginas: 1,
      podeEditar: true,
      podeConferir: true,
      podeCancelarPlanejamento
    },
    global: {
      stubs: {
        AppCabecalhoTela: { template: "<header><slot name='subtitulo'/><slot name='acoes'/></header>" },
        CancelarPlanejamentoRetornoDialog: DialogoCancelamentoStub,
        "v-card": { template: "<section><slot /></section>" },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-icon": true,
        "v-select": true,
        TransferenciasLista: ListaTransferenciasStub
      }
    }
  });
}

describe("TesourariaCockpit - planejamento de retorno", () => {
  it("remove ações inválidas e oferece um único cancelamento somente à retaguarda", async () => {
    const wrapper = montar(true);
    const pai = wrapper.get('[data-operacao-id="pai"]');
    const filha = wrapper.get('[data-operacao-id="filha"]');
    const comum = wrapper.get('[data-operacao-id="comum"]');

    expect(pai.find('[data-teste="botao-editar"]').exists()).toBe(false);
    expect(pai.find('[data-teste="botao-conferir"]').exists()).toBe(false);
    expect(filha.find('[data-teste="botao-editar"]').exists()).toBe(false);
    expect(filha.findAll('[data-teste="cancelar-planejamento-retorno"]')).toHaveLength(1);
    expect(comum.find('[data-teste="botao-editar"]').exists()).toBe(true);
    // A tela virou relatorio: nao ha mais "Conferir" aqui (a conferencia vai para o Relatorio de fechamento).
    expect(comum.find('[data-teste="botao-conferir"]').exists()).toBe(false);

    await filha.get('[data-teste="cancelar-planejamento-retorno"]').trigger("click");
    const dialogo = wrapper.get('[data-teste="dialogo-cancelamento-stub"]');
    expect(dialogo.attributes("data-aberto")).toBe("true");
    await dialogo.trigger("click");
    expect(wrapper.emitted("cancelarPlanejamento")).toEqual([[payloadCancelamento]]);

    expect(montar(false).find('[data-teste="cancelar-planejamento-retorno"]').exists()).toBe(false);
  });
});
