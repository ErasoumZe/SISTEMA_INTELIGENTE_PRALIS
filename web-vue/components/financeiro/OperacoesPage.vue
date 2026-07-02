<script setup lang="ts">
import type { EntidadeOperacional, ItemMenu, OperacaoResumo, Opcao, ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";

defineProps<{
  resumo: ResumoCaixa | null;
  telaAtual: ItemMenu | null | undefined;
  telaAtiva: string;
  empresaAtiva: Opcao | null;
  operacoesPaginadas: OperacaoResumo[];
  totalOperacoes: number;
  pagina: number;
  totalPaginas: number;
  descricao: string;
}>();

const emit = defineEmits<{
  (event: "editar", entidade: EntidadeOperacional, operacao: OperacaoResumo): void;
  (event: "update:pagina", pagina: number): void;
}>();

function entidadeDaTela(tela: string): EntidadeOperacional {
  if (tela === "despesas") return "despesa";
  if (tela === "mercadorias") return "mercadoria";
  if (tela === "retiradas") return "retirada";
  if (tela === "transferencias") return "transferencia";
  return "venda";
}
</script>

<template>
  <div class="operacoes-layout">
    <section v-if="resumo" class="summary-grid" aria-label="Resumo do caixa">
      <article class="summary-card card-entradas">
        <div class="summary-label"><v-icon icon="mdi-cash-plus" size="16" /> Entradas</div>
        <div class="summary-value">{{ dinheiro(resumo.totalEntradas) }}</div>
      </article>
      <article class="summary-card card-transferencias">
        <div class="summary-label"><v-icon icon="mdi-swap-horizontal" size="16" /> Transferencias</div>
        <div class="summary-value">{{ dinheiro(resumo.totalTransferencias) }}</div>
      </article>
      <article class="summary-card card-despesas">
        <div class="summary-label"><v-icon icon="mdi-receipt-text" size="16" /> Despesas</div>
        <div class="summary-value">{{ dinheiro(resumo.totalDespesas) }}</div>
      </article>
      <article class="summary-card card-retiradas">
        <div class="summary-label"><v-icon icon="mdi-wallet" size="16" /> Retiradas</div>
        <div class="summary-value">{{ dinheiro(resumo.totalRetiradas) }}</div>
      </article>
      <article class="summary-card card-saldo">
        <div class="summary-label"><v-icon icon="mdi-currency-usd" size="16" /> Saldo</div>
        <div class="summary-value">{{ dinheiro(resumo.saldo) }}</div>
      </article>
    </section>

    <v-card class="svelte-table-card">
      <v-card-text>
        <div class="table-heading">
          <h2>{{ telaAtual?.titulo }}</h2>
          <p>{{ descricao || `Lancamentos da empresa ${empresaAtiva?.nome ?? ""}.` }}</p>
        </div>
        <div class="responsive-table-shell">
          <v-table class="operacoes-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descricao</th>
                <th class="text-right">Valor</th>
                <th class="text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="operacao in operacoesPaginadas" :key="operacao.id">
                <td>{{ operacao.dataReferencia }}</td>
                <td class="font-weight-bold">{{ operacao.descricao }}</td>
                <td class="text-right font-weight-bold">{{ dinheiro(operacao.valorOriginal) }}</td>
                <td class="text-right">
                  <v-btn
                    size="small"
                    variant="tonal"
                    prepend-icon="mdi-pencil"
                    @click="emit('editar', entidadeDaTela(telaAtiva), operacao)"
                  >
                    Editar
                  </v-btn>
                </td>
              </tr>
              <tr v-if="!operacoesPaginadas.length">
                <td colspan="4" class="text-center text-muted py-8">Nenhum lancamento encontrado.</td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <div v-if="totalOperacoes > 10" class="mt-4 d-flex justify-end align-center ga-2">
          <v-btn
            size="small"
            variant="outlined"
            :disabled="pagina === 1"
            @click="emit('update:pagina', Math.max(1, pagina - 1))"
          >
            Anterior
          </v-btn>
          <span>{{ pagina }} / {{ totalPaginas }}</span>
          <v-btn
            size="small"
            variant="outlined"
            :disabled="pagina === totalPaginas"
            @click="emit('update:pagina', Math.min(totalPaginas, pagina + 1))"
          >
            Proxima
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>
