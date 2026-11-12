<script setup lang="ts">
/* Fechamento cego (R-236, Marco 12/11/2026): o caixa so descobre o resultado DEPOIS de encerrar. Bateu ou sobrou:
   "Tudo certo" (a sobra vai so para a Tesouraria). Faltou: o valor da falta e o campo para explicar, que vai para a
   quebra de caixa. Antes de fechar nada aparece — contar 0 e ver a falta revelaria o esperado da gaveta. */
import { computed, ref, watch } from "vue";
import type { ResultadoFechamento } from "@padaria/shared";
import { useApi } from "~/composables/useApi";
import { dinheiro, mensagemErro } from "~/utils/domain";

const props = defineProps<{ caixaId: string | null }>();
const emit = defineEmits<{ fechar: [] }>();
const { apiGet, apiPost } = useApi();

const resultado = ref<ResultadoFechamento | null>(null);
const erro = ref("");
const explicacao = ref("");
const enviando = ref(false);
const enviada = ref(false);
const aberto = computed(() => Boolean(props.caixaId));
const explicacaoValida = computed(() => explicacao.value.trim().length >= 5);

watch(
  () => props.caixaId,
  async (id) => {
    resultado.value = null;
    erro.value = "";
    explicacao.value = "";
    enviada.value = false;
    if (!id) return;
    try {
      resultado.value = await apiGet<ResultadoFechamento>(`/api/caixa/${encodeURIComponent(id)}/resultado-fechamento`);
    } catch (falha) {
      erro.value = mensagemErro(falha);
    }
  },
  { immediate: true }
);

async function enviarExplicacao() {
  if (!props.caixaId || !explicacaoValida.value || enviando.value) return;
  enviando.value = true;
  erro.value = "";
  try {
    resultado.value = await apiPost<ResultadoFechamento>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/explicar-falta`,
      { observacao: explicacao.value.trim() }
    );
    enviada.value = true;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <v-dialog :model-value="aberto" max-width="460" persistent>
    <v-card class="resultado-fechamento" data-teste="resultado-fechamento">
      <v-card-text class="pa-6">
        <v-progress-linear v-if="!resultado && !erro" indeterminate aria-label="Carregando o resultado do fechamento" />
        <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

        <template v-if="resultado?.resultado === 'tudo_certo'">
          <v-icon icon="mdi-check-circle" color="success" size="48" class="mb-2" />
          <h2 class="text-h6 mb-1">Tudo certo</h2>
          <p class="mb-0">Caixa encerrado e enviado à Tesouraria.</p>
        </template>

        <template v-else-if="resultado?.resultado === 'falta'">
          <v-icon icon="mdi-alert-circle" color="error" size="48" class="mb-2" />
          <h2 class="text-h6 mb-1">Falta de {{ dinheiro(resultado.falta ?? 0) }}</h2>
          <p>A falta virou quebra de caixa e a Tesouraria foi avisada.</p>
          <template v-if="resultado.explicacaoPendente">
            <v-textarea
              v-model="explicacao"
              label="Explique o que aconteceu"
              rows="3"
              auto-grow
              counter="1000"
              maxlength="1000"
              :messages="explicacaoValida ? '' : 'Escreva pelo menos 5 letras.'"
            />
          </template>
          <v-alert v-else type="success" variant="tonal" density="compact">
            {{ enviada ? "Explicação enviada à Tesouraria." : "A explicação já foi enviada." }}
          </v-alert>
        </template>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <template v-if="resultado?.resultado === 'falta' && resultado.explicacaoPendente">
          <v-btn variant="text" :disabled="enviando" @click="emit('fechar')">Explicar depois</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="enviando"
            :disabled="!explicacaoValida"
            @click="enviarExplicacao"
          >
            Enviar explicação
          </v-btn>
        </template>
        <v-btn v-else color="primary" variant="flat" @click="emit('fechar')">Ok</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
