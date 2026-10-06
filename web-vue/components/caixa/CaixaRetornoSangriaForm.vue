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
  <section class="retorno-dialog">
    <div class="retorno-dialog__corpo">
      <div class="retorno-dialog__secao">Retorno / sangria</div>
      <p class="retorno-dialog__intro">Envie dinheiro físico do Caixa aberto para o cofre.</p>
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
      <v-row class="mt-2 retorno-dialog__campos">
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
    </div>

    <div class="retorno-dialog__acoes">
      <v-btn variant="text" @click="emit('cancelar')">Cancelar</v-btn>
      <v-spacer />
      <v-btn
        variant="outlined"
        class="retorno-dialog__continuar"
        :disabled="bloqueado"
        :loading="salvando"
        @click="emit('salvar', false)"
      >
        Salvar e continuar
      </v-btn>
      <v-btn class="retorno-dialog__salvar" :disabled="bloqueado" :loading="salvando" @click="emit('salvar', true)">
        Salvar e sair
      </v-btn>
    </div>
  </section>
</template>

<style scoped>
.retorno-dialog {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
  color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface));
}

.retorno-dialog__corpo {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 22px;
}

.retorno-dialog__secao {
  margin: 2px 0 8px;
  color: var(--cat-transferencias-tinta, #9c2f07);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.retorno-dialog__intro { margin: 0 0 14px; }

.retorno-dialog__saldo {
  padding: 10px 12px;
  border-radius: 8px;
  color: rgb(var(--v-theme-on-surface));
  background: var(--cat-transferencias-soft, #fff1eb);
  border: 1px solid color-mix(in srgb, var(--cat-transferencias-base, #fb4b0b) 38%, transparent);
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
  border: 1px solid color-mix(in srgb, var(--cat-transferencias-base, #fb4b0b) 25%, transparent);
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
  display: flex;
  align-items: center;
  padding: 12px 22px;
  border-top: 1px solid var(--cx-line, rgb(var(--v-theme-on-surface) / 18%));
  flex-wrap: wrap;
  gap: 8px;
}

.retorno-dialog__continuar { color: var(--cat-transferencias-tinta, #9c2f07); }
.retorno-dialog__salvar { color: #fff; background: var(--cat-transferencias-base, #fb4b0b); }
.retorno-dialog__campos :deep(.v-field--focused .v-field__outline) { color: var(--cat-transferencias-base, #fb4b0b); }

@media (max-width: 560px) {
  .retorno-dialog__corpo { padding: 14px 16px; }
  .retorno-dialog__acoes { padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); }
}
</style>
