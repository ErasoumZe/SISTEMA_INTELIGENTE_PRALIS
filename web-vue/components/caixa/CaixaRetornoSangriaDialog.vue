<script setup lang="ts">
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import { dinheiro } from "~/utils/domain";

const props = defineProps<{
  aberto: boolean;
  saldoLivre: number;
  valor: string;
  valorEspecie: string;
  valorMoedas: string;
  lacre: string;
  observacao: string;
  responsavelNome: string;
  bloqueado: boolean;
  mensagemErro: string;
  salvando: boolean;
}>();
const emit = defineEmits<{
  (event: "update:aberto", valor: boolean): void;
  (event: "update:valor", valor: string): void;
  (event: "update:valorEspecie", valor: string): void;
  (event: "update:valorMoedas", valor: string): void;
  (event: "update:lacre", valor: string): void;
  (event: "update:observacao", valor: string): void;
  (event: "salvar", fecharDepois: boolean): void;
}>();

const dialogAberto = computed({
  get: () => props.aberto,
  set: (aberto: boolean) => emit("update:aberto", aberto)
});
</script>

<template>
  <v-dialog v-model="dialogAberto" max-width="720">
    <v-card class="retorno-dialog">
      <div class="retorno-dialog__cabecalho">
        <div>
          <div class="retorno-dialog__titulo">
            <v-icon icon="mdi-bank-transfer-out" /> Transferência de retorno / sangria
          </div>
          <div class="retorno-dialog__subtitulo">Envie dinheiro físico do caixa para o cofre.</div>
        </div>
        <v-btn icon="mdi-close" variant="text" aria-label="Fechar retorno / sangria" @click="dialogAberto = false" />
      </div>

      <v-card-text class="pt-5">
        <div class="retorno-dialog__saldo">
          Disponível para retorno: <strong>{{ dinheiro(saldoLivre) }}</strong>
        </div>
        <v-row class="mt-2">
          <v-col cols="12" md="4">
            <CampoDinheiro
              :model-value="valor"
              label="Valor a entregar (vazio = tudo)"
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
            <v-text-field
              :model-value="lacre"
              label="Lacre do retorno / sangria (obrigatório)"
              hint="Identifica o malote que retorna do caixa ao cofre."
              persistent-hint
              color="error"
              base-color="error"
              prepend-inner-icon="mdi-lock-outline"
              required
              @update:model-value="emit('update:lacre', $event)"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              :model-value="responsavelNome"
              label="Responsável pela sangria (obrigatório)"
              hint="Registrado automaticamente pelo usuário que está operando."
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
        <v-btn variant="text" @click="dialogAberto = false">Cancelar</v-btn>
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
  </v-dialog>
</template>

<style scoped>
.retorno-dialog {
  overflow: hidden;
}

.retorno-dialog__cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px;
  background: rgb(var(--v-theme-warning));
  color: rgb(var(--v-theme-on-warning));
}

.retorno-dialog__titulo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
  font-weight: 800;
}

.retorno-dialog__subtitulo {
  margin-top: 4px;
  font-size: 0.875rem;
}

.retorno-dialog__saldo {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-warning), 0.13);
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
