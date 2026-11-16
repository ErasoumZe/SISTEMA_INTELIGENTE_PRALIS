<script setup lang="ts">
/* PAGINA TREINAMENTO (R-242): todos os videos de ajuda num lugar so, separados por assunto (grupo).
   Antes eles viviam numa faixa da home (R-237); a faixa SAIU, nao ficou ao lado desta pagina.

   Quem ve cada grupo continua vindo da MESMA lista do menu (`gruposVisiveis`): o grupo do Caixa
   aparece para quem tem a tela Caixa. Nenhuma permissao nova nasce aqui.

   O player e o mesmo `AppVideoTelaCheia`: abre no video tocado, com o grupo INTEIRO (o liberado,
   nao o filtrado pela busca), para as setas seguirem a ordem do grupo. */
import type { ItemMenu } from "~/types/padaria";
import type { GrupoVideos } from "~/utils/videos-ajuda";
import { duracaoTotal, filtrarVideos, gruposVisiveis } from "~/utils/videos-ajuda";
import AppVideoTelaCheia from "~/components/app/AppVideoTelaCheia.vue";
import TreinamentoCartao from "~/components/treinamento/TreinamentoCartao.vue";

const props = defineProps<{ telas: Pick<ItemMenu, "id">[] }>();

const termo = ref("");
const liberados = computed(() => gruposVisiveis(props.telas));
const achados = computed(() => filtrarVideos(liberados.value, termo.value ?? ""));
const totalVideos = computed(() => liberados.value.reduce((soma, grupo) => soma + grupo.videos.length, 0));
const buscando = computed(() => Boolean(termo.value?.trim()));

const aberto = ref<{ grupo: GrupoVideos; inicio: number } | null>(null);
// Ao fechar o player o foco volta para quem o abriu (cartao ou "Assistir em sequencia"); sem isto,
// quem usa teclado cai no comeco da pagina e perde o lugar.
let origemDoFoco: HTMLElement | null = null;
function abrir(grupoId: string, videoId?: string) {
  const grupo = liberados.value.find((item) => item.id === grupoId);
  if (!grupo) return;
  origemDoFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const inicio = videoId ? grupo.videos.findIndex((item) => item.id === videoId) : 0;
  aberto.value = { grupo, inicio: Math.max(0, inicio) };
}
/** Numero do video na ordem do grupo inteiro: continua certo mesmo com a busca escondendo outros. */
function numero(grupoId: string, videoId: string) {
  const grupo = liberados.value.find((item) => item.id === grupoId);
  return (grupo?.videos.findIndex((item) => item.id === videoId) ?? 0) + 1;
}
function fechar() {
  aberto.value = null;
  const alvo = origemDoFoco;
  origemDoFoco = null;
  if (alvo?.isConnected) void nextTick(() => alvo.focus());
}
const grupoInteiro = (grupoId: string) => liberados.value.find((item) => item.id === grupoId)!;
</script>

<template>
  <div class="treinamento">
    <p v-if="!liberados.length" class="treinamento__aviso" role="status">Ainda não há treinamento para o seu acesso.</p>

    <template v-else>
      <div class="treinamento__barra">
        <v-text-field
          v-model="termo"
          class="treinamento__busca"
          label="O que você quer aprender?"
          placeholder="Ex.: abrir caixa, lacre, maquininha"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="comfortable"
          hide-details
          clearable
        />
        <span class="treinamento__conta cx-num" aria-live="polite">
          <template v-if="buscando">
            {{ achados.reduce((soma, grupo) => soma + grupo.videos.length, 0) }} de {{ totalVideos }} vídeos
          </template>
          <template v-else>{{ totalVideos }} vídeos curtos</template>
        </span>
      </div>

      <!-- Atalho entre assuntos: so aparece quando ha mais de um, senao e ruido. -->
      <nav v-if="liberados.length > 1 && !buscando" class="treinamento__assuntos" aria-label="Assuntos">
        <a v-for="grupo in liberados" :key="grupo.id" :href="`#assunto-${grupo.id}`" class="treinamento__assunto">
          {{ grupo.titulo }}
        </a>
      </nav>

      <p v-if="!achados.length" class="treinamento__aviso" role="status">
        Nenhum vídeo com essa palavra. Tente: abrir, lacre, malote, maquininha.
      </p>

      <section
        v-for="grupo in achados"
        :id="`assunto-${grupo.id}`"
        :key="grupo.id"
        class="assunto"
        :aria-labelledby="`assunto-titulo-${grupo.id}`"
      >
        <header class="assunto__topo">
          <div class="assunto__texto">
            <h2 :id="`assunto-titulo-${grupo.id}`" class="assunto__titulo">{{ grupo.titulo }}</h2>
            <p class="assunto__meta cx-num">
              {{ grupoInteiro(grupo.id).videos.length }} vídeos · {{ duracaoTotal(grupoInteiro(grupo.id)) }} no
              total<template v-if="grupo.ordem"> · {{ grupo.ordem }}</template>
            </p>
          </div>
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-play"
            class="assunto__sequencia"
            @click="abrir(grupo.id)"
          >
            Assistir em sequência
          </v-btn>
        </header>

        <ul class="assunto__lista">
          <li v-for="video in grupo.videos" :key="video.id">
            <TreinamentoCartao
              :grupo-id="grupo.id"
              :video="video"
              :numero="numero(grupo.id, video.id)"
              @abrir="abrir(grupo.id, video.id)"
            />
          </li>
        </ul>
      </section>
    </template>

    <AppVideoTelaCheia v-if="aberto" :grupo="aberto.grupo" :inicio="aberto.inicio" @fechar="fechar" />
  </div>
</template>

<style scoped>
.treinamento {
  display: grid;
  gap: var(--cx-sp-6);
  min-width: 0;
}
.treinamento__barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-3) var(--cx-sp-4);
}
.treinamento__busca {
  flex: 1 1 280px;
  max-width: 560px;
}
.treinamento__conta {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
}
.treinamento__assuntos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}
.treinamento__assunto {
  padding: var(--cx-sp-1) var(--cx-sp-3);
  border-radius: var(--cx-r-pill);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
  text-decoration: none;
}
.treinamento__assunto:focus-visible {
  outline: 2px solid var(--cx-focus);
  outline-offset: 2px;
}
.treinamento__aviso {
  margin: 0;
  padding: var(--cx-sp-6) var(--cx-sp-4);
  border: 1px dashed var(--cx-line);
  border-radius: var(--cx-r-lg);
  color: var(--cx-ink-soft);
  text-align: center;
}

.assunto {
  display: grid;
  gap: var(--cx-sp-4);
  min-width: 0;
  scroll-margin-top: var(--cx-sp-8);
}
.assunto__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding-bottom: var(--cx-sp-3);
  border-bottom: 1px solid var(--cx-line-soft);
}
.assunto__texto {
  display: grid;
  gap: var(--cx-sp-1);
  min-width: 0;
}
.assunto__titulo {
  margin: 0;
  font-size: var(--cx-fs-title);
  font-weight: 700;
  line-height: 1.2;
}
.assunto__meta {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

/* Prateleira: 2 colunas no celular, 3 no tablet, 4 no notebook, 5 no desktop largo. */
.assunto__lista {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
@media (min-width: 640px) {
  .assunto__lista {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--cx-sp-4);
  }
}
@media (min-width: 1000px) {
  .assunto__lista {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (min-width: 1360px) {
  .assunto__lista {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
@media (width <= 420px) {
  .assunto__sequencia {
    width: 100%;
  }
}
</style>
