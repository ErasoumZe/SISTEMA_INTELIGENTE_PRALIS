<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useApi } from "~/composables/useApi";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import { useCaixaRetornoSangria } from "~/composables/useCaixaRetornoSangria";
import OperacaoTransferenciaForm from "~/components/operacoes/OperacaoTransferenciaForm.vue";
import CaixaRetornoSangriaForm from "~/components/caixa/CaixaRetornoSangriaForm.vue";
import "~/components/operacoes/operacao-lancamento.css";

const {
  modalOperacaoAberto,
  entidadeNova,
  operacaoEditandoId,
  empresaId,
  caixaStatus,
  podeCriarTransferencia,
  podeEditarTransferencia,
  podeOperarCaixa,
  podeOperarTransferenciaSemCaixa,
  caixaSalvando,
  salvandoOperacao,
  carregarStatusCaixa,
  retornarSaldoOperacional
} = useWorkspaceContext();
const { apiGet } = useApi();
const aba = ref<"nova" | "retorno">("nova");
const aberto = computed({
  get: () => modalOperacaoAberto.value && entidadeNova.value === "transferencia",
  set: (valor: boolean) => {
    if (!valor) modalOperacaoAberto.value = false;
  }
});
const editando = computed(() => Boolean(operacaoEditandoId.value));
const caixaEmFechamento = computed(() => caixaStatus.value?.caixaAberto?.status === "em_fechamento");
// A Tesouraria registra a transferencia contabil sem depender do caixa do PDV.
// Retorno/sangria e outro ato: continua exclusivo do operador com caixa aberto.
const eRetaguarda = computed(() => podeOperarTransferenciaSemCaixa.value);
const podeUsarComum = computed(
  () =>
    (eRetaguarda.value || !caixaEmFechamento.value) &&
    (editando.value ? podeEditarTransferencia.value : podeCriarTransferencia.value)
);
const {
  entrega,
  saldoLivre,
  lacresRetornoDisponiveis,
  podeRetornar,
  carregando,
  erroCarga,
  entregaBloqueada,
  mensagemErroEntrega,
  processando,
  preparar,
  retornarSaldo
} = useCaixaRetornoSangria({
  status: caixaStatus,
  empresaId,
  permitido: podeOperarCaixa,
  salvando: caixaSalvando,
  carregarStatus: () => carregarStatusCaixa(),
  carregarLacres: (caixaId) => apiGet(`/api/caixa/${encodeURIComponent(caixaId)}/lacres-retorno`),
  retornarSaldo: retornarSaldoOperacional,
  fechar: () => {
    aberto.value = false;
  }
});
const ocupado = computed(() => processando.value || caixaSalvando.value || salvandoOperacao.value);
const podeUsarRetorno = computed(() => !caixaEmFechamento.value && podeRetornar.value);
const transferenciaVars = {
  "--cat": "var(--cat-transferencias-base)",
  "--cat-soft": "var(--cat-transferencias-soft)",
  "--cat-faixa": "var(--cat-transferencias-faixa)",
  "--cat-tinta": "var(--cat-transferencias-tinta)"
};
watch(
  aberto,
  (valor) => {
    if (valor) aba.value = podeUsarComum.value ? "nova" : "retorno";
  },
  { immediate: true }
);
watch(
  [caixaEmFechamento, eRetaguarda, podeUsarComum, aba],
  ([emFechamento, retaguarda, podeComum, abaAtual]) => {
    if (emFechamento && retaguarda && podeComum && abaAtual === "retorno") aba.value = "nova";
  }
);
watch(
  [aberto, aba],
  ([visivel, atual]) => {
    if (visivel && atual === "retorno") void preparar();
  },
  { immediate: true }
);
watch(empresaId, () => {
  aberto.value = false;
});
function fechar() {
  if (!ocupado.value) aberto.value = false;
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="560" persistent no-click-animation>
    <div class="lc-modal transferencias-host" :style="transferenciaVars">
      <div class="transferencias-host__faixa">
        <div class="lc-head">
          <span class="lc-ic"><v-icon size="19">mdi-swap-horizontal</v-icon></span>
          <h2 class="lc-titulo">{{ editando ? "Editar transferência" : "Nova transferência" }}</h2>
          <v-icon class="lc-x" size="19" :disabled="ocupado" aria-label="Fechar" @click="fechar">mdi-close</v-icon>
        </div>
        <div v-if="!editando" class="lc-cats transferencias-host__abas" role="tablist" aria-label="Tipo de transferência">
          <button
            type="button"
            class="lc-cat"
            :class="{ ativa: aba === 'nova' }"
            :style="{ '--cat-btn-faixa': 'var(--cat-transferencias-faixa)' }"
            :aria-selected="aba === 'nova'"
            :disabled="!podeUsarComum || ocupado"
            data-tab="nova"
            @click="aba = 'nova'"
          >
            <v-icon size="16">mdi-swap-horizontal</v-icon>
            <span>Nova transferência</span>
          </button>
          <button
            type="button"
            class="lc-cat"
            :class="{ ativa: aba === 'retorno' }"
            :style="{ '--cat-btn-faixa': 'var(--cat-transferencias-faixa)' }"
            :aria-selected="aba === 'retorno'"
            :disabled="!podeUsarRetorno || ocupado"
            data-tab="retorno"
            @click="aba = 'retorno'"
          >
            <v-icon size="16">mdi-cash-refund</v-icon>
            <span>Retorno / sangria</span>
          </button>
        </div>
      </div>
      <v-alert v-if="aba === 'retorno' && caixaEmFechamento" type="warning" variant="tonal" class="ma-4">
        <strong>Caixa em fechamento.</strong> Transferências, saídas e sangrias do PDV estão bloqueadas até a
        conferência final na Tesouraria.
      </v-alert>
      <div v-if="podeUsarComum" v-show="aba === 'nova'" class="transferencias-host__comum">
        <OperacaoTransferenciaForm />
      </div>
      <template v-if="aba === 'retorno' && !editando && !caixaEmFechamento">
        <v-alert v-if="!podeUsarRetorno" type="info" variant="tonal" class="ma-4">
          Retorno / sangria exige um Caixa aberto e permissão para operar Caixa.
        </v-alert>
        <template v-else>
          <v-progress-linear v-if="carregando" indeterminate aria-label="Carregando retorno / sangria" />
          <v-alert v-if="erroCarga" type="error" variant="tonal" class="ma-4">
            {{ erroCarga }}
            <v-btn variant="text" @click="preparar">Tentar novamente</v-btn>
          </v-alert>
          <CaixaRetornoSangriaForm
            :saldo-livre="saldoLivre"
            v-model:valor="entrega.valor"
            v-model:valor-especie="entrega.valorEspecie"
            v-model:valor-moedas="entrega.valorMoedas"
            v-model:lacre-id="entrega.lacreId"
            v-model:observacao="entrega.observacao"
            :responsavel-nome="entrega.responsavelNome"
            :lacres-disponiveis="lacresRetornoDisponiveis"
            :bloqueado="entregaBloqueada || Boolean(erroCarga)"
            :mensagem-erro="mensagemErroEntrega"
            :salvando="processando || caixaSalvando"
            @cancelar="fechar"
            @salvar="retornarSaldo"
          />
        </template>
      </template>
    </div>
  </v-dialog>
</template>

<style scoped>
.transferencias-host {
  min-width: 0;
  color: rgb(var(--v-theme-on-surface));
  box-shadow: none !important;
}
.transferencias-host__faixa {
  flex: 0 0 auto;
  padding: var(--cx-sp-4) var(--cx-sp-5) var(--cx-sp-3);
  color: #fff;
  background: var(--cat-transferencias-faixa);
  border-radius: 16px 16px 0 0;
}
.transferencias-host__abas {
  flex: 0 0 auto;
}
.transferencias-host__comum {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.transferencias-host :deep(.tr-modal) {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  height: auto;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.transferencias-host :deep(.tr-corpo) {
  padding-top: 0;
}
.transferencias-host :deep(.retorno-dialog) {
  flex: 1 1 auto;
}
@media (max-width: 560px) {
  .transferencias-host__faixa {
    padding: 10px 12px 0;
  }
}
</style>
