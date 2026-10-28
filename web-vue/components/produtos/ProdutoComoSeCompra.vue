<script setup lang="ts">
/** "Como se compra" (paralelo P:897-939): embalagem e unidade de compra, com as listas fixas. */
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";
import { EMBALAGENS, MEDIDAS_COMPRA, opcoesComAtual } from "~/utils/produto-listas";

const props = defineProps<{
  form: ProdutoForm;
  comoSeCompraPreview: string;
  travado: boolean;
  dica: (campo: string) => string | undefined;
}>();

const embalagens = computed(() => opcoesComAtual(EMBALAGENS, props.form.embalagem));
const medidasCompra = computed(() => opcoesComAtual(MEDIDAS_COMPRA, props.form.medidaCompra));
</script>

<template>
  <div class="cartao__subtitulo"><strong>Como se compra</strong><span>Embalagem e unidade de compra</span></div>
  <v-row dense>
    <v-col cols="6" sm="3">
      <v-select
        v-model="form.embalagem"
        :items="embalagens"
        label="Embalagem"
        clearable
        :hint="dica('embalagem')"
        :disabled="travado"
      />
    </v-col>
    <v-col cols="6" sm="3">
      <v-select v-model="form.cDe" :items="['C/', 'DE']" label="C/DE" :hint="dica('cDe')" :disabled="travado" />
    </v-col>
    <v-col cols="6" sm="3">
      <v-text-field
        v-model="form.quantidadeCaixa"
        type="number"
        min="1"
        label="Qt. embalagem"
        :hint="dica('quantidadeCaixa')"
        :disabled="travado"
      />
    </v-col>
    <v-col cols="6" sm="3">
      <v-select
        v-model="form.medidaCompra"
        :items="medidasCompra"
        label="Medida de compra"
        clearable
        :hint="dica('medidaCompra')"
        :disabled="travado"
      />
    </v-col>
    <v-col cols="12" sm="3">
      <v-select
        v-model="form.compraAproximada"
        :items="[
          { title: 'Exato', value: false },
          { title: 'Aproximado', value: true }
        ]"
        label="Quantidade da embalagem"
        :hint="dica('compraAproximada')"
        :disabled="travado"
      />
    </v-col>
    <v-col cols="12">
      <!-- O texto inteiro fica no title (aparece ao passar o mouse), como no paralelo. -->
      <v-text-field
        :model-value="comoSeCompraPreview"
        :title="comoSeCompraPreview"
        label="Como se compra (automático)"
        readonly
        placeholder="Preencha a embalagem para gerar"
        class="cartao__previa"
      />
    </v-col>
  </v-row>
</template>
