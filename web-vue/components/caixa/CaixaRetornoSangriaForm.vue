<script setup lang="ts">
import { computed } from "vue";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import { dinheiro } from "~/utils/domain";

const props = defineProps<{
  saldoLivre: number;
  valor: string;
  valorEspecie: string;
  valorMoedas: string;
  lacreId: string;
  lacresDisponiveis: Array<{ id: string; numero: string }>;
  observacao: string;
  responsavelNome: string;
  bloqueado: boolean;
  mensagemErro: string;
  salvando: boolean;
}>();
const emit = defineEmits<{
  (event: "cancelar"): void;
  (event: "update:valor", valor: string): void;
  (event: "update:valorEspecie", valor: string): void;
  (event: "update:valorMoedas", valor: string): void;
  (event: "update:lacreId", valor: string): void;
  (event: "update:observacao", valor: string): void;
  (event: "update:responsavelNome", valor: string): void;
  (event: "salvar", fecharDepois: boolean): void;
}>();

const valorEfetivo = computed(() => Number(props.valor || props.saldoLivre));
const valorEspecie = computed(() => Number(props.valorEspecie || 0));
const valorMoedas = computed(() => Number(props.valorMoedas || 0));
</script>

<template>
  <v-card class="retorno-dialog">
    <v-card-text class="pt-5">
      <p class="mb-4">Envie dinheiro físico do Caixa aberto para o cofre.</p>
      <div class="retorno-dialog__saldo">
        Disponível para retorno: <strong>{{ dinheiro(saldoLivre) }}</strong>
      </div>
      <div class="retorno-dialog__resumo mt-3" aria-live="polite">
        <span
          ><small>Valor total</small><strong>{{ dinheiro(valorEfetivo) }}</strong></span
        >
        <span
          ><small>Dinheiro físico</small><strong>{{ dinheiro(valorEspecie) }}</strong></span
        >
        <span
          ><small>Moedas</small><strong>{{ dinheiro(valorMoedas) }}</strong></span
        >
      </div>
      <v-row class="mt-2">
        <v-col cols="12" md="4">
          <CampoDinheiro
            :model-value="valor"
            label="Valor total"
            icone="mdi-cash-minus"
            @update:model-value="emit('update:valor', $event)"
          />
        </v-col>
        <v-col cols="12" md="4">
          <CampoDinheiro
            :model-value="valorEspecie"
            label="Dinheiro físico"
            icone="mdi-cash"
            @update:model-value="emit('update:valorEspecie', $event)"
          />
        </v-col>
        <v-col cols="12" md="4">
          <CampoDinheiro
            :model-value="valorMoedas"
            label="Moedas"
            icone="mdi-circle-multiple-outline"
            @update:model-value="emit('update:valorMoedas', $event)"
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-select
            :model-value="lacreId"
            :items="lacresDisponiveis"
            item-title="numero"
            item-value="id"
            label="Lacre disponível (obrigatório)"
            hint="Confira fisicamente o número antes de fechar a bolsa."
            persistent-hint
            color="error"
            base-color="error"
            prepend-inner-icon="mdi-lock-outline"
            required
            @update:model-value="emit('update:lacreId', String($event ?? ''))"
          >
            <template #no-data>Nenhum lacre disponivel. Solicite a Tesouraria.</template>
          </v-select>
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            :model-value="responsavelNome"
            label="Responsável pela sangria (obrigatório)"
            hint="Preenchido automaticamente com o operador que abriu o caixa."
            persistent-hint
            prepend-inner-icon="mdi-account-cash-outline"
            readonly
            required
          />
        </v-col>
        <v-col cols="12">
          <v-text-field
            :model-value="observacao"
            label="Observação (opcional)"
            @update:model-value="emit('update:observacao', $event)"
          />
        </v-col>
      </v-row>
      <div v-if="mensagemErro" class="retorno-dialog__erro" role="alert">{{ mensagemErro }}</div>
    </v-card-text>

    <v-card-actions class="retorno-dialog__acoes px-6 pb-5">
      <v-btn variant="text" @click="emit('cancelar')">Cancelar</v-btn>
      <v-spacer />
      <v-btn
        variant="outlined"
        color="warning"
        :disabled="bloqueado"
        :loading="salvando"
        @click="emit('salvar', false)"
      >
        Salvar e continuar
      </v-btn>
      <v-btn color="warning" :disabled="bloqueado" :loading="salvando" @click="emit('salvar', true)">
        Salvar e sair
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.retorno-dialog {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface));
}

.retorno-dialog__saldo {
  padding: 10px 12px;
  border-radius: 8px;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-primary), 0.16);
  border: 1px solid rgba(var(--v-theme-primary), 0.34);
}

.retorno-dialog__resumo {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.retorno-dialog__resumo span {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 8px;
}

.retorno-dialog__resumo small {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.75rem;
}

@media (max-width: 560px) {
  .retorno-dialog__resumo {
    grid-template-columns: 1fr;
  }
}

.retorno-dialog__erro {
  color: rgb(var(--v-theme-error));
  font-size: 0.8125rem;
  font-weight: 600;
}

.retorno-dialog__acoes {
  flex-wrap: wrap;
  gap: 8px;
}
</style>
