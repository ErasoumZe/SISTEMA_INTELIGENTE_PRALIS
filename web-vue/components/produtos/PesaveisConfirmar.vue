<script setup lang="ts">
/** Frase de confirmacao + botao de gravar, comum as acoes de pesavel (a previa ja foi conferida). */
defineProps<{ frase: string; rotulo: string; habilitado: boolean; gravando: boolean }>();
const confirmacao = defineModel<string>({ required: true });
defineEmits<{ gravar: [] }>();
</script>

<template>
  <div class="pesaveis-confirmar">
    <v-text-field v-model="confirmacao" :label="`Digite: ${frase}`" hide-details />
    <v-btn
      color="primary"
      prepend-icon="mdi-content-save-outline"
      :disabled="!habilitado"
      :loading="gravando"
      @click="$emit('gravar')"
    >
      {{ rotulo }}
    </v-btn>
  </div>
</template>

<style scoped>
.pesaveis-confirmar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-3);
  align-items: center;
}
.pesaveis-confirmar .v-text-field {
  flex: 1 1 280px;
}
</style>
