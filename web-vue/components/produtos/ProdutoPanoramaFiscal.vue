<script setup lang="ts">
const { apiGet } = useApi();
const carregando = ref(true);
const erro = ref(false);
const estados = ref<Record<string, number>>({});

const nomes: Record<string, string> = {
  completo: "Completo",
  sem_registro: "Sem registro fiscal",
  nao_classificado: "Não classificado",
  parcial: "Parcial",
  pendente_grupo_invalido: "Grupo fora das regras",
  pendente_sem_correspondencia: "Sem correspondência ECF",
  pendente_ambiguo: "Correspondência ambígua",
  pendente_conflito: "Conflito entre fontes",
  pendente_fonte_da_loja: "Fonte da loja ausente",
  fonte_indisponivel: "Fonte indisponível"
};

onMounted(async () => {
  try {
    estados.value = await apiGet<Record<string, number>>("/api/produtos/fiscal/panorama");
  } catch {
    erro.value = true;
  } finally {
    carregando.value = false;
  }
});
</script>

<template>
  <v-card variant="outlined" class="mb-5" aria-labelledby="panorama-fiscal-titulo">
    <v-card-title id="panorama-fiscal-titulo" class="text-subtitle-1">Panorama fiscal</v-card-title>
    <v-card-text>
      <v-progress-linear v-if="carregando" indeterminate aria-label="Carregando panorama fiscal" />
      <v-alert v-else-if="erro" type="warning" variant="tonal">
        Não foi possível carregar o panorama fiscal. Tente atualizar a página.
      </v-alert>
      <template v-else>
        <p class="text-body-2 text-medium-emphasis mb-3">
          Contagem dos produtos das empresas disponíveis para este administrador. Este painel só consulta dados.
        </p>
        <v-row dense>
          <v-col v-for="(total, estado) in estados" :key="estado" cols="12" sm="6" md="4">
            <div class="d-flex justify-space-between ga-3 rounded pa-3 bg-surface-variant">
              <span>{{ nomes[estado] ?? estado }}</span>
              <strong>{{ total }}</strong>
            </div>
          </v-col>
          <v-col v-if="!Object.keys(estados).length" cols="12">
            <span class="text-medium-emphasis">Nenhum produto no escopo disponível.</span>
          </v-col>
        </v-row>
      </template>
    </v-card-text>
  </v-card>
</template>
