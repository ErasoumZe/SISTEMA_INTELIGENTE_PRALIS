<script setup lang="ts">
import type { DetalheCaixaResponse } from "@padaria/shared";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

const props = defineProps<{
  aberta: boolean;
  cor: string;
  saldo: number;
  // Caixa aberto do proprio operador: mostra acerto + fechamento. Caso contrario, so leitura.
  editavel: boolean;
  precisaAcerto: boolean;
  salvando?: boolean;
  // Auditoria (gerente): ajuste de saldo e trilha de alteracoes de horario do caixa selecionado.
  detalhe: DetalheCaixaResponse | null;
}>();

const emit = defineEmits<{
  (event: "alternar"): void;
  (event: "acertar"): void;
  (event: "fechar", observacao: string | null): void;
}>();

const observacaoFechamento = ref("");

function fechar() {
  emit("fechar", observacaoFechamento.value || null);
}

const ajuste = computed(() => props.detalhe?.ajuste ?? null);
const edicoes = computed(() => props.detalhe?.edicoes ?? []);
</script>

<template>
  <v-card variant="outlined" class="cockpit-secao" :style="{ '--cor-secao': cor }">
    <div
      class="cockpit-secao-cabecalho"
      role="button"
      tabindex="0"
      :aria-expanded="aberta"
      @click="emit('alternar')"
      @keydown.enter.prevent="emit('alternar')"
      @keydown.space.prevent="emit('alternar')"
    >
      <v-icon :icon="aberta ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="20" class="text-medium-emphasis" />
      <v-icon icon="mdi-scale-balance" size="20" class="cockpit-secao-icone" />
      <span class="cockpit-secao-titulo">Resultado / Diferenca</span>
      <span class="cockpit-secao-total">{{ dinheiro(saldo) }}</span>
    </div>

    <v-expand-transition>
      <div v-if="aberta" class="cockpit-secao-corpo pa-4">
        <!-- Caixa aberto do proprio operador: acerto de diferenca + fechamento. -->
        <template v-if="editavel">
          <v-alert v-if="precisaAcerto" type="warning" variant="tonal" class="mb-4">
            Diferenca positiva de {{ dinheiro(saldo) }}. Ao acertar, a diferenca sera atribuida ao usuario do caixa.
          </v-alert>
          <v-row dense>
            <v-col v-if="precisaAcerto" cols="12">
              <v-btn color="warning" prepend-icon="mdi-cash-sync" :loading="salvando" @click="emit('acertar')">
                Acertar saldo
              </v-btn>
            </v-col>
            <v-col cols="12" md="8">
              <v-text-field v-model="observacaoFechamento" label="Observacao do fechamento" hide-details />
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

        <!-- Auditoria (caixa fechado ou de outro operador): leitura do resultado, ajuste e trilha. -->
        <template v-else>
          <div v-if="ajuste" class="mb-4">
            <div class="text-subtitle-2 mb-1">Acerto de saldo</div>
            <div class="text-body-2">
              Diferenca de <strong>{{ dinheiro(ajuste.valorDiferenca) }}</strong>
              <template v-if="ajuste.colaboradorNome"> atribuida a {{ ajuste.colaboradorNome }}</template>
              <template v-if="ajuste.observacao"> — {{ ajuste.observacao }}</template>
            </div>
          </div>

          <div class="text-subtitle-2 mb-1">Alteracoes de horario</div>
          <div v-if="!edicoes.length" class="text-body-2 text-medium-emphasis">Sem alteracoes de horario.</div>
          <ul v-else class="cockpit-trilha">
            <li v-for="edicao in edicoes" :key="edicao.id" class="text-body-2 mb-1">
              <strong>{{ formatarDataHora(edicao.editadoEm) }}</strong>
              — {{ edicao.editadoPorNome || edicao.editadoPor || "sistema" }}
              <span v-if="edicao.porToken">(por token)</span>
              <template v-if="edicao.autorizadorNome"> · autorizado por {{ edicao.autorizadorNome }}</template>
              <template v-if="edicao.observacao"> · {{ edicao.observacao }}</template>
            </li>
          </ul>
        </template>
      </div>
    </v-expand-transition>
  </v-card>
</template>

<style scoped>
.cockpit-secao {
  border-left: 4px solid var(--cor-secao);
}
.cockpit-secao-cabecalho {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}
.cockpit-secao-cabecalho:hover {
  background: rgba(0, 0, 0, 0.03);
}
.cockpit-secao-icone {
  color: var(--cor-secao);
}
.cockpit-secao-titulo {
  font-weight: 600;
}
.cockpit-secao-total {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.cockpit-secao-corpo {
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.cockpit-trilha {
  list-style: none;
  padding-left: 0;
}
</style>
