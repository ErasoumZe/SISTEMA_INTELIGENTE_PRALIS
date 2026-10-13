<script setup lang="ts">
import { dinheiro } from "~/utils/domain";

const props = defineProps<{
  aberto: boolean;
  titulo: string;
  icone: string;
  valor: number;
  detalhe?: string;
  tom?: string;
}>();

const emit = defineEmits<{ (event: "update:aberto", valor: boolean): void }>();

const dialogAberto = computed({
  get: () => props.aberto,
  set: (valor: boolean) => emit("update:aberto", valor)
});
</script>

<template>
  <v-dialog v-model="dialogAberto" max-width="420" width="calc(100% - 24px)" scrollable>
    <v-card class="categoria-resumo-dialog" :style="{ '--categoria-resumo-cor': tom ?? 'var(--cx-focus)' }">
      <v-card-title class="d-flex align-center justify-space-between ga-2">
        <span class="d-flex align-center ga-2 min-width-0">
          <v-icon :icon="icone" class="categoria-resumo-dialog__icone" size="20" />
          <span class="text-truncate">{{ titulo }}</span>
        </span>
        <v-btn
          class="categoria-resumo-dialog__fechar"
          icon="mdi-close"
          variant="text"
          aria-label="Fechar resumo"
          @click="dialogAberto = false"
        />
      </v-card-title>
      <v-card-text>
        <div class="categoria-resumo-dialog__valor">{{ dinheiro(valor) }}</div>
        <p class="text-body-2 text-medium-emphasis mb-0">
          {{ detalhe || "Valor registrado no turno atual." }}
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn class="categoria-resumo-dialog__acao" variant="text" @click="dialogAberto = false">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.categoria-resumo-dialog__valor {
  color: var(--categoria-resumo-cor);
  font-size: 1.8rem;
  font-weight: 800;
  line-height: 1.15;
}
.categoria-resumo-dialog {
  border-top: 4px solid var(--categoria-resumo-cor);
}
.categoria-resumo-dialog__icone,
.categoria-resumo-dialog__fechar,
.categoria-resumo-dialog__acao {
  color: var(--categoria-resumo-cor);
}
</style>
