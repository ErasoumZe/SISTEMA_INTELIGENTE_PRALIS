<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{ error: NuxtError }>();

const titulo = computed(() => {
  if (props.error.statusCode === 404) return "Página não encontrada";
  if (props.error.statusCode === 403) return "Sem permissão";
  return "Não foi possível abrir esta página";
});

const mensagem = computed(() => {
  if (props.error.statusCode === 404) return "A rota informada não existe.";
  if (props.error.statusCode === 403) return "Seu usuário não tem permissão para acessar esta página.";
  return props.error.statusMessage || props.error.message || "Tente novamente.";
});

function voltar() {
  void clearError({ redirect: "/entradas" });
}
</script>

<template>
  <v-app>
    <v-main class="min-h-screen panel-bg d-flex align-center justify-center pa-4">
      <v-card max-width="560" width="100%">
        <v-card-title>{{ titulo }}</v-card-title>
        <v-card-text>{{ mensagem }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="voltar">Voltar ao sistema</v-btn>
        </v-card-actions>
      </v-card>
    </v-main>
  </v-app>
</template>
