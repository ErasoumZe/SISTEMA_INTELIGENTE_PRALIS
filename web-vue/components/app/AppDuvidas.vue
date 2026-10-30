<script setup lang="ts">
// Bolinha de duvidas no canto de baixo + janelinha "pergunte e veja a resposta" (sem IA). Mostra uma coisa
// por vez: o campo para escrever, ate 3 opcoes quando a pergunta nao e certeira, ou a resposta. A bolinha
// usa a imagem parada da marca: simbolo animado em toda tela, o turno inteiro, distrai quem esta no caixa.
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
const campo = ref<HTMLInputElement | null>(null);
const bolinha = ref<HTMLButtonElement | null>(null);

const chat = useChatDuvidas(props.duvidas);
const { tela, comuns } = chat;
const { tema: temaMarcado } = useDuvidasContexto();
const rota = useRoute();
// Fora do fechamento, quem esta no caixa costuma perguntar do turno.
const temaDoContexto = computed<TemaDuvida | null>(
  () => temaMarcado.value ?? (rota.path.startsWith("/caixa") ? "turno" : null)
);

// Perguntar e o caminho principal, entao o campo ja vem focado.
watch(aberto, async (agora) => {
  if (!agora) return;
  texto.value = "";
  chat.iniciar(temaDoContexto.value);
  await nextTick();
  campo.value?.focus();
});

function fechar() {
  aberto.value = false;
  bolinha.value?.focus();
}
function enviar() {
  chat.perguntar(texto.value);
}
async function outraPergunta() {
  texto.value = "";
  chat.voltar();
  await nextTick();
  campo.value?.focus();
}
</script>

<template>
  <div class="duvidas" :class="{ 'duvidas--com-nav': comNavegacaoMobile }">
    <Transition name="duvidas-janela">
      <section
        v-if="aberto"
        id="duvidas-chat"
        class="duvidas__janela"
        role="dialog"
        aria-label="Dúvidas sobre o caixa"
        data-teste="duvidas-painel"
        @keydown.esc="fechar"
      >
        <header class="duvidas__topo">
          <AppLogoAnimada :size="30" :glow-intensity="0.12" />
          <h2>Qual é a sua dúvida?</h2>
          <button type="button" class="duvidas__acao" aria-label="Fechar dúvidas" @click="fechar">
            <v-icon icon="mdi-close" size="20" />
          </button>
        </header>

        <form class="duvidas__envio" @submit.prevent="enviar">
          <input
            ref="campo"
            v-model="texto"
            type="text"
            maxlength="120"
            placeholder="Ex.: errei a contagem do malote"
            aria-label="Escreva sua dúvida"
            autocomplete="off"
            enterkeyhint="search"
            data-teste="duvidas-busca"
          />
          <button type="submit" class="duvidas__enviar" aria-label="Perguntar" :disabled="!texto.trim()">
            <v-icon icon="mdi-arrow-right" size="20" />
          </button>
        </form>

        <div class="duvidas__corpo" aria-live="polite" data-teste="duvidas-corpo">
          <Transition name="duvidas-troca" mode="out-in">
            <div v-if="tela.tipo === 'resposta'" :key="`r-${tela.duvida.id}`" data-teste="duvidas-resposta">
              <h3 class="duvidas__pergunta">{{ tela.duvida.pergunta }}</h3>
              <p class="duvidas__resposta">{{ tela.duvida.resposta }}</p>
              <button type="button" class="duvidas__link" data-teste="duvidas-outra" @click="outraPergunta">
                <v-icon icon="mdi-arrow-left" size="16" /> Fazer outra pergunta
              </button>
            </div>

            <div v-else-if="tela.tipo === 'opcoes'" :key="`o-${tela.termo}`">
              <p class="duvidas__rotulo">É alguma destas?</p>
              <button
                v-for="duvida in tela.duvidas"
                :key="duvida.id"
                type="button"
                class="duvidas__opcao"
                :data-teste="`duvida-${duvida.id}`"
                @click="chat.escolher(duvida)"
              >
                {{ duvida.pergunta }}
              </button>
              <p class="duvidas__dica">Nenhuma? Escreva de outro jeito ou chame o gerente do turno.</p>
            </div>

            <div v-else-if="tela.tipo === 'nada'" :key="`n-${tela.termo}`" data-teste="duvidas-vazio">
              <p class="duvidas__resposta">
                Não achei essa dúvida. Tente com outras palavras (ex.: “sangria”, “lacre”, “maquininha”) ou chame o
                gerente do turno.
              </p>
            </div>

            <div v-else key="inicio">
              <p class="duvidas__rotulo">Mais perguntadas aqui</p>
              <button
                v-for="duvida in comuns"
                :key="duvida.id"
                type="button"
                class="duvidas__opcao"
                :data-teste="`duvida-${duvida.id}`"
                @click="chat.escolher(duvida)"
              >
                {{ duvida.pergunta }}
              </button>
            </div>
          </Transition>
        </div>
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
