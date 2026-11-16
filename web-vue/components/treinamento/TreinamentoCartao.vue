<script setup lang="ts">
/* Um video da pagina Treinamento. A capa fica EM PE, como o celular em que o video foi gravado:
   o operador reconhece a tela antes de ler o titulo. O numero laranja e a ordem dentro do grupo
   (a ordem da abertura, no Caixa) e e a mesma que o player segue. */
import type { VideoAjuda } from "~/utils/videos-ajuda";
import { capaDoVideo } from "~/utils/videos-ajuda";

defineProps<{ grupoId: string; video: VideoAjuda; numero: number }>();
const emit = defineEmits<{ abrir: [] }>();
</script>

<template>
  <button
    type="button"
    class="aula"
    :aria-label="`Assistir: ${video.titulo}. ${video.duracao} segundos`"
    @click="emit('abrir')"
  >
    <span class="aula__capa">
      <img :src="capaDoVideo(grupoId, video.id)" alt="" loading="lazy" decoding="async" />
      <span class="aula__numero cx-num" aria-hidden="true">{{ numero }}</span>
      <span class="aula__play" aria-hidden="true"><v-icon icon="mdi-play" size="26" /></span>
      <span class="aula__tempo cx-num" aria-hidden="true">{{ video.duracao }} s</span>
    </span>
    <span class="aula__texto" aria-hidden="true">
      <strong>{{ video.titulo }}</strong>
      <small>{{ video.resumo }}</small>
    </span>
  </button>
</template>

<style scoped>
.aula {
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    transform var(--cx-dur-2) var(--cx-ease-out),
    box-shadow var(--cx-dur-2) var(--cx-ease-out),
    border-color var(--cx-dur-2) var(--cx-ease-out);
}
.aula:hover {
  border-color: color-mix(in srgb, var(--cx-brand) 45%, var(--cx-line));
  box-shadow: var(--cx-e-2);
  transform: translateY(-2px);
}
.aula:active {
  transform: translateY(0) scale(0.99);
}
.aula:focus-visible {
  outline: 3px solid var(--cx-focus);
  outline-offset: 2px;
}

/* Recorte 4:5 do topo do video: mostra o titulo gravado e a tela, sem ocupar a pagina inteira. */
.aula__capa {
  position: relative;
  display: block;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  background: #120b22;
}
.aula__capa img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  opacity: 0.82;
  transition:
    transform var(--cx-dur-3) var(--cx-ease-out),
    opacity var(--cx-dur-2) var(--cx-ease-out);
}
.aula:hover .aula__capa img {
  opacity: 1;
  transform: scale(1.03);
}
.aula__numero {
  position: absolute;
  top: var(--cx-sp-2);
  left: var(--cx-sp-2);
  display: grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: var(--cx-r-pill);
  background: #ff8a1f;
  color: #1d1433;
  font-size: var(--cx-fs-caption);
  font-weight: 800;
}
.aula__play {
  position: absolute;
  left: 50%;
  top: 50%;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--cx-r-pill);
  background: rgb(18 11 34 / 0.62);
  color: #fff;
  transform: translate(-50%, -50%);
  transition: background var(--cx-dur-2) var(--cx-ease-out);
}
.aula:hover .aula__play {
  background: var(--cx-brand);
}
.aula__tempo {
  position: absolute;
  right: var(--cx-sp-2);
  bottom: var(--cx-sp-2);
  padding: 2px 8px;
  border-radius: var(--cx-r-pill);
  background: rgb(18 11 34 / 0.72);
  color: #fff;
  font-size: var(--cx-fs-micro);
  font-weight: 700;
}
.aula__texto {
  display: grid;
  align-content: start;
  gap: var(--cx-sp-1);
  padding: var(--cx-sp-3);
}
.aula__texto strong {
  font-size: var(--cx-fs-body);
  line-height: 1.3;
}
.aula__texto small {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  line-height: 1.35;
}

@media (prefers-reduced-motion: reduce) {
  .aula,
  .aula__capa img,
  .aula__play {
    transition: none;
  }
  .aula:hover,
  .aula:active,
  .aula:hover .aula__capa img {
    transform: none;
  }
}
</style>
