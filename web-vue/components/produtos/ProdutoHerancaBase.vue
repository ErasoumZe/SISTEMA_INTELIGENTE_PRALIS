<script setup lang="ts">
/**
 * Selo de heranca da copia da loja (igual ao app oficial): o que ainda segue a BASE e o que esta loja
 * passou a mandar, com o atalho para voltar a herdar.
 */
defineProps<{ naoSeguem: string[]; somenteLeitura: boolean }>();
const emit = defineEmits<{ "voltar-a-herdar": [] }>();
</script>

<template>
  <section class="heranca" aria-label="Herança da base">
    <p v-if="!naoSeguem.length" class="heranca__texto">
      Este produto <strong>segue a base</strong> em todos os campos — o que o administrador alterar lá desce para cá
      automaticamente.
    </p>
    <template v-else>
      <p class="heranca__texto">
        <strong>{{ naoSeguem.length }}</strong> campo(s) foram editados nesta loja e
        <strong>não seguem mais a base</strong>:
      </p>
      <div class="heranca__campos">
        <v-chip v-for="campo in naoSeguem" :key="campo" size="small" color="warning" variant="tonal">{{
          campo
        }}</v-chip>
      </div>
      <v-btn v-if="!somenteLeitura" size="small" variant="text" @click="emit('voltar-a-herdar')">
        Voltar a herdar da base
      </v-btn>
    </template>
    <p class="heranca__nota">
      Este produto veio da base. Os campos do cadastro geral estão em leitura — só o administrador os altera, e a
      mudança desce para as lojas. Aqui você completa o que é da sua loja e pode ativar ou inativar.
    </p>
  </section>
</template>

<style scoped>
.heranca {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface);
}
.heranca__texto,
.heranca__nota {
  margin: 0;
  font-size: var(--cx-fs-body);
  color: var(--cx-ink);
}
.heranca__nota {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}
.heranca__campos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-1);
}
</style>
