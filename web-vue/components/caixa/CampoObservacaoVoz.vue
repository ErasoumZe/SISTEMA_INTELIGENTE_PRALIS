<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import AppLogoAnimada from "~/components/app/AppLogoAnimada.vue";

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  isFinal: boolean;
  [index: number]: RecognitionAlternative;
}

interface RecognitionResultList {
  length: number;
  [index: number]: RecognitionResult;
}

interface RecognitionEvent extends Event {
  resultIndex: number;
  results: RecognitionResultList;
}

interface RecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type AudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

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
const ouvindo = ref(false);
const erro = ref("");
const parcial = ref("");
const finais = ref("");
const nivelVoz = ref(0);
const reconhecimentoDisponivel = ref(false);

let reconhecimento: SpeechRecognitionLike | null = null;
let stream: MediaStream | null = null;
let contextoAudio: AudioContext | null = null;
let analisador: AnalyserNode | null = null;
let quadroAudio: number | null = null;
let textoInicial = "";
let reiniciarAoTerminar = false;

const textoReconhecido = computed(() => `${finais.value}${parcial.value}`.trim());
const textoEditavel = computed({
  get: () => textoReconhecido.value,
  set: (value: string) => {
    finais.value = value;
    parcial.value = "";
  }
});

const temTexto = computed(() => textoReconhecido.value.trim().length > 0);
const logoGlow = computed(() => 0.28 + nivelVoz.value * 0.72);

function obterReconhecimento(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const navegador = window as SpeechWindow;
  return navegador.SpeechRecognition ?? navegador.webkitSpeechRecognition ?? null;
}

function limparAudio() {
  if (quadroAudio !== null) cancelAnimationFrame(quadroAudio);
  quadroAudio = null;
  analisador = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (contextoAudio) void contextoAudio.close();
  contextoAudio = null;
  nivelVoz.value = 0;
}

function medirVoz() {
  if (!analisador || !ouvindo.value) {
    nivelVoz.value = 0;
    return;
  }
  const dados = new Uint8Array(analisador.fftSize);
  analisador.getByteTimeDomainData(dados);
  let soma = 0;
  for (const amostra of dados) {
    const distancia = (amostra - 128) / 128;
    soma += distancia * distancia;
  }
  const rms = Math.sqrt(soma / dados.length);
  nivelVoz.value = Math.min(1, rms * 5.5);
  quadroAudio = requestAnimationFrame(medirVoz);
}

async function prepararMedidor() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  const audioWindow = window as AudioWindow;
  const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return;
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  contextoAudio = new AudioContextConstructor();
  const origem = contextoAudio.createMediaStreamSource(stream);
  analisador = contextoAudio.createAnalyser();
  analisador.fftSize = 256;
  origem.connect(analisador);
  await contextoAudio.resume();
  medirVoz();
}

function configurarReconhecimento() {
  const Constructor = obterReconhecimento();
  if (!Constructor) {
    reconhecimentoDisponivel.value = false;
    throw new Error("Este navegador não oferece transcrição de voz. A integração Grok será adicionada depois.");
  }
  reconhecimentoDisponivel.value = true;
  reconhecimento = new Constructor();
  reconhecimento.continuous = true;
  reconhecimento.interimResults = true;
  reconhecimento.lang = "pt-BR";
  reconhecimento.maxAlternatives = 1;
  reconhecimento.onresult = (event) => {
    let finaisNovos = "";
    let parcialNovo = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const resultado = event.results[index];
      if (!resultado) continue;
      const transcricao = resultado[0]?.transcript ?? "";
      if (resultado.isFinal) finaisNovos += `${transcricao.trim()} `;
      else parcialNovo += transcricao;
    }
    finais.value = `${finais.value}${finaisNovos}`;
    parcial.value = parcialNovo;
  };
  reconhecimento.onerror = (event) => {
    if (event.error === "aborted") return;
    erro.value =
      event.error === "not-allowed"
        ? "Permita o acesso ao microfone para transcrever."
        : "Não foi possível transcrever o áudio.";
    ouvindo.value = false;
    reiniciarAoTerminar = false;
    limparAudio();
  };
  reconhecimento.onend = () => {
    if (reiniciarAoTerminar && ouvindo.value) {
      try {
        reconhecimento?.start();
        return;
      } catch {
        // Alguns navegadores encerram a sessão entre duas frases; o texto já recebido permanece.
      }
    }
    ouvindo.value = false;
    limparAudio();
  };
}

function abrir() {
  aberto.value = true;
  erro.value = "";
  finais.value = "";
  parcial.value = "";
  textoInicial = props.modelValue;
  reconhecimentoDisponivel.value = Boolean(obterReconhecimento());
}

async function iniciar() {
  erro.value = "";
  try {
    if (!reconhecimento) configurarReconhecimento();
    try {
      await prepararMedidor();
    } catch {
      // A transcrição continua mesmo se o medidor visual não puder acessar o microfone.
      limparAudio();
    }
    reiniciarAoTerminar = true;
    ouvindo.value = true;
    reconhecimento?.start();
  } catch (falha) {
    ouvindo.value = false;
    reiniciarAoTerminar = false;
    limparAudio();
    erro.value = falha instanceof Error ? falha.message : "Não foi possível acessar o microfone.";
  }
}

function pararReconhecimentoSeguro() {
  try {
    reconhecimento?.stop();
  } catch {
    // O reconhecimento pode já ter sido encerrado pelo navegador.
  }
}

function parar() {
  reiniciarAoTerminar = false;
  ouvindo.value = false;
  pararReconhecimentoSeguro();
  limparAudio();
}

function cancelar() {
  parar();
  emit("update:modelValue", textoInicial);
  aberto.value = false;
}

function usarTranscricao() {
  const texto = textoReconhecido.value.trim();
  if (texto) emit("update:modelValue", texto);
  parar();
  aberto.value = false;
}

onBeforeUnmount(() => {
  reiniciarAoTerminar = false;
  pararReconhecimentoSeguro();
  limparAudio();
});
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
        <v-card-subtitle>
          Fale a observação do fechamento. Revise o texto antes de enviar ao tesoureiro.
        </v-card-subtitle>

        <v-card-text>
          <div class="voz-orbe" :class="{ 'voz-orbe--ouvindo': ouvindo }" :style="{ '--voz-nivel': nivelVoz }">
            <div class="voz-orbe__halo" />
            <AppLogoAnimada :size="64" :glow-intensity="logoGlow" :speed="ouvindo ? 1.35 : 0.65" />
          </div>
          <div class="voz-status" aria-live="polite">
            <span v-if="ouvindo">Ouvindo… fale normalmente</span>
            <span v-else-if="erro" class="text-error">{{ erro }}</span>
            <span v-else>Toque em iniciar para falar</span>
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

          <v-alert v-if="!reconhecimentoDisponivel" type="info" variant="tonal" density="compact" class="mt-3">
            Use Chrome ou Edge no celular. A conexão com o Grok será adicionada depois, sem alterar este fluxo.
          </v-alert>
        </v-card-text>

        <v-card-actions class="flex-wrap ga-2 px-4 pb-4">
          <v-btn
            v-if="!ouvindo"
            color="primary"
            prepend-icon="mdi-microphone"
            :disabled="!reconhecimentoDisponivel"
            @click="iniciar"
          >
            Iniciar
          </v-btn>
          <v-btn v-else color="error" prepend-icon="mdi-stop" @click="parar">Parar</v-btn>
          <v-spacer />
          <v-btn variant="text" @click="cancelar">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!temTexto || ouvindo" @click="usarTranscricao">
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
  width: 92px;
  height: 92px;
  margin: 10px auto 4px;
  place-items: center;
  border-radius: 50%;
}

.voz-orbe__halo {
  position: absolute;
  inset: 10px;
  border: 1px solid rgb(var(--v-theme-primary), 0.24);
  border-radius: 50%;
  opacity: calc(0.45 + var(--voz-nivel) * 0.55);
  transform: scale(calc(1 + var(--voz-nivel) * 0.22));
  transition:
    transform 120ms ease,
    opacity 120ms ease;
}

.voz-orbe--ouvindo .voz-orbe__halo {
  box-shadow:
    0 0 0 8px rgb(var(--v-theme-primary), 0.06),
    0 0 28px rgb(var(--v-theme-primary), 0.22);
}

.voz-status {
  min-height: 22px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  text-align: center;
  font-size: 0.88rem;
}

@media (max-width: 480px) {
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
</style>
