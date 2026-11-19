<script setup lang="ts">
/* Ultima etapa da Tesouraria (Marco, 12/11/2026): os relatorios do fechamento vao para a planilha da Tesouraria.
   Um botao le as fotos ja anexadas (maquininha e folha do CREARE). Desde 19/11/2026 cada aba tem o seu envio:
   "Exportar cartao para a planilha" (aba de cartoes) e "Gerar relatorio da folha de caixa" (aba do PDV). A Tesouraria
   corrige o que a leitura errar e envia cada um quando quiser. Nada aqui muda o fechamento. */
import { ref } from "vue";
import type { PreviaPlanilha } from "@padaria/shared/planilha-tesouraria";
import { useApi } from "~/composables/useApi";
import { mensagemErro } from "~/utils/domain";
import PlanilhaEnvioCartao from "./PlanilhaEnvioCartao.vue";
import PlanilhaEnvioPdv from "./PlanilhaEnvioPdv.vue";

const props = defineProps<{ caixaId: string }>();
const { apiPost } = useApi();

const previa = ref<PreviaPlanilha | null>(null);
const lendo = ref(false);
const erro = ref("");

async function ler() {
  lendo.value = true;
  erro.value = "";
  try {
    previa.value = await apiPost<PreviaPlanilha>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/planilha-tesouraria/previa`,
      {}
    );
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    lendo.value = false;
  }
}
</script>

<template>
  <section class="planilha-tesouraria mt-4" aria-labelledby="titulo-planilha" data-teste="planilha-tesouraria">
    <header class="planilha-tesouraria__topo">
      <h3 id="titulo-planilha" class="text-subtitle-1 font-weight-bold mb-0">Planilha da Tesouraria</h3>
      <v-btn variant="tonal" color="primary" :loading="lendo" prepend-icon="mdi-file-search-outline" @click="ler">
        {{ previa ? "Ler de novo" : "Ler relatórios" }}
      </v-btn>
    </header>
    <p class="text-body-2 text-medium-emphasis mb-3">
      Lê as fotos da maquininha e da folha do CREARE deste fechamento e mostra o que vai para cada aba. Confira, corrija
      o que a leitura errar e envie cada uma no seu botão. O fechamento não muda.
    </p>

    <v-alert v-if="erro" type="error" variant="tonal" class="mb-3" role="alert">{{ erro }}</v-alert>

    <template v-if="previa">
      <v-alert
        v-for="aviso in previa.avisos"
        :key="aviso"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-2"
      >
        {{ aviso }}
      </v-alert>
      <p v-if="previa.pdv" class="mb-3">
        <strong>PDV:</strong> {{ previa.pdv }} · <strong>Turno:</strong> {{ previa.turno }}
      </p>
      <div class="planilha-tesouraria__blocos">
        <PlanilhaEnvioCartao
          v-if="previa.cartao"
          :caixa-id="caixaId"
          :cartao="previa.cartao"
          :enviado="previa.enviado.cartao"
        />
        <PlanilhaEnvioPdv
          v-if="previa.relatorioPdv"
          :caixa-id="caixaId"
          :relatorio-pdv="previa.relatorioPdv"
          :enviado="previa.enviado.relatorioPdv"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.planilha-tesouraria {
  padding: var(--cx-sp-4);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
}
.planilha-tesouraria__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  margin-bottom: var(--cx-sp-2);
}
.planilha-tesouraria__blocos {
  display: grid;
  gap: var(--cx-sp-3);
}
</style>
