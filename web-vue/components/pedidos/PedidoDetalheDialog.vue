<script setup lang="ts">
import type { PedidoDto, PedidoStatus } from "@padaria/shared";
import { formatarQuantidade } from "~/utils/formatacao";
import {
  corStatusPedido as corStatus,
  pedidoEhLegado,
  rotuloDoTipoDePedido,
  rotuloStatusPedido
} from "~/utils/pedido-origem";

const aberto = defineModel<boolean>({ default: false });
defineProps<{
  pedido: PedidoDto | null;
  podeEditar: boolean;
  podeReceber: boolean;
  transicionando: boolean;
}>();
// Doc 58 §6: o pedido da cotacao nasce Comprado; o fornecedor pode ajustar a quantidade ao estoque dele (aparece no
// historico). Daqui se recebe ou se cancela.
const emit = defineEmits<{
  situacao: [status: "cancelado"];
  receber: [];
}>();

const etapasLegado: PedidoStatus[] = ["a_fazer", "enviado", "retornado", "confirmado", "recebido_parcial", "recebido"];
const etapasRodada: PedidoStatus[] = ["confirmado", "recebido_parcial", "recebido"];
const etapasDe = (pedido: PedidoDto) => (pedidoEhLegado(pedido.tipo) ? etapasLegado : etapasRodada);
function etapaAtual(pedido: PedidoDto, etapa: PedidoStatus) {
  if (pedido.status === "cancelado" || pedido.status === "rascunho" || pedido.status === "aprovado")
    return pedido.status === etapa;
  const etapas = etapasDe(pedido);
  return etapas.indexOf(etapa) <= etapas.indexOf(pedido.status);
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="900" scrollable>
    <v-card v-if="pedido" class="pedido-detalhe">
      <v-card-title class="pedido-detalhe__topo">
        <div>
          <h2 class="pedido-detalhe__titulo">{{ pedido.fornecedorNome ?? "Pedido histórico" }}</h2>
          <p class="pedido-detalhe__subtitulo">
            {{ pedido.totalItens }} item(ns) ·
            {{ rotuloDoTipoDePedido(pedido.tipo) }}
          </p>
        </div>
        <v-chip :color="corStatus(pedido.status)" size="small">{{ rotuloStatusPedido(pedido.status) }}</v-chip>
      </v-card-title>
      <v-card-text class="pedido-detalhe__corpo">
        <v-alert v-if="pedido.status === 'rascunho' || pedido.status === 'aprovado'" type="warning" variant="tonal">
          Pedido histórico: leitura preservada; não entra no novo fluxo sem migração de dados aprovada.
        </v-alert>
        <v-alert
          v-else-if="pedidoEhLegado(pedido.tipo) && ['a_fazer', 'enviado', 'retornado'].includes(pedido.status)"
          type="info"
          variant="tonal"
          density="compact"
          data-legado="pedido"
        >
          Pedido do fluxo antigo: não é mais editado, enviado nem confirmado. Só pode ser cancelado. Para comprar de
          novo, use o Pedido urgente.
        </v-alert>
        <div v-if="pedido.status !== 'rascunho' && pedido.status !== 'aprovado'" class="pedido-detalhe__etapas">
          <v-chip
            v-for="etapa in etapasDe(pedido)"
            :key="etapa"
            :color="etapaAtual(pedido, etapa) ? corStatus(etapa) : undefined"
            :variant="etapaAtual(pedido, etapa) ? 'tonal' : 'outlined'"
            size="small"
            >{{ rotuloStatusPedido(etapa) }}</v-chip
          >
        </div>
        <div class="pedido-detalhe__tabela d-none d-sm-block">
          <v-table density="compact">
            <thead>
              <tr>
                <th>Produto</th>
                <th class="text-right">Pedido</th>
                <th class="text-right">Recebido</th>
                <th class="text-right">Pendente</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pedido.itens ?? []" :key="item.id">
                <td>{{ item.descricaoProduto }}</td>
                <td class="text-right pedido-detalhe__numero">{{ formatarQuantidade(item.quantidade) }}</td>
                <td class="text-right pedido-detalhe__numero">{{ formatarQuantidade(item.quantidadeRecebida) }}</td>
                <td class="text-right pedido-detalhe__numero">{{ formatarQuantidade(item.quantidadePendente) }}</td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <div class="d-sm-none d-grid ga-2">
          <v-card v-for="item in pedido.itens ?? []" :key="item.id" class="pedido-detalhe__item-mobile">
            <v-card-text class="py-3"
              ><div class="font-weight-medium">{{ item.descricaoProduto }}</div>
              <div class="d-flex justify-space-between text-body-2 mt-2">
                <span>Pedido {{ formatarQuantidade(item.quantidade) }}</span
                ><span>Recebido {{ formatarQuantidade(item.quantidadeRecebida) }}</span>
              </div>
              <div class="text-caption text-medium-emphasis mt-1">
                Pendente: {{ formatarQuantidade(item.quantidadePendente) }}
              </div></v-card-text
            >
          </v-card>
        </div>
        <v-list
          v-if="pedido.eventos?.length"
          class="pedido-detalhe__historico"
          density="compact"
          data-secao="historico-pedido"
        >
          <v-list-subheader>Histórico</v-list-subheader>
          <v-list-item
            v-for="evento in pedido.eventos"
            :key="evento.id"
            data-evento="pedido"
            :title="`${rotuloStatusPedido(evento.status)} · ${evento.criadoPorNome}`"
            :subtitle="`${new Date(evento.criadoEm).toLocaleString('pt-BR')} · ${evento.observacao ?? 'Sem observação'}`"
          />
        </v-list>
      </v-card-text>
      <v-card-actions class="pedido-detalhe__acoes flex-wrap">
        <v-btn
          v-if="podeReceber && ['confirmado', 'recebido_parcial'].includes(pedido.status)"
          color="success"
          @click="emit('receber')"
          >Conferir recebimento</v-btn
        >
        <v-btn
          v-if="podeEditar && !['recebido', 'cancelado', 'rascunho', 'aprovado'].includes(pedido.status)"
          color="error"
          variant="text"
          :loading="transicionando"
          @click="emit('situacao', 'cancelado')"
          >Cancelar</v-btn
        >
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.pedido-detalhe {
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-xl);
  background: var(--cx-surface-raised);
  box-shadow: var(--cx-e-3);
}

.pedido-detalhe__topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-6);
  border-bottom: 1px solid var(--cx-line-soft);
}

.pedido-detalhe__titulo {
  color: var(--cx-ink);
  font-size: var(--cx-fs-title);
  font-weight: 650;
  letter-spacing: var(--cx-tracking-tight);
  line-height: 1.25;
}

.pedido-detalhe__subtitulo {
  margin: var(--cx-sp-1) 0 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 400;
}

.pedido-detalhe__corpo {
  display: grid;
  /* Linhas do tamanho do conteudo. Sem isto, num dialogo com altura limitada, os blocos com
     overflow: hidden (tabela e historico) tem tamanho minimo zero e sao ESPREMIDOS em vez de o
     corpo rolar: a tabela mostrava 1 de 3 itens e o historico so o primeiro evento. */
  grid-auto-rows: max-content;
  align-content: start;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-5) var(--cx-sp-6);
}

.pedido-detalhe__etapas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-sunken);
}

.pedido-detalhe__tabela {
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
}

.pedido-detalhe__tabela :deep(th) {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}

.pedido-detalhe__numero {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.pedido-detalhe__item-mobile {
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  box-shadow: none;
}

.pedido-detalhe__historico {
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
}

.pedido-detalhe__acoes {
  gap: var(--cx-sp-1);
  padding: var(--cx-sp-3) var(--cx-sp-6) var(--cx-sp-5);
  border-top: 1px solid var(--cx-line-soft);
}

@media (max-width: 599px) {
  .pedido-detalhe__topo,
  .pedido-detalhe__corpo,
  .pedido-detalhe__acoes {
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }

  .pedido-detalhe__topo {
    flex-direction: column;
  }
}
</style>
