<script setup lang="ts">
/** Conversoes de unidade da LOJA (so o ERP tem). A mesma unidade nao pode aparecer duas vezes. */
import ProdutoCartao from "~/components/produtos/ProdutoCartao.vue";
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";

const props = defineProps<{
  form: ProdutoForm;
  unidades: Array<{ id: string; sigla: string; nome: string }>;
  erros: Record<string, string>;
  somenteLeitura: boolean;
  dica: (campo: string) => string | undefined;
}>();

function adicionar() {
  props.form.conversoes.push({ unidadeMedidaId: "", quantidade: "1", unidadesIndividuais: "1" });
}
function remover(indice: number) {
  props.form.conversoes.splice(indice, 1);
}
</script>

<template>
  <ProdutoCartao titulo="Conversões de unidade" icone="mdi-swap-horizontal">
    <template #cabecalho>
      <v-btn v-if="!somenteLeitura" size="small" variant="tonal" prepend-icon="mdi-plus" @click="adicionar">
        Adicionar
      </v-btn>
    </template>
    <v-alert v-if="erros['conversoes']" type="warning" variant="tonal" density="compact">
      {{ erros["conversoes"] }}
    </v-alert>

    <v-row v-for="(conversao, indice) in form.conversoes" :key="`conv-${indice}`" dense align="center">
      <v-col cols="12" sm="4">
        <v-select
          v-model="conversao.unidadeMedidaId"
          :items="unidades"
          item-title="sigla"
          item-value="id"
          label="Unidade"
          :hint="dica('conversoes')"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="6" sm="3">
        <v-text-field
          v-model="conversao.quantidade"
          type="number"
          min="0"
          label="Quantidade"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="6" sm="3">
        <v-text-field
          v-model="conversao.unidadesIndividuais"
          type="number"
          min="0"
          label="Unidades individuais"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col v-if="!somenteLeitura" cols="12" sm="2">
        <v-btn size="small" variant="text" prepend-icon="mdi-delete-outline" @click="remover(indice)">Remover</v-btn>
      </v-col>
    </v-row>
    <p v-if="!form.conversoes.length" class="text-caption ma-0">Sem conversão cadastrada.</p>
  </ProdutoCartao>
</template>
