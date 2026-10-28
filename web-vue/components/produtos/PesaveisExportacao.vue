<script setup lang="ts">
/** Card "Pesáveis pela exportação do SIA" (oficial `manutencao`): só TNP, casa pelo código interno. */
import { usePesaveisExportacao } from "~/composables/usePesaveis";
import PesaveisConfirmar from "~/components/produtos/PesaveisConfirmar.vue";

const props = defineProps<{ empresaId: string }>();
const acao = usePesaveisExportacao(toRef(props, "empresaId"));
const { arquivo, previa, confirmacao, conferindo, gravando, erro, sucesso, fraseOk, bloqueado } = acao;
const numero = (valor: number) => valor.toLocaleString("pt-BR");
</script>

<template>
  <v-card variant="outlined" class="pa-4 pesaveis-card">
    <h2>Pesáveis pela exportação do SIA · TNP</h2>
    <p>
      O que o SIA marca como <strong>Pesável = S</strong> vira pesável, tecla 000 e a validade do SIA, no produto e no
      de-para. Casa só pelo código interno — nunca por nome ou barras. Envie em <code>.xlsx</code> ou <code>.csv</code>.
    </p>
    <div class="pesaveis-card__envio">
      <v-file-input
        v-model="arquivo"
        label="Exportação do SIA (TNP)"
        accept=".xlsx,.csv"
        prepend-icon=""
        prepend-inner-icon="mdi-file-upload-outline"
        hide-details
      />
      <v-btn
        variant="tonal"
        prepend-icon="mdi-clipboard-check-outline"
        :disabled="!arquivo"
        :loading="conferindo"
        @click="acao.conferir"
      >
        Conferir sem gravar
      </v-btn>
    </div>
    <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
    <v-alert v-if="sucesso" type="success" variant="tonal">{{ sucesso }}</v-alert>

    <template v-if="previa">
      <ul class="pesaveis-card__numeros">
        <li>
          <strong class="cx-num">{{ numero(previa.pesaveisFonte) }}</strong> pesáveis no arquivo ({{
            numero(previa.validadeZero)
          }}
          com validade 0)
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.atualizarProdutos) }}</strong> produtos mudam
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.atualizarEspelhos) }}</strong> linhas do de-para mudam
        </li>
        <li>
          <strong class="cx-num">{{ numero(previa.jaCorretos) }}</strong> já estão certos
        </li>
      </ul>
      <p v-if="previa.semProduto.length" class="pesaveis-card__lista">
        Sem produto na TNP ({{ previa.semProduto.length }}): {{ previa.semProduto.slice(0, 20).join(", ") }}
      </p>
      <p v-if="previa.semEspelho.length" class="pesaveis-card__lista">
        Sem linha no de-para ({{ previa.semEspelho.length }}): {{ previa.semEspelho.slice(0, 20).join(", ") }}
      </p>
      <ul v-if="previa.amostra.length" class="pesaveis-card__lista">
        <li v-for="item in previa.amostra" :key="item.codigoInterno">
          {{ item.codigoInterno }} · {{ item.nome }} · {{ item.validadeDias }} dia(s)
        </li>
      </ul>
      <v-alert v-if="bloqueado" type="error" variant="tonal">
        Códigos ambíguos — corrija os vínculos antes:
        {{ [...previa.codigoAmbiguo, ...previa.espelhoAmbiguo].slice(0, 20).join(", ") }}
      </v-alert>
      <PesaveisConfirmar
        v-else
        v-model="confirmacao"
        :frase="previa.confirmacao"
        rotulo="Atualizar pesáveis"
        :habilitado="fraseOk"
        :gravando="gravando"
        @gravar="acao.gravar"
      />
    </template>
  </v-card>
</template>

<style scoped src="./pesaveis-card.css"></style>
