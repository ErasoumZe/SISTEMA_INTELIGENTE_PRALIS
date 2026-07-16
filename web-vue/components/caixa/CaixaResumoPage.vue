<script setup lang="ts">
import type { CaixaStatus, Opcao, ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { dataHoraLocal, formatarDataHora } from "~/utils/formatacao";
import CaixaAutorizacoes from "~/components/caixa/CaixaAutorizacoes.vue";

const props = defineProps<{
  resumo: ResumoCaixa | null;
  status: CaixaStatus | null;
  pdvs: Opcao[];
  turnos?: Opcao[];
  empresaId: string;
  permissoes: string[];
  usuarioId: string;
  usuarioNome: string;
  salvando?: boolean;
}>();

const emit = defineEmits<{
  (
    event: "abrirCaixa",
    payload: {
      pdvId: string;
      usuarioCaixaId: string;
      turnoId?: string | null;
      dataHoraAbertura: string;
      observacao: string | null;
    }
  ): void;
  (event: "acertarSaldo", payload: { caixaId: string; observacao: string | null }): void;
  (event: "fecharCaixa", payload: { caixaId: string; observacao: string | null }): void;
  (event: "recarregar"): void;
}>();

const abertura = reactive({
  pdvId: "",
  turnoId: "",
  dataHoraAbertura: dataHoraLocal()
});
const fechamento = reactive({ observacao: "" });

const caixaAberto = computed(() => props.status?.caixaAberto ?? null);
const resumoAtual = computed(() => props.resumo ?? props.status?.resumo ?? null);
const precisaAcerto = computed(() => Number(resumoAtual.value?.saldo ?? 0) > 0);

watch(
  () => props.pdvs,
  (pdvs) => {
    if (!abertura.pdvId && pdvs[0]?.id) abertura.pdvId = pdvs[0].id;
  },
  { immediate: true }
);

watch(
  caixaAberto,
  () => {
    if (!caixaAberto.value) {
      fechamento.observacao = "";
    }
  },
  { immediate: true }
);

function abrir() {
  emit("abrirCaixa", {
    pdvId: abertura.pdvId,
    usuarioCaixaId: props.usuarioId,
    turnoId: abertura.turnoId || null,
    dataHoraAbertura: abertura.dataHoraAbertura,
    observacao: null
  });
}

function acertar() {
  const caixa = caixaAberto.value;
  if (!caixa) return;
  emit("acertarSaldo", { caixaId: caixa.id, observacao: null });
}

function fechar() {
  const caixa = caixaAberto.value;
  if (!caixa) return;
  emit("fecharCaixa", {
    caixaId: caixa.id,
    observacao: fechamento.observacao || null
  });
}
</script>

<template>
  <v-card>
    <v-card-title>Caixa</v-card-title>
    <v-card-text>
      <v-alert v-if="!pdvs.length" type="warning" variant="tonal" class="mb-4">
        Cadastre um PDV com conta vinculada antes de abrir caixa.
      </v-alert>

      <!-- Sem caixa aberto o autorizador ainda precisa da fila de autorizacoes: o proprio
           CaixaAutorizacoes decide o que mostrar (so o botao Autorizacoes, neste caso). -->
      <div v-if="!caixaAberto" class="mb-4">
        <CaixaAutorizacoes
          :empresa-id="empresaId"
          :caixa-aberto="null"
          :permissoes="permissoes"
          @alterado="emit('recarregar')"
        />
      </div>

      <v-row v-if="!caixaAberto" dense>
        <v-col cols="12" md="3">
          <v-select v-model="abertura.pdvId" :items="pdvs" item-title="nome" item-value="id" label="PDV" />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="abertura.turnoId"
            :items="turnos ?? []"
            item-title="nome"
            item-value="id"
            label="Turno"
            clearable
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-text-field v-model="abertura.dataHoraAbertura" type="datetime-local" label="Data e hora de abertura" />
        </v-col>
        <v-col cols="12" md="3">
          <v-text-field :model-value="usuarioNome" label="Usuario do caixa" readonly />
        </v-col>
        <v-col cols="12">
          <v-btn
            color="primary"
            prepend-icon="mdi-cash-register"
            :loading="salvando"
            :disabled="!abertura.pdvId"
            @click="abrir"
          >
            Abrir caixa
          </v-btn>
        </v-col>
      </v-row>

      <template v-else>
        <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
          <v-alert type="success" variant="tonal" class="flex-grow-1 mb-0">
            Caixa aberto em {{ formatarDataHora(caixaAberto.dataHoraAbertura) }} no {{ caixaAberto.pdvNome }}.
          </v-alert>
          <CaixaAutorizacoes
            :empresa-id="empresaId"
            :caixa-aberto="caixaAberto"
            :permissoes="permissoes"
            @alterado="emit('recarregar')"
          />
        </div>

        <v-row v-if="resumoAtual" dense>
          <v-col cols="12" md="2">
            <v-sheet class="pa-4 rounded-lg soft-bg">
              <div class="text-caption">Entradas</div>
              <div class="text-h6">{{ dinheiro(resumoAtual.totalEntradas) }}</div>
            </v-sheet>
          </v-col>
          <v-col cols="12" md="2">
            <v-sheet class="pa-4 rounded-lg soft-bg">
              <div class="text-caption">Transf. entrada</div>
              <div class="text-h6">{{ dinheiro(resumoAtual.totalTransferenciasEntrada || 0) }}</div>
            </v-sheet>
          </v-col>
          <v-col cols="12" md="2">
            <v-sheet class="pa-4 rounded-lg soft-bg">
              <div class="text-caption">Transf. saida</div>
              <div class="text-h6">{{ dinheiro(resumoAtual.totalTransferenciasSaida || 0) }}</div>
            </v-sheet>
          </v-col>
          <v-col cols="12" md="2">
            <v-sheet class="pa-4 rounded-lg soft-bg">
              <div class="text-caption">Despesas</div>
              <div class="text-h6">{{ dinheiro(resumoAtual.totalDespesas) }}</div>
            </v-sheet>
          </v-col>
          <v-col cols="12" md="2">
            <v-sheet class="pa-4 rounded-lg soft-bg">
              <div class="text-caption">Mercadorias</div>
              <div class="text-h6">{{ dinheiro(resumoAtual.totalMercadorias || 0) }}</div>
            </v-sheet>
          </v-col>
          <v-col cols="12" md="2">
            <v-sheet class="pa-4 rounded-lg soft-bg">
              <div class="text-caption">Saldo</div>
              <div class="text-h6">{{ dinheiro(resumoAtual.saldo) }}</div>
            </v-sheet>
          </v-col>
        </v-row>

        <v-divider class="my-5" />

        <v-alert v-if="precisaAcerto" type="warning" variant="tonal" class="my-5">
          Diferenca positiva de {{ dinheiro(resumoAtual?.saldo || 0) }}. Ao acertar, a diferenca sera atribuida ao
          usuario do caixa.
        </v-alert>

        <v-row dense>
          <v-col v-if="precisaAcerto" cols="12">
            <v-btn color="warning" prepend-icon="mdi-cash-sync" :loading="salvando" @click="acertar">
              Acertar saldo
            </v-btn>
          </v-col>
          <v-col cols="12" md="8">
            <v-text-field v-model="fechamento.observacao" label="Observacao do fechamento" />
          </v-col>
          <v-col cols="12">
            <v-btn
              color="primary"
              prepend-icon="mdi-lock"
              :disabled="precisaAcerto"
              :loading="salvando"
              @click="fechar"
            >
              Fechar caixa
            </v-btn>
          </v-col>
        </v-row>
      </template>
    </v-card-text>
  </v-card>
</template>
