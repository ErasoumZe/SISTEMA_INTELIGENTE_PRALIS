<script setup lang="ts">
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

type ConferenciaAbertura = {
  etapa: "abertura" | "retorno_sangria";
  resultado: "convergente" | "divergente";
  valorEspecieDeclarado: number;
  valorMoedasDeclarado: number;
  valorEspecieContado: number;
  valorMoedasContado: number;
  observacao: string | null;
  conferidoEm: string;
};

const props = defineProps<{ caixaId: string }>();
const { apiGet } = useApi();
const conferencia = ref<ConferenciaAbertura | null>(null);
const dialogAberto = ref(false);
let consultaAtual = 0;

const totalDeclarado = computed(() => {
  const atual = conferencia.value;
  return atual ? atual.valorEspecieDeclarado + atual.valorMoedasDeclarado : 0;
});
const totalContado = computed(() => {
  const atual = conferencia.value;
  return atual ? atual.valorEspecieContado + atual.valorMoedasContado : 0;
});
const divergiu = computed(() => conferencia.value?.resultado === "divergente");

watch(
  () => props.caixaId,
  async (caixaId) => {
    const consulta = ++consultaAtual;
    conferencia.value = null;
    try {
      const itens = await apiGet<ConferenciaAbertura[]>(`/api/caixa/${caixaId}/conferencias-fisicas`);
      if (consulta !== consultaAtual) return;
      conferencia.value = itens.find((item) => item.etapa === "abertura") ?? null;
    } catch {
      // Sem registro (caixa legado) ou falha transitória: não poluir o card operacional.
      // A tela continua utilizável e o próximo refresh tenta novamente.
    }
  },
  { immediate: true }
);
</script>

<template>
  <button
    v-if="conferencia"
    type="button"
    class="malote-abertura"
    :class="{ 'malote-abertura--divergente': divergiu }"
    aria-label="Ver resumo do malote de abertura"
    @click="dialogAberto = true"
  >
    <template v-if="divergiu">
      <span>Abertura com divergência — ver conferência</span>
      <v-icon icon="mdi-alert-outline" size="14" aria-hidden="true" />
    </template>
    <template v-else>
      <span
        >Abertura: dinheiro {{ dinheiro(conferencia.valorEspecieContado) }} · moedas
        {{ dinheiro(conferencia.valorMoedasContado) }}</span
      >
      <v-icon icon="mdi-information-outline" size="14" aria-hidden="true" />
    </template>
  </button>

  <v-dialog v-model="dialogAberto" max-width="560">
    <v-card v-if="conferencia">
      <v-card-title>Resumo do malote de abertura</v-card-title>
      <v-card-text>
        <div class="text-body-2 text-medium-emphasis mb-4">
          Conferido em {{ formatarDataHora(conferencia.conferidoEm) }}.
        </div>
        <div class="malote-abertura__grid">
          <section class="malote-abertura__bloco">
            <div class="text-subtitle-2">Valor declarado</div>
            <div>
              Dinheiro: <strong>{{ dinheiro(conferencia.valorEspecieDeclarado) }}</strong>
            </div>
            <div>
              Moedas: <strong>{{ dinheiro(conferencia.valorMoedasDeclarado) }}</strong>
            </div>
            <div class="mt-2">
              Total: <strong>{{ dinheiro(totalDeclarado) }}</strong>
            </div>
          </section>
          <section class="malote-abertura__bloco">
            <div class="text-subtitle-2">Valor contado pelo caixa</div>
            <div>
              Dinheiro: <strong>{{ dinheiro(conferencia.valorEspecieContado) }}</strong>
            </div>
            <div>
              Moedas: <strong>{{ dinheiro(conferencia.valorMoedasContado) }}</strong>
            </div>
            <div class="mt-2">
              Total: <strong>{{ dinheiro(totalContado) }}</strong>
            </div>
          </section>
        </div>
        <v-alert v-if="divergiu" type="error" density="compact" class="mt-4">
          Divergência na abertura: {{ dinheiro(totalContado) }} contado para {{ dinheiro(totalDeclarado) }} declarado.
          <span v-if="conferencia.observacao"> Motivo: {{ conferencia.observacao }}</span>
        </v-alert>
        <div v-else class="text-body-2 text-success mt-4">Conferência de abertura convergente.</div>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn color="primary" @click="dialogAberto = false">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.malote-abertura {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.74rem;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
}

.malote-abertura:hover,
.malote-abertura:focus-visible {
  text-decoration: underline;
}

.malote-abertura--divergente {
  color: rgb(var(--v-theme-error));
}

.malote-abertura:focus-visible {
  outline: 2px solid currentcolor;
  outline-offset: 3px;
}

.malote-abertura__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.malote-abertura__bloco {
  padding: 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-size: 0.875rem;
}

@media (max-width: 480px) {
  .malote-abertura__grid {
    grid-template-columns: 1fr;
  }
}
</style>
