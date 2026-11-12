<script setup lang="ts">
/* Ultima etapa da Tesouraria (Marco, 12/11/2026): enviar os relatorios do fechamento (cartao PagBank e folha do PDV)
   para a planilha. ADITIVO: le as fotos ja anexadas, confere a soma, mostra a previa e grava so o que a Tesouraria
   confirmar. A Tesouraria pode corrigir qualquer valor (a IA pode ler um digito errado). Nada aqui muda o fechamento.
   Texto da planilha em MAIUSCULAS; o PDV vem sempre do caixa. */
import { computed, ref } from "vue";
import type {
  LinhaCartao,
  LinhaPdv,
  PreviaPlanilha,
  ResultadoEnvioPlanilha,
  StatusConferencia
} from "@padaria/shared/planilha-tesouraria";
import { useApi } from "~/composables/useApi";
import { dinheiro, mensagemErro } from "~/utils/domain";

const props = defineProps<{ caixaId: string }>();
const { apiPost } = useApi();

const previa = ref<PreviaPlanilha | null>(null);
const linhasCartao = ref<LinhaCartao[]>([]);
const linhaPdv = ref<LinhaPdv | null>(null);
const lendo = ref(false);
const enviando = ref(false);
const erro = ref("");
const resultado = ref<ResultadoEnvioPlanilha | null>(null);
const confirmado = ref(false);

const somaCartao = computed(
  () => linhasCartao.value.reduce((soma, linha) => soma + Math.round(linha.valor * 100), 0) / 100
);
const somaPdv = computed(() => {
  const l = linhaPdv.value;
  if (!l) return 0;
  return Math.round((l.credito + l.debito + l.voucher + l.pix + l.dinheiro + l.clientes) * 100) / 100;
});
const podeEnviar = computed(
  () => confirmado.value && !enviando.value && (linhasCartao.value.length > 0 || Boolean(linhaPdv.value))
);

const COR: Record<StatusConferencia, string> = {
  CONCILIADO: "success",
  DIVERGENTE: "error",
  "CONFERÊNCIA NECESSÁRIA": "warning"
};

async function preparar() {
  lendo.value = true;
  erro.value = "";
  resultado.value = null;
  confirmado.value = false;
  try {
    previa.value = await apiPost<PreviaPlanilha>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/planilha-tesouraria/previa`,
      {}
    );
    linhasCartao.value = structuredClone(previa.value.cartao?.linhas ?? []);
    linhaPdv.value = previa.value.relatorioPdv ? structuredClone(previa.value.relatorioPdv.linha) : null;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    lendo.value = false;
  }
}

async function enviar() {
  if (!podeEnviar.value) return;
  enviando.value = true;
  erro.value = "";
  try {
    resultado.value = await apiPost<ResultadoEnvioPlanilha>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/planilha-tesouraria/enviar`,
      {
        cartao: linhasCartao.value.length ? linhasCartao.value : null,
        relatorioPdv: linhaPdv.value ? { ...linhaPdv.value, operador: linhaPdv.value.operador.toUpperCase() } : null
      }
    );
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    enviando.value = false;
  }
}

const numero = (valor: string) => {
  const convertido = Number(String(valor).replace(/\./gu, "").replace(",", "."));
  return Number.isFinite(convertido) ? Math.round(convertido * 100) / 100 : 0;
};
</script>

<template>
  <section class="planilha-tesouraria mt-4" aria-labelledby="titulo-planilha" data-teste="planilha-tesouraria">
    <header class="planilha-tesouraria__topo">
      <h3 id="titulo-planilha" class="text-subtitle-1 font-weight-bold mb-0">Enviar relatório para a planilha</h3>
      <v-btn variant="tonal" color="primary" :loading="lendo" prepend-icon="mdi-file-search-outline" @click="preparar">
        {{ previa ? "Ler de novo" : "Ler relatórios" }}
      </v-btn>
    </header>
    <p class="text-body-2 text-medium-emphasis mb-3">
      Lê as fotos do cartão e do PDV deste fechamento, confere as somas e mostra a prévia. Corrija o que a leitura errar
      e envie. O fechamento não muda.
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

      <div v-if="previa.cartao" class="mb-4">
        <div class="planilha-tesouraria__linha-titulo">
          <strong>Relatório de cartões</strong>
          <v-chip :color="COR[previa.cartao.conferencia.status]" size="small" variant="flat">
            {{ previa.cartao.conferencia.status }}
          </v-chip>
        </div>
        <ul v-if="previa.cartao.conferencia.avisos.length" class="planilha-tesouraria__avisos">
          <li v-for="aviso in previa.cartao.conferencia.avisos" :key="aviso">{{ aviso }}</li>
        </ul>
        <div class="planilha-tesouraria__tabela">
          <v-table density="compact">
            <thead>
              <tr>
                <th>Data</th>
                <th>Nº série</th>
                <th>Modalidade</th>
                <th>Bandeira</th>
                <th class="text-right">Trans.</th>
                <th class="text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(linha, indice) in linhasCartao" :key="`${linha.modalidade}-${linha.bandeira}-${indice}`">
                <td>{{ linha.data }}</td>
                <td>{{ linha.numeroSerie }}</td>
                <td>{{ linha.modalidade }}</td>
                <td>{{ linha.bandeira }}</td>
                <td class="text-right">
                  <input
                    v-model.number="linha.transacoes"
                    class="planilha-tesouraria__campo"
                    type="number"
                    min="0"
                    :aria-label="`Transações ${linha.bandeira}`"
                  />
                </td>
                <td class="text-right">
                  <input
                    :value="linha.valor.toFixed(2).replace('.', ',')"
                    class="planilha-tesouraria__campo"
                    inputmode="decimal"
                    :aria-label="`Valor ${linha.modalidade} ${linha.bandeira}`"
                    @change="linha.valor = numero(($event.target as HTMLInputElement).value)"
                  />
                </td>
              </tr>
              <tr v-if="!linhasCartao.length">
                <td colspan="6" class="text-medium-emphasis">Nenhuma linha para gravar.</td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <p class="text-body-2 mt-1">
          Soma das linhas: <strong>{{ dinheiro(somaCartao) }}</strong>
          <template v-if="previa.cartao.totalEfetivado !== null">
            · Total efetivado impresso: {{ dinheiro(previa.cartao.totalEfetivado) }}</template
          >
        </p>
      </div>

      <div v-if="previa.relatorioPdv && linhaPdv" class="mb-4">
        <div class="planilha-tesouraria__linha-titulo">
          <strong>Relatório do PDV</strong>
          <v-chip :color="COR[previa.relatorioPdv.conferencia.status]" size="small" variant="flat">
            {{ previa.relatorioPdv.conferencia.status }}
          </v-chip>
        </div>
        <ul v-if="previa.relatorioPdv.conferencia.avisos.length" class="planilha-tesouraria__avisos">
          <li v-for="aviso in previa.relatorioPdv.conferencia.avisos" :key="aviso">{{ aviso }}</li>
        </ul>
        <div class="planilha-tesouraria__pdv">
          <label>Data <input v-model="linhaPdv.data" class="planilha-tesouraria__campo" /></label>
          <label
            >Operador
            <input v-model="linhaPdv.operador" class="planilha-tesouraria__campo planilha-tesouraria__campo--texto"
          /></label>
          <label v-for="forma in ['credito', 'debito', 'voucher', 'pix', 'dinheiro', 'clientes'] as const" :key="forma">
            {{ forma.toUpperCase() }}
            <input
              :value="linhaPdv[forma].toFixed(2).replace('.', ',')"
              class="planilha-tesouraria__campo"
              inputmode="decimal"
              @change="linhaPdv[forma] = numero(($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
        <p class="text-body-2 mt-1">
          Soma: <strong>{{ dinheiro(somaPdv) }}</strong>
          <template v-if="previa.relatorioPdv.totalImpresso !== null">
            · Total impresso: {{ dinheiro(previa.relatorioPdv.totalImpresso) }}</template
          >
        </p>
      </div>

      <v-checkbox
        v-model="confirmado"
        density="compact"
        hide-details
        label="Conferi os valores com as fotos e quero gravar na planilha"
        class="mb-2"
      />
      <v-btn
        color="primary"
        :disabled="!podeEnviar"
        :loading="enviando"
        prepend-icon="mdi-table-arrow-right"
        @click="enviar"
      >
        Enviar relatório para a planilha
      </v-btn>

      <div v-if="resultado" class="mt-3" role="status">
        <v-alert
          v-for="aba in [resultado.cartao, resultado.relatorioPdv].filter(Boolean)"
          :key="aba!.aba"
          :type="aba!.gravado ? 'success' : 'warning'"
          variant="tonal"
          density="compact"
          class="mb-2"
        >
          <strong>{{ aba!.aba }}</strong
          >: {{ aba!.mensagem }}
        </v-alert>
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
.planilha-tesouraria__topo,
.planilha-tesouraria__linha-titulo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  margin-bottom: var(--cx-sp-2);
}
.planilha-tesouraria__avisos {
  margin: 0 0 var(--cx-sp-2);
  padding-left: 18px;
  color: rgb(var(--v-theme-warning));
  font-size: var(--cx-fs-micro);
}
.planilha-tesouraria__tabela {
  overflow-x: auto;
}
.planilha-tesouraria__campo {
  width: 96px;
  padding: 2px 6px;
  border: 1px solid var(--cx-line-soft);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: right;
}
.planilha-tesouraria__campo--texto {
  width: 180px;
  text-align: left;
  text-transform: uppercase;
}
.planilha-tesouraria__pdv {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--cx-sp-2);
}
.planilha-tesouraria__pdv label {
  display: grid;
  gap: 2px;
  font-size: var(--cx-fs-micro);
  font-weight: 700;
}
</style>
