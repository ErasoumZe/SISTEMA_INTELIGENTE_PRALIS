<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type EventoInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const promptPendente = ref<EventoInstalacao | null>(null);
const mostrarInstrucoesIos = ref(false);
const instalado = ref(false);
const emIos = computed(() => /iphone|ipad|ipod/i.test(navigator.userAgent));

function aoSurgirPrompt(event: Event) {
  event.preventDefault();
  promptPendente.value = event as EventoInstalacao;
}

async function instalar() {
  if (promptPendente.value) {
    await promptPendente.value.prompt();
    const escolha = await promptPendente.value.userChoice;
    if (escolha.outcome === "accepted") instalado.value = true;
    promptPendente.value = null;
    return;
  }
  if (emIos.value) mostrarInstrucoesIos.value = true;
}

onMounted(() => {
  instalado.value =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  window.addEventListener("beforeinstallprompt", aoSurgirPrompt);
  window.addEventListener("appinstalled", () => (instalado.value = true), { once: true });
});
onBeforeUnmount(() => window.removeEventListener("beforeinstallprompt", aoSurgirPrompt));
</script>

<template>
  <div v-if="!instalado" class="pwa-instalar">
    <v-btn size="small" variant="tonal" class="pwa-instalar-botao" prepend-icon="mdi-cellphone-arrow-down" @click="instalar">
      Adicionar aplicativo
    </v-btn>
    <p v-if="mostrarInstrucoesIos" class="pwa-instalar-ajuda" role="status">
      No Safari, toque em Compartilhar e depois em <strong>Adicionar à Tela de Início</strong>.
    </p>
  </div>
</template>

<style scoped>
.pwa-instalar { display: grid; justify-items: center; gap: 8px; margin-top: 14px; }
.pwa-instalar-botao { color: #fff; background: color-mix(in srgb, #0e111a 72%, #7543e8 28%); border: 1px solid color-mix(in srgb, #d9c9ff 45%, transparent); box-shadow: inset 0 1px rgb(255 255 255 / 18%), 0 8px 24px rgb(38 12 94 / 28%); }
.pwa-instalar-ajuda { max-width: 300px; margin: 0; color: rgb(239 232 255 / 85%); font-size: .75rem; line-height: 1.35; text-align: center; }
</style>
