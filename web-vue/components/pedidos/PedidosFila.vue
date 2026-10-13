<script setup lang="ts">
import type { PedidoDto, PedidoStatus } from "@padaria/shared";
import { mascararWhatsapp } from "~/utils/formatacao";

const props = defineProps<{ pedidos: PedidoDto[] }>();
const emit = defineEmits<{ abrir: [id: string] }>();
const busca = ref("");
const situacaoSelecionada = ref<PedidoStatus | "">("");
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
const situacoesOperacionais: PedidoStatus[] = [
  "a_fazer",
  "enviado",
  "retornado",
  "confirmado",
  "recebido_parcial",
  "recebido"
];
const pedidosExibidos = computed(() => {
  const termo = busca.value.trim().toLocaleLowerCase("pt-BR");
  return props.pedidos.filter((pedido) => {
    const atendeTexto =
      !termo || `${pedido.fornecedorNome ?? ""} ${pedido.tipo}`.toLocaleLowerCase("pt-BR").includes(termo);
    return atendeTexto && (!situacaoSelecionada.value || pedido.status === situacaoSelecionada.value);
  });
});
const contagens = computed(() =>
  situacoesOperacionais.map((status) => ({
    status,
    total: props.pedidos.filter((pedido) => pedido.status === status).length
  }))
);
function corStatus(status: PedidoStatus) {
  if (status === "recebido") return "success";
  if (status === "recebido_parcial" || status === "confirmado") return "info";
  if (status === "cancelado") return "error";
  if (status === "retornado") return "warning";
  return "secondary";
}
/** O contador tambem FILTRA: clicar em "3 Enviado" mostra so os enviados; clicar de novo solta. */
function alternarSituacao(status: PedidoStatus) {
  situacaoSelecionada.value = situacaoSelecionada.value === status ? "" : status;
}

function telefone(valor: string | null) {
  return valor ? mascararWhatsapp(valor) : "Sem WhatsApp";
}

function quando(valor: string | null) {
  return valor
    ? new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Sem agendamento";
}
</script>

<template>
  <v-card>
    <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2"
      ><span>Fila de pedidos</span
      ><span class="text-body-2 text-medium-emphasis">{{ pedidosExibidos.length }} exibido(s)</span></v-card-title
    >
    <v-card-text class="d-grid ga-4">
      <div class="d-flex flex-wrap ga-2">
        <v-chip
          v-for="contagem in contagens"
          :key="contagem.status"
          :color="corStatus(contagem.status)"
          :variant="situacaoSelecionada === contagem.status ? 'flat' : 'tonal'"
          size="small"
          label
          link
          :aria-pressed="situacaoSelecionada === contagem.status"
          @click="alternarSituacao(contagem.status)"
          >{{ contagem.total }} {{ rotulosStatus[contagem.status] }}</v-chip
        >
      </div>
      <v-row dense>
        <v-col cols="12" sm="7"
          ><v-text-field
            v-model="busca"
            label="Buscar fornecedor"
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
        /></v-col>
        <v-col cols="12" sm="5"
          ><v-select
            v-model="situacaoSelecionada"
            :items="situacoesOperacionais.map((status) => ({ title: rotulosStatus[status], value: status }))"
            label="Situação"
            clearable
            hide-details
        /></v-col>
      </v-row>
      <div class="d-none d-md-block">
        <v-table density="comfortable"
          ><thead>
            <tr>
              <th>Fornecedor</th>
              <th>Origem</th>
              <th>Situação</th>
              <th>Itens</th>
              <th>Revisar em</th>
              <th class="text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!pedidosExibidos.length">
              <td colspan="6" class="text-center text-medium-emphasis py-8">Nenhum pedido encontrado.</td>
            </tr>
            <tr v-for="pedido in pedidosExibidos" :key="pedido.id">
              <td>
                <div class="font-weight-medium">{{ pedido.fornecedorNome ?? "Histórico sem fornecedor" }}</div>
                <div class="text-caption text-medium-emphasis">{{ telefone(pedido.fornecedorWhatsapp) }}</div>
              </td>
              <td>{{ pedido.tipo === "automatico" ? "Sugestão" : "Manual" }}</td>
              <td>
                <v-chip :color="corStatus(pedido.status)" size="small" label>{{ rotulosStatus[pedido.status] }}</v-chip>
              </td>
              <td>{{ pedido.totalItens }}</td>
              <td>{{ quando(pedido.dataAgendada) }}</td>
              <td class="text-right">
                <v-btn size="small" variant="text" prepend-icon="mdi-eye" @click="emit('abrir', pedido.id)"
                  >Abrir</v-btn
                >
              </td>
            </tr>
          </tbody></v-table
        >
      </div>
      <div class="d-md-none d-grid ga-3">
        <v-card v-if="!pedidosExibidos.length" variant="tonal"
          ><v-card-text class="text-center text-medium-emphasis">Nenhum pedido encontrado.</v-card-text></v-card
        >
        <v-card v-for="pedido in pedidosExibidos" :key="pedido.id" variant="outlined"
          ><v-card-text class="d-grid ga-2"
            ><div class="d-flex justify-space-between ga-2">
              <div>
                <div class="font-weight-bold">{{ pedido.fornecedorNome ?? "Histórico sem fornecedor" }}</div>
                <div class="text-caption text-medium-emphasis">
                  {{ pedido.tipo === "automatico" ? "Sugestão de reposição" : "Pedido manual" }}
                </div>
              </div>
              <v-chip :color="corStatus(pedido.status)" size="small" label>{{ rotulosStatus[pedido.status] }}</v-chip>
            </div>
            <div class="d-flex justify-space-between text-body-2">
              <span>{{ pedido.totalItens }} item(ns)</span><span>{{ quando(pedido.dataAgendada) }}</span>
            </div>
            <v-btn block variant="tonal" prepend-icon="mdi-eye" @click="emit('abrir', pedido.id)"
              >Ver pedido</v-btn
            ></v-card-text
          ></v-card
        >
      </div>
    </v-card-text>
  </v-card>
</template>
