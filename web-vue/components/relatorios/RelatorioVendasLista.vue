<script setup lang="ts">
import type { OperacaoResumo } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataSomenteDia, formatarHora } from "~/utils/formatacao";

const props = defineProps<{
  linhas: OperacaoResumo[];
  ordem: "asc" | "desc";
}>();

const emit = defineEmits<{
  (event: "alternar-ordem"): void;
  (event: "ver-detalhes", venda: OperacaoResumo): void;
  (event: "adicionar-comprovantes", venda: OperacaoResumo): void;
}>();

function nomePagamento(pagamento: NonNullable<OperacaoResumo["pagamentos"]>[number]) {
  return pagamento.formaPagamentoNome?.trim() || pagamento.tipoPagamentoAutomacao?.trim() || "Sem forma";
}
</script>

<template>
  <section class="lista-vendas" aria-label="Vendas encontradas">
    <header class="lista-vendas__cabecalho">
      <span>Venda</span><span>PDV e cliente</span><span>Pagamento</span><span>Valor</span><span>Ações</span>
    </header>

    <article v-for="linha in linhas" :key="linha.id" class="lista-vendas__linha" :data-venda-id="linha.id">
      <div class="lista-vendas__venda" data-col="Venda">
        <strong>{{ linha.descricao }}</strong>
        <span class="lista-vendas__data">
          {{ formatarDataSomenteDia(linha.dataReferencia) }} ·
          <button class="lista-vendas__ordem" type="button" @click="emit('alternar-ordem')">
            {{ formatarHora(linha.dataVenda) }}
            <v-icon :icon="ordem === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down'" size="14" />
          </button>
        </span>
        <v-chip v-if="linha.status === 'cancelado'" size="x-small" color="error" variant="tonal">Cancelada</v-chip>
      </div>

      <div class="lista-vendas__contexto" data-col="PDV e cliente">
        <span>{{ linha.pdvNome ?? "PDV não informado" }}</span>
        <small>{{ linha.clienteNome ?? "Sem cliente identificado" }}</small>
      </div>

      <div class="lista-vendas__pagamento" data-col="Pagamento">
        <template v-if="linha.pagamentos?.length">
          <span v-for="pagamento in linha.pagamentos" :key="pagamento.id">
            {{ nomePagamento(pagamento) }}: {{ dinheiro(pagamento.totalPago) }}
          </span>
          <v-chip v-if="linha.pagamentos.length > 1" size="x-small" variant="tonal" color="primary">Dividida</v-chip>
        </template>
        <span v-else>Sem pagamento informado</span>
      </div>

      <strong class="lista-vendas__valor" data-col="Valor">{{ dinheiro(linha.valorLiquido ?? linha.valorOriginal) }}</strong>

      <div class="lista-vendas__acoes" data-col="Ações">
        <v-btn size="small" variant="text" color="primary" @click="emit('ver-detalhes', linha)">Detalhes</v-btn>
        <v-btn size="small" variant="text" @click="emit('adicionar-comprovantes', linha)">
          Comprovantes<span v-if="linha.totalComprovantes"> ({{ linha.totalComprovantes }})</span>
        </v-btn>
      </div>
    </article>

    <div v-if="!linhas.length" class="lista-vendas__vazio">
      <v-icon icon="mdi-receipt-text-outline" size="36" />
      <strong>Nenhuma venda encontrada</strong>
      <span>Ajuste os filtros e atualize a consulta.</span>
    </div>
  </section>
</template>

<style scoped>
.lista-vendas { display: grid; overflow: hidden; border: 1px solid var(--cx-line); border-radius: 16px; background: var(--cx-surface-raised); color: var(--cx-ink); }
.lista-vendas__cabecalho, .lista-vendas__linha { display: grid; grid-template-columns: minmax(210px, 1.45fr) minmax(145px, .9fr) minmax(210px, 1.1fr) minmax(110px, .6fr) minmax(148px, auto); gap: 16px; align-items: center; padding: 14px 18px; }
.lista-vendas__cabecalho { border-bottom: 1px solid var(--cx-line); background: var(--cx-surface-sunken); color: var(--cx-ink-soft); font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
.lista-vendas__linha { min-width: 0; border-bottom: 1px solid var(--cx-line); }
.lista-vendas__linha:last-of-type { border-bottom: 0; }
.lista-vendas__venda, .lista-vendas__contexto, .lista-vendas__pagamento { display: grid; min-width: 0; gap: 4px; }
.lista-vendas__venda strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.lista-vendas__data, .lista-vendas__contexto small { color: var(--cx-ink-soft); font-size: 12px; }
.lista-vendas__ordem { display: inline-flex; align-items: center; gap: 2px; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.lista-vendas__ordem:hover { color: var(--cx-ink); text-decoration: underline; }
.lista-vendas__contexto > span { font-size: 13px; font-weight: 700; }
.lista-vendas__pagamento { font-size: 12px; }
.lista-vendas__valor { justify-self: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lista-vendas__acoes { display: flex; justify-content: flex-end; align-items: center; gap: 2px; }
.lista-vendas__vazio { display: grid; justify-items: center; gap: 8px; padding: 52px 16px; color: var(--cx-ink-soft); text-align: center; }
.lista-vendas__vazio strong { color: var(--cx-ink); }
@media (width <= 1024px) { .lista-vendas__cabecalho, .lista-vendas__linha { grid-template-columns: minmax(200px, 1.35fr) minmax(130px, .8fr) minmax(180px, 1fr) 105px minmax(130px, auto); gap: 10px; padding-inline: 14px; } }
@media (width <= 768px) { .lista-vendas { gap: 8px; padding: 8px; border: 0; border-radius: 0; background: transparent; } .lista-vendas__cabecalho { display: none; } .lista-vendas__linha { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "venda valor" "contexto contexto" "pagamento pagamento" "acoes acoes"; gap: 8px 12px; padding: 14px; border: 1px solid var(--cx-line); border-radius: 12px; background: var(--cx-surface-raised); } .lista-vendas__venda { grid-area: venda; } .lista-vendas__contexto { grid-area: contexto; } .lista-vendas__pagamento { grid-area: pagamento; } .lista-vendas__valor { grid-area: valor; align-self: start; } .lista-vendas__acoes { grid-area: acoes; justify-content: flex-start; margin-top: 2px; } }
@media (width <= 390px) { .lista-vendas__linha { padding: 12px; } .lista-vendas__acoes { display: grid; grid-template-columns: 1fr 1fr; } .lista-vendas__acoes :deep(.v-btn) { min-width: 0; padding-inline: 5px; } }
</style>
