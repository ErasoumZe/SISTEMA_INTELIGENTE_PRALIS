<script setup lang="ts">
import type { EstoqueMovimentoDto, ProdutoEstoqueDto } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  empresaId: string;
  produtos: ProdutoEstoqueDto[];
  produtoInicial: ProdutoEstoqueDto | null;
}>();
const { apiGet } = useApi();
const movimentos = ref<EstoqueMovimentoDto[]>([]);
const carregando = ref(false);
const erro = ref("");
const filtros = reactive({ produtoId: "", localEstoque: "", dataInicio: "", dataFim: "" });

const locais = computed(() =>
  [
    ...new Set(props.produtos.map((produto) => produto.localEstoque).filter((local): local is string => Boolean(local)))
  ].sort()
);

function inicioDoDiaIso(data: string) {
  return data ? new Date(`${data}T00:00:00`).toISOString() : "";
}
function diaSeguinteIso(data: string) {
  if (!data) return "";
  const fim = new Date(`${data}T00:00:00`);
  fim.setDate(fim.getDate() + 1);
  return fim.toISOString();
}
async function carregar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const query = new URLSearchParams({ empresaId: props.empresaId });
    if (filtros.produtoId) query.set("produtoId", filtros.produtoId);
    if (filtros.localEstoque) query.set("localEstoque", filtros.localEstoque);
    if (filtros.dataInicio) query.set("dataInicio", inicioDoDiaIso(filtros.dataInicio));
    if (filtros.dataFim) query.set("dataFim", diaSeguinteIso(filtros.dataFim));
    movimentos.value = await apiGet<EstoqueMovimentoDto[]>(`/api/compras/estoque/movimentos?${query}`);
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    carregando.value = false;
  }
}
watch(aberto, (valor) => {
  if (!valor) return;
  filtros.produtoId = props.produtoInicial?.id ?? "";
  filtros.localEstoque = props.produtoInicial?.localEstoque ?? "";
  filtros.dataInicio = "";
  filtros.dataFim = "";
  void carregar();
});
</script>

<template>
  <v-dialog v-model="aberto" max-width="1100" scrollable>
    <v-card>
      <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2">
        <span>Extrato auditável de estoque</span>
        <v-chip size="small" variant="tonal">{{ movimentos.length }} movimento(s)</v-chip>
      </v-card-title>
      <v-card-text class="d-grid ga-3">
        <v-row dense>
          <v-col cols="12" md="4">
            <v-select
              v-model="filtros.produtoId"
              :items="produtos"
              item-title="descricao"
              item-value="id"
              label="Produto"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="4" md="3">
            <v-select v-model="filtros.localEstoque" :items="locais" label="Local de estoque" clearable hide-details />
          </v-col>
          <v-col cols="6" sm="3" md="2"
            ><v-text-field v-model="filtros.dataInicio" type="date" label="De" hide-details
          /></v-col>
          <v-col cols="6" sm="3" md="2"
            ><v-text-field v-model="filtros.dataFim" type="date" label="Até" hide-details
          /></v-col>
          <v-col cols="12" sm="2" md="1" class="d-flex align-center"
            ><v-btn block color="primary" :loading="carregando" @click="carregar">Filtrar</v-btn></v-col
          >
        </v-row>
        <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
        <div class="d-none d-md-block">
          <v-table density="compact">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Produto / pedido</th>
                <th>Conferente</th>
                <th class="text-right">Entrada</th>
                <th class="text-right">Saldo anterior</th>
                <th class="text-right">Saldo posterior</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!carregando && !movimentos.length">
                <td colspan="6" class="text-center text-medium-emphasis py-8">Nenhum movimento encontrado.</td>
              </tr>
              <tr v-for="movimento in movimentos" :key="movimento.id">
                <td>{{ new Date(movimento.recebidoEm).toLocaleString("pt-BR") }}</td>
                <td>
                  <div class="font-weight-medium">{{ movimento.produtoDescricao }}</div>
                  <div class="text-caption">
                    Pedido {{ movimento.pedidoId.slice(0, 8) }} · {{ movimento.localEstoque ?? "Sem local" }}
                  </div>
                </td>
                <td>{{ movimento.recebidoPorNome }}</td>
                <td class="text-right text-success font-weight-bold">+{{ movimento.quantidade }}</td>
                <td class="text-right">{{ movimento.saldoAnterior }}</td>
                <td class="text-right font-weight-bold">{{ movimento.saldoPosterior }}</td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <div class="d-md-none d-grid ga-2">
          <v-card v-for="movimento in movimentos" :key="movimento.id" variant="outlined">
            <v-card-text class="d-grid ga-2">
              <div class="d-flex justify-space-between ga-2">
                <strong>{{ movimento.produtoDescricao }}</strong
                ><span class="text-success font-weight-bold">+{{ movimento.quantidade }}</span>
              </div>
              <div class="text-caption">
                {{ new Date(movimento.recebidoEm).toLocaleString("pt-BR") }} · {{ movimento.recebidoPorNome }}
              </div>
              <div class="d-flex justify-space-between text-body-2">
                <span>Saldo</span><span>{{ movimento.saldoAnterior }} → {{ movimento.saldoPosterior }}</span>
              </div>
              <div class="text-caption">
                Pedido {{ movimento.pedidoId.slice(0, 8) }} · {{ movimento.localEstoque ?? "Sem local" }}
              </div>
            </v-card-text>
          </v-card>
          <div v-if="!carregando && !movimentos.length" class="text-center text-medium-emphasis py-6">
            Nenhum movimento encontrado.
          </div>
        </div>
      </v-card-text>
      <v-card-actions><v-spacer /><v-btn variant="text" @click="aberto = false">Fechar</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
</template>
