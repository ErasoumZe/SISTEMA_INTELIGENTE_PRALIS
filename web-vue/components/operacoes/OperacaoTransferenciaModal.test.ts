import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, provide, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import OperacaoTransferenciaModal from "~/components/operacoes/OperacaoTransferenciaModal.vue";
import { WORKSPACE_CONTEXT } from "~/components/workspace/workspace-context";
import { formOperacaoVazio } from "~/utils/domain";

function montarModal(podePlanejar = true, editando = false) {
  const form = ref({
    ...formOperacaoVazio(),
    valorOriginal: "1000,00",
    contaOrigemId: "cofre-1",
    contaDestinoId: "caixa-1",
    nLacreDoc: "001"
  });
  const salvarOperacao = vi.fn(async () => ({ id: "transferencia-nova" }));
  const abrirOperacao = vi.fn(async () => undefined);
  const contexto = {
    modalOperacaoAberto: ref(true),
    entidadeNova: ref("transferencia"),
    operacaoEditandoId: ref(editando ? "transferencia-1" : ""),
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
    abrirOperacao,
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
  return { wrapper, form, salvarOperacao, abrirOperacao };
}

describe("OperacaoTransferenciaModal - transferencia de retorno", () => {
  function opcao(wrapper: ReturnType<typeof montarModal>["wrapper"], texto: string) {
    const label = wrapper.findAll("label.tr-check").find((item) => item.text().includes(texto));
    if (!label) throw new Error(`Opcao nao encontrada: ${texto}`);
    return label.get('input[type="checkbox"]');
  }

  it("mostra uma unica opcao Retorno e permite varias linhas somente de valor e lacre", async () => {
    const { wrapper, form } = montarModal();

    expect(wrapper.text()).toContain("Transferência de retorno");
    expect(wrapper.text()).not.toMatch(/sangria/iu);
    expect(wrapper.findAll('[data-teste="opcao-transferencia-retorno"]')).toHaveLength(1);

    await wrapper.get('[data-teste="opcao-transferencia-retorno"]').setValue(true);
    await nextTick();
    expect(wrapper.get('[data-teste="opcao-agendamento"]').attributes("disabled")).toBeDefined();
    expect(wrapper.findAll(".tr-planejamento-linha")).toHaveLength(1);
    expect(form.value.retornosPlanejados).toHaveLength(1);
    expect(form.value.retornosPlanejados[0]).toEqual({
      valor: "",
      nLacreDoc: ""
    });

    await wrapper.get(".tr-adicionar-retorno").trigger("click");
    expect(wrapper.findAll(".tr-planejamento-linha")).toHaveLength(2);
    expect(form.value.retornosPlanejados).toHaveLength(2);
    for (const linha of wrapper.findAll(".tr-planejamento-linha")) {
      expect(linha.text()).toContain("Valor");
      expect(linha.text()).toContain("Lacre");
      expect(linha.text()).not.toContain("Destino");
      expect(linha.find("select").exists()).toBe(false);
    }
  });

  it("torna Retorno, Multiplo Destino e Tempo de confirmacao mutuamente exclusivos", async () => {
    const retorno = montarModal();
    await retorno.wrapper.get('[data-teste="opcao-transferencia-retorno"]').setValue(true);
    expect(opcao(retorno.wrapper, "Múltiplo Destino").attributes("disabled")).toBeDefined();
    expect(opcao(retorno.wrapper, "Tempo de confirmação").attributes("disabled")).toBeDefined();
    expect(retorno.form.value.tempoConfirmacao).toBeNull();

    const multiplo = montarModal();
    await opcao(multiplo.wrapper, "Múltiplo Destino").setValue(true);
    expect(opcao(multiplo.wrapper, "Tempo de confirmação").attributes("disabled")).toBeDefined();
    expect(multiplo.wrapper.get('[data-teste="opcao-transferencia-retorno"]').attributes("disabled")).toBeDefined();
    expect(multiplo.form.value.tempoConfirmacao).toBeNull();

    const prazo = montarModal();
    await opcao(prazo.wrapper, "Tempo de confirmação").setValue(true);
    expect(opcao(prazo.wrapper, "Múltiplo Destino").attributes("disabled")).toBeDefined();
    expect(prazo.wrapper.get('[data-teste="opcao-transferencia-retorno"]').attributes("disabled")).toBeDefined();
    expect(prazo.form.value.tempoConfirmacao).toBe("1dia");
  });

  it("explica qual modo bloqueia o retorno e distingue visualmente as opcoes desabilitadas", async () => {
    const prazo = montarModal();
    await opcao(prazo.wrapper, "Tempo de confirmação").setValue(true);

    expect((opcao(prazo.wrapper, "Tempo de confirmação").element as HTMLInputElement).checked).toBe(true);
    expect((opcao(prazo.wrapper, "Múltiplo Destino").element as HTMLInputElement).checked).toBe(false);
    expect(opcao(prazo.wrapper, "Múltiplo Destino").attributes("disabled")).toBeDefined();
    expect(opcao(prazo.wrapper, "Múltiplo Destino").element.closest("label")?.classList).toContain(
      "tr-check-desabilitado"
    );
    expect(prazo.wrapper.get('[data-teste="ajuda-retorno"]').text()).toBe(
      "Transferência de retorno indisponível enquanto Tempo de confirmação estiver ativo."
    );

    await opcao(prazo.wrapper, "Tempo de confirmação").setValue(false);
    expect(prazo.wrapper.find('[data-teste="ajuda-retorno"]').exists()).toBe(false);
    expect(prazo.wrapper.get('[data-teste="opcao-transferencia-retorno"]').attributes("disabled")).toBeUndefined();

    const multiplo = montarModal();
    await opcao(multiplo.wrapper, "Múltiplo Destino").setValue(true);
    expect((opcao(multiplo.wrapper, "Múltiplo Destino").element as HTMLInputElement).checked).toBe(true);
    expect((opcao(multiplo.wrapper, "Tempo de confirmação").element as HTMLInputElement).checked).toBe(false);
    expect(multiplo.wrapper.get('[data-teste="ajuda-retorno"]').text()).toBe(
      "Transferência de retorno indisponível enquanto Múltiplo Destino estiver ativo."
    );
  });

  it("nao apaga agendamento ao bloquear o planejamento de retorno", async () => {
    const { wrapper, form } = montarModal();
    await wrapper.get('[data-teste="opcao-agendamento"]').setValue(true);
    const agendadaPara = form.value.agendadaPara;

    expect(agendadaPara).not.toBe("");
    expect(wrapper.get('[data-teste="opcao-transferencia-retorno"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-teste="ajuda-retorno"]').text()).toBe(
      "Transferência de retorno indisponível enquanto Agendamento estiver ativo."
    );
    expect(form.value.agendadaPara).toBe(agendadaPara);
  });

  it("preserva o rascunho do retorno quando a rota fica temporariamente inelegivel", async () => {
    const { wrapper, form } = montarModal();
    await wrapper.get('[data-teste="opcao-transferencia-retorno"]').setValue(true);
    form.value.retornosPlanejados[0] = { valor: "300,00", nLacreDoc: "002" };

    form.value.contaDestinoId = "banco-1";
    await nextTick();

    expect((wrapper.get('[data-teste="opcao-transferencia-retorno"]').element as HTMLInputElement).checked).toBe(false);
    expect(form.value.retornosPlanejados).toEqual([]);

    form.value.contaDestinoId = "caixa-1";
    await nextTick();
    await wrapper.get('[data-teste="opcao-transferencia-retorno"]').setValue(true);

    expect(form.value.retornosPlanejados).toEqual([{ valor: "300,00", nLacreDoc: "002" }]);
  });

  it("exige pelo menos duas contas quando Multiplo Destino estiver marcado", async () => {
    const { wrapper, salvarOperacao } = montarModal();
    await opcao(wrapper, "Múltiplo Destino").setValue(true);

    await wrapper.get(".tr-salvar").trigger("click");
    expect(salvarOperacao).not.toHaveBeenCalled();
    expect(wrapper.get(".tr-erro").text()).toBe("Selecione ao menos duas contas de destino.");

    await wrapper.get('input[value="banco-1"]').setValue(true);
    await wrapper.get(".tr-salvar").trigger("click");
    expect(salvarOperacao).toHaveBeenCalledOnce();
  });

  it("remove o erro de Multiplo Destino quando a modalidade for desmarcada", async () => {
    const { wrapper, form } = montarModal();
    form.value.contaDestinoId = "";
    await nextTick();
    await opcao(wrapper, "Múltiplo Destino").setValue(true);
    await wrapper.get(".tr-salvar").trigger("click");
    expect(wrapper.get(".tr-erro").text()).toBe("Selecione ao menos duas contas de destino.");

    await opcao(wrapper, "Múltiplo Destino").setValue(false);
    expect(wrapper.find(".tr-erro").exists()).toBe(false);
    await opcao(wrapper, "Tempo de confirmação").setValue(true);
    expect(wrapper.find(".tr-erro").exists()).toBe(false);
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

  it("na edicao mantem prazo e agendamento somente leitura", () => {
    const { wrapper } = montarModal(true, true);
    expect(opcao(wrapper, "Tempo de confirmação").attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-teste="opcao-agendamento"]').attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-teste="opcao-transferencia-retorno"]').exists()).toBe(false);
  });

  it("nao oferece a propria origem como destino direto", () => {
    const { wrapper } = montarModal();
    const destino = wrapper.get('select[aria-label="Destino / Entrada"]');
    expect(destino.find('option[value="cofre-1"]').exists()).toBe(false);
    expect(destino.find('option[value="caixa-1"]').exists()).toBe(true);
  });

  it("Salvar e criar nova reabre um formulario novo e Salvar comum nao reabre", async () => {
    const continuar = montarModal();
    await continuar.wrapper.get(".tr-salvar-nova").trigger("click");
    expect(continuar.salvarOperacao).toHaveBeenCalledOnce();
    expect(continuar.abrirOperacao).toHaveBeenCalledWith("transferencia");

    const finalizar = montarModal();
    await finalizar.wrapper.get(".tr-salvar").trigger("click");
    expect(finalizar.salvarOperacao).toHaveBeenCalledOnce();
    expect(finalizar.abrirOperacao).not.toHaveBeenCalled();
  });

  it("compara valores em centavos e aceita 0,10 + 0,20 para uma ida de 0,30", async () => {
    const { wrapper, form, salvarOperacao } = montarModal();
    form.value.valorOriginal = "0,30";
    await wrapper.get('[data-teste="opcao-transferencia-retorno"]').setValue(true);
    form.value.retornosPlanejados[0] = {
      valor: "0,10",
      nLacreDoc: "RET-010"
    };
    await wrapper.get(".tr-adicionar-retorno").trigger("click");
    form.value.retornosPlanejados[1] = {
      valor: "0,20",
      nLacreDoc: "RET-020"
    };
    await wrapper.get(".tr-salvar").trigger("click");
    expect(salvarOperacao).toHaveBeenCalledOnce();
  });
});
