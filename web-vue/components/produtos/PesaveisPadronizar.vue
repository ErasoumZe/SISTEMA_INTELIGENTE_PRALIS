<script setup lang="ts">
/** Card "Todos os ativos pesáveis · S, tecla 000, validade 5" (oficial `manutencao`): sobrescreve o cadastro. */
import { usePesavelPadronizar } from "~/composables/usePesaveis";
import PesaveisConfirmar from "~/components/produtos/PesaveisConfirmar.vue";

const props = defineProps<{ empresaId: string }>();
const acao = usePesavelPadronizar(toRef(props, "empresaId"));
const { previa, confirmacao, conferindo, gravando, erro, sucesso, fraseOk, barrasPropriasPesaveis } = acao;
const numero = (valor: number) => valor.toLocaleString("pt-BR");
</script>

<template>
  <v-card variant="outlined" class="pa-4 pesaveis-card">
    <h2>Todos os ativos pesáveis · S, tecla 000, validade 5</h2>
    <p>
      Todo produto ativo da loja vira pesável, tecla 000 e 5 dias, e o de-para do SIA acompanha.
      <strong>Sobrescreve</strong> quem já dizia não pesável — depois a edição continua livre em cada produto.
    </p>
    <v-checkbox
      v-model="barrasPropriasPesaveis"
      label="Também quem tem código de barras próprio (a balança não aceita código acima de 999999)"
      density="compact"
      hide-details
    />
    <div>
      <v-btn variant="tonal" prepend-icon="mdi-clipboard-check-outline" :loading="conferindo" @click="acao.conferir">
        Conferir sem gravar
      </v-btn>
    </div>
    <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
    <v-alert v-if="sucesso" type="success" variant="tonal">{{ sucesso }}</v-alert>

    <template v-if="previa">
      <ul class="pesaveis-card__numeros">
        <li>
          <strong class="cx-num">{{ numero(previa.gravar) }}</strong> mudam de {{ numero(previa.totalAtivos) }} ativos
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.invertidos) }}</strong> trocam de lado
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.paraS) }}</strong> viram pesáveis · {{ numero(previa.paraN) }} não
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.espelhoCorrigir) }}</strong> linhas do de-para mudam
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.barrasProprias) }}</strong> com barras próprias
        </li>
      </ul>
      <p v-if="previa.amostraInvertidos.length" class="pesaveis-card__lista">
        Diziam não pesável: {{ previa.amostraInvertidos.map((i) => `${i.codigoInterno} ${i.nome}`).join(" · ") }}
      </p>
      <p v-if="previa.amostraNaoPesaveis.length" class="pesaveis-card__lista">
        Ficam não pesáveis (barras próprias):
        {{ previa.amostraNaoPesaveis.map((i) => `${i.codigoInterno} ${i.nome}`).join(" · ") }}
      </p>
      <v-alert type="warning" variant="tonal" density="compact">
        {{ numero(previa.invertidos) }} produto(s) que diziam o contrário vão mudar de lado.
      </v-alert>
      <PesaveisConfirmar
        v-model="confirmacao"
        :frase="previa.confirmacao"
        rotulo="Padronizar pesáveis"
        :habilitado="fraseOk"
        :gravando="gravando"
        @gravar="acao.gravar"
      />
    </template>
  </v-card>
</template>

<style scoped src="./pesaveis-card.css"></style>
