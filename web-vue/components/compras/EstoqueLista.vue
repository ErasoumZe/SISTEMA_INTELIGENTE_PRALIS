<script setup lang="ts">
import type { ProdutoEstoqueDto } from "@padaria/shared";

defineProps<{ produtos: ProdutoEstoqueDto[] }>();

function numero(valor: string | null) {
  return Number(valor ?? 0);
}
function situacao(produto: ProdutoEstoqueDto) {
  if (produto.estoqueMin !== null && numero(produto.quantidadeEstoque) <= numero(produto.estoqueMin)) {
    return { texto: "No mínimo", cor: "warning" };
  }
  if (produto.estoqueMax !== null && numero(produto.quantidadeEstoque) >= numero(produto.estoqueMax)) {
    return { texto: "No máximo", cor: "info" };
  }
  return { texto: "Regular", cor: "success" };
}
</script>

<template>
  <div class="d-none d-md-block">
    <v-table density="comfortable">
      <thead>
        <tr>
          <th>Produto</th>
          <th>Classificação</th>
          <th>Localização</th>
          <th class="text-right">Saldo</th>
          <th class="text-right">Mín./máx.</th>
          <th>Situação</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!produtos.length">
          <td colspan="6" class="text-center text-medium-emphasis py-8">Nenhum produto encontrado.</td>
        </tr>
        <tr v-for="produto in produtos" :key="produto.id">
          <td>
            <div class="font-weight-medium">{{ produto.descricao }}</div>
            <div class="text-caption text-medium-emphasis">{{ produto.grupo ?? "Sem grupo" }}</div>
          </td>
          <td>
            <v-chip v-if="produto.curvaAbc" size="x-small" label>{{ produto.curvaAbc }}</v-chip
            ><span v-else class="text-medium-emphasis">Sem ABC</span>
          </td>
          <td>
            <div>{{ produto.areaEstoque ?? "Sem área" }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ produto.localEstoque ?? "Sem local" }} · {{ produto.localVenda.join(", ") || "Sem venda" }}
            </div>
          </td>
          <td class="text-right font-weight-bold">{{ produto.quantidadeEstoque }}</td>
          <td class="text-right">{{ produto.estoqueMin ?? "—" }} / {{ produto.estoqueMax ?? "—" }}</td>
          <td>
            <v-chip :color="situacao(produto).cor" size="small" label>{{ situacao(produto).texto }}</v-chip>
          </td>
        </tr>
      </tbody>
    </v-table>
  </div>
  <div class="d-md-none d-grid ga-3">
    <v-card v-if="!produtos.length" variant="tonal"
      ><v-card-text class="text-center text-medium-emphasis">Nenhum produto encontrado.</v-card-text></v-card
    >
    <v-card v-for="produto in produtos" :key="produto.id" variant="outlined">
      <v-card-text class="d-grid ga-2">
        <div class="d-flex justify-space-between ga-2">
          <div>
            <div class="font-weight-bold">{{ produto.descricao }}</div>
            <div class="text-caption text-medium-emphasis">{{ produto.grupo ?? "Sem grupo" }}</div>
          </div>
          <v-chip :color="situacao(produto).cor" size="small" label>{{ situacao(produto).texto }}</v-chip>
        </div>
        <div class="d-flex justify-space-between">
          <span class="text-body-2">Saldo disponível</span><strong>{{ produto.quantidadeEstoque }}</strong>
        </div>
        <div class="d-flex justify-space-between text-body-2">
          <span>Mínimo / máximo</span><span>{{ produto.estoqueMin ?? "—" }} / {{ produto.estoqueMax ?? "—" }}</span>
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ produto.areaEstoque ?? "Sem área" }} · {{ produto.localEstoque ?? "Sem local" }} ·
          {{ produto.localVenda.join(", ") || "Sem local de venda" }}
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>
