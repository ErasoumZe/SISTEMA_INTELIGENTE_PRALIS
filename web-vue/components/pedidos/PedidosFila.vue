<script setup lang="ts">
import type { PedidoDto, PedidoStatus } from "@padaria/shared";
import { mascararWhatsapp } from "~/utils/formatacao";
import { rotuloDoTipoDePedido } from "~/utils/pedido-origem";

const props = defineProps<{ pedidos: PedidoDto[] }>();
const emit = defineEmits<{ abrir: [id: string] }>();
const busca = ref("");
// O pedido nasce da rodada ja confirmado: a fila abre onde ele esta (o legado em andamento tem as abas proprias).
const situacaoSelecionada = ref<PedidoStatus>("confirmado");
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
  "recebido",
  "cancelado"
];
const pedidosExibidos = computed(() => {
  const termo = busca.value.trim().toLocaleLowerCase("pt-BR");
  return props.pedidos.filter((pedido) => {
    const atendeTexto =
      !termo || `${pedido.fornecedorNome ?? ""} ${pedido.tipo}`.toLocaleLowerCase("pt-BR").includes(termo);
    return atendeTexto && pedido.status === situacaoSelecionada.value;
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
  <v-card class="pedidos-fila">
    <v-card-title class="pedidos-fila__topo">
      <div>
        <h2 class="pedidos-fila__titulo">Fila de pedidos</h2>
        <p class="pedidos-fila__subtitulo">Acompanhe cada compra da criação ao recebimento.</p>
      </div>
      <v-chip size="small" variant="tonal" label>{{ pedidosExibidos.length }} exibido(s)</v-chip>
    </v-card-title>
    <v-card-text class="pedidos-fila__corpo">
      <div class="pedidos-fila__trilha">
        <v-tabs
          v-model="situacaoSelecionada"
          class="pedidos-fila__abas"
          color="primary"
          show-arrows
          aria-label="Etapas do ciclo de pedido"
        >
          <v-tab v-for="contagem in contagens" :key="contagem.status" :value="contagem.status">
            {{ rotulosStatus[contagem.status] }} <span class="pedidos-fila__contagem">{{ contagem.total }}</span>
          </v-tab>
        </v-tabs>
      </div>
      <v-text-field
        v-model="busca"
        class="pedidos-fila__busca"
        label="Buscar fornecedor"
        prepend-inner-icon="mdi-magnify"
        clearable
        hide-details
      />
      <div class="pedidos-fila__tabela d-none d-md-block">
        <v-table density="comfortable">
          <thead>
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
              <td>{{ rotuloDoTipoDePedido(pedido.tipo) }}</td>
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
          </tbody>
        </v-table>
      </div>
      <div class="pedidos-fila__mobile d-md-none d-grid ga-3">
        <v-card v-if="!pedidosExibidos.length" variant="tonal">
          <v-card-text class="text-center text-medium-emphasis">Nenhum pedido encontrado.</v-card-text>
        </v-card>
        <v-card v-for="pedido in pedidosExibidos" :key="pedido.id" class="pedidos-fila__cartao-mobile">
          <v-card-text class="d-grid ga-2">
            <div class="d-flex justify-space-between ga-2">
              <div>
                <div class="font-weight-bold">{{ pedido.fornecedorNome ?? "Histórico sem fornecedor" }}</div>
                <div class="text-caption text-medium-emphasis">
                  {{ rotuloDoTipoDePedido(pedido.tipo) }}
                </div>
              </div>
              <v-chip :color="corStatus(pedido.status)" size="small" label>{{ rotulosStatus[pedido.status] }}</v-chip>
            </div>
            <div class="d-flex justify-space-between text-body-2">
              <span>{{ pedido.totalItens }} item(ns)</span><span>{{ quando(pedido.dataAgendada) }}</span>
            </div>
            <v-btn block variant="tonal" prepend-icon="mdi-eye" @click="emit('abrir', pedido.id)">Ver pedido</v-btn>
          </v-card-text>
        </v-card>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.pedidos-fila {
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-xl);
  background: var(--cx-surface-raised);
  box-shadow: var(--cx-e-1);
}

.pedidos-fila__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-6) var(--cx-sp-6) var(--cx-sp-4);
}

.pedidos-fila__titulo {
  color: var(--cx-ink);
  font-size: var(--cx-fs-title);
  font-weight: 650;
  letter-spacing: var(--cx-tracking-tight);
  line-height: 1.2;
}

.pedidos-fila__subtitulo {
  margin: var(--cx-sp-1) 0 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 400;
}

.pedidos-fila__corpo {
  display: grid;
  gap: var(--cx-sp-4);
  padding: 0 var(--cx-sp-6) var(--cx-sp-6);
}

.pedidos-fila__trilha {
  overflow: hidden;
  padding: var(--cx-sp-1);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-sunken);
}

.pedidos-fila__abas {
  max-width: 100%;
}

.pedidos-fila__abas :deep(.v-tab) {
  min-height: 42px;
  border-radius: var(--cx-r-md);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.pedidos-fila__abas :deep(.v-tab--selected) {
  background: var(--cx-surface-raised);
  box-shadow: var(--cx-e-1);
}

.pedidos-fila__contagem {
  min-width: 20px;
  margin-left: var(--cx-sp-2);
  padding: 1px var(--cx-sp-1);
  border-radius: var(--cx-r-pill);
  background: var(--cx-hover);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.pedidos-fila__busca {
  max-width: 440px;
}

.pedidos-fila__tabela {
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
}

.pedidos-fila__tabela :deep(th) {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}

.pedidos-fila__tabela :deep(tbody tr) {
  transition: background var(--cx-dur-1) var(--cx-ease);
}

.pedidos-fila__tabela :deep(tbody tr:hover) {
  background: var(--cx-hover);
}

.pedidos-fila__cartao-mobile {
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
  box-shadow: var(--cx-e-1);
}

@media (max-width: 599px) {
  .pedidos-fila__topo {
    padding: var(--cx-sp-5) var(--cx-sp-4) var(--cx-sp-3);
  }

  .pedidos-fila__corpo {
    padding: 0 var(--cx-sp-4) var(--cx-sp-4);
  }
}
</style>
