<script setup lang="ts">
import type { Opcao } from "~/types/padaria";
import type { FiltrosVendas } from "./relatorio-vendas";

const props = defineProps<{
  filtros: FiltrosVendas;
  pdvs: Opcao[];
  clientes: Opcao[];
  colaboradores: Opcao[];
  formasPagamento: Opcao[];
  turnos: Opcao[];
  carregando?: boolean;
}>();

const emit = defineEmits<{
  (event: "update:filtros", filtros: FiltrosVendas): void;
  (event: "buscar"): void;
  (event: "limpar"): void;
}>();

function atualizar(campo: keyof FiltrosVendas, valor: unknown) {
  emit("update:filtros", { ...props.filtros, [campo]: String(valor ?? "") });
}
</script>

<template>
  <section class="filtros-vendas" aria-label="Filtros do relatório de vendas">
    <header class="filtros-vendas__cabecalho">
      <div>
        <span class="filtros-vendas__sobretitulo">Consulta</span>
        <h2>Filtros de vendas</h2>
        <p>Refine o período, a origem e o pagamento antes de consultar.</p>
      </div>
      <div class="filtros-vendas__acoes">
        <v-btn variant="text" :disabled="carregando" @click="emit('limpar')">Limpar filtros</v-btn>
        <v-btn color="primary" prepend-icon="mdi-magnify" :loading="carregando" @click="emit('buscar')">
          Atualizar
        </v-btn>
      </div>
    </header>

    <div class="filtros-vendas__grupos">
      <fieldset class="filtros-vendas__grupo">
        <legend>Período da venda</legend>
        <div class="filtros-vendas__campos filtros-vendas__campos--periodo">
          <v-text-field
            :model-value="filtros.dataInicio"
            type="date"
            label="Data inicial"
            density="comfortable"
            variant="outlined"
            hide-details
            @update:model-value="atualizar('dataInicio', $event)"
          />
          <v-text-field
            :model-value="filtros.horaInicio"
            type="time"
            step="1"
            label="Hora de abertura"
            density="comfortable"
            variant="outlined"
            hide-details
            @update:model-value="atualizar('horaInicio', $event)"
          />
          <v-text-field
            :model-value="filtros.dataFim"
            type="date"
            label="Data final"
            density="comfortable"
            variant="outlined"
            hide-details
            @update:model-value="atualizar('dataFim', $event)"
          />
          <v-text-field
            :model-value="filtros.horaFim"
            type="time"
            step="1"
            label="Hora de fechamento"
            density="comfortable"
            variant="outlined"
            hide-details
            @update:model-value="atualizar('horaFim', $event)"
          />
        </div>
      </fieldset>

      <fieldset class="filtros-vendas__grupo">
        <legend>Identificação</legend>
        <div class="filtros-vendas__campos filtros-vendas__campos--identificacao">
          <v-text-field
            :model-value="filtros.idVenda"
            label="ID da venda (CREARE)"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            @update:model-value="atualizar('idVenda', $event)"
          />
          <v-text-field
            :model-value="filtros.produto"
            label="Produto"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            @update:model-value="atualizar('produto', $event)"
          />
        </div>
      </fieldset>

      <fieldset class="filtros-vendas__grupo">
        <legend>Contexto e pagamento</legend>
        <div class="filtros-vendas__campos filtros-vendas__campos--contexto">
          <v-select
            :model-value="filtros.pdvId"
            :items="pdvs"
            item-title="nome"
            item-value="id"
            label="PDV"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            @update:model-value="atualizar('pdvId', $event)"
          />
          <v-select
            :model-value="filtros.turnoId"
            :items="turnos"
            item-title="nome"
            item-value="id"
            label="Turno"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            @update:model-value="atualizar('turnoId', $event)"
          />
          <v-select
            :model-value="filtros.formaPagamentoId"
            :items="formasPagamento"
            item-title="nome"
            item-value="id"
            label="Pagamento"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            @update:model-value="atualizar('formaPagamentoId', $event)"
          />
          <v-select
            :model-value="filtros.clienteId"
            :items="clientes"
            item-title="nome"
            item-value="id"
            label="Cliente"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            @update:model-value="atualizar('clienteId', $event)"
          />
          <v-select
            :model-value="filtros.colaboradorId"
            :items="colaboradores"
            item-title="nome"
            item-value="id"
            label="Colaborador"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            @update:model-value="atualizar('colaboradorId', $event)"
          />
          <v-select
            :model-value="filtros.status"
            :items="['aprovado', 'aguardando_aprovacao', 'cancelado']"
            label="Status"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            @update:model-value="atualizar('status', $event)"
          />
        </div>
      </fieldset>
    </div>
  </section>
</template>

<style scoped>
.filtros-vendas { display: grid; gap: 18px; padding: 20px; border: 1px solid var(--cx-line); border-radius: 16px; background: var(--cx-surface-raised); color: var(--cx-ink); }
.filtros-vendas__cabecalho { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.filtros-vendas__sobretitulo { color: var(--cx-ink-soft); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.filtros-vendas h2 { margin: 3px 0 2px; font-size: 18px; line-height: 1.25; }
.filtros-vendas p { margin: 0; color: var(--cx-ink-soft); font-size: 13px; }
.filtros-vendas__acoes { display: flex; flex: 0 0 auto; gap: 8px; }
.filtros-vendas__grupos { display: grid; gap: 14px; }
.filtros-vendas__grupo { min-inline-size: 0; margin: 0; padding: 14px; border: 1px solid var(--cx-line); border-radius: 12px; }
.filtros-vendas__grupo legend { padding: 0 6px; color: var(--cx-ink-soft); font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
.filtros-vendas__campos { display: grid; gap: 10px; }
.filtros-vendas__campos--periodo { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.filtros-vendas__campos--identificacao { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.filtros-vendas__campos--contexto { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (width <= 900px) { .filtros-vendas__campos--periodo, .filtros-vendas__campos--contexto { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (width <= 600px) { .filtros-vendas { padding: 14px; gap: 14px; } .filtros-vendas__cabecalho { display: grid; } .filtros-vendas__acoes { width: 100%; } .filtros-vendas__acoes :deep(.v-btn) { flex: 1 1 0; } .filtros-vendas__campos--periodo, .filtros-vendas__campos--identificacao, .filtros-vendas__campos--contexto { grid-template-columns: 1fr; } }
</style>
