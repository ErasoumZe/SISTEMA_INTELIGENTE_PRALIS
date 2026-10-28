<script setup lang="ts">
/**
 * Fila de reenvio para a planilha (paralelo `manutencao.vue`, card "Fila de reenvio"). Usa as rotas
 * que ja existem: GET `/api/produtos/planilha/fila` e POST `/api/produtos/planilha/reenvio` — as duas
 * so para administrador (o servidor recusa os demais; esconder aqui e so conveniencia).
 */
import { mensagemErro } from "~/utils/domain";

interface SituacaoDaFila {
  ligado: boolean;
  porStatus: Record<string, number>;
  desistidos: number;
}
interface ResultadoReenvio {
  ligado: boolean;
  tentados: number;
  sincronizados: number;
  falharam: number;
  desistidos: number;
  reanimados: number;
}

const ROTULOS: Record<string, string> = { pendente: "pendente(s)", falhou: "com falha", sincronizado: "enviado(s)" };

const { apiGet, apiPost } = useApi();
const fila = ref<SituacaoDaFila | null>(null);
const erro = ref("");
const reenviando = ref(false);
const resultado = ref("");

const aguardando = computed(() => (fila.value?.porStatus["pendente"] ?? 0) + (fila.value?.porStatus["falhou"] ?? 0));

async function carregar() {
  erro.value = "";
  try {
    fila.value = await apiGet<SituacaoDaFila>("/api/produtos/planilha/fila");
  } catch (falha) {
    fila.value = null;
    erro.value = mensagemErro(falha);
  }
}

/** `resgatar` inclui quem desistiu: botao separado, porque insistir com quem estourou o teto e decisao. */
async function reenviar(resgatar: boolean) {
  reenviando.value = true;
  resultado.value = "";
  try {
    const r = await apiPost<ResultadoReenvio>("/api/produtos/planilha/reenvio", {
      limite: 50,
      incluirDesistidos: resgatar
    });
    const resgate = r.reanimados ? `${r.reanimados} desistido(s) voltaram à fila. ` : "";
    resultado.value = !r.ligado
      ? "O espelho na planilha está desligado: nada foi enviado."
      : r.tentados === 0
        ? `${resgate}Nada esperando reenvio agora.`
        : `${resgate}${r.sincronizados} de ${r.tentados} foram para a planilha. ${r.falharam} continuam pendentes.`;
    await carregar();
  } catch (falha) {
    resultado.value = mensagemErro(falha);
  } finally {
    reenviando.value = false;
  }
}

onMounted(carregar);
</script>

<template>
  <v-card variant="outlined">
    <v-card-title class="text-subtitle-1">Fila de reenvio para a planilha</v-card-title>
    <v-card-text>
      <p class="mb-3">
        Quando o Google falha, o produto fica salvo no banco e a gravação na planilha entra nesta fila. O sistema tenta
        sozinho a cada 5 minutos. Aqui você força a tentativa agora.
      </p>
      <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-3">{{ erro }}</v-alert>
      <v-alert v-else-if="fila && !fila.ligado" type="info" variant="tonal" density="compact" class="mb-3">
        O espelho na planilha está desligado até a virada: a fila guarda o que mudou, mas nada é enviado agora.
      </v-alert>
      <div class="d-flex align-center flex-wrap ga-3">
        <v-chip label :color="aguardando > 0 ? 'warning' : 'success'">
          {{ fila === null ? "—" : aguardando }} aguardando
        </v-chip>
        <template v-if="fila">
          <v-chip v-for="(total, status) in fila.porStatus" :key="status" label variant="outlined">
            {{ total }} {{ ROTULOS[status] ?? status }}
          </v-chip>
        </template>
        <v-chip v-if="fila && fila.desistidos > 0" label color="error">
          {{ fila.desistidos }} desistido(s) — precisam de atenção
        </v-chip>
        <v-btn
          variant="tonal"
          prepend-icon="mdi-sync"
          :loading="reenviando"
          :disabled="!fila || aguardando === 0"
          @click="reenviar(false)"
        >
          Reenviar agora
        </v-btn>
        <v-btn
          v-if="fila && fila.desistidos > 0"
          variant="tonal"
          color="error"
          prepend-icon="mdi-restart"
          :loading="reenviando"
          @click="reenviar(true)"
        >
          Tentar de novo os {{ fila.desistidos }} desistido(s)
        </v-btn>
      </div>
      <p v-if="fila && fila.desistidos > 0" class="text-body-2 mt-3 mb-0">
        Desistir depois do teto de tentativas pressupõe problema permanente. Quando a causa era passageira mas demorou
        mais que isso — planilha sem permissão, cota estourada, aba faltando — os produtos ficam presos aqui. Só clique
        depois de a causa estar corrigida.
      </p>
      <p v-if="resultado" class="mt-3 mb-0">{{ resultado }}</p>
    </v-card-text>
  </v-card>
</template>
