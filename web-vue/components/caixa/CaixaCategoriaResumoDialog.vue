<script setup lang="ts">
import { dinheiro } from "~/utils/domain";

const props = defineProps<{
  aberto: boolean;
  titulo: string;
  icone: string;
  valor: number;
  detalhe?: string;
}>();

const emit = defineEmits<{ (event: "update:aberto", valor: boolean): void }>();

const dialogAberto = computed({
  get: () => props.aberto,
  set: (valor: boolean) => emit("update:aberto", valor)
});
</script>

<template>
  <v-dialog v-model="dialogAberto" max-width="420" width="calc(100% - 24px)" scrollable>
    <v-card class="categoria-resumo-dialog">
      <v-card-title class="d-flex align-center justify-space-between ga-2">
        <span class="d-flex align-center ga-2 min-width-0">
          <v-icon :icon="icone" color="primary" size="20" />
          <span class="text-truncate">{{ titulo }}</span>
        </span>
        <v-btn icon="mdi-close" variant="text" aria-label="Fechar resumo" @click="dialogAberto = false" />
      </v-card-title>
      <v-card-text>
        <div class="categoria-resumo-dialog__valor">{{ dinheiro(valor) }}</div>
        <p class="text-body-2 text-medium-emphasis mb-0">
          {{ detalhe || "Valor registrado no turno atual." }}
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" variant="text" @click="dialogAberto = false">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.categoria-resumo-dialog__valor {
  color: rgb(var(--v-theme-primary));
  font-size: 1.8rem;
  font-weight: 800;
  line-height: 1.15;
}
</style>
