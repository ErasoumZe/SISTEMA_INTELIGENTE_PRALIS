<script setup lang="ts">
/**
 * Ficha de transformacao (paralelo P:1047-1068). Editavel tambem na copia da loja (decisao D1:
 * fica fora da trava do que veio da BASE, como no paralelo).
 */
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";
import { UNIDADES_TRANSFORMACAO, opcoesComAtual } from "~/utils/produto-listas";

const props = defineProps<{
  form: ProdutoForm;
  validacaoQtdPreview: string;
  somenteLeitura: boolean;
  dica: (campo: string) => string | undefined;
}>();

const unidades = computed(() => opcoesComAtual(UNIDADES_TRANSFORMACAO, props.form.unidadeTransformacao));
</script>

<template>
  <div class="cartao__subtitulo"><strong>Transformação</strong><span>Quantidade, unidade e receituário</span></div>
  <v-row dense>
    <v-col cols="6" sm="4">
      <v-select
        v-model="form.precisao"
        :items="['EXATOS', 'APROXIMADOS']"
        label="Precisão"
        :hint="dica('precisao')"
        :disabled="somenteLeitura"
      />
    </v-col>
    <v-col cols="6" sm="4">
      <v-text-field
        v-model="form.quantidadeTransformacao"
        type="number"
        min="0"
        label="Quantidade"
        :hint="dica('quantidadeTransformacao')"
        :disabled="somenteLeitura"
      />
    </v-col>
    <v-col cols="12" sm="4">
      <v-select
        v-model="form.unidadeTransformacao"
        :items="unidades"
        label="Unidade"
        :hint="dica('unidadeTransformacao')"
        :disabled="somenteLeitura"
      />
    </v-col>
    <v-col cols="12" sm="6">
      <v-text-field
        v-model="form.produtoReceituario"
        label="Produto receituário"
        :hint="dica('produtoReceituario')"
        :disabled="somenteLeitura"
      />
    </v-col>
    <v-col cols="12" sm="6">
      <v-text-field
        v-model="form.refReceituario"
        label="Ref. receituário"
        :hint="dica('refReceituario')"
        :disabled="somenteLeitura"
      />
    </v-col>
    <v-col cols="12">
      <v-text-field
        :model-value="validacaoQtdPreview"
        label="Validação de quantidade (automática)"
        readonly
        class="cartao__previa"
      />
    </v-col>
  </v-row>
</template>
