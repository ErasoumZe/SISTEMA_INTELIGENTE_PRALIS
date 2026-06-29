<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{ error: NuxtError }>();

const titulo = computed(() => {
  if (props.error.statusCode === 404) return "Pagina nao encontrada";
  if (props.error.statusCode === 403) return "Sem permissao";
  return "Nao foi possivel abrir esta pagina";
});

const mensagem = computed(() => {
  if (props.error.statusCode === 404) return "A rota informada nao existe.";
  if (props.error.statusCode === 403) return "Seu usuario nao tem permissao para acessar esta pagina.";
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
