<script setup lang="ts">
import type { PedidoDto, PedidoStatus } from "@padaria/shared";
import PedidoCotacaoPainel from "~/components/pedidos/PedidoCotacaoPainel.vue";
import { formatarQuantidade } from "~/utils/formatacao";

const aberto = defineModel<boolean>({ default: false });
defineProps<{
  pedido: PedidoDto | null;
  podeEditar: boolean;
  podeReceber: boolean;
  transicionando: boolean;
  /** Link de cotacao gerado nesta sessao para este pedido, para copiar. */
  linkCotacao: string | null;
}>();
const emit = defineEmits<{
  editar: [pedido: PedidoDto];
  enviarCotacao: [];
  copiarLink: [link: string];
  situacao: [status: "confirmado" | "cancelado"];
  receber: [];
}>();

const rotulosStatus: Record<PedidoStatus, string> = {
  rascunho: "Legado: rascunho",
  aprovado: "Legado: aprovado",
  a_fazer: "A fazer",
  enviado: "Enviado",
  retornado: "Retornado",
  confirmado: "Confirmado",
  recebido_parcial: "Recebido parcialmente",
  recebido: "Recebido",
  cancelado: "Cancelado"
};
const etapas: PedidoStatus[] = ["a_fazer", "enviado", "retornado", "confirmado", "recebido_parcial", "recebido"];
function corStatus(status: PedidoStatus) {
  if (status === "recebido") return "success";
  if (status === "recebido_parcial" || status === "confirmado") return "info";
  if (status === "cancelado") return "error";
  if (status === "retornado") return "warning";
  return "secondary";
}
function etapaAtual(pedido: PedidoDto, etapa: PedidoStatus) {
  if (pedido.status === "cancelado" || pedido.status === "rascunho" || pedido.status === "aprovado")
    return pedido.status === etapa;
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
            {{ pedido.tipo === "automatico" ? "Sugestão de reposição" : "Pedido manual" }}
          </p>
        </div>
        <v-chip :color="corStatus(pedido.status)" size="small">{{ rotulosStatus[pedido.status] }}</v-chip>
      </v-card-title>
      <v-card-text class="pedido-detalhe__corpo">
        <v-alert v-if="pedido.status === 'rascunho' || pedido.status === 'aprovado'" type="warning" variant="tonal">
          Pedido histórico: leitura preservada; não entra no novo fluxo sem migração de dados aprovada.
        </v-alert>
        <div v-else class="pedido-detalhe__etapas">
          <v-chip
            v-for="etapa in etapas"
            :key="etapa"
            :color="etapaAtual(pedido, etapa) ? corStatus(etapa) : undefined"
            :variant="etapaAtual(pedido, etapa) ? 'tonal' : 'outlined'"
            size="small"
            >{{ rotulosStatus[etapa] }}</v-chip
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
        <PedidoCotacaoPainel
          v-if="
            pedido.cotacao &&
            ['enviado', 'retornado', 'confirmado', 'recebido_parcial', 'recebido', 'cancelado'].includes(pedido.status)
          "
          :cotacao="pedido.cotacao"
          :status="pedido.status"
          :link="linkCotacao"
          :pode-editar="podeEditar"
          :transicionando="transicionando"
          @novo-link="emit('enviarCotacao')"
          @copiar="(link) => emit('copiarLink', link)"
        />
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
            :title="`${rotulosStatus[evento.status]} · ${evento.criadoPorNome}`"
            :subtitle="`${new Date(evento.criadoEm).toLocaleString('pt-BR')} · ${evento.observacao ?? 'Sem observação'}`"
          />
        </v-list>
      </v-card-text>
      <v-card-actions class="pedido-detalhe__acoes flex-wrap">
        <v-btn v-if="podeEditar && pedido.status === 'a_fazer'" @click="emit('editar', pedido)">Editar</v-btn>
        <v-btn
          v-if="podeEditar && pedido.status === 'a_fazer'"
          color="primary"
          :loading="transicionando"
          prepend-icon="mdi-whatsapp"
          @click="emit('enviarCotacao')"
          >Enviar cotação</v-btn
        >
        <v-btn
          v-if="podeEditar && pedido.status === 'retornado'"
          color="primary"
          :loading="transicionando"
          @click="emit('situacao', 'confirmado')"
          >Confirmar negociação</v-btn
        >
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
