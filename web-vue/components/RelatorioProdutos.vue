<script setup lang="ts">
import { dinheiro, mensagemErro } from "~/utils/domain";

const props = defineProps<{ empresaId: string }>();
const { apiGet } = useApi();

const carregando = ref(false);
const erro = ref("");
const produtos = ref<Array<{ produto: string; quantidade: number; valorTotal: number }>>([]);

async function carregar() {
  if (!props.empresaId || carregando.value) return;
  carregando.value = true;
  erro.value = "";
  try {
    produtos.value = await apiGet(`/api/vendas/produtos-mais-vendidos?empresaId=${props.empresaId}`);
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

watch(
  () => props.empresaId,
  () => {
    produtos.value = [];
    void carregar();
  },
  { immediate: true }
);
</script>

<template>
  <v-card>
    <v-card-title>
      <div class="text-h6">Produtos mais vendidos</div>
      <div class="text-body-2 text-muted">Relatorio permitido para caixa e gerente.</div>
    </v-card-title>
    <v-card-text>
      <v-alert v-if="erro" type="error" variant="tonal" class="mb-3">{{ erro }}</v-alert>
      <div class="responsive-table-shell">
        <v-table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Quantidade</th>
            <th class="text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in produtos" :key="item.produto">
            <td>{{ item.produto }}</td>
            <td>{{ item.quantidade }}</td>
            <td class="text-right">{{ dinheiro(item.valorTotal) }}</td>
          </tr>
          <tr v-if="!produtos.length">
            <td colspan="3" class="text-center text-muted py-8">
              {{ carregando ? "Carregando..." : "Nenhum produto encontrado." }}
            </td>
          </tr>
        </tbody>
        </v-table>
      </div>
    </v-card-text>
  </v-card>
</template>
