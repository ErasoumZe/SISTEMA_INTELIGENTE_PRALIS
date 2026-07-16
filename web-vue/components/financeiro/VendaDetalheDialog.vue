<script setup lang="ts">
import { computed } from "vue";
import type { Opcao } from "~/types/padaria";
import type { OperacaoDetalhe } from "~/utils/operacoes";
import { dinheiro } from "~/utils/domain";

const props = defineProps<{
  aberto: boolean;
  detalhe: OperacaoDetalhe | null;
  carregando?: boolean;
  formasPagamento?: Opcao[];
}>();

const emit = defineEmits<{ (event: "update:aberto", valor: boolean): void }>();

function nomeForma(formaPagamentoId: string | null): string {
  if (!formaPagamentoId) return "Nao informado";
  return props.formasPagamento?.find((forma) => forma.id === formaPagamentoId)?.nome ?? "Forma removida";
}

const itens = computed(() => props.detalhe?.itensVenda ?? []);
const pagamentos = computed(() => props.detalhe?.tiposPagamento ?? []);
const totalVenda = computed(() => Number(props.detalhe?.valorOriginal ?? 0));
</script>

<template>
  <v-dialog :model-value="aberto" max-width="720" scrollable @update:model-value="emit('update:aberto', $event)">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-receipt-text-outline" />
        Detalhe da venda
        <span v-if="detalhe" class="text-body-2 text-medium-emphasis">{{ detalhe.descricao }}</span>
      </v-card-title>
      <v-divider />
      <v-card-text>
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
              <div v-if="!pagamentos.length" class="text-body-2 text-medium-emphasis">Nao informado</div>
            </div>
            <div class="text-right">
              <div class="text-caption text-medium-emphasis">Total da venda</div>
              <div class="text-h5 font-weight-bold">{{ dinheiro(totalVenda) }}</div>
            </div>
          </div>
        </template>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:aberto', false)">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
