<script setup lang="ts">
import type { PedidoDto, PedidoStatus } from "@padaria/shared";

const aberto = defineModel<boolean>({ default: false });
defineProps<{
  pedido: PedidoDto | null;
  podeEditar: boolean;
  podeReceber: boolean;
  transicionando: boolean;
}>();
const emit = defineEmits<{
  editar: [pedido: PedidoDto];
  enviarWhatsapp: [];
  situacao: [status: "retornado" | "confirmado" | "cancelado"];
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
  <v-dialog v-model="aberto" max-width="850">
    <v-card v-if="pedido">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>{{ pedido.fornecedorNome ?? "Pedido histórico" }}</span>
        <v-chip :color="corStatus(pedido.status)" size="small">{{ rotulosStatus[pedido.status] }}</v-chip>
      </v-card-title>
      <v-card-text class="d-grid ga-3">
        <v-alert v-if="pedido.status === 'rascunho' || pedido.status === 'aprovado'" type="warning" variant="tonal">
          Pedido histórico: leitura preservada; não entra no novo fluxo sem migração de dados aprovada.
        </v-alert>
        <div v-else class="d-flex flex-wrap ga-1">
          <v-chip
            v-for="etapa in etapas"
            :key="etapa"
            :color="etapaAtual(pedido, etapa) ? corStatus(etapa) : undefined"
            :variant="etapaAtual(pedido, etapa) ? 'tonal' : 'outlined'"
            size="small"
            >{{ rotulosStatus[etapa] }}</v-chip
          >
        </div>
        <div class="d-none d-sm-block">
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
                <td class="text-right">{{ item.quantidade }}</td>
                <td class="text-right">{{ item.quantidadeRecebida }}</td>
                <td class="text-right">{{ item.quantidadePendente }}</td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <div class="d-sm-none d-grid ga-2">
          <v-card v-for="item in pedido.itens ?? []" :key="item.id" variant="tonal">
            <v-card-text class="py-3"
              ><div class="font-weight-medium">{{ item.descricaoProduto }}</div>
              <div class="d-flex justify-space-between text-body-2 mt-2">
                <span>Pedido {{ item.quantidade }}</span
                ><span>Recebido {{ item.quantidadeRecebida }}</span>
              </div>
              <div class="text-caption text-medium-emphasis mt-1">
                Pendente: {{ item.quantidadePendente }}
              </div></v-card-text
            >
          </v-card>
        </div>
        <v-list v-if="pedido.eventos?.length" density="compact" data-secao="historico-pedido">
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
      <v-card-actions class="flex-wrap">
        <v-btn v-if="podeEditar && pedido.status === 'a_fazer'" @click="emit('editar', pedido)">Editar</v-btn>
        <v-btn
          v-if="podeEditar && pedido.status === 'a_fazer'"
          color="primary"
          :loading="transicionando"
          @click="emit('enviarWhatsapp')"
          >Enviar WhatsApp</v-btn
        >
        <v-btn
          v-if="podeEditar && pedido.status === 'enviado'"
          :loading="transicionando"
          @click="emit('situacao', 'retornado')"
          >Marcar retornado</v-btn
        >
        <v-btn
          v-if="podeEditar && ['enviado', 'retornado'].includes(pedido.status)"
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
