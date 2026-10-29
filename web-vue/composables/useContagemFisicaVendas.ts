import { computed, ref } from "vue";
import type { ContagemFisicaRelatorio } from "@padaria/shared";
import type { ContagemEmEdicao } from "~/components/caixa/CaixaContagemFisica.vue";

// R-232 · contagem fisica cega em Vendas: o que esta sendo digitado e o que ja foi gravado no relatorio (trava ao
// gerar). Sem contagem gravada, o envio leva o digitado; gravada e sem correcao, reenvia a mesma (o servidor nao pede
// nada); corrigindo, leva a nova com a justificativa.
export function useContagemFisicaVendas(aoRegistrar: (contagem: ContagemFisicaRelatorio | null) => void) {
  const vazia = (): ContagemEmEdicao => ({ valorEspecie: "", valorMoedas: "", justificativa: "", corrigindo: false });
  const contagem = ref<ContagemEmEdicao>(vazia());
  const registrada = ref<ContagemFisicaRelatorio | null>(null);

  const pronta = computed(() => {
    if (registrada.value && !contagem.value.corrigindo) return true;
    const preenchida = contagem.value.valorEspecie.trim() !== "" && contagem.value.valorMoedas.trim() !== "";
    return preenchida && (!contagem.value.corrigindo || contagem.value.justificativa.trim().length >= 5);
  });

  function registrar(nova: ContagemFisicaRelatorio | null) {
    registrada.value = nova;
    contagem.value = vazia();
    aoRegistrar(nova);
  }

  function paraEnvio() {
    const atual = registrada.value;
    if (atual && !contagem.value.corrigindo) {
      return { contagemFisica: { valorEspecie: atual.valorEspecie, valorMoedas: atual.valorMoedas } };
    }
    return {
      contagemFisica: {
        valorEspecie: Number(contagem.value.valorEspecie || 0),
        valorMoedas: Number(contagem.value.valorMoedas || 0)
      },
      ...(contagem.value.corrigindo ? { justificativaContagem: contagem.value.justificativa.trim() } : {})
    };
  }

  return { contagem, registrada, pronta, registrar, paraEnvio };
}
