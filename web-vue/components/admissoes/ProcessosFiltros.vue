<script setup lang="ts">
// Da `vue`, e nao do auto-import do Nuxt: o teste monta este componente fora do runtime do Nuxt,
// e sem o import explicito `reactive` chega indefinido na montagem.
import { computed, reactive } from "vue";
import type { SituacaoFicha } from "@padaria/shared";
import { rotuloSituacaoFicha } from "~/utils/admissoes";

/**
 * ADM-003 V6 — o recorte da lista de processos, e a fila do DP.
 *
 * Mesmo contrato do `TestesFiltros` do modulo vizinho: um tipo exportado, `PADRAO`, estado local, e
 * UM evento `aplicar` com uma copia. A pagina guarda so o que foi aplicado — o que esta digitado e
 * ainda nao enviado nao pode influenciar a frase do estado vazio.
 *
 * "Aguardando revisao" e ATALHO do mesmo filtro, nunca um segundo parametro: um `aguardandoRevisao`
 * convivendo com `ficha` seriam duas formas de pedir a mesma coisa, capazes de divergir. A pilula
 * apenas seleciona `enviada` e aplica.
 */
export type FiltrosProcessos = {
  ficha: SituacaoFicha | "";
};

defineProps<{ carregando: boolean }>();

const emit = defineEmits<{ (event: "aplicar", filtros: FiltrosProcessos): void }>();

// Abre SEM recorte: a lista de processos e o cadastro, e quem entra por ela quer ver todo mundo.
// A fila e um gesto — um clique na pilula —, nao o estado inicial da tela.
const PADRAO: FiltrosProcessos = { ficha: "" };

const filtros = reactive<FiltrosProcessos>({ ...PADRAO });

/**
 * O rotulo carrega o significado do estado, e nao so o nome dele. "Enviada" sozinho nao diz que e a
 * que espera decisao — e quem nao sabe disso procura a fila em outro lugar.
 */
const opcoesFicha: { valor: SituacaoFicha | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Qualquer ficha" },
  { valor: "enviada", rotulo: rotuloSituacaoFicha.enviada },
  { valor: "devolvida", rotulo: rotuloSituacaoFicha.devolvida },
  { valor: "aprovada", rotulo: rotuloSituacaoFicha.aprovada },
  { valor: "rascunho", rotulo: rotuloSituacaoFicha.rascunho }
];

const aguardandoRevisao = computed(() => filtros.ficha === "enviada");

function aplicar() {
  emit("aplicar", { ...filtros });
}

/** Clicar de novo na pilula marcada volta para "qualquer ficha" — o mesmo gesto do filtro de produtos. */
function alternarFila() {
  filtros.ficha = aguardandoRevisao.value ? "" : "enviada";
  aplicar();
}

function limpar() {
  Object.assign(filtros, PADRAO);
  aplicar();
}
</script>

<template>
  <v-row dense align="center" class="mb-2">
    <v-col cols="12" sm="auto">
      <!-- `aria-pressed` porque a pilula e um interruptor, nao um link: sem ele, o leitor de tela
           anuncia "botao" e nao diz se o recorte esta ligado. -->
      <v-btn
        :variant="aguardandoRevisao ? 'flat' : 'outlined'"
        :color="aguardandoRevisao ? 'primary' : undefined"
        :aria-pressed="aguardandoRevisao"
        prepend-icon="mdi-clock-alert-outline"
        class="filtro-fila"
        @click="alternarFila"
      >
        Aguardando revisão
      </v-btn>
    </v-col>

    <v-col cols="12" sm="4" md="3">
      <v-select
        v-model="filtros.ficha"
        :items="opcoesFicha"
        item-title="rotulo"
        item-value="valor"
        label="Ficha do candidato"
        density="comfortable"
        hide-details
      />
    </v-col>

    <v-col cols="12" sm="auto" class="d-flex ga-2">
      <v-btn variant="text" size="small" class="filtro-acao" @click="limpar">Limpar</v-btn>
      <v-btn variant="outlined" size="small" class="filtro-acao" :loading="carregando" @click="aplicar">
        Filtrar
      </v-btn>
    </v-col>
  </v-row>
</template>

<style scoped>
/* Alvo de toque: 40px de piso (`67` §9), 44px no celular (`67` §13.4). */
.filtro-fila,
.filtro-acao {
  min-height: 40px;
}

@media (max-width: 768px) {
  .filtro-fila,
  .filtro-acao {
    min-height: 44px;
  }

  .filtro-fila {
    width: 100%;
  }
}
</style>
