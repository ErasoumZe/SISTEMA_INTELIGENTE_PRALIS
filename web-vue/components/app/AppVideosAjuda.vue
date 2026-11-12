<script setup lang="ts">
/* VIDEOS DE AJUDA no painel: um video curto por duvida, com a legenda gravada no proprio video.
   O chat de Duvidas (bolinha) e outra coisa e continua igual: la se pergunta, aqui se assiste.

   Quem ve cada grupo vem da MESMA lista do menu (`gruposVisiveis`): o grupo do Caixa aparece para
   quem tem a tela Caixa, que e a conta do PDV. Sem grupo liberado, a faixa inteira some. */
import type { ItemMenu } from "~/types/padaria";
import type { GrupoVideos } from "~/utils/videos-ajuda";
import { capaDoVideo, filtrarVideos, gruposVisiveis } from "~/utils/videos-ajuda";
import AppVideoTelaCheia from "~/components/app/AppVideoTelaCheia.vue";

const props = defineProps<{ telas: ItemMenu[] }>();

const termo = ref("");
const liberados = computed(() => gruposVisiveis(props.telas));
const achados = computed(() => filtrarVideos(liberados.value, termo.value));
const totalLiberado = computed(() => liberados.value.reduce((soma, grupo) => soma + grupo.videos.length, 0));

/* Abre o player no video tocado, mas com o grupo INTEIRO (o liberado, nao o filtrado pela busca):
   as setas seguem a ordem da abertura, como stories. */
const aberto = ref<{ grupo: GrupoVideos; inicio: number } | null>(null);
function abrir(grupoId: string, videoId: string) {
  const grupo = liberados.value.find((item) => item.id === grupoId);
  if (grupo) aberto.value = { grupo, inicio: grupo.videos.findIndex((item) => item.id === videoId) };
}
const numero = (grupoId: string, videoId: string) =>
  (liberados.value.find((item) => item.id === grupoId)?.videos.findIndex((item) => item.id === videoId) ?? 0) + 1;
</script>

<template>
  <section v-if="liberados.length" class="faixa videos-ajuda" aria-labelledby="faixa-videos">
    <div class="videos-ajuda__topo">
      <h2 id="faixa-videos" class="faixa-titulo">Vídeos de ajuda</h2>
      <span class="videos-ajuda__conta">{{ totalLiberado }} vídeos curtos</span>
    </div>

    <v-text-field
      v-model="termo"
      class="videos-ajuda__busca"
      label="O que você quer fazer?"
      placeholder="Ex.: abrir caixa, lacre, maquininha"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="comfortable"
      hide-details
      clearable
    />

    <p v-if="!achados.length" class="videos-ajuda__vazio">
      Nenhum vídeo com essa palavra. Tente: abrir, lacre, malote, maquininha.
    </p>

    <div v-for="grupo in achados" :key="grupo.id" class="videos-ajuda__grupo">
      <h3 class="videos-ajuda__grupo-titulo">{{ grupo.titulo }} <small>na ordem da abertura</small></h3>
      <ul class="videos-ajuda__lista">
        <li v-for="video in grupo.videos" :key="video.id">
          <button type="button" class="video-card" @click="abrir(grupo.id, video.id)">
            <span class="video-card__capa">
              <img :src="capaDoVideo(grupo.id, video.id)" alt="" loading="lazy" decoding="async" />
              <span class="video-card__play" aria-hidden="true"><v-icon icon="mdi-play" size="22" /></span>
              <span class="video-card__numero cx-num" aria-hidden="true">{{ numero(grupo.id, video.id) }}</span>
            </span>
            <span class="video-card__texto">
              <strong>{{ video.titulo }}</strong>
              <small>{{ video.resumo }}</small>
            </span>
            <span class="video-card__tempo cx-num">{{ video.duracao }} s</span>
          </button>
        </li>
      </ul>
    </div>

    <AppVideoTelaCheia
      v-if="aberto"
      :grupo="aberto.grupo"
      :inicio="aberto.inicio"
      @fechar="aberto = null"
    />
  </section>
</template>

<style scoped>
.videos-ajuda {
  display: grid;
  gap: var(--cx-sp-3);
}
.videos-ajuda__topo {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}
.videos-ajuda__conta {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
}
.videos-ajuda__busca {
  max-width: 520px;
}
.videos-ajuda__vazio {
  margin: 0;
  padding: var(--cx-sp-4);
  border: 1px dashed var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  color: var(--cx-ink-soft);
  text-align: center;
}
.videos-ajuda__grupo {
  display: grid;
  gap: var(--cx-sp-2);
}
.videos-ajuda__grupo-titulo {
  margin: 0;
  font-size: var(--cx-fs-body);
  font-weight: 700;
}
/* Uma coluna no celular; duas a partir do tablet; tres no desktop largo. */
.videos-ajuda__lista {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--cx-sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
@media (min-width: 768px) {
  .videos-ajuda__lista {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (min-width: 1280px) {
  .videos-ajuda__lista {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.video-card {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--cx-sp-3);
  width: 100%;
  min-height: 84px;
  padding: var(--cx-sp-2) var(--cx-sp-3) var(--cx-sp-2) var(--cx-sp-2);
  border: 1px solid transparent;
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    transform 160ms ease;
}
:root[data-theme="dark"] .video-card {
  border-color: var(--cx-line-soft);
}
.video-card:hover {
  border-color: rgb(var(--v-theme-primary));
}
.video-card:active {
  transform: scale(0.99);
}
.video-card:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
/* Capa em pe, como o celular: o operador reconhece a tela antes de ler o titulo. */
.video-card__capa {
  position: relative;
  width: 56px;
  aspect-ratio: 390 / 844;
  max-height: 68px;
  overflow: hidden;
  border-radius: var(--cx-r-sm);
  background: #120b22;
}
.video-card__capa img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  opacity: 0.75;
}
.video-card__play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
}
.videos-ajuda__grupo-titulo small {
  margin-left: var(--cx-sp-1);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 500;
}
.video-card__numero {
  position: absolute;
  top: 3px;
  left: 3px;
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border-radius: 999px;
  background: #ff8a1f;
  color: #1d1433;
  font-size: 12px;
  font-weight: 800;
}
.video-card__texto strong {
  display: block;
  font-size: var(--cx-fs-body);
  line-height: 1.3;
}
.video-card__texto small {
  display: block;
  margin-top: 2px;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
}
.video-card__tempo {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 700;
}
@media (prefers-reduced-motion: reduce) {
  .video-card {
    transition: none;
  }
}
</style>
