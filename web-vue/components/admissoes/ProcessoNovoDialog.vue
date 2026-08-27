<script setup lang="ts">
import type { FuncaoOpcaoDto } from "@padaria/shared";

/**
 * "+ Novo cadastro" — a UNICA entrada de admissao direta.
 *
 * Nao pergunta nome nem CPF: identidade e do formulario do candidato, e o CHECK do banco impede que
 * o processo passe a ter a sua propria. Nao pergunta empresa: ela vem do perfil, como em todo o
 * modulo. Nao pergunta area, setor, CBO nem salario: fora desta vertical.
 *
 * Quem veio de um periodo de teste NAO passa por aqui — efetivar o teste ja cria o processo, na
 * propria tela de Testes. Nao existe segundo caminho para o mesmo ato.
 */
const props = defineProps<{
  aberto: boolean;
  funcoes: FuncaoOpcaoDto[];
  salvando: boolean;
  erro: string;
}>();

const emit = defineEmits<{
  (event: "fechar"): void;
  (event: "salvar", dados: { funcaoId: string; jornadaHorario: string; dataAdmissao: string }): void;
}>();

const formulario = reactive({ funcaoId: "", jornadaHorario: "", dataAdmissao: "" });

watch(
  () => props.aberto,
  (aberto) => {
    if (!aberto) return;
    formulario.funcaoId = "";
    formulario.jornadaHorario = "";
    formulario.dataAdmissao = "";
  }
);

// So as funcoes ATIVAS: este e um cadastro NOVO, e escolher uma funcao desativada aqui seria criar
// um processo que ja nasce apontando para catalogo fora de uso.
const opcoes = computed(() => props.funcoes.filter((funcao) => funcao.ativo));

const podeSalvar = computed(
  () =>
    Boolean(formulario.funcaoId) &&
    formulario.jornadaHorario.trim().length > 0 &&
    Boolean(formulario.dataAdmissao)
);

function salvar() {
  if (!podeSalvar.value) return;
  emit("salvar", {
    funcaoId: formulario.funcaoId,
    jornadaHorario: formulario.jornadaHorario.trim(),
    dataAdmissao: formulario.dataAdmissao
  });
}
</script>

<template>
  <v-dialog :model-value="aberto" max-width="560" @update:model-value="emit('fechar')">
    <v-card>
      <v-card-title>Novo cadastro de admissão</v-card-title>
      <v-card-subtitle>
        Admissão direta, sem período de teste. A empresa vem do seu perfil.
      </v-card-subtitle>

      <v-card-text>
        <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">{{ erro }}</v-alert>

        <form class="formulario" @submit.prevent="salvar">
          <v-select
            v-model="formulario.funcaoId"
            :items="opcoes"
            item-title="nome"
            item-value="id"
            label="Função operacional"
            density="comfortable"
          />
          <v-text-field
            v-model="formulario.jornadaHorario"
            label="Jornada / horário"
            density="comfortable"
            placeholder="Seg a sex, 08:00 às 17:00"
          />
          <v-text-field
            v-model="formulario.dataAdmissao"
            label="Data de admissão"
            type="date"
            density="comfortable"
          />
        </form>

        <p class="nota">
          Nome, CPF, endereço e dependentes chegam com a resposta do candidato — não são preenchidos
          aqui.
        </p>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="salvando" @click="emit('fechar')">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!podeSalvar || salvando" @click="salvar">
          Criar processo
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.formulario {
  display: grid;
  gap: 4px;
}
.nota {
  font-size: 0.8rem;
  opacity: 0.75;
  margin-top: 8px;
}
</style>
