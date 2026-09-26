<script setup lang="ts">
import type { OperacaoResumo } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataSomenteDia, formatarHora } from "~/utils/formatacao";

const props = defineProps<{
  modelValue: boolean;
  venda: OperacaoResumo | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const aberto = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value)
});

function nomePagamento(pagamento: NonNullable<OperacaoResumo["pagamentos"]>[number]) {
  return pagamento.formaPagamentoNome?.trim() || pagamento.tipoPagamentoAutomacao?.trim() || "Sem forma";
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="840" persistent no-click-animation>
    <v-card v-if="venda">
      <v-card-title class="d-flex align-center justify-space-between ga-2">
        <span>Detalhes da venda</span>
        <v-btn icon="mdi-close" variant="text" aria-label="Fechar detalhes" @click="aberto = false" />
      </v-card-title>
      <v-card-subtitle>
        {{ venda.descricao }}
        <span class="text-caption text-medium-emphasis ml-2">{{ venda.id }}</span>
      </v-card-subtitle>

      <v-card-text>
        <v-row dense class="mb-2">
          <v-col cols="12" sm="4"><strong>Data:</strong> {{ formatarDataSomenteDia(venda.dataReferencia) }}</v-col>
          <v-col cols="12" sm="4"><strong>Hora:</strong> {{ formatarHora(venda.dataVenda) }}</v-col>
          <v-col cols="12" sm="4"><strong>Status:</strong> {{ venda.status }}</v-col>
          <v-col cols="12" sm="4"><strong>PDV:</strong> {{ venda.pdvNome ?? "-" }}</v-col>
          <v-col cols="12" sm="4"><strong>Cliente:</strong> {{ venda.clienteNome ?? "-" }}</v-col>
          <v-col cols="12" sm="4"><strong>Colaborador:</strong> {{ venda.colaboradorNome ?? "-" }}</v-col>
          <v-col cols="12" sm="4"><strong>Subtotal:</strong> {{ dinheiro(venda.valorOriginal) }}</v-col>
          <v-col cols="12" sm="4"><strong>Desconto:</strong> {{ dinheiro(venda.valorDesconto ?? 0) }}</v-col>
          <v-col cols="12" sm="4"><strong>Acréscimo:</strong> {{ dinheiro(venda.valorAcrescimo ?? 0) }}</v-col>
          <v-col cols="12" sm="4"
            ><strong>Total líquido:</strong> {{ dinheiro(venda.valorLiquido ?? venda.valorOriginal) }}</v-col
          >
          <v-col cols="12" sm="4"><strong>Data de pagamento:</strong> {{ venda.dataPagamento ?? "-" }}</v-col>
        </v-row>

        <v-alert v-if="venda.status === 'cancelado'" type="warning" variant="tonal" class="mb-4" data-teste="auditoria-cancelamento-creare">
          <div><strong>Cancelamento no CREARE</strong></div>
          <div><strong>Autorizado por:</strong> {{ venda.cancelamentoAutorizadoPorAutomacao ?? "Não informado" }}</div>
          <div><strong>Motivo:</strong> {{ venda.cancelamentoMotivo ?? "Não informado" }}</div>
          <div><strong>Justificativa:</strong> {{ venda.cancelamentoJustificativa ?? "Não informada" }}</div>
        </v-alert>

        <v-divider class="my-4" />
        <div class="text-subtitle-1 font-weight-bold mb-2">Produtos</div>
        <v-table v-if="venda.itensVenda?.length" density="compact">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Quantidade</th>
              <th>Valor unitário</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in venda.itensVenda"
              :key="`${venda.id}-${item.produtoAutomacaoId ?? item.descricaoProduto}`"
            >
              <td>
                <div>{{ item.descricaoProduto }}</div>
                <div v-if="item.produtoAutomacaoCodigo" class="text-caption text-medium-emphasis">
                  Código: {{ item.produtoAutomacaoCodigo }}
                </div>
              </td>
              <td>{{ item.quantidade }}</td>
              <td>{{ dinheiro(item.valorUnitario) }}</td>
              <td class="text-right">{{ dinheiro(item.valorTotal) }}</td>
            </tr>
          </tbody>
        </v-table>
        <v-alert v-else type="info" variant="tonal">Esta venda não possui produtos registrados.</v-alert>

        <div class="text-subtitle-1 font-weight-bold mt-5 mb-2">Pagamentos</div>
        <v-table v-if="venda.pagamentos?.length" density="compact">
          <thead>
            <tr>
              <th>Forma de pagamento</th>
              <th class="text-right">Valor pago</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pagamento in venda.pagamentos" :key="pagamento.id">
              <td>{{ nomePagamento(pagamento) }}</td>
              <td class="text-right">{{ dinheiro(pagamento.totalPago) }}</td>
            </tr>
          </tbody>
        </v-table>
        <v-alert v-else type="warning" variant="tonal">Esta venda não possui pagamentos registrados.</v-alert>
        <v-chip v-if="(venda.pagamentos?.length ?? 0) > 1" size="small" color="primary" variant="tonal" class="mt-2">
          Venda dividida em {{ venda.pagamentos?.length }} formas de pagamento
        </v-chip>

        <v-alert v-if="venda.observacao" class="mt-4" variant="tonal" type="info">
          <strong>Observação:</strong> {{ venda.observacao }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" @click="aberto = false">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
