import { defineComponent, h, provide, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import OperacaoLancamentoDatas from "~/components/operacoes/OperacaoLancamentoDatas.vue";
import OperacaoLancamentoPagamento from "~/components/operacoes/OperacaoLancamentoPagamento.vue";
import { OPERACAO_LANCAMENTO_KEY, type OperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";
import { formOperacaoVazio } from "~/utils/domain";

function montarBloco(categoria: "despesa" | "retirada") {
  const bloco = {
    cat: ref(categoria),
    form: ref(formOperacaoVazio()),
    hojeISO: ref("2026-09-14"),
    pago: ref(false),
    dataDocFiscal: ref(""),
    numeroDocFiscal: ref("")
  } as unknown as OperacaoLancamentoBloco;
  return defineComponent({
    setup() {
      provide(OPERACAO_LANCAMENTO_KEY, bloco);
      return () => h("div", [h(OperacaoLancamentoDatas), h(OperacaoLancamentoPagamento)]);
    }
  });
}

describe("campos da retirada", () => {
  it("oculta somente documento fiscal e vencimento na retirada", () => {
    const wrapper = mount(montarBloco("retirada"));

    expect(wrapper.text()).toContain("Data Lanç");
    expect(wrapper.text()).toContain("Data pagamento");
    expect(wrapper.text()).not.toContain("Data Doc. Fiscal");
    expect(wrapper.text()).not.toContain("Doc. Fiscal");
    expect(wrapper.text()).not.toContain("Data Vencimento");
  });

  it("mantem os campos fiscais e vencimento em despesa", () => {
    const wrapper = mount(montarBloco("despesa"));

    expect(wrapper.text()).toContain("Data Doc. Fiscal");
    expect(wrapper.text()).toContain("N° Doc. Fiscal");
    expect(wrapper.text()).toContain("Data Vencimento");
  });
});
