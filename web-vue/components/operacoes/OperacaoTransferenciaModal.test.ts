import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, provide, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import OperacaoTransferenciaModal from "~/components/operacoes/OperacaoTransferenciaModal.vue";
import { WORKSPACE_CONTEXT } from "~/components/workspace/workspace-context";
import { formOperacaoVazio } from "~/utils/domain";

function montarModal(podePlanejar = true) {
  const form = ref({
    ...formOperacaoVazio(),
    valorOriginal: "1000,00",
    contaOrigemId: "cofre-1",
    contaDestinoId: "caixa-1",
    nLacreDoc: "001"
  });
  const salvarOperacao = vi.fn(async () => undefined);
  const contexto = {
    modalOperacaoAberto: ref(true),
    entidadeNova: ref("transferencia"),
    operacaoEditandoId: ref(""),
    empresaId: ref("empresa-1"),
    form,
    opcoesEmpresa: computed(() => ({
      empresas: [{ id: "empresa-1", nome: "Empresa", contaCofreId: "cofre-1" }],
      contas: [
        { id: "cofre-1", nome: "Cofre" },
        { id: "caixa-1", nome: "Caixa" },
        { id: "banco-1", nome: "Banco" }
      ],
      pdvs: [{ id: "pdv-1", nome: "PDV", contaId: "caixa-1", ativo: true }]
    })),
    salvandoOperacao: ref(false),
    salvarOperacao,
    podePlanejarRetorno: computed(() => podePlanejar)
  };
  const Workspace = defineComponent({
    setup() {
      provide(WORKSPACE_CONTEXT, contexto);
      return () => h(OperacaoTransferenciaModal);
    }
  });
  const wrapper = mount(Workspace, {
    global: {
      stubs: {
        "v-dialog": { template: "<div><slot /></div>" },
        "v-icon": true
      }
    }
  });
  return { wrapper, form, salvarOperacao };
}

describe("OperacaoTransferenciaModal - transferencia de retorno", () => {
  it("mostra uma unica opcao Retorno e permite varias linhas de valor, lacre e destino", async () => {
    const { wrapper, form } = montarModal();

    expect(wrapper.text()).toContain("Transferência de retorno");
    expect(wrapper.text()).not.toMatch(/sangria/iu);
    expect(wrapper.findAll('[data-teste="opcao-transferencia-retorno"]')).toHaveLength(1);

    await wrapper.get('[data-teste="opcao-transferencia-retorno"]').setValue(true);
    await nextTick();
    expect(wrapper.get('[data-teste="opcao-agendamento"]').attributes("disabled")).toBeDefined();
    expect(wrapper.findAll(".tr-planejamento-linha")).toHaveLength(1);
    expect(form.value.retornosPlanejados).toHaveLength(1);
    expect(form.value.retornosPlanejados[0]).toMatchObject({
      valor: "",
      nLacreDoc: "",
      contaDestinoId: "cofre-1"
    });

    await wrapper.get(".tr-adicionar-retorno").trigger("click");
    expect(wrapper.findAll(".tr-planejamento-linha")).toHaveLength(2);
    expect(form.value.retornosPlanejados).toHaveLength(2);
    for (const linha of wrapper.findAll(".tr-planejamento-linha")) {
      expect(linha.text()).toContain("Valor");
      expect(linha.text()).toContain("Lacre");
      expect(linha.text()).toContain("Destino");
    }
  });

  it("nao oferece planejamento ao operador e desabilita fora da rota Cofre para PDV", async () => {
    const operador = montarModal(false);
    expect(operador.wrapper.find('[data-teste="opcao-transferencia-retorno"]').exists()).toBe(false);

    const retaguarda = montarModal();
    retaguarda.form.value.contaOrigemId = "banco-1";
    await nextTick();
    expect(retaguarda.wrapper.get('[data-teste="opcao-transferencia-retorno"]').attributes("disabled")).toBeDefined();
    expect(retaguarda.wrapper.text()).toContain("Selecione Cofre como origem");
  });

  it("compara valores em centavos e aceita 0,10 + 0,20 para uma ida de 0,30", async () => {
    const { wrapper, form, salvarOperacao } = montarModal();
    form.value.valorOriginal = "0,30";
    await wrapper.get('[data-teste="opcao-transferencia-retorno"]').setValue(true);
    form.value.retornosPlanejados[0] = {
      valor: "0,10",
      nLacreDoc: "RET-010",
      contaDestinoId: "cofre-1"
    };
    await wrapper.get(".tr-adicionar-retorno").trigger("click");
    form.value.retornosPlanejados[1] = {
      valor: "0,20",
      nLacreDoc: "RET-020",
      contaDestinoId: "banco-1"
    };
    await wrapper.get(".tr-salvar").trigger("click");
    expect(salvarOperacao).toHaveBeenCalledOnce();
  });
});
