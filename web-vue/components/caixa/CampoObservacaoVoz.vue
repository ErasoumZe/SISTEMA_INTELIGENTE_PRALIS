<script setup lang="ts">
import { ref } from "vue";
import AppLogoAnimada from "~/components/app/AppLogoAnimada.vue";
import { useTranscricaoVoz } from "~/composables/useTranscricaoVoz";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label?: string;
    error?: boolean;
    messages?: string;
    dataTeste?: string;
  }>(),
  {
    label: "Observação do fechamento",
    error: false,
    messages: "",
    dataTeste: "observacao-fechamento"
  }
);

const emit = defineEmits<{ (event: "update:modelValue", value: string): void }>();

const aberto = ref(false);
let textoInicial = "";
const {
  cancelar: descartarGravacao,
  erro,
  gravacaoDisponivel,
  iniciar,
  logoGlow,
  logoSpeed,
  nivelVoz,
  ouvindo,
  parar,
  preparar,
  temTexto,
  textoEditavel,
  textoReconhecido,
  transcrevendo
} = useTranscricaoVoz();

function abrir() {
  aberto.value = true;
  textoInicial = props.modelValue;
  preparar(textoInicial);
}

function cancelar() {
  descartarGravacao();
  emit("update:modelValue", textoInicial);
  aberto.value = false;
}

function usarTranscricao() {
  const texto = textoReconhecido.value.trim();
  if (texto) emit("update:modelValue", texto);
  descartarGravacao();
  aberto.value = false;
}
</script>

<template>
  <div class="campo-observacao-voz">
    <v-textarea
      :model-value="modelValue"
      :label="label"
      :error="error"
      :messages="messages"
      rows="1"
      auto-grow
      max-rows="3"
      variant="outlined"
      :data-teste="dataTeste"
      append-inner-icon="mdi-microphone-outline"
      @update:model-value="emit('update:modelValue', $event)"
      @click:append-inner="abrir"
    />

    <v-dialog v-model="aberto" max-width="480" width="calc(100% - 24px)" persistent>
      <v-card class="observacao-voz-dialog">
        <v-card-title class="d-flex align-center justify-space-between ga-3">
          <span>Falar observação</span>
          <v-btn icon="mdi-close" variant="text" aria-label="Fechar transcrição" @click="cancelar" />
        </v-card-title>
        <v-card-subtitle>Toque na logo e fale. Revise a transcrição antes de enviar ao tesoureiro.</v-card-subtitle>

        <v-card-text>
          <button
            type="button"
            class="voz-orbe"
            :class="{ 'voz-orbe--ouvindo': ouvindo }"
            :style="{ '--voz-nivel': nivelVoz }"
            :disabled="ouvindo || transcrevendo || !gravacaoDisponivel"
            :aria-label="ouvindo ? 'Gravação em andamento' : 'Iniciar transcrição por voz'"
            @click="iniciar"
          >
            <div class="voz-orbe__halo" />
            <AppLogoAnimada :size="142" :glow-intensity="logoGlow" :speed="logoSpeed" />
          </button>
          <div class="voz-status" aria-live="polite">
            <span v-if="transcrevendo">Transcrevendo sua observação…</span>
            <span v-else-if="ouvindo">Ouvindo… fale normalmente</span>
            <span v-else-if="erro" class="text-error">{{ erro }}</span>
            <span v-else>Toque na logo para começar a falar</span>
          </div>

          <v-textarea
            v-model="textoEditavel"
            class="mt-4"
            label="Transcrição"
            placeholder="A transcrição aparecerá aqui…"
            rows="4"
            auto-grow
            max-rows="8"
            variant="outlined"
            :disabled="ouvindo"
            aria-live="polite"
          />

          <v-alert v-if="!gravacaoDisponivel" type="info" variant="tonal" density="compact" class="mt-3">
            Seu navegador não permite gravar áudio. Use Chrome, Edge ou Safari atualizado e permita o microfone.
          </v-alert>
        </v-card-text>

        <v-card-actions class="flex-wrap ga-2 px-4 pb-4">
          <v-btn v-if="ouvindo" color="error" prepend-icon="mdi-stop" @click="parar">Parar gravação</v-btn>
          <span v-else-if="transcrevendo" class="text-medium-emphasis text-caption">Enviando áudio com segurança…</span>
          <v-spacer />
          <v-btn variant="text" @click="cancelar">Cancelar</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :disabled="!temTexto || ouvindo || transcrevendo"
            @click="usarTranscricao"
          >
            Usar texto
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.campo-observacao-voz :deep(.v-field__append-inner .v-icon) {
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
}

.observacao-voz-dialog {
  overflow: hidden;
}

.voz-orbe {
  position: relative;
  display: grid;
  width: 184px;
  height: 184px;
  margin: 4px auto 10px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  appearance: none;
  background: radial-gradient(circle, rgb(var(--v-theme-primary), 0.1), transparent 64%);
  cursor: pointer;
  transition:
    transform 180ms ease,
    filter 180ms ease;
}

.voz-orbe:not(:disabled):hover,
.voz-orbe:not(:disabled):focus-visible {
  filter: brightness(1.12);
  outline: none;
  transform: scale(1.035);
}

.voz-orbe:focus-visible {
  box-shadow: 0 0 0 3px rgb(var(--v-theme-primary), 0.42);
}

.voz-orbe:disabled {
  cursor: default;
}

.voz-orbe__halo {
  position: absolute;
  inset: 12px;
  border: 1px solid rgb(var(--v-theme-primary), 0.34);
  border-radius: 50%;
  opacity: calc(0.4 + var(--voz-nivel) * 0.6);
  transform: scale(calc(0.88 + var(--voz-nivel) * 0.26));
  transition:
    transform 100ms ease,
    opacity 100ms ease;
}

.voz-orbe--ouvindo .voz-orbe__halo {
  box-shadow:
    0 0 0 12px rgb(var(--v-theme-primary), 0.07),
    0 0 42px rgb(var(--v-theme-primary), 0.38);
  animation: voz-respira 1.7s ease-in-out infinite;
}

.voz-status {
  min-height: 22px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  text-align: center;
  font-size: 0.88rem;
}

@media (max-width: 480px) {
  .voz-orbe {
    width: 164px;
    height: 164px;
  }

  .observacao-voz-dialog :deep(.v-card-title) {
    font-size: 1.05rem;
  }

  .observacao-voz-dialog :deep(.v-card-actions) {
    align-items: stretch;
  }

  .observacao-voz-dialog :deep(.v-card-actions .v-btn) {
    min-width: 0;
  }
}

@keyframes voz-respira {
  50% {
    transform: scale(1.06);
  }
}

@media (prefers-reduced-motion: reduce) {
  .voz-orbe,
  .voz-orbe__halo {
    animation: none;
    transition: none;
  }
}
</style>
