<script setup lang="ts">
/**
 * Barra de selecao + confirmacao da inativacao em lote (so administrador). A frase digitada e a
 * mesma regra do "excluir em lote" do app oficial — aqui o lote so inativa, nunca apaga.
 */
const props = defineProps<{ quantidade: number; frase: string; processando: boolean }>();
const emit = defineEmits<{ confirmar: [confirmacao: string]; limpar: []; "selecionar-pagina": [] }>();

const aberto = ref(false);
const digitado = ref("");
const confere = computed(() => digitado.value.trim().toUpperCase() === props.frase);

function abrir() {
  digitado.value = "";
  aberto.value = true;
}

defineExpose({ fechar: () => (aberto.value = false) });
</script>

<template>
  <div v-if="quantidade" class="inativar-lote" role="region" aria-label="Seleção para inativar">
    <span>
      <strong class="cx-num">{{ quantidade }}</strong> produto(s) selecionado(s)
    </span>
    <div class="inativar-lote__acoes">
      <v-btn size="small" variant="text" @click="emit('selecionar-pagina')">Selecionar página atual</v-btn>
      <v-btn size="small" variant="text" @click="emit('limpar')">Limpar seleção</v-btn>
      <v-btn size="small" color="error" variant="flat" prepend-icon="mdi-archive-outline" @click="abrir">
        Inativar selecionados
      </v-btn>
    </div>

    <v-dialog v-model="aberto" max-width="440">
      <v-card>
        <v-card-title>Inativar {{ quantidade }} produto(s)</v-card-title>
        <v-card-text class="inativar-lote__texto">
          <p>Os produtos saem de uso nesta loja. Nada é apagado e cada um pode ser ativado de novo.</p>
          <v-text-field
            v-model="digitado"
            :label="`Digite ${frase} para confirmar`"
            autocomplete="off"
            autofocus
            @keyup.enter="confere && emit('confirmar', digitado)"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="processando" @click="aberto = false">Cancelar</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="processando"
            :disabled="!confere"
            @click="emit('confirmar', digitado)"
          >
            Inativar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.inativar-lote {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface);
  border: 1px solid var(--cx-line-soft);
  font-size: var(--cx-fs-caption);
}
.inativar-lote__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}
.inativar-lote__texto p {
  margin: 0 0 var(--cx-sp-3);
}
</style>
