<script setup lang="ts">
/**
 * Campos de estoque que so o ERP tem (o paralelo nao tem) e que so a LOJA grava: estoque atual
 * (leitura — muda por movimentacao), area, curva ABC, vendido por peso e tolerancia. Na BASE nao
 * aparecem, porque la nao salvam (decisao D4).
 */
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";

const props = defineProps<{
  form: ProdutoForm;
  somenteLeitura: boolean;
  dica: (campo: string) => string | undefined;
}>();

// Desligar "vendido por peso" limpa a tolerancia: o que esta na tela e o que vai para o banco.
watch(
  () => props.form.quantidadeVariavel,
  (variavel) => {
    if (!variavel) props.form.toleranciaQuantidadePercentual = "";
  }
);
</script>

<template>
  <v-row dense>
    <v-col cols="6" sm="3">
      <v-text-field
        :model-value="form.quantidadeEstoque"
        label="Estoque atual"
        readonly
        class="cx-num cartao__previa"
        :hint="dica('quantidadeEstoque')"
      />
    </v-col>
    <v-col cols="6" sm="3">
      <v-text-field v-model="form.areaEstoque" label="Área" :disabled="somenteLeitura" />
    </v-col>
    <v-col cols="12" sm="6">
      <v-select
        v-model="form.curvaAbc"
        :items="['A', 'B', 'C']"
        label="Curva ABC"
        clearable
        :disabled="somenteLeitura"
      />
    </v-col>
    <v-col cols="12" sm="6" class="d-flex align-center">
      <v-switch
        v-model="form.quantidadeVariavel"
        color="primary"
        inset
        hide-details
        label="Produto vendido por peso"
        :disabled="somenteLeitura"
      />
    </v-col>
    <v-col cols="12" sm="6">
      <v-text-field
        v-model="form.toleranciaQuantidadePercentual"
        type="number"
        min="0"
        max="30"
        step="0.01"
        label="Tolerância na separação"
        suffix="%"
        :disabled="somenteLeitura || !form.quantidadeVariavel"
        hint="Fora desta faixa, a quantidade efetiva exigirá aprovação."
        persistent-hint
      />
    </v-col>
  </v-row>
</template>
