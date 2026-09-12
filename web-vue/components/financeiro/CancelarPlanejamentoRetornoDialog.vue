<script setup lang="ts">
import { ref, watch } from "vue";
import type { OperacaoResumo } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    operacao: OperacaoResumo | null;
    salvando?: boolean;
  }>(),
  { salvando: false }
);

const emit = defineEmits<{
  (event: "update:modelValue", valor: boolean): void;
  (
    event: "confirmar",
    payload: { planejamentoId: string; motivo: string; aoConcluir: (sucesso: boolean) => void }
  ): void;
}>();

const motivo = ref("");
const erro = ref("");

watch(
  () => props.modelValue,
  (aberto) => {
    if (aberto) {
      motivo.value = "";
      erro.value = "";
    }
  }
);

function fechar() {
  if (props.salvando) return;
  emit("update:modelValue", false);
}

function confirmar() {
  const texto = motivo.value.trim();
  if (!props.operacao || props.salvando) return;
  if (!texto) {
    erro.value = "Informe o motivo do cancelamento para a auditoria.";
    return;
  }
  emit("confirmar", {
    planejamentoId: props.operacao.id,
    motivo: texto,
    aoConcluir: (sucesso: boolean) => {
      if (sucesso) emit("update:modelValue", false);
    }
  });
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="520" @update:model-value="(valor) => !valor && fechar()">
    <v-card title="Cancelar transferência de retorno">
      <v-card-text>
        O planejamento não será apagado. O motivo, o responsável e o horário ficarão registrados na auditoria.
        <div v-if="operacao" class="mt-4" data-teste="resumo-cancelamento-planejamento">
          <strong>{{ dinheiro(Number(operacao.valorOriginal)) }}</strong> · lacre {{ operacao.nLacreDoc || "—" }} ·
          destino {{ operacao.contaDestinoNome || "não informado" }}
        </div>
        <v-textarea
          v-model="motivo"
          class="mt-4"
          label="Motivo do cancelamento"
          :error-messages="erro ? [erro] : []"
          maxlength="500"
          autofocus
          data-teste="motivo-cancelamento-planejamento"
          @update:model-value="erro = ''"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="salvando" @click="fechar">Voltar</v-btn>
        <v-btn color="error" :loading="salvando" data-teste="confirmar-cancelamento" @click="confirmar">
          Cancelar planejamento
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
