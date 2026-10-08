<script setup lang="ts">
import type { PedidoRecorrencia } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";

export type PedidoFormEdicao = {
  fornecedorId: string;
  recorrencia: PedidoRecorrencia;
  dataAgendada: string;
  observacao: string;
  itens: Array<{ produtoId: string; quantidade: string }>;
};

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  titulo: string;
  empresaId: string;
  fornecedores: Opcao[];
  form: PedidoFormEdicao;
  salvando: boolean;
}>();
const emit = defineEmits<{ salvar: []; adicionar: []; remover: [indice: number] }>();
const recorrencias: Array<{ value: PedidoRecorrencia; label: string }> = [
  { value: "nenhuma", label: "Sem recorrência" },
  { value: "semanal", label: "Semanal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" }
];
const fornecedorSelecionado = computed(() => props.fornecedores.find((fornecedor) => fornecedor.id === props.form.fornecedorId));
</script>

<template>
  <v-dialog v-model="aberto" max-width="900" persistent>
    <v-card>
      <v-card-title>{{ titulo }}</v-card-title>
      <v-card-text class="d-grid ga-2">
        <v-select v-model="form.fornecedorId" :items="fornecedores" item-title="nome" item-value="id" label="Fornecedor *" />
        <v-alert v-if="fornecedorSelecionado && !fornecedorSelecionado.whatsapp" type="warning" density="compact" variant="tonal">
          Este fornecedor ainda não tem WhatsApp cadastrado; o pedido pode ser salvo, mas não enviado por WhatsApp.
        </v-alert>
        <v-row v-for="(item, indice) in form.itens" :key="`item-${indice}`" dense align="center">
          <v-col cols="12" md="8"><ProdutoAutocomplete v-model="item.produtoId" :empresa-id="empresaId" /></v-col>
          <v-col cols="9" md="3"><v-text-field v-model="item.quantidade" type="number" min="0.001" step="0.001" label="Quantidade" /></v-col>
          <v-col cols="3" md="1" class="d-flex justify-end"><v-btn icon="mdi-delete" variant="text" aria-label="Remover item" @click="emit('remover', indice)" /></v-col>
        </v-row>
        <v-btn variant="text" prepend-icon="mdi-plus" class="align-self-start" @click="emit('adicionar')">Adicionar item</v-btn>
        <v-row dense><v-col cols="12" md="4"><v-select v-model="form.recorrencia" :items="recorrencias" item-title="label" item-value="value" label="Agendador" /></v-col><v-col cols="12" md="4"><v-text-field v-model="form.dataAgendada" type="datetime-local" label="Revisar em" /></v-col><v-col cols="12" md="4"><v-textarea v-model="form.observacao" rows="1" auto-grow label="Observação" /></v-col></v-row>
        <p class="text-caption text-medium-emphasis">O agendador apenas lembra o comprador de revisar a sugestão; não envia pedido sozinho.</p>
      </v-card-text>
      <v-card-actions><v-spacer /><v-btn variant="text" @click="aberto = false">Cancelar</v-btn><v-btn color="primary" :loading="salvando" @click="emit('salvar')">Salvar pedido</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
</template>
