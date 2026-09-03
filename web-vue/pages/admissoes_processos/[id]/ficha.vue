<script setup lang="ts">
import FichaRevisaoPage from "~/components/admissoes/FichaRevisaoPage.vue";

const rota = useRoute();
const processoId = computed(() => String(rota.params["id"] ?? ""));
</script>

<template>
  <!-- ADM-003 V5: a ficha do candidato e SUB-ROTA do processo, alcancada so pelo modal de detalhe
       ("Abrir ficha do candidato"). Sem entrada em `itemPorTela`: entrar ali criaria item de menu, e
       a ficha nao e tela de menu — e de um processo. -->
  <FichaRevisaoPage :key="processoId" :processo-id="processoId" />
</template>
