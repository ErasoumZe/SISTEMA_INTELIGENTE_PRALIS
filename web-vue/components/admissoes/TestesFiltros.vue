<script setup lang="ts">
import type { CargoOpcaoDto, SituacaoTeste } from "@padaria/shared";

export type FiltrosTestes = {
  buscaNome: string;
  situacao: SituacaoTeste | "";
  cargoId: string;
  prazo: "" | "vence_hoje" | "vencido";
};

defineProps<{ cargos: CargoOpcaoDto[]; carregando: boolean }>();

const emit = defineEmits<{ (event: "aplicar", filtros: FiltrosTestes): void }>();

// Abre em Ativo: o teste em andamento e o que o DP precisa ver ao entrar. Encerrado e cancelado
// continuam alcancaveis pelo MESMO filtro — nao existe lista separada de "arquivados".
const PADRAO: FiltrosTestes = { buscaNome: "", situacao: "ativo", cargoId: "", prazo: "" };

const filtros = reactive<FiltrosTestes>({ ...PADRAO });

// Filtro UNICO de situacao, derivado dos estados tecnicos. Nao ha um segundo filtro por `status`:
// seriam duas formas de pedir a mesma coisa, capazes de divergir.
const opcoesSituacao: { valor: SituacaoTeste | ""; rotulo: string }[] = [
  { valor: "ativo", rotulo: "Ativo" },
  { valor: "inativo", rotulo: "Inativo" },
  { valor: "", rotulo: "Todos" }
];

const opcoesPrazo: { valor: FiltrosTestes["prazo"]; rotulo: string }[] = [
  { valor: "", rotulo: "Qualquer prazo" },
  { valor: "vence_hoje", rotulo: "Vence hoje" },
  { valor: "vencido", rotulo: "Vencido" }
];

function aplicar() {
  emit("aplicar", { ...filtros });
}

function limpar() {
  Object.assign(filtros, PADRAO);
  aplicar();
}
</script>

<template>
  <v-row dense align="center" class="mb-2">
    <v-col cols="12" md="4">
      <!-- Somente NOME. CPF nunca entra em busca GET: a query string vai para log de acesso,
           historico do navegador e cabecalho referer. -->
      <v-text-field
        v-model="filtros.buscaNome"
        label="Buscar por nome"
        density="comfortable"
        hide-details
        clearable
        @keyup.enter="aplicar"
      />
    </v-col>
    <v-col cols="6" md="2">
      <v-select
        v-model="filtros.situacao"
        :items="opcoesSituacao"
        item-title="rotulo"
        item-value="valor"
        label="Situação"
        density="comfortable"
        hide-details
      />
    </v-col>
    <v-col cols="6" md="3">
      <v-select
        v-model="filtros.cargoId"
        :items="[{ id: '', nome: 'Todos os cargos' }, ...cargos]"
        item-title="nome"
        item-value="id"
        label="Cargo"
        density="comfortable"
        hide-details
      />
    </v-col>
    <v-col cols="6" md="2">
      <v-select
        v-model="filtros.prazo"
        :items="opcoesPrazo"
        item-title="rotulo"
        item-value="valor"
        label="Prazo"
        density="comfortable"
        hide-details
      />
    </v-col>
    <v-col cols="6" md="1" class="d-flex ga-2 justify-end">
      <v-btn variant="text" size="small" @click="limpar">Limpar</v-btn>
      <v-btn variant="outlined" size="small" :loading="carregando" @click="aplicar">Filtrar</v-btn>
    </v-col>
  </v-row>
</template>
