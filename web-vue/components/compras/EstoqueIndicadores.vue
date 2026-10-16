<script setup lang="ts">
import type { ProdutoEstoqueDto } from "@padaria/shared";

const props = defineProps<{ produtos: ProdutoEstoqueDto[] }>();

function numero(valor: string | null) {
  return Number(valor ?? 0);
}

const abaixoDoMinimo = computed(() =>
  props.produtos.filter(
    (produto) => produto.estoqueMin !== null && numero(produto.quantidadeEstoque) <= numero(produto.estoqueMin)
  )
);
const semLimiteConfigurado = computed(
  () => props.produtos.filter((produto) => produto.estoqueMin === null || produto.estoqueMax === null).length
);
const sugestoesPossiveis = computed(
  () =>
    abaixoDoMinimo.value.filter(
      (produto) => produto.estoqueMax !== null && numero(produto.estoqueMax) > numero(produto.quantidadeEstoque)
    ).length
);

const indicadores = computed(() => [
  {
    titulo: "Produtos exibidos",
    valor: props.produtos.length,
    texto: "de acordo com os filtros atuais",
    icone: "mdi-package-variant",
    cor: "primary"
  },
  {
    titulo: "No mínimo",
    valor: abaixoDoMinimo.value.length,
    texto: "pedem revisão de reposição",
    icone: "mdi-alert-circle-outline",
    cor: "warning"
  },
  {
    titulo: "Sugestões possíveis",
    valor: sugestoesPossiveis.value,
    texto: "podem completar até o máximo",
    icone: "mdi-cart-arrow-down",
    cor: "info"
  },
  {
    titulo: "Sem faixa definida",
    valor: semLimiteConfigurado.value,
    texto: "cadastre mínimo e máximo",
    icone: "mdi-tune-variant",
    cor: "secondary"
  }
]);
</script>

<template>
  <v-row dense>
    <v-col v-for="indicador in indicadores" :key="indicador.titulo" cols="6" md="3">
      <v-card class="h-100" variant="tonal" :color="indicador.cor">
        <v-card-text class="d-flex ga-3 align-center">
          <v-avatar :color="indicador.cor" size="38"><v-icon :icon="indicador.icone" /></v-avatar>
          <div>
            <div class="text-h6 font-weight-bold">{{ indicador.valor }}</div>
            <div class="text-body-2 font-weight-medium">{{ indicador.titulo }}</div>
            <div class="text-caption text-medium-emphasis">{{ indicador.texto }}</div>
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>
