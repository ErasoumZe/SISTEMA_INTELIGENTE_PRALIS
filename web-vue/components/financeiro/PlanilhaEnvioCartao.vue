<script setup lang="ts">
/* Planilha da Tesouraria · aba de CARTOES (Marco, 19/11/2026): botao proprio, separado da folha de caixa. Uma linha
   por bandeira, lida da foto da maquininha; a Tesouraria corrige e exporta. Nada aqui muda o fechamento. */
import { computed, ref, watch } from "vue";
import type {
  EnvioRegistrado,
  LinhaCartao,
  PreviaPlanilha,
  ResultadoEnvioPlanilha
} from "@padaria/shared/planilha-tesouraria";
import { useApi } from "~/composables/useApi";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { COR_CONFERENCIA, copiaEditavel, numeroDigitado, somaCentavos, textoJaEnviado } from "./planilha-envio";

const props = defineProps<{
  caixaId: string;
  cartao: NonNullable<PreviaPlanilha["cartao"]>;
  enviado: EnvioRegistrado | null;
}>();
const { apiPost } = useApi();

const linhas = ref<LinhaCartao[]>([]);
const confirmado = ref(false);
const enviando = ref(false);
const erro = ref("");
const resultado = ref<NonNullable<ResultadoEnvioPlanilha["cartao"]> | null>(null);
watch(
  () => props.cartao,
  (cartao) => {
    linhas.value = copiaEditavel(cartao.linhas);
    confirmado.value = false;
    resultado.value = null;
  },
  { immediate: true }
);

const soma = computed(() => somaCentavos(linhas.value.map((linha) => linha.valor)));
const podeEnviar = computed(() => confirmado.value && !enviando.value && !props.enviado && linhas.value.length > 0);

async function exportar() {
  if (!podeEnviar.value) return;
  enviando.value = true;
  erro.value = "";
  try {
    const resposta = await apiPost<ResultadoEnvioPlanilha>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/planilha-tesouraria/enviar`,
      { cartao: linhas.value, relatorioPdv: null }
    );
    resultado.value = resposta.cartao;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <section class="planilha-bloco" aria-labelledby="titulo-planilha-cartao" data-teste="planilha-cartao">
    <div class="planilha-bloco__titulo">
      <h4 id="titulo-planilha-cartao">Relatório de cartões</h4>
      <v-chip :color="COR_CONFERENCIA[cartao.conferencia.status]" size="small" variant="flat">
        {{ cartao.conferencia.status }}
      </v-chip>
    </div>
    <ul v-if="cartao.conferencia.avisos.length" class="planilha-bloco__avisos">
      <li v-for="aviso in cartao.conferencia.avisos" :key="aviso">{{ aviso }}</li>
    </ul>
    <v-alert v-if="enviado" type="info" variant="tonal" density="compact" data-teste="planilha-cartao-enviado">
      {{ textoJaEnviado(enviado) }}
    </v-alert>

    <div class="planilha-bloco__tabela">
      <v-table density="compact">
        <thead>
          <tr>
            <th>Data</th>
            <th>Nº série</th>
            <th>PDV</th>
            <th>Modalidade</th>
            <th>Bandeira</th>
            <th class="text-right">Trans.</th>
            <th class="text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(linha, indice) in linhas" :key="`${linha.modalidade}-${linha.bandeira}-${indice}`">
            <td>{{ linha.data }}</td>
            <td>{{ linha.numeroSerie }}</td>
            <td>{{ linha.pdv }}</td>
            <td>{{ linha.modalidade }}</td>
            <td>{{ linha.bandeira }}</td>
            <td class="text-right">
              <input
                v-model.number="linha.transacoes"
                class="planilha-bloco__campo"
                type="number"
                min="0"
                :aria-label="`Transações ${linha.modalidade} ${linha.bandeira}`"
              />
            </td>
            <td class="text-right">
              <input
                :value="linha.valor.toFixed(2).replace('.', ',')"
                class="planilha-bloco__campo"
                inputmode="decimal"
                :aria-label="`Valor ${linha.modalidade} ${linha.bandeira}`"
                @change="linha.valor = numeroDigitado(($event.target as HTMLInputElement).value)"
              />
            </td>
          </tr>
          <tr v-if="!linhas.length">
            <td colspan="7" class="text-medium-emphasis">Nenhuma linha para gravar.</td>
          </tr>
        </tbody>
      </v-table>
    </div>
    <p class="text-body-2 mb-0">
      Soma das linhas: <strong>{{ dinheiro(soma) }}</strong>
      <template v-if="cartao.totalEfetivado !== null">
        · Total efetivado impresso: {{ dinheiro(cartao.totalEfetivado) }}</template
      >
    </p>

    <v-alert v-if="erro" type="error" variant="tonal" density="compact" role="alert">{{ erro }}</v-alert>
    <div v-if="!enviado" class="planilha-bloco__acoes">
      <v-checkbox
        v-model="confirmado"
        density="compact"
        hide-details
        label="Conferi as linhas com a foto da maquininha"
        data-teste="planilha-cartao-confirmar"
      />
      <v-btn
        color="primary"
        :disabled="!podeEnviar"
        :loading="enviando"
        prepend-icon="mdi-credit-card-outline"
        data-teste="planilha-cartao-exportar"
        @click="exportar"
      >
        Exportar cartão para a planilha
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
