<script setup lang="ts">
/**
 * Cartao "Promocao" da LOJA, so para revenda (paralelo P:1134-1167): uma promocao, sem validade.
 * Promocoes a mais ou com validade cadastradas antes sao PRESERVADAS (aviso, nunca apagadas).
 */
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import ProdutoCartao from "~/components/produtos/ProdutoCartao.vue";
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";
import {
  aplicarTipoDePromocao,
  temPromocaoLegada,
  tipoDaPromocao,
  type TipoDePromocaoNaTela
} from "~/utils/produto-promocao";

const props = defineProps<{
  form: ProdutoForm;
  errosDePromocao: string[];
  somenteLeitura: boolean;
}>();

const DIAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];

const tipo = computed<TipoDePromocaoNaTela>({
  get: () => tipoDaPromocao(props.form.promocoes),
  set: (novo) => aplicarTipoDePromocao(props.form.promocoes, novo)
});
const promo = computed(() => props.form.promocoes[0]);
const legada = computed(() => temPromocaoLegada(props.form.promocoes));
</script>

<template>
  <ProdutoCartao titulo="Promoção" subtitulo="Condições e período de oferta" icone="mdi-tag-outline">
    <v-alert v-if="legada" type="warning" variant="tonal" density="compact">
      Este produto tem {{ form.promocoes.length }} promoção(ões) cadastrada(s) antes, com mais de uma ou com validade. A
      tela edita só a primeira; as demais e a validade são mantidas como estão ao salvar.
    </v-alert>
    <v-alert v-if="errosDePromocao.length" type="warning" variant="tonal" density="compact">
      <div v-for="mensagem in errosDePromocao" :key="mensagem">{{ mensagem }}</div>
    </v-alert>

    <v-btn-toggle
      v-model="tipo"
      mandatory
      color="primary"
      divided
      variant="outlined"
      density="comfortable"
      :disabled="somenteLeitura"
    >
      <v-btn value="nenhum">Sem promoção</v-btn>
      <v-btn value="valor">Valor fixo</v-btn>
      <v-btn value="desconto">Desconto %</v-btn>
    </v-btn-toggle>

    <v-row v-if="promo" dense>
      <v-col v-if="promo.tipo === 'valor'" cols="6" sm="4">
        <CampoDinheiro v-model="promo.valor" label="Valor promo" :disabled="somenteLeitura" />
      </v-col>
      <v-col v-else cols="6" sm="4">
        <v-text-field
          v-model="promo.descontoPercentual"
          type="number"
          min="0"
          max="100"
          label="Desconto %"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field v-model="promo.horaInicio" type="time" label="Início" :disabled="somenteLeitura" />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field v-model="promo.horaFim" type="time" label="Término" :disabled="somenteLeitura" />
      </v-col>
      <v-col cols="12">
        <div class="text-caption mb-1">Dias da semana</div>
        <div class="d-flex flex-wrap ga-3">
          <v-checkbox
            v-for="(dia, posicao) in DIAS"
            :key="dia"
            v-model="promo.dias[posicao]"
            :label="dia"
            density="compact"
            hide-details
            color="primary"
            :disabled="somenteLeitura"
          />
        </div>
      </v-col>
    </v-row>
  </ProdutoCartao>
</template>
