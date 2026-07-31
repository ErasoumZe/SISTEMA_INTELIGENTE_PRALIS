<script setup lang="ts">
import { computed } from "vue";
import type { Opcao } from "~/types/padaria";
import type { OperacaoDetalhe } from "~/utils/operacoes";
import { dinheiro } from "~/utils/domain";

// Conteudo do detalhe da venda integrada (itens + formas de pagamento + total). Compartilhado
// entre o dialog (VendaDetalheDialog) e a exibicao inline na lista de Entradas.
const props = defineProps<{
  detalhe: OperacaoDetalhe | null;
  carregando?: boolean;
  formasPagamento?: Opcao[];
}>();

function nomeForma(formaPagamentoId: string | null): string {
  if (!formaPagamentoId) return "Nao informado";
  return props.formasPagamento?.find((forma) => forma.id === formaPagamentoId)?.nome ?? "Forma removida";
}

const itens = computed(() => props.detalhe?.itensVenda ?? []);
const pagamentos = computed(() => props.detalhe?.tiposPagamento ?? []);
const totalVenda = computed(() => Number(props.detalhe?.valorOriginal ?? 0));
</script>

<template>
  <div v-if="carregando" class="text-center py-8">
    <v-progress-circular indeterminate color="primary" />
  </div>
  <template v-else>
    <div class="responsive-table-shell mb-4">
      <v-table density="compact">
        <thead>
          <tr>
            <th>Produto</th>
            <th class="text-right">Qtd</th>
            <th class="text-right">Preco unit.</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, indice) in itens" :key="indice">
            <td>{{ item.descricaoProduto }}</td>
            <td class="text-right">{{ item.quantidade }}</td>
            <td class="text-right">{{ dinheiro(item.valorUnitario) }}</td>
            <td class="text-right">{{ dinheiro(item.valorTotal) }}</td>
          </tr>
          <tr v-if="!itens.length">
            <td colspan="4" class="text-center text-medium-emphasis py-4">Sem itens nesta venda.</td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <div class="d-flex flex-wrap justify-space-between ga-4">
      <div>
        <div class="text-caption text-medium-emphasis mb-1">Formas de pagamento</div>
        <div v-for="(pagamento, indice) in pagamentos" :key="indice" class="text-body-2">
          {{ nomeForma(pagamento.formaPagamentoId) }}: <strong>{{ dinheiro(pagamento.totalPago) }}</strong>
        </div>
        <div v-if="!pagamentos.length" class="text-body-2 text-medium-emphasis">Não informado</div>
      </div>
      <div class="text-right">
        <div class="text-caption text-medium-emphasis">Total da venda</div>
        <div class="text-h5 font-weight-bold">{{ dinheiro(totalVenda) }}</div>
      </div>
    </div>
  </template>
</template>
