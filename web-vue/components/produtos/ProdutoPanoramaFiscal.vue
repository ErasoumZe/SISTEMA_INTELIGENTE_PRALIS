<script setup lang="ts">
/**
 * Carga fiscal (igual ao cartao do app oficial): o panorama por estado e o backfill — "Conferir" so
 * relata; "Completar" grava a rodada conferida (ate 200 por vez, retomando pelo cursor).
 */
const { apiGet, apiPost } = useApi();
const carregando = ref(true);
const erro = ref(false);
const estados = ref<Record<string, number>>({});

type ResultadoBackfill = {
  aplicou: boolean;
  analisados: number;
  porEstado: Record<string, number>;
  alterados: Array<{ id: string; nome: string; de: string; para: string; motivo: string }>;
  proximoCursor: string | null;
};
const LIMITE = 200;
const conferencia = ref<ResultadoBackfill | null>(null);
const executando = ref(false);
const erroBackfill = ref("");
const aviso = ref("");

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

async function carregarPanorama() {
  try {
    estados.value = await apiGet<Record<string, number>>("/api/produtos/fiscal/panorama");
  } catch {
    erro.value = true;
  } finally {
    carregando.value = false;
  }
}

async function backfill(aplicar: boolean) {
  executando.value = true;
  erroBackfill.value = "";
  aviso.value = "";
  try {
    const resultado = await apiPost<ResultadoBackfill>("/api/produtos/fiscal/backfill", { aplicar, limite: LIMITE });
    if (aplicar) {
      aviso.value = `${resultado.alterados.length} produto(s) atualizados de ${resultado.analisados} analisados.`;
      conferencia.value = null;
      await carregarPanorama();
    } else {
      conferencia.value = resultado;
    }
  } catch (falha) {
    erroBackfill.value = falha instanceof Error ? falha.message : "Não foi possível completar a carga fiscal.";
  } finally {
    executando.value = false;
  }
}

onMounted(carregarPanorama);
</script>

<template>
  <v-card variant="outlined" class="mb-5" aria-labelledby="panorama-fiscal-titulo">
    <v-card-title id="panorama-fiscal-titulo" class="text-subtitle-1">Carga fiscal</v-card-title>
    <v-card-text>
      <v-progress-linear v-if="carregando" indeterminate aria-label="Carregando panorama fiscal" />
      <v-alert v-else-if="erro" type="warning" variant="tonal">
        Não foi possível carregar o panorama fiscal. Tente atualizar a página.
      </v-alert>
      <template v-else>
        <p class="text-body-2 text-medium-emphasis mb-3">
          Produtos das empresas disponíveis para este administrador, por estado da classificação fiscal.
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

        <p class="text-body-2 mt-4 mb-2">
          Completar a carga fiscal classifica pelo grupo quem nunca foi classificado ou ficou parcial — o mesmo caminho
          do cadastro. Quem já está completo não é tocado. Primeiro confira; depois complete.
        </p>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            variant="tonal"
            prepend-icon="mdi-clipboard-check-outline"
            :loading="executando"
            @click="backfill(false)"
          >
            Conferir {{ LIMITE }}
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-check-all"
            :disabled="!conferencia || !conferencia.alterados.length"
            :loading="executando"
            @click="backfill(true)"
          >
            Completar
          </v-btn>
        </div>
        <v-alert v-if="erroBackfill" type="error" variant="tonal" class="mt-3">{{ erroBackfill }}</v-alert>
        <v-alert v-if="aviso" type="success" variant="tonal" class="mt-3">{{ aviso }}</v-alert>
        <v-alert v-if="conferencia" type="info" variant="tonal" class="mt-3">
          {{ conferencia.analisados }} analisado(s); {{ conferencia.alterados.length }} mudariam de estado ou ganhariam
          carga.
          <span v-for="(total, estado) in conferencia.porEstado" :key="estado" class="d-inline-block mr-3">
            {{ nomes[estado] ?? estado }}: <strong>{{ total }}</strong>
          </span>
        </v-alert>
      </template>
    </v-card-text>
  </v-card>
</template>
