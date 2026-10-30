<script setup lang="ts">
// Bolinha de duvidas no canto de baixo + janelinha de chat com perguntas e respostas prontas (sem IA). A
// conversa comeca no assunto em que a pessoa esta (etapa do fechamento, caixa...). A bolinha usa a imagem
// parada da marca: simbolo animado em toda tela, o turno inteiro, distrai quem esta no caixa. O animado
// aparece so no topo da janela aberta.
import { computed, nextTick, ref, watch } from "vue";
import AppLogoAnimada from "~/components/app/AppLogoAnimada.vue";
import { useChatDuvidas } from "~/composables/useChatDuvidas";
import { useDuvidasContexto } from "~/composables/useDuvidasContexto";
import type { Duvida, TemaDuvida } from "~/utils/duvidas";
import { DUVIDAS_CAIXA } from "~/utils/duvidas-caixa";

const props = withDefaults(
  defineProps<{
    duvidas?: readonly Duvida[];
    /** No celular a barra de baixo ocupa o canto: a bolinha sobe para ficar acima dela. */
    comNavegacaoMobile?: boolean;
  }>(),
  { duvidas: () => DUVIDAS_CAIXA, comNavegacaoMobile: false }
);

// Caminho de /public, servido como esta (sem passar pelo bundler).
const SIMBOLO = "/cicluz/cicluz-simbolo.png";
const aberto = ref(false);
const texto = ref("");
const conversa = ref<HTMLElement | null>(null);
const janela = ref<HTMLElement | null>(null);
const bolinha = ref<HTMLButtonElement | null>(null);

const chat = useChatDuvidas(props.duvidas);
const { mensagens, tituloDoTema } = chat;
const { tema: temaMarcado } = useDuvidasContexto();
const rota = useRoute();
// Fora do fechamento, quem esta no caixa costuma perguntar do turno; nas outras telas, oferece os assuntos.
const temaDoContexto = computed<TemaDuvida | null>(
  () => temaMarcado.value ?? (rota.path.startsWith("/caixa") ? "turno" : null)
);

// O foco vai para a janela, e nao para o campo: no celular, focar o campo abriria o teclado por cima das
// perguntas prontas, que sao o caminho mais rapido.
watch(aberto, async (agora) => {
  if (!agora) return;
  texto.value = "";
  chat.iniciar(temaDoContexto.value);
  await nextTick();
  janela.value?.focus();
});

// A cada troca, a pergunta feita sobe para o topo da conversa e a resposta aparece logo abaixo dela.
watch(
  () => mensagens.value.length,
  async (total, antes) => {
    if (!antes || total <= 1) return;
    await nextTick();
    const itens = conversa.value?.querySelectorAll<HTMLElement>("[data-de='voce']");
    const ultima = itens?.[itens.length - 1];
    if (conversa.value && ultima) conversa.value.scrollTop = ultima.offsetTop - 8;
  }
);

function fechar() {
  aberto.value = false;
  bolinha.value?.focus();
}
function enviar() {
  chat.perguntar(texto.value);
  texto.value = "";
}
</script>

<template>
  <div class="duvidas" :class="{ 'duvidas--com-nav': comNavegacaoMobile }">
    <Transition name="duvidas-janela">
      <section
        v-if="aberto"
        id="duvidas-chat"
        ref="janela"
        class="duvidas__janela"
        role="dialog"
        aria-label="Dúvidas sobre o caixa"
        tabindex="-1"
        data-teste="duvidas-painel"
        @keydown.esc="fechar"
      >
        <header class="duvidas__topo">
          <AppLogoAnimada :size="30" :glow-intensity="0.12" />
          <div class="duvidas__titulo">
            <h2>Dúvidas</h2>
            <p>Respostas rápidas sobre o caixa</p>
          </div>
          <button type="button" class="duvidas__acao" aria-label="Ver os assuntos" @click="chat.verAssuntos()">
            <v-icon icon="mdi-format-list-bulleted" size="20" />
          </button>
          <button type="button" class="duvidas__acao" aria-label="Fechar dúvidas" @click="fechar">
            <v-icon icon="mdi-close" size="20" />
          </button>
        </header>

        <ol ref="conversa" class="duvidas__conversa" aria-live="polite">
          <li
            v-for="mensagem in mensagens"
            :key="mensagem.id"
            :class="`msg msg--${mensagem.de}`"
            :data-de="mensagem.de"
          >
            <p class="msg__balao">
              <strong v-if="mensagem.titulo">{{ mensagem.titulo }}</strong>
              {{ mensagem.texto }}
            </p>
            <div v-if="mensagem.sugestoes" class="msg__opcoes">
              <button
                v-for="duvida in mensagem.sugestoes"
                :key="duvida.id"
                type="button"
                :data-teste="`duvida-${duvida.id}`"
                @click="chat.escolherDuvida(duvida)"
              >
                {{ duvida.pergunta }}
              </button>
            </div>
            <div v-if="mensagem.temas" class="msg__opcoes msg__opcoes--temas">
              <button
                v-for="tema in mensagem.temas"
                :key="tema"
                type="button"
                :data-teste="`duvidas-tema-${tema}`"
                @click="chat.escolherTema(tema)"
              >
                {{ tituloDoTema(tema) }}
              </button>
            </div>
          </li>
        </ol>

        <form class="duvidas__envio" @submit.prevent="enviar">
          <input
            v-model="texto"
            type="text"
            maxlength="120"
            placeholder="Escreva sua dúvida"
            aria-label="Escreva sua dúvida"
            autocomplete="off"
            enterkeyhint="send"
            data-teste="duvidas-busca"
          />
          <button type="submit" class="duvidas__enviar" aria-label="Enviar" :disabled="!texto.trim()">
            <v-icon icon="mdi-send" size="18" />
          </button>
        </form>
      </section>
    </Transition>

    <button
      ref="bolinha"
      type="button"
      class="duvidas__bolinha"
      :aria-label="aberto ? 'Fechar dúvidas' : 'Dúvidas: perguntas e respostas'"
      :aria-expanded="aberto"
      aria-controls="duvidas-chat"
      data-teste="duvidas-abrir"
      @click="aberto ? fechar() : (aberto = true)"
    >
      <v-icon v-if="aberto" icon="mdi-close" size="24" />
      <img v-else :src="SIMBOLO" alt="" width="30" height="30" />
    </button>
  </div>
</template>

<style scoped src="./AppDuvidas.css"></style>
