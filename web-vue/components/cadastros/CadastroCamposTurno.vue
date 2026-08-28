<script setup lang="ts">
import type { CadastroForm } from "@padaria/shared";
import { diasSemana, etiquetasTurno } from "@padaria/shared";
import { rotuloDiaSemanaCurto, rotuloEtiquetaTurno } from "~/utils/admissoes";

/**
 * Campos do TURNO no modal de cadastro. Extraídos do `WorkspaceDialogs.vue`, que já passava de 650
 * linhas (AGENTS.md §4.5).
 *
 * Etiqueta e dias entraram na ADM-003/V1B: sem eles o turno é válido no cadastro, mas **não pode ser
 * escolhido numa admissão**. Nenhum valor antigo é preenchido automaticamente — nada de deduzir
 * "Manhã" do nome. O formulário mostra o que está gravado e o DP decide.
 */
const formulario = defineModel<CadastroForm>({ required: true });

const opcoesEtiqueta = etiquetasTurno.map((valor) => ({ valor, titulo: rotuloEtiquetaTurno[valor] }));
const opcoesDia = diasSemana.map((valor) => ({ valor, titulo: rotuloDiaSemanaCurto(valor) }));

const incompleto = computed(
  () => !formulario.value.etiquetaTurno || formulario.value.diasSemanaTurno.length === 0
);
</script>

<template>
  <v-col cols="12" md="4">
    <v-text-field v-model="formulario.horaInicio" type="time" label="Inicio" />
  </v-col>
  <v-col cols="12" md="4">
    <v-text-field v-model="formulario.horaFim" type="time" label="Fim" />
  </v-col>
  <v-col cols="12" md="4">
    <v-switch v-model="formulario.ativo" color="primary" label="Ativo" />
  </v-col>

  <v-col cols="12" md="4">
    <v-select
      v-model="formulario.etiquetaTurno"
      :items="opcoesEtiqueta"
      item-title="titulo"
      item-value="valor"
      label="Etiqueta"
      clearable
      hint="M, T ou I — como a operação chama este turno."
      persistent-hint
    />
  </v-col>
  <v-col cols="12" md="8">
    <v-select
      v-model="formulario.diasSemanaTurno"
      :items="opcoesDia"
      item-title="titulo"
      item-value="valor"
      label="Dias da semana"
      multiple
      chips
      closable-chips
    />
  </v-col>

  <v-col v-if="incompleto" cols="12">
    <v-alert type="info" variant="tonal" density="compact">
      Sem etiqueta e dias, este turno continua válido no cadastro, mas <strong>não pode ser
      escolhido em uma admissão</strong>.
    </v-alert>
  </v-col>
</template>
