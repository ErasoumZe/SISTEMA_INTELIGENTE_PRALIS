<script setup lang="ts">
/**
 * Fila de decisão do Comprador (R-221, E6): o que ficou sem vencedor na rodada, por quê, e o que cada
 * fornecedor ofereceu. Daqui o Comprador aprova uma compra por exceção (permissão própria), encerra a
 * solicitação ou leva os itens que sobraram para um Pedido rápido com outro fornecedor — não existe segunda rodada.
 *
 * Aprovar é irreversível (vira pedido confirmado), por isso pede confirmação na própria linha.
 */
import type { StatusSolicitacao } from "@padaria/shared";
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
  solicitacaoId: string | null;
  solicitacaoStatus: StatusSolicitacao | null;
  podeExcecao: boolean;
  podeEditar: boolean;
  podeCriar: boolean;
}>();
const emit = defineEmits<{
  mudou: [];
  "nova-solicitacao": [itens: Array<{ produtoId: string; quantidade: string }>];
}>();

const empresaIdRef = computed(() => props.empresaId);
const { decisoes, carregando, processando, erro, carregar, aprovar, encerrar, encerrarRodada, contrapropor } =
  useRodadaDecisoes(empresaIdRef);
const confirmandoEncerrar = ref(false);
const confirmandoEncerrarRodada = ref(false);

const ROTULO_RODADA: Record<string, string> = {
  aberta: "Rodada aberta",
  fechada: "Rodada fechada",
  cancelada: "Rodada cancelada"
};
const itens = computed(() => decisoes.value?.itens ?? []);
// A excecao so vale com a rodada FECHADA (a API recusa com 422): com ela aberta, aprovar travaria o
// item e uma oferta melhor que chegasse depois perderia.
const rodadaFechada = computed(() => decisoes.value?.status === "fechada");
const podeEncerrarRodada = computed(() => props.podeEditar && decisoes.value?.status === "aberta");
// Com a rodada aberta o fornecedor ainda pode vender estes itens sozinho (compra automatica): levar os
// pendentes para outra solicitacao agora poderia comprar o mesmo item duas vezes.
const podeLevarPendentes = computed(
  () => props.podeCriar && decisoes.value?.status === "fechada" && itens.value.length > 0
);
const podeEncerrarSolicitacao = computed(
  () => props.podeEditar && props.solicitacaoStatus === "parcialmente_comprada" && itens.value.length > 0
);

watch(
  () => [aberto.value, props.solicitacaoId] as const,
  ([visivel, solicitacaoId]) => {
    confirmandoEncerrar.value = false;
    confirmandoEncerrarRodada.value = false;
    if (visivel && solicitacaoId) void carregar(solicitacaoId);
  },
  { immediate: true }
);

async function confirmarAprovacao(propostaItemId: string) {
  if (!props.solicitacaoId || !decisoes.value) return;
  const aprovou = await aprovar(decisoes.value.rodadaId, propostaItemId);
  if (aprovou) emit("mudou");
  // Em conflito (proposta superada, item ja vendido) a fila na tela esta velha: recarrega e mantem a
  // mensagem de erro, senao o Comprador continuaria vendo o botao armado sobre uma proposta morta.
  await carregar(props.solicitacaoId, !aprovou);
}

// E7: a fila recarrega para mostrar a contraproposta pendente (ou o erro, se a API recusou).
async function contrapor(conviteId: string, rodadaItemId: string, valor: number) {
  if (!props.solicitacaoId || !decisoes.value) return;
  const enviou = await contrapropor(decisoes.value.rodadaId, conviteId, rodadaItemId, valor);
  await carregar(props.solicitacaoId, !enviou);
}

async function confirmarEncerrarRodada() {
  if (!props.solicitacaoId || !decisoes.value) return;
  const encerrou = await encerrarRodada(decisoes.value.rodadaId);
  confirmandoEncerrarRodada.value = false;
  if (encerrou) emit("mudou");
  await carregar(props.solicitacaoId, !encerrou);
}

async function confirmarEncerramento() {
  if (!props.solicitacaoId) return;
  if (await encerrar(props.solicitacaoId)) {
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
  <v-dialog v-model="aberto" max-width="860" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-gavel" color="primary" />
        Decisões da rodada
      </v-card-title>
      <v-card-subtitle v-if="decisoes">
        {{ ROTULO_RODADA[decisoes.status] ?? decisoes.status }} · {{ decisoes.itensComprados }} de
        {{ decisoes.totalItens }} item(ns) comprado(s)
      </v-card-subtitle>
      <v-card-text class="d-grid ga-3">
        <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
        <v-progress-linear v-if="carregando" indeterminate />
        <v-alert v-if="decisoes?.status === 'aberta'" type="info" variant="tonal" density="compact">
          A rodada ainda está aberta: os fornecedores podem enviar novas respostas. Esta lista mostra o que não foi
          comprado até agora. Aprovar compra fora da base só é possível depois do fechamento; se for urgente, encerre a
          rodada agora.
        </v-alert>
        <v-alert v-if="decisoes && !itens.length" type="success" variant="tonal" density="compact">
          Nenhum item pendente. Tudo que foi pedido tem fornecedor.
        </v-alert>
        <v-alert v-if="itens.length && !podeExcecao" type="warning" variant="tonal" density="compact">
          Aprovar compra fora do preço-base exige a permissão de exceção. Você pode ver as propostas, mas não
          aprová-las.
        </v-alert>

        <div v-for="item in itens" :key="item.rodadaItemId" class="decisao">
          <div class="decisao__topo">
            <div>
              <strong>{{ item.descricaoProduto }}</strong>
              <span class="text-caption text-medium-emphasis ml-2"
                >{{ Number(item.quantidade) }} un · base {{ formatarValorDecisao(item.precoBaseValor) }}</span
              >
            </div>
            <v-chip size="small" variant="tonal" label :color="COR_MOTIVO[item.motivo]">{{
              ROTULO_MOTIVO[item.motivo]
            }}</v-chip>
          </div>
          <p class="text-caption text-medium-emphasis mb-0">{{ AJUDA_MOTIVO[item.motivo] }}</p>

          <ComprasDecisaoProposta
            v-for="proposta in item.propostas"
            :key="proposta.propostaItemId"
            :proposta="proposta"
            :quantidade="item.quantidade"
            :rodada-item-id="item.rodadaItemId"
            :rodada-aberta="decisoes?.status === 'aberta'"
            :rodada-fechada="rodadaFechada"
            :pode-editar="podeEditar"
            :pode-excecao="podeExcecao"
            :processando="processando"
            @aprovar="confirmarAprovacao"
            @contrapropor="contrapor"
          />
          <p v-if="!item.propostas.length" class="text-caption mb-0">Nenhuma proposta recebida para este item.</p>
        </div>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <template v-if="podeEncerrarRodada">
          <template v-if="confirmandoEncerrarRodada">
            <span class="text-caption">Os fornecedores não poderão mais responder. Encerrar a rodada agora?</span>
            <v-btn color="primary" variant="flat" size="small" :loading="processando" @click="confirmarEncerrarRodada"
              >Encerrar rodada</v-btn
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
            >Encerrar rodada agora</v-btn
          >
        </template>
        <v-btn
          v-if="podeLevarPendentes"
          variant="text"
          prepend-icon="mdi-playlist-plus"
          @click="levarParaNovaSolicitacao"
          >Pedido rápido com os pendentes</v-btn
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
.decisao {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
}

.decisao__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}

.proposta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  padding-top: var(--cx-sp-2);
  border-top: 1px dashed var(--cx-line-soft);
}

.proposta__dados {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--cx-sp-2) var(--cx-sp-3);
  min-width: 0;
}

.proposta__acao {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}
</style>
