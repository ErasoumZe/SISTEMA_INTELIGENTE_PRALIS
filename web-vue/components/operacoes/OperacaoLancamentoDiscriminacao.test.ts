import { defineComponent, h, provide, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import OperacaoLancamentoDiscriminacao from "~/components/operacoes/OperacaoLancamentoDiscriminacao.vue";
import { OPERACAO_LANCAMENTO_KEY, type OperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";
import { itemDespesaVazio } from "~/utils/operacoes";

function montarBloco() {
  const removerItemDaDiscriminacao = vi.fn();
  const bloco = {
    cfg: ref({ token: "despesas", icone: "", discrimina: true }),
    discriminando: ref(true),
    itensDaDiscriminacao: ref([itemDespesaVazio(), itemDespesaVazio()]),
    origensDoItem: ref([]),
    rotuloDaOpcao: vi.fn(),
    itemVinculado: vi.fn(() => ""),
    escolherItemVinculado: vi.fn(),
    grupoDoItem: vi.fn(() => ""),
    definirGrupoDoItem: vi.fn(),
    gruposDoItem: ref([]),
    gruposPatrimonio: ref([]),
    novoItemDaDiscriminacao: vi.fn(),
    removerItemDaDiscriminacao,
    unitComDesc: vi.fn(() => 0),
    totalLinha: vi.fn(() => 0),
    totalLinhaComDesc: vi.fn(() => 0),
    pctEfetivo: ref(0),
    totalGeralBruto: ref(0),
    totalGeralComDesc: ref(0),
    descontoValorReais: ref(0),
    modoDesconto: ref<"valor" | "percentual">("valor"),
    descontoInput: ref(""),
    erroDiscriminacaoLinha: ref<number | null>(null),
    brn: vi.fn(() => "0,00")
  } as object as OperacaoLancamentoBloco;

  const Componente = defineComponent({
    setup() {
      provide(OPERACAO_LANCAMENTO_KEY, bloco);
      return () => h(OperacaoLancamentoDiscriminacao);
    }
  });

  return { Componente, removerItemDaDiscriminacao };
}

describe("layout da discriminacao", () => {
  it("mantem percentual e exclusao em colunas separadas", async () => {
    const { Componente, removerItemDaDiscriminacao } = montarBloco();
    const wrapper = mount(Componente, {
      global: {
        stubs: {
          CampoDinheiro: true,
          OperacaoLancamentoIa: true,
          "v-icon": true
        }
      }
    });

    expect(wrapper.find("thead .disc-pct").exists()).toBe(true);
    expect(wrapper.find("thead .disc-acao").exists()).toBe(true);
    expect(wrapper.findAll("tbody .disc-pct")).toHaveLength(2);
    expect(wrapper.findAll("tbody .disc-acao")).toHaveLength(2);

    const botoesExcluir = wrapper.findAll<HTMLButtonElement>("tbody .disc-acao button");
    expect(botoesExcluir).toHaveLength(2);
    expect(botoesExcluir[0]?.element.disabled).toBe(false);
    await botoesExcluir[0]?.trigger("click");
    expect(removerItemDaDiscriminacao).toHaveBeenCalledWith(0);
  });
});
