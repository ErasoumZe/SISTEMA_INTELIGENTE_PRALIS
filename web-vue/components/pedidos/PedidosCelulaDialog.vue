<script setup lang="ts">
/**
 * O que está numa célula da matriz (doc 57 §4): os pedidos daquele fornecedor naquela situação, os convites
 * que ele ainda tem para responder ("Enviado") e, na linha "Sem fornecedor", o "A fazer".
 */
import {
  ROTULO_COLUNA_PAINEL,
  type ColunaPainel,
  type DecisaoPendenteDto,
  type LinhaPainel,
  type PainelComprasDto,
  type PedidoDto
} from "@padaria/shared";
import PedidosAFazerLista from "~/components/pedidos/PedidosAFazerLista.vue";
import type { Opcao } from "~/types/padaria";
import { rotuloDoTipoDePedido } from "~/utils/pedido-origem";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  linha: LinhaPainel | null;
  coluna: ColunaPainel | null;
  pedidos: PedidoDto[];
  painel: PainelComprasDto;
  fornecedores: Opcao[];
  empresaId: string;
  podeEditar: boolean;
}>();
const emit = defineEmits<{
  pedido: [id: string];
  rodada: [rodadaId: string];
  decidir: [decisao: DecisaoPendenteDto];
  convidado: [nome: string];
}>();

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const ROTULO_ENVIO = { pendente: "Na fila do WhatsApp", enviado: "Enviado pelo WhatsApp", falhou: "WhatsApp falhou" };

const fornecedorId = computed(() => props.linha?.fornecedorId ?? null);
const pedidosDaCelula = computed(() =>
  props.pedidos.filter((pedido) => pedido.fornecedorId === fornecedorId.value && pedido.status === props.coluna)
);
const convitesDaCelula = computed(() =>
  props.coluna === "enviado" && fornecedorId.value
    ? props.painel.convites.filter((convite) => convite.fornecedorId === fornecedorId.value)
    : []
);
const aFazerSemFornecedor = computed(() => props.coluna === "a_fazer" && fornecedorId.value === null);
</script>

<template>
  <v-dialog v-model="aberto" max-width="760" scrollable>
    <v-card v-if="linha && coluna" data-dialogo="celula-matriz">
      <v-card-title class="d-flex flex-wrap align-center ga-2">
        <span>{{ linha.fornecedorNome }}</span>
        <v-chip size="small" variant="tonal" label>{{ ROTULO_COLUNA_PAINEL[coluna] }}</v-chip>
      </v-card-title>
      <v-card-text class="d-grid ga-3">
        <PedidosAFazerLista
          v-if="aFazerSemFornecedor"
          :empresa-id="empresaId"
          :itens="painel.semFornecedor"
          :decisoes="painel.decisoes"
          :fornecedores="fornecedores"
          :pode-editar="podeEditar"
          @convidado="(nome: string) => emit('convidado', nome)"
          @decidir="(decisao: DecisaoPendenteDto) => emit('decidir', decisao)"
        />

        <div
          v-for="convite in convitesDaCelula"
          :key="convite.conviteId"
          class="celula__linha"
          data-bloco="convite-enviado"
        >
          <div>
            <strong>Cotação #{{ convite.rodadaNumero }}</strong>
            <div class="text-caption text-medium-emphasis">
              {{ convite.totalItens }} item(ns) · {{ convite.respondeu ? "Respondeu" : "Ainda não respondeu" }} · fecha
              em {{ DATA_HORA.format(new Date(convite.expiraEm)) }}
              <template v-if="convite.whatsapp"> · {{ ROTULO_ENVIO[convite.whatsapp] }}</template>
            </div>
          </div>
          <v-btn size="small" variant="tonal" @click="emit('rodada', convite.rodadaId)">Ver convite</v-btn>
        </div>

        <div v-for="pedido in pedidosDaCelula" :key="pedido.id" class="celula__linha" data-bloco="pedido-celula">
          <div>
            <strong>{{ pedido.totalItens }} item(ns)</strong>
            <div class="text-caption text-medium-emphasis">
              {{ rotuloDoTipoDePedido(pedido.tipo) }} · {{ DATA_HORA.format(new Date(pedido.criadoEm)) }}
            </div>
          </div>
          <v-btn size="small" variant="tonal" color="primary" @click="emit('pedido', pedido.id)">Abrir</v-btn>
        </div>

        <p
          v-if="!aFazerSemFornecedor && !convitesDaCelula.length && !pedidosDaCelula.length"
          class="text-body-2 text-medium-emphasis"
        >
          Nada nesta situação.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.celula__linha {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
}
</style>
