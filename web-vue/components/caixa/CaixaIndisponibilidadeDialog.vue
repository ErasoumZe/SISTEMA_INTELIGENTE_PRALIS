<script setup lang="ts">
const props = defineProps<{
  aberto: boolean;
  salvando: boolean;
  erro?: string;
  indisponibilidadeAberta: { motivos: string[]; motivoOutro: string | null; iniciadoEm: string } | null;
}>();

const emit = defineEmits<{
  (event: "update:aberto", value: boolean): void;
  (event: "registrar", value: { motivos: string[]; motivoOutro: string | null }): void;
  (event: "retornar"): void;
}>();

const motivos = ref<string[]>([]);
const motivoOutro = ref("");
const abertoEm = ref<Date | null>(null);
const opcoes = [
  ["falta_energia", "Falta de energia na loja"],
  ["oscilacao_eletrica", "Oscilação ou pane elétrica"],
  ["internet_caiu", "Internet caiu"],
  ["cabo_desconectado", "Esbarrão em fio / cabo desconectado"],
  ["computador_travou", "Computador travou, tive que reiniciar"],
  ["limpeza_manutencao", "Limpeza ou manutenção na loja"],
  ["atualizacao_sistema", "Atualização do sistema (Windows)"],
  ["outro", "Outro"]
] as const;
const outroSelecionado = computed(() => motivos.value.includes("outro"));
const pdvDesligado = computed(() => Boolean(props.indisponibilidadeAberta));
const podeRegistrar = computed(
  () => motivos.value.length > 0 && (!outroSelecionado.value || Boolean(motivoOutro.value.trim()))
);

watch(
  () => props.aberto,
  (aberto) => {
    if (aberto && !props.indisponibilidadeAberta) {
      motivos.value = [];
      motivoOutro.value = "";
      abertoEm.value = new Date();
    }
  }
);

function fechar() {
  if (!props.salvando) emit("update:aberto", false);
}
function registrar() {
  if (!podeRegistrar.value) return;
  emit("registrar", { motivos: motivos.value, motivoOutro: outroSelecionado.value ? motivoOutro.value.trim() : null });
}
</script>

<template>
  <v-dialog :model-value="aberto" max-width="560" persistent>
    <v-card class="caixa-indisponibilidade">
      <v-card-title
        class="caixa-indisponibilidade__cabecalho"
        :class="{ 'caixa-indisponibilidade__cabecalho--desligado': pdvDesligado }"
      >
        <v-icon :icon="pdvDesligado ? 'mdi-monitor-off' : 'mdi-monitor'" />
        <span>{{ pdvDesligado ? "PDV DESLIGADO" : "PDV LIGADO" }}</span>
      </v-card-title>
      <v-card-text>
        <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
        <template v-if="indisponibilidadeAberta">
          <v-alert type="warning" variant="tonal" class="mb-4">
            O PDV está desligado desde
            {{ new Date(indisponibilidadeAberta.iniciadoEm).toLocaleString("pt-BR") }}.
          </v-alert>
          <p>
            Quando o computador voltar a funcionar, registre o retorno para concluir este intervalo no histórico do
            caixa.
          </p>
        </template>
        <template v-else>
          <p class="mb-4">O PDV está ligado. Ao registrar os motivos abaixo, ele ficará marcado como desligado.</p>
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            Solicitação iniciada em <strong>{{ abertoEm?.toLocaleString("pt-BR") }}</strong
            >. A hora oficial será confirmada ao registrar a parada.
          </v-alert>
          <v-checkbox
            v-for="[valor, titulo] in opcoes"
            :key="valor"
            v-model="motivos"
            :label="titulo"
            :value="valor"
            density="compact"
            hide-details
          />
          <v-textarea
            v-if="outroSelecionado"
            v-model="motivoOutro"
            class="mt-3"
            label="Descreva o outro motivo"
            rows="2"
            :error="!motivoOutro.trim()"
            :error-messages="!motivoOutro.trim() ? 'Obrigatório para Outro.' : ''"
          />
        </template>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn :disabled="salvando" variant="text" @click="fechar">Cancelar</v-btn>
        <v-btn v-if="indisponibilidadeAberta" color="success" :loading="salvando" @click="emit('retornar')">
          Computador voltou
        </v-btn>
        <v-btn v-else color="error" :disabled="!podeRegistrar" :loading="salvando" @click="registrar">
          Registrar parada
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.caixa-indisponibilidade__cabecalho {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 16px 24px;
  color: #fff;
  background: #16a34a;
  font-weight: 750;
}
.caixa-indisponibilidade__cabecalho--desligado {
  background: #dc2626;
}
.caixa-indisponibilidade__cabecalho :deep(.v-icon) {
  color: inherit;
}
</style>
