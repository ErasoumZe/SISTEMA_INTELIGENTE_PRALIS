<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { SituacaoFicha } from "@padaria/shared";
import { fichaRevisavel } from "~/utils/admissoes";

/**
 * ADM-003 V5 — a decisao do DP sobre a ficha: aprovar ou devolver. UM lugar para os dois atos.
 *
 * Os botoes so existem quando ha decisao a tomar: ficha `enviada` E permissao de revisar. Fora
 * disso o componente nao renderiza nada — botao que o servidor recusaria com 409 e o botao morto
 * que a D-8.1 do PROJECT_BRAIN/44 tirou do modal, e nao volta aqui.
 *
 * Devolver exige texto: e o que o candidato vai ler ao reabrir o link. O servidor tambem recusa
 * pendencia vazia (`PENDENCIA_OBRIGATORIA`); a barreira aqui e para o DP nao descobrir isso depois
 * de clicar. Aprovar pede confirmacao porque e irreversivel pela tela: a ficha deixa de ser
 * editavel pelo candidato.
 */
const props = defineProps<{
  situacao: SituacaoFicha;
  podeRevisar: boolean;
  processando: boolean;
}>();

const emit = defineEmits<{
  (event: "aprovar"): void;
  (event: "devolver", pendencias: string): void;
}>();

// O mesmo teto do contrato (`devolverFichaPayloadSchema`): a tela avisa antes, o servidor recusa depois.
const LIMITE_PENDENCIAS = 2000;

const visivel = computed(() => props.podeRevisar && fichaRevisavel(props.situacao));

const confirmandoAprovacao = ref(false);
const devolvendo = ref(false);
const pendencias = ref("");
const tentouDevolver = ref(false);

const pendenciasLimpas = computed(() => pendencias.value.trim());
const erroPendencias = computed(() => {
  if (!tentouDevolver.value) return "";
  if (!pendenciasLimpas.value) return "Escreva o que precisa ser corrigido.";
  if (pendenciasLimpas.value.length > LIMITE_PENDENCIAS) return `No máximo ${LIMITE_PENDENCIAS} caracteres.`;
  return "";
});

function abrirDevolucao() {
  tentouDevolver.value = false;
  pendencias.value = "";
  devolvendo.value = true;
}

function confirmarDevolucao() {
  tentouDevolver.value = true;
  if (erroPendencias.value) return;
  emit("devolver", pendenciasLimpas.value);
  devolvendo.value = false;
}

function confirmarAprovacao() {
  confirmandoAprovacao.value = false;
  emit("aprovar");
}

/**
 * Devolver o foco a quem abriu — a mesma disciplina do modal do processo. Os dois dialogos abrem
 * programaticamente, sem `activator`, e o Vuetify nao refoca nada: ao fechar, o foco cairia no
 * `body` e a navegacao por teclado recomecaria do topo da pagina.
 */
let origemDoFoco: HTMLElement | null = null;

watch([devolvendo, confirmandoAprovacao], async ([abriuDevolucao, abriuAprovacao], [tinhaDevolucao, tinhaAprovacao]) => {
  const abriu = (abriuDevolucao && !tinhaDevolucao) || (abriuAprovacao && !tinhaAprovacao);
  const fechou = (!abriuDevolucao && tinhaDevolucao) || (!abriuAprovacao && tinhaAprovacao);
  if (abriu) {
    const ativo = document.activeElement;
    origemDoFoco = ativo instanceof HTMLElement ? ativo : null;
    return;
  }
  if (!fechou) return;
  const alvo = origemDoFoco;
  origemDoFoco = null;
  await nextTick();
  if (alvo?.isConnected) alvo.focus({ preventScroll: true });
});
</script>

<template>
  <footer v-if="visivel" class="decisao" aria-label="Decisão sobre a ficha">
    <p class="decisao__texto">
      Conferiu os dados? <strong>Aprovar</strong> encerra a edição pelo candidato.
      <strong>Devolver</strong> reabre o mesmo link com as pendências que você escrever.
    </p>
    <div class="decisao__botoes">
      <v-btn variant="outlined" color="warning" class="decisao__botao" :disabled="processando" @click="abrirDevolucao">
        Devolver para correção
      </v-btn>
      <v-btn
        color="primary"
        variant="flat"
        class="decisao__botao"
        :loading="processando"
        :disabled="processando"
        @click="confirmandoAprovacao = true"
      >
        Aprovar ficha
      </v-btn>
    </div>
  </footer>

  <!-- `persistent`: segura texto nao enviado. Escape e clique fora nao podem apagar o que o DP
       escreveu para o candidato. -->
  <v-dialog v-model="devolvendo" max-width="560" persistent scrollable>
    <v-card role="dialog" aria-labelledby="titulo-devolver-ficha">
      <v-card-title id="titulo-devolver-ficha">Devolver para correção</v-card-title>
      <v-card-text>
        <p class="mb-3">O candidato vai ler exatamente este texto ao abrir o link. Diga o que precisa ser corrigido.</p>
        <v-textarea
          v-model="pendencias"
          label="Pendências"
          :error-messages="erroPendencias ? [erroPendencias] : []"
          :counter="LIMITE_PENDENCIAS"
          rows="4"
          auto-grow
          autofocus
          data-campo="pendencias"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="devolvendo = false">Voltar</v-btn>
        <v-btn color="warning" variant="flat" @click="confirmarDevolucao">Devolver ficha</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="confirmandoAprovacao" max-width="460">
    <v-card role="dialog" aria-labelledby="titulo-aprovar-ficha">
      <v-card-title id="titulo-aprovar-ficha">Aprovar ficha</v-card-title>
      <v-card-text>
        <p class="mb-2">Os dados conferem?</p>
        <p class="mb-0">
          Depois de aprovada, a ficha deixa de ser editável pelo candidato e o histórico registra quem aprovou e
          quando. Isto <strong>não</strong> cria colaborador: a efetivação é outra etapa.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="confirmandoAprovacao = false">Voltar</v-btn>
        <v-btn color="primary" variant="flat" @click="confirmarAprovacao">Aprovar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Barra de decisao presa ao rodape enquanto a ficha rola: o DP le tudo e decide sem voltar ao topo. */
.decisao {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3) var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  border: 1px solid var(--cx-line-soft);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-2);
  min-width: 0;
}

.decisao__texto {
  flex: 1 1 24rem;
  margin: 0;
  min-width: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.decisao__botoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}

/* Alvo de toque: 40px de piso (`67` §9), 44px no celular (`67` §13.4). */
.decisao__botao {
  min-height: 40px;
}

@media (max-width: 768px) {
  .decisao {
    padding: var(--cx-sp-3) var(--cx-sp-4);
    border-radius: var(--cx-r-lg) var(--cx-r-lg) 0 0;
  }

  .decisao__botoes {
    flex: 1 1 100%;
    flex-direction: column-reverse;
  }

  .decisao__botao {
    width: 100%;
    min-height: 44px;
  }
}
</style>
