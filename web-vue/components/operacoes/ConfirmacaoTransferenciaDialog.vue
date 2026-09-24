<script setup lang="ts">
import { dinheiro } from "~/utils/domain";

const props = defineProps<{
  aberto: boolean;
  salvando: boolean;
  valorTotal: number;
  valorEspecie: number;
  valorMoedas: number;
  lacreMalote: string;
  lacresRetorno: string[];
  origem: string;
  destinos: string[];
  agendadaPara: string;
}>();

const emit = defineEmits<{
  (event: "editar"): void;
  (event: "confirmar"): void;
}>();

const temComposicao = computed(() => props.valorEspecie > 0 || props.valorMoedas > 0);
</script>

<template>
  <v-dialog :model-value="aberto" max-width="620" persistent no-click-animation>
    <v-card class="confirmacao-transferencia">
      <div class="confirmacao-transferencia__faixa">
        <div>
          <div class="text-h6 font-weight-bold">Confirmar transferência</div>
          <div class="text-body-2">Confira o malote antes de registrar a saída.</div>
        </div>
        <v-btn icon="mdi-close" variant="text" color="white" :disabled="salvando" @click="emit('editar')" />
      </div>

      <v-card-text class="pa-5">
        <v-sheet class="confirmacao-transferencia__valor pa-4 mb-4" rounded="lg">
          <span>Valor total enviado</span>
          <strong>{{ dinheiro(valorTotal) }}</strong>
        </v-sheet>

        <v-row dense>
          <v-col cols="12" sm="6"><strong>Origem:</strong> {{ origem }}</v-col>
          <v-col cols="12" sm="6"><strong>Destino:</strong> {{ destinos.join(" · ") }}</v-col>
          <v-col cols="12"><strong>Lacre do malote:</strong> {{ lacreMalote }}</v-col>
          <template v-if="temComposicao">
            <v-col cols="12" sm="6"><strong>Dinheiro físico:</strong> {{ dinheiro(valorEspecie) }}</v-col>
            <v-col cols="12" sm="6"><strong>Moedas:</strong> {{ dinheiro(valorMoedas) }}</v-col>
          </template>
          <v-col v-if="agendadaPara" cols="12"><strong>Agendado para:</strong> {{ agendadaPara }}</v-col>
        </v-row>

        <v-sheet class="mt-4 pa-3" rounded="lg" border>
          <div class="text-subtitle-2">Lacres de retorno / sangria</div>
          <div class="text-body-2 mt-1">{{ lacresRetorno.length }} lacre(s) preparado(s) dentro do malote.</div>
          <v-chip-group v-if="lacresRetorno.length" class="mt-2">
            <v-chip v-for="(lacre, indice) in lacresRetorno" :key="lacre" size="small" prepend-icon="mdi-lock-outline">
              Bolsa {{ indice + 1 }}: {{ lacre }}
            </v-chip>
          </v-chip-group>
        </v-sheet>
      </v-card-text>

      <v-card-actions class="px-5 pb-5">
        <v-spacer />
        <v-btn variant="text" :disabled="salvando" @click="emit('editar')">Voltar e editar</v-btn>
        <v-btn color="deep-orange-darken-2" variant="flat" :loading="salvando" @click="emit('confirmar')">
          Confirmar transferência
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.confirmacao-transferencia {
  overflow: hidden;
  background: rgb(255 255 255 / 94%);
  backdrop-filter: blur(10px);
}
.confirmacao-transferencia__faixa {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  color: #fff;
  background: linear-gradient(120deg, #c2410c, #ea580c);
}
.confirmacao-transferencia__valor {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #7c2d12;
  background: #fff1e8;
}
.confirmacao-transferencia__valor strong {
  font-size: 22px;
}
</style>
