<script setup lang="ts">
defineProps<{
  aberto: boolean;
  titulo: string;
  mensagem: string;
  textoConfirmar: string;
}>();

const emit = defineEmits<{
  (event: "responder", confirmou: boolean): void;
}>();
</script>

<template>
  <v-dialog :model-value="aberto" max-width="460" persistent no-click-animation>
    <v-card>
      <v-card-title>{{ titulo }}</v-card-title>
      <v-card-text class="confirmacao-dialog__mensagem">{{ mensagem }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('responder', false)">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" @click="emit('responder', true)">{{ textoConfirmar }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.confirmacao-dialog__mensagem {
  white-space: pre-line;
}
</style>
