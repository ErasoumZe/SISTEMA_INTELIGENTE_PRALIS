<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useApi } from "~/composables/useApi";

type Regra = {
  id: string;
  parcelasDe: number | null;
  parcelasAte: number | null;
  taxaPercentual: string | null;
  taxaFixa: string | null;
  prazoDias: number | null;
  status: "rascunho" | "validada" | "arquivada";
};
const props = defineProps<{ empresaId: string; formaId: string | null; podeConfigurar: boolean }>();
const { apiGet, apiPost } = useApi();
const regras = ref<Regra[]>([]);
const carregando = ref(false);
const salvando = ref(false);
const erro = ref("");
const aberto = ref(false);
const modelo = ref({
  parcelasDe: null as number | null,
  parcelasAte: null as number | null,
  taxaPercentual: null as number | null,
  taxaFixa: null as number | null,
  prazoDias: null as number | null,
  fonteReferencia: "",
  observacao: ""
});
const podeSalvar = computed(
  () =>
    !salvando.value &&
    (modelo.value.parcelasDe == null) === (modelo.value.parcelasAte == null) &&
    (modelo.value.parcelasDe == null ||
      (modelo.value.parcelasDe >= 1 && modelo.value.parcelasAte! >= modelo.value.parcelasDe)) &&
    (modelo.value.taxaPercentual == null || (modelo.value.taxaPercentual >= 0 && modelo.value.taxaPercentual <= 100)) &&
    (modelo.value.taxaFixa == null || modelo.value.taxaFixa >= 0) &&
    (modelo.value.prazoDias == null || modelo.value.prazoDias >= 0)
);
function limpar() {
  modelo.value = {
    parcelasDe: null,
    parcelasAte: null,
    taxaPercentual: null,
    taxaFixa: null,
    prazoDias: null,
    fonteReferencia: "",
    observacao: ""
  };
}
async function carregar() {
  if (!props.formaId || !props.podeConfigurar) return;
  carregando.value = true;
  erro.value = "";
  try {
    regras.value = await apiGet<Regra[]>(
      `/api/formas-pagamento/${props.formaId}/regras-recebimento?empresaId=${props.empresaId}`
    );
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel carregar as regras de teste.";
  } finally {
    carregando.value = false;
  }
}
async function salvar() {
  if (!props.formaId || !podeSalvar.value) return;
  salvando.value = true;
  erro.value = "";
  try {
    await apiPost(`/api/formas-pagamento/${props.formaId}/regras-recebimento`, {
      empresaId: props.empresaId,
      ...modelo.value,
      status: "rascunho"
    });
    limpar();
    aberto.value = false;
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel salvar a regra de teste.";
  } finally {
    salvando.value = false;
  }
}
watch(
  () => props.formaId,
  () => void carregar(),
  { immediate: true }
);
</script>

<template>
  <section class="mt-6">
    <div class="d-flex align-center justify-space-between ga-2 mb-2">
      <div>
        <div class="text-subtitle-1 font-weight-bold">Regras de teste</div>
        <div class="text-caption text-medium-emphasis">Taxa e prazo de referencia desta forma.</div>
      </div>
      <v-btn size="small" color="primary" variant="tonal" :disabled="!podeConfigurar" @click="aberto = !aberto">{{
        aberto ? "Cancelar" : "Adicionar regra"
      }}</v-btn>
    </div>
    <v-alert type="info" variant="tonal" density="compact" class="mb-3"
      >Ambiente de simulacao: estas regras nao alteram vendas, saldo, caixa, contas ou liquidacoes.</v-alert
    >
    <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-3">{{ erro }}</v-alert>
    <v-card v-if="aberto" variant="outlined" class="mb-3 pa-3"
      ><div class="campos-regras">
        <v-text-field
          v-model.number="modelo.parcelasDe"
          type="number"
          min="1"
          label="Parcelas de"
          density="comfortable"
          hide-details
        /><v-text-field
          v-model.number="modelo.parcelasAte"
          type="number"
          min="1"
          label="Parcelas ate"
          density="comfortable"
          hide-details
        /><v-text-field
          v-model.number="modelo.taxaPercentual"
          type="number"
          min="0"
          max="100"
          step="0.0001"
          suffix="%"
          label="Taxa percentual"
          density="comfortable"
          hide-details
        /><v-text-field
          v-model.number="modelo.taxaFixa"
          type="number"
          min="0"
          step="0.01"
          prefix="R$"
          label="Taxa fixa"
          density="comfortable"
          hide-details
        /><v-text-field
          v-model.number="modelo.prazoDias"
          type="number"
          min="0"
          label="Prazo em dias"
          density="comfortable"
          hide-details
        /><v-text-field
          v-model="modelo.fonteReferencia"
          label="Fonte de referencia"
          density="comfortable"
          hide-details
        />
      </div>
      <v-textarea
        v-model="modelo.observacao"
        label="Observacao (opcional)"
        rows="2"
        auto-grow
        density="comfortable"
        hide-details
        class="mt-3"
      />
      <div class="d-flex justify-end mt-3">
        <v-btn color="primary" variant="flat" :loading="salvando" :disabled="!podeSalvar" @click="salvar"
          >Salvar regra de teste</v-btn
        >
      </div></v-card
    >
    <div v-if="carregando" class="text-center py-3">
      <v-progress-circular indeterminate size="24" color="primary" />
    </div>
    <v-table v-else-if="regras.length" density="compact"
      ><thead>
        <tr>
          <th>Parcelas</th>
          <th>Taxa</th>
          <th>Prazo</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="regra in regras" :key="regra.id">
          <td>{{ regra.parcelasDe == null ? "Todas" : `${regra.parcelasDe} a ${regra.parcelasAte}` }}</td>
          <td>{{ regra.taxaPercentual == null ? "—" : `${regra.taxaPercentual}%` }}</td>
          <td>{{ regra.prazoDias == null ? "—" : `${regra.prazoDias} dia(s)` }}</td>
          <td>
            <v-chip size="x-small" :color="regra.status === 'validada' ? 'success' : 'warning'">{{
              regra.status
            }}</v-chip>
          </td>
        </tr>
      </tbody></v-table
    >
    <p v-else-if="!carregando" class="text-caption text-medium-emphasis mb-0">Nenhuma regra de teste cadastrada.</p>
  </section>
</template>

<style scoped>
.campos-regras {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 768px) {
  .campos-regras {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
