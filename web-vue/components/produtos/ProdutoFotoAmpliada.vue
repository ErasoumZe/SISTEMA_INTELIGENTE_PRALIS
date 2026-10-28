<script setup lang="ts">
/** Foto do card ampliada (paralelo `index.vue`). O endereco ja e o object URL baixado pelo card. */
const props = defineProps<{ foto: { endereco: string; nome: string } | null }>();
const emit = defineEmits<{ fechar: [] }>();

const aberto = computed({
  get: () => Boolean(props.foto),
  set: (valor: boolean) => {
    if (!valor) emit("fechar");
  }
});
</script>

<template>
  <v-dialog v-model="aberto" max-width="760">
    <v-card v-if="foto">
      <v-card-title class="d-flex align-center ga-2">
        <span class="text-truncate">{{ foto.nome }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" aria-label="Fechar foto" @click="emit('fechar')" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-2 pa-sm-4">
        <img :src="foto.endereco" :alt="`Foto ampliada de ${foto.nome}`" class="foto-ampliada" />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.foto-ampliada {
  display: block;
  width: 100%;
  max-height: 72vh;
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  object-fit: contain;
}
</style>
