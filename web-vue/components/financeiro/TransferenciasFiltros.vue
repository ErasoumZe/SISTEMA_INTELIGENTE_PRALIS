<script setup lang="ts">
import { computed, ref } from "vue";
import type { Opcao } from "~/types/padaria";
import type { StatusTransferencia } from "@padaria/shared";

type FiltrosTransferencias = {
  dataInicio: string;
  dataFim: string;
  pdvId: string;
  usuario: string;
  contaOrigemId: string;
  contaDestinoId: string;
  lacre: string;
};

const props = defineProps<{
  status: StatusTransferencia | "";
  filtros: FiltrosTransferencias;
  opcoesStatus: Array<{ title: string; value: string }>;
  pdvs: Opcao[];
  contas: Opcao[];
}>();

const emit = defineEmits<{
  (event: "update:status", status: StatusTransferencia | ""): void;
  (event: "update:filtros", filtros: FiltrosTransferencias): void;
}>();

const avancadosAbertos = ref(false);
const opcoesPdvs = computed(() => [
  { title: "Todos os PDVs", value: "" },
  ...props.pdvs.map((pdv) => ({ title: pdv.nome ?? pdv.id, value: pdv.id }))
]);
const opcoesContas = computed(() => [
  { title: "Todas as contas", value: "" },
  ...props.contas.map((conta) => ({ title: conta.nome ?? conta.id, value: conta.id }))
]);
const rotuloStatus = computed(
  () => props.opcoesStatus.find((opcao) => opcao.value === props.status)?.title ?? "Status"
);
const filtrosAtivos = computed(() => {
  const chips: Array<{ chave: "status" | keyof FiltrosTransferencias; texto: string }> = [];
  if (props.status) chips.push({ chave: "status", texto: rotuloStatus.value });
  if (props.filtros.dataInicio) chips.push({ chave: "dataInicio", texto: `De ${props.filtros.dataInicio}` });
  if (props.filtros.dataFim) chips.push({ chave: "dataFim", texto: `Até ${props.filtros.dataFim}` });
  if (props.filtros.pdvId)
    chips.push({
      chave: "pdvId",
      texto: opcoesPdvs.value.find((opcao) => opcao.value === props.filtros.pdvId)?.title ?? "PDV"
    });
  if (props.filtros.usuario) chips.push({ chave: "usuario", texto: `Lançado por: ${props.filtros.usuario}` });
  if (props.filtros.contaOrigemId)
    chips.push({
      chave: "contaOrigemId",
      texto: `Origem: ${opcoesContas.value.find((opcao) => opcao.value === props.filtros.contaOrigemId)?.title ?? "Conta"}`
    });
  if (props.filtros.contaDestinoId)
    chips.push({
      chave: "contaDestinoId",
      texto: `Destino: ${opcoesContas.value.find((opcao) => opcao.value === props.filtros.contaDestinoId)?.title ?? "Conta"}`
    });
  if (props.filtros.lacre) chips.push({ chave: "lacre", texto: `Lacre: ${props.filtros.lacre}` });
  return chips;
});

function atualizar(campo: keyof FiltrosTransferencias, valor: unknown) {
  emit("update:filtros", { ...props.filtros, [campo]: String(valor ?? "") });
}

function remover(chave: "status" | keyof FiltrosTransferencias) {
  if (chave === "status") emit("update:status", "");
  else atualizar(chave, "");
}

function limpar() {
  emit("update:status", "");
  emit("update:filtros", {
    dataInicio: "",
    dataFim: "",
    pdvId: "",
    usuario: "",
    contaOrigemId: "",
    contaDestinoId: "",
    lacre: ""
  });
}
</script>

<template>
  <section class="filtros-transferencias" aria-label="Filtros de transferências">
    <div class="filtros-transferencias__barra">
      <v-select
        :model-value="status"
        :items="opcoesStatus"
        label="Status"
        density="compact"
        variant="outlined"
        hide-details
        prepend-inner-icon="mdi-filter-variant"
        aria-label="Filtrar transferências por status"
        @update:model-value="emit('update:status', $event as StatusTransferencia | '')"
      />
      <v-text-field
        :model-value="filtros.dataInicio"
        type="date"
        label="Data inicial"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="atualizar('dataInicio', $event)"
      />
      <v-text-field
        :model-value="filtros.dataFim"
        type="date"
        label="Data final"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="atualizar('dataFim', $event)"
      />
      <v-select
        :model-value="filtros.pdvId"
        :items="opcoesPdvs"
        label="PDV"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="atualizar('pdvId', $event)"
      />
      <v-btn
        class="filtros-transferencias__mais"
        variant="text"
        size="small"
        :prepend-icon="avancadosAbertos ? 'mdi-chevron-up' : 'mdi-tune-variant'"
        @click="avancadosAbertos = !avancadosAbertos"
      >
        {{ avancadosAbertos ? "Menos filtros" : "Mais filtros" }}
      </v-btn>
    </div>

    <div v-if="filtrosAtivos.length" class="filtros-transferencias__chips" aria-label="Filtros aplicados">
      <span class="filtros-transferencias__rotulo">Aplicados</span>
      <v-chip
        v-for="filtro in filtrosAtivos"
        :key="filtro.chave"
        closable
        size="small"
        @click:close="remover(filtro.chave)"
      >
        {{ filtro.texto }}
      </v-chip>
      <v-btn variant="text" size="x-small" @click="limpar">Limpar tudo</v-btn>
    </div>

    <div v-if="avancadosAbertos" class="filtros-transferencias__avancados">
      <v-text-field
        :model-value="filtros.usuario"
        label="Lançado por"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        @update:model-value="atualizar('usuario', $event)"
      />
      <v-select
        :model-value="filtros.contaOrigemId"
        :items="opcoesContas"
        label="Conta de origem"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="atualizar('contaOrigemId', $event)"
      />
      <v-select
        :model-value="filtros.contaDestinoId"
        :items="opcoesContas"
        label="Conta de destino"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="atualizar('contaDestinoId', $event)"
      />
      <v-text-field
        :model-value="filtros.lacre"
        label="Lacre"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        @update:model-value="atualizar('lacre', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.filtros-transferencias {
  display: grid;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid var(--cx-line);
  background: var(--cx-surface-raised);
}
.filtros-transferencias__barra,
.filtros-transferencias__avancados {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr)) auto;
  gap: 10px;
  align-items: center;
}
.filtros-transferencias__avancados {
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  padding-top: 10px;
  border-top: 1px solid var(--cx-line);
}
.filtros-transferencias__mais {
  color: var(--cx-ink);
  text-transform: none;
}
.filtros-transferencias__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 24px;
}
.filtros-transferencias__rotulo {
  color: var(--cx-ink-soft);
  font-size: 12px;
  font-weight: 700;
}
@media (width <= 1024px) {
  .filtros-transferencias__barra {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .filtros-transferencias__mais {
    justify-self: start;
  }
  .filtros-transferencias__avancados {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (width <= 560px) {
  .filtros-transferencias {
    padding: 12px;
  }
  .filtros-transferencias__barra,
  .filtros-transferencias__avancados {
    grid-template-columns: 1fr;
  }
}
</style>
