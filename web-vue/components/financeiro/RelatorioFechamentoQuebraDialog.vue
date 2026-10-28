<script setup lang="ts">
import { computed, ref, watch } from "vue";

type Resultado = "conferido" | "divergente";

// Popup unico para "Teve quebra" (nova decisao) e "Alterar status" (revisao de uma decisao ja tomada). O motivo
// e obrigatorio em ambos; quem chama a API e o pai (aqui so se escreve o motivo e se confirma).
const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{ resultado: Resultado; revisao: boolean; enviando: boolean; erro: string }>();
const emit = defineEmits<{ (event: "confirmar", observacao: string): void }>();

const observacao = ref("");
const erroLocal = ref("");

// Cada abertura comeca com o campo limpo: o motivo da conferencia anterior nao pode vazar para a proxima.
watch(aberto, (valor) => {
  if (valor) {
    observacao.value = "";
    erroLocal.value = "";
  }
});

const titulo = computed(() => (props.revisao ? "Alterar status da conferência" : "Registrar quebra"));
const rotuloMotivo = computed(() => (props.revisao ? "Motivo da alteração" : "O que aconteceu (motivo da quebra)"));
const rotuloAcao = computed(() => (props.revisao ? "Alterar status" : "Registrar quebra"));
const novoStatus = computed(() => (props.resultado === "conferido" ? "Conferido" : "Quebra / divergência"));
const statusAnterior = computed(() => (props.resultado === "conferido" ? "Quebra / divergência" : "Conferido"));

function confirmar() {
  const motivo = observacao.value.trim();
  if (!motivo) {
    erroLocal.value = props.revisao ? "Informe o motivo da alteração de status." : "Informe o motivo da quebra.";
    return;
  }
  erroLocal.value = "";
  emit("confirmar", motivo);
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="520" scrollable>
    <v-card data-teste="dialogo-quebra">
      <v-card-title>{{ titulo }}</v-card-title>
      <v-card-text>
        <p v-if="revisao" class="mb-3">
          O status passa de <strong>{{ statusAnterior }}</strong> para <strong>{{ novoStatus }}</strong
          >. A decisão anterior continua no histórico e os valores financeiros não mudam.
        </p>
        <p v-else class="mb-3">
          Descreva a quebra que a Tesouraria encontrou. Este registro avisa a quebra, não altera os valores financeiros
          e fica no histórico.
        </p>
        <v-textarea
          v-model="observacao"
          :label="rotuloMotivo"
          auto-grow
          counter="1000"
          maxlength="1000"
          :error-messages="erroLocal || erro"
        />
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" class="quebra__botao" :disabled="enviando" @click="aberto = false">Voltar</v-btn>
        <v-btn
          color="deep-orange"
          variant="flat"
          class="quebra__botao"
          :loading="enviando"
          data-teste="confirmar-quebra"
          @click="confirmar"
          >{{ rotuloAcao }}</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.quebra__botao {
  min-height: 44px;
}
</style>
