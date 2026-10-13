<script setup lang="ts">
const props = defineProps<{ aberto: boolean; pdvNome: string; salvando: boolean; erro?: string }>();
const emit = defineEmits<{ (event: "update:aberto", value: boolean): void; (event: "confirmar"): void }>();
</script>

<template>
  <v-dialog :model-value="aberto" max-width="620" persistent>
    <v-card>
      <v-card-title class="caixa-inicio-fechamento__cabecalho"
        ><v-icon icon="mdi-lock-clock-outline" />Confirmar encerramento das vendas</v-card-title
      >
      <v-card-text class="pt-5">
        <v-alert type="warning" variant="tonal" class="mb-4"
          >Ao confirmar, o PDV <strong>{{ pdvNome }}</strong> para de receber vendas neste caixa no horário do
          servidor.</v-alert
        >
        <p class="mb-3">
          Você seguirá para a conferência final na Tesouraria. Depois desta confirmação, não será possível voltar ao
          caixa aberto nem incluir novas vendas neste turno.
        </p>
        <p class="text-body-2 mb-0">Confirme somente quando a última venda já tiver passado no PDV.</p>
        <v-alert v-if="erro" type="error" variant="tonal" class="mt-4">{{ erro }}</v-alert>
      </v-card-text>
      <v-card-actions class="caixa-inicio-fechamento__acoes px-6 pb-5"
        ><v-spacer /><v-btn
          color="success"
          variant="flat"
          :disabled="salvando"
          prepend-icon="mdi-arrow-left"
          @click="emit('update:aberto', false)"
          >Voltar ao caixa</v-btn
        ><v-btn
          color="error"
          variant="flat"
          :loading="salvando"
          prepend-icon="mdi-cash-register"
          @click="emit('confirmar')"
          >Encerrar vendas e ir para conferência</v-btn
        ></v-card-actions
      >
    </v-card>
  </v-dialog>
</template>

<style scoped>
.caixa-inicio-fechamento__cabecalho {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  background: #6d28d9;
  font-weight: 800;
}
.caixa-inicio-fechamento__acoes {
  gap: 10px;
}
.caixa-inicio-fechamento__acoes :deep(.v-btn) {
  min-height: 42px;
  font-weight: 800;
  letter-spacing: 0.03em;
}
@media (max-width: 600px) {
  .caixa-inicio-fechamento__acoes {
    display: grid;
    grid-template-columns: 1fr;
    padding: 16px !important;
  }
  .caixa-inicio-fechamento__acoes :deep(.v-spacer) {
    display: none;
  }
  .caixa-inicio-fechamento__acoes :deep(.v-btn) {
    width: 100%;
    min-height: 48px;
    font-size: 0.76rem;
  }
}
</style>
