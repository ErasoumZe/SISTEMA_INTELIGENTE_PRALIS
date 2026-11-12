<script setup lang="ts">
/* Os videos de um grupo em tela cheia, em sequencia: quando um acaba, o proximo comeca sozinho.
   Cada video tem barrinhas gravadas no topo, uma por PASSO. As setas dos lados andam por essas
   barrinhas (passo anterior / proximo passo), como stories; da ultima barrinha, a seta da direita
   vai para o proximo video. Tocar no meio pausa e continua. No fim do ultimo: "Ver de novo".
   O `v-dialog` fullscreen cuida do foco preso, do Esc e de travar a rolagem da pagina. */
import type { GrupoVideos } from "~/utils/videos-ajuda";
import { arquivoDoVideo, capaDoVideo, passoAnterior, proximoPasso } from "~/utils/videos-ajuda";

const props = defineProps<{ grupo: GrupoVideos; inicio: number }>();
const emit = defineEmits<{ fechar: [] }>();

const aberto = ref(true);
const elemento = ref<HTMLVideoElement | null>(null);
const indice = ref(Math.min(Math.max(0, props.inicio), props.grupo.videos.length - 1));
const tocando = ref(false);
const terminou = ref(false);
const mostrarIcone = ref(false);
let esconderIcone: ReturnType<typeof setTimeout> | undefined;

const atual = computed(() => props.grupo.videos[indice.value]!);
const ehUltimo = computed(() => indice.value === props.grupo.videos.length - 1);

function piscarIcone() {
  clearTimeout(esconderIcone);
  mostrarIcone.value = true;
  if (tocando.value) esconderIcone = setTimeout(() => (mostrarIcone.value = false), 600);
}

async function tocar() {
  const video = elemento.value;
  if (!video) return;
  try {
    await video.play();
  } catch {
    // Navegador que bloqueia o play automatico: fica pausado, com o icone de play na tela.
    tocando.value = false;
    mostrarIcone.value = true;
  }
}

function alternar() {
  const video = elemento.value;
  if (!video) return;
  if (video.paused) void tocar();
  else video.pause();
}

/** Troca de video. O `src` muda pelo `atual`; o `loadeddata` da o play. */
function irPara(novo: number) {
  if (novo < 0 || novo >= props.grupo.videos.length) return;
  terminou.value = false;
  if (novo === indice.value) {
    const video = elemento.value;
    if (video) video.currentTime = 0;
    void tocar();
    return;
  }
  indice.value = novo;
}

/** Pula para o inicio de um passo do video atual, sem mudar se esta tocando ou pausado. */
function irParaPasso(segundo: number) {
  const video = elemento.value;
  if (!video) return;
  video.currentTime = segundo;
  if (terminou.value) {
    terminou.value = false;
    void tocar();
  }
}

function anterior() {
  const video = elemento.value;
  if (!video) return;
  const passo = passoAnterior(atual.value.inicios, video.currentTime);
  irParaPasso(passo);
}
function proximo() {
  const video = elemento.value;
  if (!video) return;
  const passo = proximoPasso(atual.value.inicios, video.currentTime);
  if (passo !== null) irParaPasso(passo);
  else if (!ehUltimo.value) irPara(indice.value + 1);
}

function aoTocar() {
  tocando.value = true;
  terminou.value = false;
  piscarIcone();
}
function aoPausar() {
  tocando.value = false;
  if (!terminou.value) piscarIcone();
}
function aoTerminar() {
  if (!ehUltimo.value) {
    irPara(indice.value + 1);
    return;
  }
  tocando.value = false;
  terminou.value = true;
  mostrarIcone.value = false;
}

watch(aberto, (valor) => {
  if (!valor) emit("fechar");
});
onBeforeUnmount(() => clearTimeout(esconderIcone));

const idPassos = computed(() => `passos-${atual.value.id}`);
</script>

<template>
  <v-dialog v-model="aberto" fullscreen transition="dialog-bottom-transition" :aria-label="grupo.titulo">
    <div class="tela-cheia">
      <header class="tela-cheia__topo">
        <v-btn icon="mdi-arrow-left" variant="tonal" color="white" aria-label="Voltar para os vídeos" @click="aberto = false" />
        <span class="tela-cheia__contador">
          {{ grupo.titulo }} · <span class="cx-num">vídeo {{ indice + 1 }} de {{ grupo.videos.length }}</span>
        </span>
      </header>
      <!-- O titulo ja esta gravado no topo do video; aqui so para quem usa leitor de tela. -->
      <h2 class="sr-only" aria-live="polite">{{ atual.titulo }}</h2>

      <div class="tela-cheia__palco">
        <video
          :key="atual.id"
          ref="elemento"
          class="tela-cheia__video"
          :src="arquivoDoVideo(grupo.id, atual.id)"
          :poster="capaDoVideo(grupo.id, atual.id)"
          playsinline
          muted
          preload="auto"
          :aria-describedby="idPassos"
          @loadeddata="tocar"
          @play="aoTocar"
          @pause="aoPausar"
          @ended="aoTerminar"
        />
        <button
          v-if="!terminou"
          type="button"
          class="tela-cheia__toque"
          :aria-label="tocando ? 'Pausar' : 'Continuar'"
          @click="alternar"
        >
          <span class="tela-cheia__icone" :class="{ visivel: mostrarIcone }" aria-hidden="true">
            <v-icon :icon="tocando ? 'mdi-pause' : 'mdi-play'" size="40" />
          </span>
        </button>

        <!-- Um de cada lado, no meio da altura: alcanca com o polegar segurando o celular. -->
        <button
          type="button"
          class="tela-cheia__seta tela-cheia__seta--voltar"
          aria-label="Passo anterior"
          @click="anterior"
        >
          <v-icon icon="mdi-chevron-left" size="36" />
        </button>
        <button
          v-if="!terminou"
          type="button"
          class="tela-cheia__seta tela-cheia__seta--avancar"
          aria-label="Próximo passo"
          @click="proximo"
        >
          <v-icon icon="mdi-chevron-right" size="36" />
        </button>

        <div v-if="terminou" class="tela-cheia__fim">
          <v-btn color="primary" size="x-large" prepend-icon="mdi-replay" @click="irPara(0)">Ver de novo</v-btn>
          <v-btn variant="text" color="white" size="large" @click="aberto = false">Voltar para os vídeos</v-btn>
        </div>
      </div>

      <!-- A legenda esta gravada no video; para o leitor de tela, o mesmo texto em lista. -->
      <ol :id="idPassos" class="sr-only">
        <li v-for="passo in atual.passos" :key="passo">{{ passo }}</li>
      </ol>
    </div>
  </v-dialog>
</template>

<style scoped>
.tela-cheia {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--cx-sp-2);
  height: 100dvh;
  padding: max(8px, env(safe-area-inset-top, 0px)) max(8px, env(safe-area-inset-right, 0px))
    max(8px, env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px));
  background: #120b22;
  color: #fff;
}
.tela-cheia__topo {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  min-width: 0;
}
.tela-cheia__contador {
  min-width: 0;
  overflow: hidden;
  color: rgb(255 255 255 / 0.8);
  font-size: var(--cx-fs-micro);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tela-cheia__palco {
  position: relative;
  min-height: 0;
}
/* O video inteiro sempre cabe: na altura no celular, na largura que sobrar no desktop. */
.tela-cheia__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #120b22;
}
.tela-cheia__toque {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.tela-cheia__toque:focus-visible {
  outline: 3px solid #ffb15c;
  outline-offset: -3px;
}
.tela-cheia__icone {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgb(53 18 140 / 0.85);
  color: #fff;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
  opacity: 0;
  transform: scale(0.85);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.tela-cheia__icone.visivel {
  opacity: 1;
  transform: scale(1);
}
.tela-cheia__seta {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgb(18 11 34 / 0.6);
  color: #fff;
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.4);
  cursor: pointer;
  transform: translateY(-50%);
}
.tela-cheia__seta--voltar {
  left: 2px;
}
.tela-cheia__seta--avancar {
  right: 2px;
}
.tela-cheia__seta:active {
  background: rgb(53 18 140 / 0.9);
}
.tela-cheia__seta:focus-visible {
  outline: 3px solid #ffb15c;
  outline-offset: 2px;
}
.tela-cheia__fim {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: var(--cx-sp-3);
  background: rgb(18 11 34 / 0.72);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .tela-cheia__icone {
    transition: none;
  }
}
</style>
