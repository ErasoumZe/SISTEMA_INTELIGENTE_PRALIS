<script setup lang="ts">
// R-232 · substitui a antiga etapa "Resumo": ao entrar no fechamento, um popup rapido confirma o gerente responsavel.
// E o mesmo da abertura? Confirma. Nao e? Digita o nome. O responsavel pelo caixa e quem abriu (R-226), nao muda.
import { computed, ref, watch } from "vue";

type Fechamento = { caixaResponsavelNome: string; supervisorResponsavelNome: string };

const props = defineProps<{ modelValue: boolean; fechamento: Fechamento }>();
const emit = defineEmits<{ (event: "confirmado"): void }>();

const trocando = ref(false);
const nomeNovo = ref("");
const gerenteAtual = computed(() => props.fechamento.supervisorResponsavelNome.trim());
// Caixa antigo, sem nome de quem abriu: o responsavel tambem precisa ser informado aqui.
const faltaResponsavel = computed(() => !props.fechamento.caixaResponsavelNome.trim());
const responsavelNovo = ref("");
const podeConfirmar = computed(
  () =>
    (!faltaResponsavel.value || responsavelNovo.value.trim().length > 1) &&
    (trocando.value || !gerenteAtual.value ? nomeNovo.value.trim().length > 1 : true)
);

watch(
  () => props.modelValue,
  (aberto) => {
    if (!aberto) return;
    trocando.value = !gerenteAtual.value;
    nomeNovo.value = "";
    responsavelNovo.value = "";
  },
  { immediate: true }
);

function confirmar() {
  if (!podeConfirmar.value) return;
  if (trocando.value || !gerenteAtual.value) props.fechamento.supervisorResponsavelNome = nomeNovo.value.trim();
  if (faltaResponsavel.value) props.fechamento.caixaResponsavelNome = responsavelNovo.value.trim();
  emit("confirmado");
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="440" persistent aria-labelledby="gerente-fechamento-titulo">
    <v-card rounded="lg" data-teste="popup-gerente-fechamento">
      <v-card-title id="gerente-fechamento-titulo" class="text-wrap">Gerente responsável pelo fechamento</v-card-title>
      <v-card-text>
        <template v-if="gerenteAtual && !trocando">
          <p class="mb-2">O gerente que vai conferir e fechar o malote é:</p>
          <p class="gerente__nome">{{ gerenteAtual }}</p>
        </template>
        <v-text-field
          v-else
          v-model="nomeNovo"
          label="Nome do gerente responsável"
          prepend-inner-icon="mdi-account-supervisor-outline"
          autofocus
          data-teste="popup-gerente-nome"
          @keydown.enter="confirmar"
        />
        <v-text-field
          v-if="faltaResponsavel"
          v-model="responsavelNovo"
          label="Responsável pelo caixa"
          prepend-inner-icon="mdi-account-cash-outline"
          hint="Este caixa não registrou quem abriu."
          persistent-hint
          class="mt-2"
          data-teste="popup-gerente-responsavel"
        />
      </v-card-text>
      <v-card-actions class="gerente__acoes">
        <v-btn
          v-if="gerenteAtual && !trocando"
          variant="outlined"
          size="large"
          data-teste="popup-gerente-trocar"
          @click="trocando = true"
          >Não, é outro</v-btn
        >
        <v-spacer />
        <v-btn
          color="success"
          variant="flat"
          size="large"
          :disabled="!podeConfirmar"
          data-teste="popup-gerente-confirmar"
          @click="confirmar"
        >
          {{ gerenteAtual && !trocando ? "Sim, confirmar" : "Confirmar" }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.gerente__nome {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
}
.gerente__acoes {
  padding: 0 16px 16px;
  gap: 8px;
}
</style>
