<script setup lang="ts">
/**
 * A cotação inteira (doc 58 §4): o que ainda não foi comprado e por quê, encerrar a cotação antes do prazo, levar
 * o que sobrou para um Pedido urgente ou encerrar a solicitação. Aceitar ou contrapropor uma oferta é na cotação do
 * produto — daqui só se abre o produto.
 */
import { useRodadaDecisoes } from "~/composables/useRodadaDecisoes";
import {
  AJUDA_MOTIVO,
  COR_MOTIVO,
  ROTULO_MOTIVO,
  formatarValorDecisao,
  itensParaNovaSolicitacao
} from "~/utils/decisao-compras";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  empresaId: string;
  rodadaId: string | null;
  podeEditar: boolean;
  podeCriar: boolean;
}>();
const emit = defineEmits<{
  mudou: [];
  produto: [produtoId: string];
  "nova-solicitacao": [itens: Array<{ produtoId: string; quantidade: string }>];
}>();

const empresaIdRef = computed(() => props.empresaId);
const { decisoes, carregando, processando, erro, carregar, encerrar, encerrarRodada } = useRodadaDecisoes(empresaIdRef);
const confirmandoEncerrar = ref(false);
const confirmandoEncerrarRodada = ref(false);

const ROTULO_RODADA: Record<string, string> = {
  aberta: "Cotação aberta",
  fechada: "Cotação fechada",
  cancelada: "Cotação cancelada"
};
const itens = computed(() => decisoes.value?.itens ?? []);
const fechada = computed(() => decisoes.value?.status === "fechada");
const podeEncerrarRodada = computed(() => props.podeEditar && decisoes.value?.status === "aberta");
// Com a cotação aberta o fornecedor ainda pode vender estes itens: levar os pendentes para outro pedido agora
// poderia comprar o mesmo produto duas vezes.
const podeLevarPendentes = computed(() => props.podeCriar && fechada.value && itens.value.length > 0);
// Fechada com item sem vencedor = solicitação parcialmente comprada (statusSolicitacaoAposFechamento).
const podeEncerrarSolicitacao = computed(() => props.podeEditar && fechada.value && itens.value.length > 0);

watch(
  () => [aberto.value, props.rodadaId] as const,
  ([visivel, rodadaId]) => {
    confirmandoEncerrar.value = false;
    confirmandoEncerrarRodada.value = false;
    if (visivel && rodadaId) void carregar(rodadaId);
  },
  { immediate: true }
);

async function confirmarEncerrarRodada() {
  if (!props.rodadaId) return;
  const encerrou = await encerrarRodada(props.rodadaId);
  confirmandoEncerrarRodada.value = false;
  if (encerrou) emit("mudou");
  await carregar(props.rodadaId, !encerrou);
}

async function confirmarEncerramento() {
  if (!decisoes.value) return;
  if (await encerrar(decisoes.value.solicitacaoId)) {
    confirmandoEncerrar.value = false;
    emit("mudou");
    aberto.value = false;
  }
}

function levarParaNovaSolicitacao() {
  emit("nova-solicitacao", itensParaNovaSolicitacao(itens.value));
  aberto.value = false;
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="760" scrollable>
    <v-card data-dialogo="acoes-cotacao">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-gavel" color="primary" />
        Decisões da cotação
      </v-card-title>
      <v-card-subtitle v-if="decisoes">
        {{ ROTULO_RODADA[decisoes.status] ?? decisoes.status }} · {{ decisoes.itensComprados }} de
        {{ decisoes.totalItens }} produto(s) comprado(s)
      </v-card-subtitle>
      <v-card-text class="d-grid ga-3">
        <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
        <v-progress-linear v-if="carregando" indeterminate />
        <v-alert v-if="decisoes && !itens.length" type="success" variant="tonal" density="compact">
          Nada pendente. Tudo que foi pedido já foi comprado.
        </v-alert>

        <div v-for="item in itens" :key="item.rodadaItemId" class="pendente" :data-produto="item.descricaoProduto">
          <div class="pendente__dados">
            <strong>{{ item.descricaoProduto }}</strong>
            <span class="text-caption text-medium-emphasis"
              >{{ Number(item.quantidade) }} · referência {{ formatarValorDecisao(item.precoBaseValor) }}</span
            >
            <span class="text-caption text-medium-emphasis">{{ AJUDA_MOTIVO[item.motivo] }}</span>
          </div>
          <div class="pendente__acao">
            <v-chip size="small" variant="tonal" label :color="COR_MOTIVO[item.motivo]">{{
              ROTULO_MOTIVO[item.motivo]
            }}</v-chip>
            <v-btn size="small" variant="tonal" @click="emit('produto', item.produtoId)">Ver ofertas</v-btn>
          </div>
        </div>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <template v-if="podeEncerrarRodada">
          <template v-if="confirmandoEncerrarRodada">
            <span class="text-caption">Os fornecedores não poderão mais responder. Encerrar a cotação agora?</span>
            <v-btn color="primary" variant="flat" size="small" :loading="processando" @click="confirmarEncerrarRodada"
              >Encerrar cotação</v-btn
            >
            <v-btn variant="text" size="small" :disabled="processando" @click="confirmandoEncerrarRodada = false"
              >Voltar</v-btn
            >
          </template>
          <v-btn
            v-else
            variant="tonal"
            color="primary"
            prepend-icon="mdi-flag-checkered"
            @click="confirmandoEncerrarRodada = true"
            >Encerrar cotação agora</v-btn
          >
        </template>
        <v-btn
          v-if="podeLevarPendentes"
          variant="text"
          prepend-icon="mdi-playlist-plus"
          @click="levarParaNovaSolicitacao"
          >Pedido urgente com os pendentes</v-btn
        >
        <template v-if="podeEncerrarSolicitacao">
          <template v-if="confirmandoEncerrar">
            <span class="text-caption">Encerrar sem comprar o que sobrou?</span>
            <v-btn color="error" variant="flat" size="small" :loading="processando" @click="confirmarEncerramento"
              >Encerrar</v-btn
            >
            <v-btn variant="text" size="small" :disabled="processando" @click="confirmandoEncerrar = false"
              >Voltar</v-btn
            >
          </template>
          <v-btn
            v-else
            variant="text"
            color="error"
            prepend-icon="mdi-close-circle-outline"
            @click="confirmandoEncerrar = true"
            >Encerrar solicitação</v-btn
          >
        </template>
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.pendente {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
}

.pendente__dados {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.pendente__acao {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}
</style>
