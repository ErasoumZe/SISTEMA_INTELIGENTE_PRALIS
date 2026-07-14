<script setup lang="ts">
import type { CaixaStatus, ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

const props = defineProps<{
  resumo: ResumoCaixa | null;
  status: CaixaStatus | null;
  salvando?: boolean;
}>();

const emit = defineEmits<{
  (event: "acertarSaldo", payload: { caixaId: string; observacao: string | null }): void;
  (event: "fecharCaixa", payload: { caixaId: string; observacao: string | null }): void;
}>();

const fechamento = reactive({ observacao: "" });

const caixaAberto = computed(() => props.status?.caixaAberto ?? null);
const resumoAtual = computed(() => props.resumo ?? props.status?.resumo ?? null);
const diferenca = computed(() => Number(resumoAtual.value?.saldo ?? 0));
const precisaAcerto = computed(() => diferenca.value > 0);

watch(
  caixaAberto,
  () => {
    if (!caixaAberto.value) fechamento.observacao = "";
  },
  { immediate: true }
);

function acertar() {
  const caixa = caixaAberto.value;
  if (!caixa) return;
  emit("acertarSaldo", { caixaId: caixa.id, observacao: fechamento.observacao || null });
}

function fechar() {
  const caixa = caixaAberto.value;
  if (!caixa) return;
  emit("fecharCaixa", { caixaId: caixa.id, observacao: fechamento.observacao || null });
}
</script>

<template>
  <div class="operacoes-layout">
    <v-alert v-if="!caixaAberto" type="warning" variant="tonal"> Nenhum caixa aberto para fechamento. </v-alert>

    <template v-else>
      <section v-if="resumoAtual" class="summary-grid" aria-label="Resumo do fechamento">
        <article class="summary-card card-entradas">
          <div class="summary-label"><v-icon icon="mdi-cash-plus" size="16" /> Entradas</div>
          <div class="summary-value">{{ dinheiro(resumoAtual.totalEntradas) }}</div>
        </article>
        <article class="summary-card card-transferencias">
          <div class="summary-label"><v-icon icon="mdi-swap-horizontal" size="16" /> Transf. entrada</div>
          <div class="summary-value">{{ dinheiro(resumoAtual.totalTransferenciasEntrada || 0) }}</div>
        </article>
        <article class="summary-card card-retiradas">
          <div class="summary-label"><v-icon icon="mdi-swap-horizontal" size="16" /> Transf. saida</div>
          <div class="summary-value">{{ dinheiro(resumoAtual.totalTransferenciasSaida || 0) }}</div>
        </article>
        <article class="summary-card card-despesas">
          <div class="summary-label"><v-icon icon="mdi-receipt-text" size="16" /> Despesas</div>
          <div class="summary-value">{{ dinheiro(resumoAtual.totalDespesas) }}</div>
        </article>
        <article class="summary-card card-transferencias">
          <div class="summary-label"><v-icon icon="mdi-package-variant-closed" size="16" /> Mercadorias</div>
          <div class="summary-value">{{ dinheiro(resumoAtual.totalMercadorias || 0) }}</div>
        </article>
        <article class="summary-card card-saldo">
          <div class="summary-label"><v-icon icon="mdi-currency-usd" size="16" /> Diferenca</div>
          <div class="summary-value">{{ dinheiro(resumoAtual.saldo) }}</div>
        </article>
      </section>

      <v-card class="svelte-table-card">
        <v-card-text>
          <div class="table-heading">
            <h2>Fechamento com diferenca</h2>
            <p>
              {{ caixaAberto.pdvNome }} aberto em {{ formatarDataHora(caixaAberto.dataHoraAbertura) }} por
              {{ caixaAberto.usuarioCaixaNome }}.
            </p>
          </div>

          <v-alert v-if="precisaAcerto" type="warning" variant="tonal" class="mb-5">
            Diferenca positiva de {{ dinheiro(diferenca) }}. Faca o acerto antes de fechar o caixa.
          </v-alert>

          <v-alert v-else type="success" variant="tonal" class="mb-5"> Caixa pronto para fechamento. </v-alert>

          <v-textarea
            v-model="fechamento.observacao"
            label="Observacao do fechamento"
            rows="3"
            auto-grow
            class="mb-4"
          />

          <div class="d-flex flex-wrap ga-3 justify-end">
            <v-btn
              v-if="precisaAcerto"
              color="warning"
              prepend-icon="mdi-cash-sync"
              :loading="salvando"
              @click="acertar"
            >
              Acertar saldo
            </v-btn>
            <v-btn
              color="primary"
              prepend-icon="mdi-lock"
              :disabled="precisaAcerto"
              :loading="salvando"
              @click="fechar"
            >
              Fechar caixa
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </template>
  </div>
</template>
