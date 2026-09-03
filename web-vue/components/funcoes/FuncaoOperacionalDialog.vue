<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { FuncaoOperacionalDto } from "@padaria/shared";

/**
 * Criar ou renomear uma funcao operacional.
 *
 * Este dialogo NAO liga nem desliga a funcao. Ativar e desativar sao atos proprios, com botao
 * proprio na linha da tabela — um interruptor aqui dentro seria o segundo caminho para o mesmo ato,
 * e a pessoa acabaria desativando sem perceber ao corrigir um nome.
 *
 * E nao ha excluir: uma funcao sai de circulacao desativada, nunca apagada.
 */
const props = defineProps<{
  aberto: boolean;
  /** `null` = nova. Preenchido = edicao. */
  funcao: FuncaoOperacionalDto | null;
  salvando: boolean;
  erro: string;
}>();

const emit = defineEmits<{
  (event: "fechar"): void;
  (event: "salvar", dados: { nome: string; cbo: string | null }): void;
}>();

const nome = ref("");
const cbo = ref("");
const tentouSalvar = ref(false);

const editando = computed(() => props.funcao !== null);
const titulo = computed(() => (editando.value ? "Editar função" : "Nova função operacional"));

const nomeLimpo = computed(() => nome.value.trim());
const cboLimpo = computed(() => cbo.value.trim());

const erroNome = computed(() => {
  if (!tentouSalvar.value || nomeLimpo.value) return "";
  return "Informe o nome da função.";
});

/** O mesmo formato que o contrato e o banco cobram: seis dígitos, ou vazio. */
const erroCbo = computed(() => {
  if (!tentouSalvar.value || !cboLimpo.value) return "";
  return /^[0-9]{6}$/u.test(cboLimpo.value) ? "" : "O CBO tem 6 dígitos. Deixe vazio se não souber.";
});

// Reabrir com outro alvo precisa trocar o conteudo: sem isto, editar uma funcao depois de outra
// mostraria os dados da anterior.
watch(
  () => [props.aberto, props.funcao] as const,
  ([aberto, funcao]) => {
    if (!aberto) return;
    tentouSalvar.value = false;
    nome.value = funcao?.nome ?? "";
    cbo.value = funcao?.cbo ?? "";
  },
  { immediate: true }
);

function confirmar() {
  tentouSalvar.value = true;
  if (erroNome.value || erroCbo.value || !nomeLimpo.value) return;
  // Vazio vira `null`, e nao string vazia: o banco guarda ausência de CBO como nulo, e "" passaria
  // pelo CHECK de formato só para virar um valor que não significa nada.
  emit("salvar", { nome: nomeLimpo.value, cbo: cboLimpo.value || null });
}
</script>

<template>
  <!-- `persistent`: segura o que foi digitado. Escape ou clique fora apagariam um nome já escrito. -->
  <v-dialog :model-value="aberto" max-width="520" persistent @update:model-value="(v) => !v && emit('fechar')">
    <v-card role="dialog" aria-labelledby="titulo-funcao-operacional">
      <v-card-title id="titulo-funcao-operacional">{{ titulo }}</v-card-title>

      <v-card-text>
        <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-3">{{ erro }}</v-alert>

        <v-text-field
          v-model="nome"
          label="Nome da função *"
          :error-messages="erroNome ? [erroNome] : []"
          density="comfortable"
          autofocus
          data-campo="nome"
        />

        <v-text-field
          v-model="cbo"
          label="CBO (opcional)"
          :error-messages="erroCbo ? [erroCbo] : []"
          density="comfortable"
          maxlength="6"
          data-campo="cbo"
          hint="Classificação Brasileira de Ocupações. Deixe vazio se não souber."
          persistent-hint
        />

        <p v-if="editando && funcao?.emUso" class="funcao-dialogo__nota">
          Esta função já foi usada em admissões. Renomear muda como ela aparece também nos registros
          antigos.
        </p>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" class="funcao-dialogo__acao" :disabled="salvando" @click="emit('fechar')">
          Cancelar
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="funcao-dialogo__acao"
          :loading="salvando"
          :disabled="salvando"
          @click="confirmar"
        >
          Salvar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.funcao-dialogo__nota {
  margin: var(--cx-sp-3) 0 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

/* Alvo de toque: 40px de piso (`67` §9), 44px no celular (`67` §13.4). */
.funcao-dialogo__acao {
  min-height: 40px;
}

@media (max-width: 768px) {
  .funcao-dialogo__acao {
    min-height: 44px;
  }
}
</style>
