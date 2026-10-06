<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useApi } from "~/composables/useApi";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import { useCaixaRetornoSangria } from "~/composables/useCaixaRetornoSangria";
import OperacaoTransferenciaForm from "~/components/operacoes/OperacaoTransferenciaForm.vue";
import CaixaRetornoSangriaForm from "~/components/caixa/CaixaRetornoSangriaForm.vue";

const {
  modalOperacaoAberto,
  entidadeNova,
  operacaoEditandoId,
  empresaId,
  caixaStatus,
  podeCriarTransferencia,
  podeEditarTransferencia,
  podeOperarCaixa,
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
const podeUsarComum = computed(
  () => !caixaEmFechamento.value && (editando.value ? podeEditarTransferencia.value : podeCriarTransferencia.value)
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
watch(
  aberto,
  (valor) => {
    if (valor) aba.value = podeUsarComum.value ? "nova" : "retorno";
  },
  { immediate: true }
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
  <v-dialog v-model="aberto" max-width="720" persistent no-click-animation>
    <v-card class="transferencias-host" elevation="0">
      <div class="transferencias-host__faixa">
        <div class="transferencias-host__cabecalho">
          <span class="transferencias-host__icone"><v-icon size="19">mdi-swap-horizontal</v-icon></span>
          <h2>{{ editando ? "Editar transferência" : "Nova transferência" }}</h2>
          <v-btn
            icon="mdi-close"
            variant="text"
            aria-label="Fechar transferências"
            :disabled="ocupado"
            @click="fechar"
          />
        </div>
        <v-tabs v-if="!editando" v-model="aba" grow class="transferencias-host__abas">
          <v-tab value="nova" :disabled="!podeUsarComum || ocupado">Nova transferência</v-tab>
          <v-tab value="retorno" :disabled="!podeRetornar || ocupado">Retorno / sangria</v-tab>
        </v-tabs>
      </div>
      <v-alert v-if="caixaEmFechamento" type="warning" variant="tonal" class="ma-4">
        <strong>Caixa em fechamento.</strong> Transferências, saídas e sangrias do PDV estão bloqueadas até a
        conferência final na Tesouraria.
      </v-alert>
      <div v-if="!caixaEmFechamento && podeUsarComum" v-show="aba === 'nova'" class="transferencias-host__comum">
        <OperacaoTransferenciaForm />
      </div>
      <template v-if="!caixaEmFechamento && aba === 'retorno' && !editando">
        <v-alert v-if="!podeRetornar" type="info" variant="tonal" class="ma-4">
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
    </v-card>
  </v-dialog>
</template>

<style scoped>
.transferencias-host {
  min-width: 0;
  max-height: calc(100dvh - 48px);
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface));
  box-shadow: none !important;
}
.transferencias-host__faixa {
  flex: 0 0 auto;
  padding: var(--cx-sp-4) var(--cx-sp-5) 0;
  color: #fff;
  background: var(--cat-transferencias-faixa, #c13a08);
  border-radius: 16px 16px 0 0;
}
.transferencias-host__cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: var(--cx-sp-3);
}
.transferencias-host__cabecalho h2 {
  flex: 1;
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
}
.transferencias-host__icone {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  background: rgb(255 255 255 / 20%);
}
.transferencias-host__cabecalho :deep(.v-btn) {
  color: #fff;
}
.transferencias-host__abas {
  flex: 0 0 auto;
}
.transferencias-host__abas :deep(.v-tab) {
  min-height: 38px;
  color: rgb(255 255 255 / 78%) !important;
  opacity: 1 !important;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.transferencias-host__abas :deep(.v-tab--selected) {
  color: #fff !important;
}
.transferencias-host__abas :deep(.v-tabs__slider) {
  height: 3px;
  color: #fff;
}
.transferencias-host__comum {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.transferencias-host :deep(.tr-modal) {
  min-height: 0;
  height: auto;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
@media (max-width: 560px) {
  .transferencias-host {
    max-height: 100dvh;
  }
  .transferencias-host__cabecalho {
    padding-bottom: 8px;
  }
  .transferencias-host__faixa {
    padding: 10px 12px 0;
  }
  .transferencias-host__abas :deep(.v-tab) {
    min-width: 0;
    padding-inline: 10px;
    font-size: 0.78rem;
  }
}
</style>
