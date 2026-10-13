<script setup lang="ts">
type EventoInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const eventoInstalacao = ref<EventoInstalacao | null>(null);

function guardarEvento(evento: Event) {
  evento.preventDefault();
  eventoInstalacao.value = evento as EventoInstalacao;
}

async function instalar() {
  const evento = eventoInstalacao.value;
  if (!evento) return;
  await evento.prompt();
  const escolha = await evento.userChoice;
  if (escolha.outcome === "accepted") eventoInstalacao.value = null;
}

onMounted(() => window.addEventListener("beforeinstallprompt", guardarEvento));
onBeforeUnmount(() => window.removeEventListener("beforeinstallprompt", guardarEvento));
</script>

<template>
  <v-btn
    v-if="eventoInstalacao"
    variant="text"
    size="small"
    prepend-icon="mdi-download-outline"
    aria-label="Instalar aplicativo"
    @click="instalar"
  >
    Instalar aplicativo
  </v-btn>
</template>
