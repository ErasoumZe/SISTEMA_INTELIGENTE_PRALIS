<script setup lang="ts">
// Botao pequeno de duvidas na borda direita + painel lateral com perguntas e respostas prontas. Abre no
// assunto em que a pessoa esta (etapa do fechamento, caixa...). O simbolo do botao e a imagem parada da
// marca: um simbolo animado em toda tela, o turno inteiro, distrai quem esta no caixa. O animado aparece
// so no topo do painel aberto.
import { computed, ref, watch } from "vue";
import AppLogoAnimada from "~/components/app/AppLogoAnimada.vue";
import { useDuvidasContexto } from "~/composables/useDuvidasContexto";
import { buscarDuvidas, TEMAS_DUVIDA, type Duvida, type TemaDuvida } from "~/utils/duvidas";
import { DUVIDAS_CAIXA } from "~/utils/duvidas-caixa";

const props = withDefaults(defineProps<{ duvidas?: readonly Duvida[] }>(), { duvidas: () => DUVIDAS_CAIXA });

// Caminho de /public, servido como esta (sem passar pelo bundler).
const SIMBOLO = "/cicluz/cicluz-simbolo.png";
const aberto = ref(false);
const termo = ref("");
const temaEscolhido = ref<TemaDuvida | "todos">("todos");
const { tema: temaMarcado } = useDuvidasContexto();
const rota = useRoute();
// Fora do fechamento, quem esta no caixa costuma perguntar do turno; nas outras telas, abre em todas.
const temaDoContexto = computed<TemaDuvida | null>(
  () => temaMarcado.value ?? (rota.path.startsWith("/caixa") ? "turno" : null)
);

const temasComPergunta = computed(() => TEMAS_DUVIDA.filter((tema) => props.duvidas.some((d) => d.tema === tema.id)));

// Ao abrir, comeca no assunto da tela; quem quiser troca no chip. A busca procura em tudo.
watch(aberto, (agora) => {
  if (!agora) return;
  termo.value = "";
  const contexto = temaDoContexto.value;
  temaEscolhido.value = contexto && temasComPergunta.value.some((t) => t.id === contexto) ? contexto : "todos";
});

const resultado = computed(() => {
  if (termo.value.trim()) return buscarDuvidas(props.duvidas, termo.value);
  if (temaEscolhido.value === "todos") return [...props.duvidas];
  return props.duvidas.filter((duvida) => duvida.tema === temaEscolhido.value);
});
const tituloDoTema = (id: TemaDuvida) => TEMAS_DUVIDA.find((tema) => tema.id === id)?.titulo ?? "";
</script>

<template>
  <button
    type="button"
    class="duvidas-gatilho"
    :class="{ 'duvidas-gatilho--aberto': aberto }"
    aria-label="Dúvidas: perguntas e respostas"
    :aria-expanded="aberto"
    aria-controls="duvidas-painel"
    data-teste="duvidas-abrir"
    @click="aberto = !aberto"
  >
    <img :src="SIMBOLO" alt="" width="24" height="24" />
    <span class="duvidas-gatilho__rotulo">Dúvidas</span>
  </button>

  <v-navigation-drawer
    id="duvidas-painel"
    v-model="aberto"
    location="right"
    temporary
    :width="400"
    class="duvidas"
    aria-label="Dúvidas"
    data-teste="duvidas-painel"
  >
    <header class="duvidas__topo">
      <AppLogoAnimada :size="34" :glow-intensity="0.16" />
      <div>
        <h2>Dúvidas</h2>
        <p>Respostas rápidas sobre o caixa.</p>
      </div>
      <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar dúvidas" @click="aberto = false" />
    </header>

    <div class="duvidas__busca">
      <v-text-field
        v-model="termo"
        placeholder="Escreva sua dúvida (ex.: errei a contagem)"
        prepend-inner-icon="mdi-magnify"
        density="comfortable"
        variant="outlined"
        hide-details
        clearable
        autofocus
        aria-label="Buscar dúvida"
        data-teste="duvidas-busca"
      />
    </div>

    <div v-if="!termo.trim()" class="duvidas__temas" role="group" aria-label="Assuntos">
      <v-chip
        :variant="temaEscolhido === 'todos' ? 'flat' : 'outlined'"
        :color="temaEscolhido === 'todos' ? 'primary' : undefined"
        size="small"
        @click="temaEscolhido = 'todos'"
        >Todas</v-chip
      >
      <v-chip
        v-for="tema in temasComPergunta"
        :key="tema.id"
        :variant="temaEscolhido === tema.id ? 'flat' : 'outlined'"
        :color="temaEscolhido === tema.id ? 'primary' : undefined"
        size="small"
        :data-teste="`duvidas-tema-${tema.id}`"
        @click="temaEscolhido = tema.id"
        >{{ tema.titulo }}</v-chip
      >
    </div>

    <p class="duvidas__contagem" aria-live="polite">
      {{ resultado.length }} {{ resultado.length === 1 ? "pergunta" : "perguntas" }}
    </p>

    <v-expansion-panels v-if="resultado.length" variant="accordion" class="duvidas__lista">
      <v-expansion-panel v-for="duvida in resultado" :key="duvida.id" :data-teste="`duvida-${duvida.id}`">
        <v-expansion-panel-title>
          <span class="duvidas__pergunta">
            <small v-if="termo.trim() || temaEscolhido === 'todos'">{{ tituloDoTema(duvida.tema) }}</small>
            {{ duvida.pergunta }}
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>{{ duvida.resposta }}</v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <p v-else class="duvidas__vazio" data-teste="duvidas-vazio">
      Não achamos essa dúvida. Tente outra palavra ou chame o gerente.
    </p>

    <footer class="duvidas__rodape">Não resolveu? Chame o gerente do turno antes de seguir.</footer>
  </v-navigation-drawer>
</template>

<style scoped src="./AppDuvidas.css"></style>
