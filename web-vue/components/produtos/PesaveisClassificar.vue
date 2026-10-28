<script setup lang="ts">
/** Card "Classificar pesável · quem ainda não tem valor" (oficial `manutencao`): TNP e LI, respeita o cadastro. */
import { usePesavelBackfill } from "~/composables/usePesaveis";
import PesaveisConfirmar from "~/components/produtos/PesaveisConfirmar.vue";

const props = defineProps<{ empresaId: string }>();
const acao = usePesavelBackfill(toRef(props, "empresaId"));
const { previa, confirmacao, conferindo, gravando, erro, sucesso, fraseOk, bloqueado, manterCadastro } = acao;
const numero = (valor: number) => valor.toLocaleString("pt-BR");
</script>

<template>
  <v-card variant="outlined" class="pa-4 pesaveis-card">
    <h2>Classificar pesável · quem ainda não tem valor</h2>
    <p>
      O que o cadastro já diz fica como está. Quem não tem valor recebe o que o de-para do SIA diz, inclusive tecla e
      validade; sem nenhum dos dois, fica <strong>não pesável</strong> (tecla 0, validade 0).
    </p>
    <v-checkbox
      v-model="manterCadastro"
      label="Quando cadastro e de-para discordam, manter o cadastro e corrigir o de-para"
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
          <strong class="cx-num">{{ numero(previa.gravar) }}</strong> recebem valor de
          {{ numero(previa.totalProdutos) }}
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.porOrigem.espelho) }}</strong> pelo de-para do SIA
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.porOrigem.padrao) }}</strong> como não pesável
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.completarBalanca) }}</strong> pesáveis completados
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.jaDefinidos) }}</strong> já definidos
        </li>
      </ul>
      <ul v-if="previa.amostraPesaveis.length" class="pesaveis-card__lista">
        <li v-for="item in previa.amostraPesaveis" :key="item.codigoInterno">
          {{ item.codigoInterno }} · {{ item.nome }} · {{ item.validadeDias }} dia(s)
        </li>
      </ul>
      <p v-if="previa.espelhoCorrigir.length" class="pesaveis-card__lista">
        De-para corrigido pelo cadastro ({{ previa.espelhoCorrigir.length }}):
        {{ previa.espelhoCorrigir.map((c) => `${c.codigoInterno} → ${c.pesavel}`).join(", ") }}
      </p>
      <p v-if="previa.espelhoIncompleto.length" class="pesaveis-card__lista">
        De-para diz S sem tecla ou validade — ficam de fora: {{ previa.espelhoIncompleto.join(", ") }}
      </p>
      <v-alert v-if="bloqueado" type="error" variant="tonal">
        <div v-if="previa.conflitos.length">
          Cadastro e de-para discordam ({{ previa.conflitos.length }}):
          {{ previa.conflitos.map((c) => `${c.codigoInterno} (${c.cadastro} × ${c.espelho})`).join(", ") }}
        </div>
        <div v-if="previa.espelhoAmbiguo.length">De-para ambíguo: {{ previa.espelhoAmbiguo.join(", ") }}</div>
      </v-alert>
      <PesaveisConfirmar
        v-else
        v-model="confirmacao"
        :frase="previa.confirmacao"
        rotulo="Classificar pesável"
        :habilitado="fraseOk"
        :gravando="gravando"
        @gravar="acao.gravar"
      />
    </template>
  </v-card>
</template>

<style scoped src="./pesaveis-card.css"></style>
