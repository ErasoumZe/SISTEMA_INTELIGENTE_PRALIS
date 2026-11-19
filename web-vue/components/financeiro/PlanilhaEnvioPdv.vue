<script setup lang="ts">
/* Planilha da Tesouraria · aba do PDV, a "folha de caixa" (Marco, 19/11/2026): botao proprio, separado do cartao.
   Uma linha por fechamento, lida da folha do CREARE: data, PDV, operador e as seis formas. Nada muda o fechamento. */
import { computed, ref, watch } from "vue";
import type {
  EnvioRegistrado,
  FormaPdv,
  LinhaPdv,
  PreviaPlanilha,
  ResultadoEnvioPlanilha
} from "@padaria/shared/planilha-tesouraria";
import { useApi } from "~/composables/useApi";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { COR_CONFERENCIA, copiaEditavel, numeroDigitado, somaCentavos, textoJaEnviado } from "./planilha-envio";

const props = defineProps<{
  caixaId: string;
  relatorioPdv: NonNullable<PreviaPlanilha["relatorioPdv"]>;
  enviado: EnvioRegistrado | null;
}>();
const { apiPost } = useApi();

const linha = ref<LinhaPdv>(copiaEditavel(props.relatorioPdv.linha));
const confirmado = ref(false);
const enviando = ref(false);
const erro = ref("");
const resultado = ref<NonNullable<ResultadoEnvioPlanilha["relatorioPdv"]> | null>(null);
watch(
  () => props.relatorioPdv,
  (relatorio) => {
    linha.value = copiaEditavel(relatorio.linha);
    confirmado.value = false;
    resultado.value = null;
  }
);

// Mesma ordem das colunas da aba do PDV (C, D, V, P, I, R).
const FORMAS_PDV: readonly FormaPdv[] = ["credito", "debito", "voucher", "pix", "dinheiro", "clientes"];
const ROTULOS: Record<FormaPdv, string> = {
  credito: "C - Crédito",
  debito: "D - Débito",
  voucher: "V - Voucher",
  pix: "P - Pix",
  dinheiro: "I - Dinheiro",
  clientes: "R - Clientes"
};
const soma = computed(() => somaCentavos(FORMAS_PDV.map((forma) => linha.value[forma])));
const podeEnviar = computed(
  () => confirmado.value && !enviando.value && !props.enviado && linha.value.operador.trim().length >= 2
);

async function gerar() {
  if (!podeEnviar.value) return;
  enviando.value = true;
  erro.value = "";
  try {
    const resposta = await apiPost<ResultadoEnvioPlanilha>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/planilha-tesouraria/enviar`,
      { cartao: null, relatorioPdv: { ...linha.value, operador: linha.value.operador.toUpperCase() } }
    );
    resultado.value = resposta.relatorioPdv;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <section class="planilha-bloco" aria-labelledby="titulo-planilha-pdv" data-teste="planilha-pdv">
    <div class="planilha-bloco__titulo">
      <h4 id="titulo-planilha-pdv">Folha de caixa (relatório do PDV)</h4>
      <v-chip :color="COR_CONFERENCIA[relatorioPdv.conferencia.status]" size="small" variant="flat">
        {{ relatorioPdv.conferencia.status }}
      </v-chip>
    </div>
    <ul v-if="relatorioPdv.conferencia.avisos.length" class="planilha-bloco__avisos">
      <li v-for="aviso in relatorioPdv.conferencia.avisos" :key="aviso">{{ aviso }}</li>
    </ul>
    <v-alert v-if="enviado" type="info" variant="tonal" density="compact" data-teste="planilha-pdv-enviado">
      {{ textoJaEnviado(enviado) }}
    </v-alert>

    <div class="planilha-bloco__pdv">
      <label>Data <input v-model="linha.data" class="planilha-bloco__campo" /></label>
      <label
        >PDV <input :value="linha.pdv" class="planilha-bloco__campo planilha-bloco__campo--texto" readonly
      /></label>
      <label
        >Nome operador
        <input
          v-model="linha.operador"
          class="planilha-bloco__campo planilha-bloco__campo--texto"
          data-teste="planilha-pdv-operador"
      /></label>
      <label v-for="forma in FORMAS_PDV" :key="forma">
        {{ ROTULOS[forma] }}
        <input
          :value="linha[forma].toFixed(2).replace('.', ',')"
          class="planilha-bloco__campo"
          inputmode="decimal"
          @change="linha[forma] = numeroDigitado(($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
    <p class="text-body-2 mb-0">
      Soma: <strong>{{ dinheiro(soma) }}</strong>
      <template v-if="relatorioPdv.totalImpresso !== null">
        · Total impresso: {{ dinheiro(relatorioPdv.totalImpresso) }}</template
      >
    </p>

    <v-alert v-if="erro" type="error" variant="tonal" density="compact" role="alert">{{ erro }}</v-alert>
    <div v-if="!enviado" class="planilha-bloco__acoes">
      <v-checkbox
        v-model="confirmado"
        density="compact"
        hide-details
        label="Conferi os valores com a folha do CREARE"
        data-teste="planilha-pdv-confirmar"
      />
      <v-btn
        color="primary"
        :disabled="!podeEnviar"
        :loading="enviando"
        prepend-icon="mdi-file-table-outline"
        data-teste="planilha-pdv-gerar"
        @click="gerar"
      >
        Gerar relatório da folha de caixa
      </v-btn>
    </div>
    <v-alert
      v-if="resultado"
      :type="resultado.gravado ? 'success' : 'warning'"
      variant="tonal"
      density="compact"
      role="status"
    >
      <strong>{{ resultado.aba }}</strong
      >: {{ resultado.mensagem }}
    </v-alert>
  </section>
</template>

<style scoped src="./planilha-tesouraria.css"></style>
