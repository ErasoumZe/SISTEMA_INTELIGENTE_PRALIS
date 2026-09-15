<script setup lang="ts">
import type { LinhaHistoricoCaixa } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { formatarDataHora } from "~/utils/formatacao";
import MensagensAdminPainel from "~/components/caixa/MensagensAdminPainel.vue";

// Extraido de `HistoricoCaixasPage` quando o painel de mensagens (R-200) entrou aqui e a pagina
// passou de 400 linhas. So apresentacao: quem faz o polling de 15s e a consulta autorizada continua
// sendo a pagina, para nao nascer uma segunda fonte da lista de caixas abertos.
defineProps<{
  caixasAbertos: LinhaHistoricoCaixa[];
  monitorAtualizadoEm: string | null;
  empresaId: string;
  pdvs: Opcao[];
  podeVerMensagens: boolean;
  podeEnviarMensagem: boolean;
}>();
const emit = defineEmits<{ (event: "ver", caixa: LinhaHistoricoCaixa): void }>();
</script>

<template>
  <v-sheet class="pa-4 mb-5 rounded-lg soft-bg" data-teste="monitor-caixas-abertos">
    <div class="d-flex flex-wrap align-center ga-3">
      <div>
        <div class="text-subtitle-1 font-weight-bold">Monitor de caixas abertos</div>
        <div class="text-caption text-medium-emphasis">
          Sincroniza a cada 15 segundos enquanto esta pagina esta aberta.
          <template v-if="monitorAtualizadoEm">
            Ultima atualizacao: {{ formatarDataHora(monitorAtualizadoEm) }}.</template
          >
        </div>
      </div>
      <v-spacer />
      <v-chip color="info" variant="tonal" prepend-icon="mdi-cash-register">
        {{ caixasAbertos.length }} {{ caixasAbertos.length === 1 ? "caixa aberto" : "caixas abertos" }}
      </v-chip>
    </div>

    <div v-if="caixasAbertos.length" class="d-flex flex-wrap ga-2 mt-3">
      <v-btn
        v-for="caixa in caixasAbertos"
        :key="caixa.id"
        size="small"
        variant="outlined"
        prepend-icon="mdi-eye-outline"
        @click="emit('ver', caixa)"
      >
        {{ caixa.pdvNome }} - {{ caixa.colaboradorNome || caixa.usuarioCaixaNome || "Operador nao informado" }}
        <template v-if="caixa.dataHoraAbertura"> (desde {{ formatarDataHora(caixa.dataHoraAbertura) }})</template>
      </v-btn>
    </div>
    <div v-else class="text-body-2 text-medium-emphasis mt-3">Nenhum caixa aberto neste momento.</div>

    <MensagensAdminPainel
      v-if="podeVerMensagens"
      :empresa-id="empresaId"
      :pdvs="pdvs"
      :caixas-abertos="caixasAbertos"
      :pode-enviar="podeEnviarMensagem"
    />
  </v-sheet>
</template>
