<script setup lang="ts">
import type { VendaCanceladaCaixa } from "@padaria/shared";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";

const props = defineProps<{ aberto: boolean; caixaId: string }>();
const emit = defineEmits<{ (event: "update:aberto", valor: boolean): void }>();
const { apiGet } = useApi();

const vendas = ref<VendaCanceladaCaixa[]>([]);
const carregando = ref(false);
const erro = ref("");
let consultaAtual = 0;

const dialogAberto = computed({
  get: () => props.aberto,
  set: (aberto: boolean) => emit("update:aberto", aberto)
});

function dataVenda(venda: VendaCanceladaCaixa) {
  return venda.dataHora ? formatarDataHora(venda.dataHora) : formatarDataSomenteDia(venda.data);
}

async function carregar() {
  const consulta = ++consultaAtual;
  carregando.value = true;
  erro.value = "";
  try {
    const resposta = await apiGet<VendaCanceladaCaixa[]>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/vendas-canceladas`
    );
    if (consulta !== consultaAtual) return;
    vendas.value = resposta;
  } catch (falha) {
    if (consulta !== consultaAtual) return;
    erro.value = mensagemErro(falha);
  } finally {
    if (consulta === consultaAtual) carregando.value = false;
  }
}

watch(
  () => [props.aberto, props.caixaId] as const,
  ([aberto]) => {
    if (aberto) void carregar();
  },
  { immediate: true }
);
</script>

<template>
  <v-dialog v-model="dialogAberto" max-width="820" persistent no-click-animation>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between ga-2">
        <span>Vendas canceladas</span>
        <v-btn icon="mdi-close" variant="text" aria-label="Fechar vendas canceladas" @click="dialogAberto = false" />
      </v-card-title>
      <v-card-subtitle>Auditoria: estas vendas não entram nos totais nem no saldo do caixa.</v-card-subtitle>

      <v-card-text>
        <v-progress-linear v-if="carregando" indeterminate color="primary" class="mb-4" />
        <v-alert v-else-if="erro" type="error" density="compact">{{ erro }}</v-alert>
        <v-alert v-else-if="!vendas.length" type="info" variant="tonal">
          Nenhuma venda cancelada foi vinculada a este caixa.
        </v-alert>

        <v-expansion-panels v-else variant="accordion">
          <v-expansion-panel v-for="venda in vendas" :key="venda.id">
            <v-expansion-panel-title>
              <div class="d-flex align-center ga-3 flex-grow-1 min-width-0">
                <div class="flex-grow-1 min-width-0">
                  <div class="text-body-2 font-weight-bold text-truncate">{{ venda.descricao }}</div>
                  <div class="text-caption text-medium-emphasis">
                    {{ dataVenda(venda) }}
                    <template v-if="venda.identificadorExterno"> · {{ venda.identificadorExterno }}</template>
                  </div>
                </div>
                <strong class="text-no-wrap">{{ dinheiro(venda.valor) }}</strong>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-alert
                v-if="venda.canceladoPor || venda.justificativaCancelamento || venda.motivoCancelamento"
                type="warning"
                variant="tonal"
                density="compact"
                class="mb-4"
                data-teste="auditoria-cancelamento-creare"
              >
                <div><strong>Cancelamento no CREARE</strong></div>
                <div><strong>Autorizado por:</strong> {{ venda.canceladoPor ?? "Não informado" }}</div>
                <div><strong>Motivo:</strong> {{ venda.motivoCancelamento ?? "Não informado" }}</div>
                <div><strong>Justificativa:</strong> {{ venda.justificativaCancelamento ?? "Não informada" }}</div>
              </v-alert>
              <div class="text-subtitle-2 mb-2">Forma de pagamento</div>
              <div v-if="venda.pagamentos.length" class="d-flex flex-wrap ga-2 mb-4">
                <v-chip v-for="pagamento in venda.pagamentos" :key="pagamento.id" size="small" variant="tonal">
                  {{ pagamento.formaPagamento }}: {{ dinheiro(pagamento.valor) }}
                </v-chip>
              </div>
              <p v-else class="text-body-2 text-medium-emphasis mb-4">
                Forma de pagamento não informada pelo CREARE.
              </p>
              <div class="text-subtitle-2 mb-2">Produtos da venda</div>
              <v-table v-if="venda.produtos.length" density="compact">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th class="text-end">Qtd.</th>
                    <th class="text-end">Unitário</th>
                    <th class="text-end">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="produto in venda.produtos" :key="produto.id">
                    <td>
                      {{ produto.descricao }}
                      <v-chip v-if="produto.cancelado" size="x-small" variant="tonal" class="ml-2">Cancelado</v-chip>
                    </td>
                    <td class="text-end">{{ produto.quantidade }}</td>
                    <td class="text-end">{{ dinheiro(produto.valorUnitario) }}</td>
                    <td class="text-end">{{ dinheiro(produto.valorTotal) }}</td>
                  </tr>
                </tbody>
              </v-table>
              <p v-else class="text-body-2 text-medium-emphasis mb-0">Esta venda não possui produtos registrados.</p>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>

      <v-card-actions class="px-6 pb-5"
        ><v-spacer /><v-btn color="primary" @click="dialogAberto = false">Fechar</v-btn></v-card-actions
      >
    </v-card>
  </v-dialog>
</template>
