<script setup lang="ts">
// R-231 · transferencia sem lacre: dinheiro que a gerencia leva no meio do turno (ex.: Cofre -> PDV), sem malote.
// So origem, destino, dinheiro fisico + moedas (o total e a soma) e observacao opcional. O servidor recusa PDV sem
// caixa aberto; o operador do PDV confirma o recebimento na tela do Caixa.
import { computed, ref, watch } from "vue";
import { paraCentavos } from "@padaria/shared";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import { useApi } from "~/composables/useApi";
import type { Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";

const props = defineProps<{ modelValue: boolean; empresaId: string; contas: Opcao[] }>();
const emit = defineEmits<{
  (event: "update:modelValue", aberto: boolean): void;
  (event: "criada"): void;
}>();
const { apiPost } = useApi();

const origemId = ref("");
const destinoId = ref("");
const fisico = ref("");
const moedas = ref("");
const observacao = ref("");
const salvando = ref(false);
const erro = ref("");

// Dinheiro que SAI do PDV vai pelo retorno / sangria do Caixa: conta de PDV nao e origem aqui.
const origens = computed(() => props.contas.filter((conta) => !conta.ehContaPdv));
const destinos = computed(() => props.contas.filter((conta) => conta.id !== origemId.value));
const origem = computed(() => props.contas.find((conta) => conta.id === origemId.value));
const destino = computed(() => props.contas.find((conta) => conta.id === destinoId.value));
const total = computed(() => (paraCentavos(fisico.value) + paraCentavos(moedas.value)) / 100);
const podeSalvar = computed(
  () => Boolean(origemId.value && destinoId.value && origemId.value !== destinoId.value) && total.value > 0
);

watch(
  () => props.modelValue,
  (aberto) => {
    if (!aberto) return;
    origemId.value = origens.value.find((conta) => conta.ehCofre)?.id ?? "";
    destinoId.value = "";
    fisico.value = "";
    moedas.value = "";
    observacao.value = "";
    erro.value = "";
  },
  { immediate: true }
);

function fechar() {
  if (!salvando.value) emit("update:modelValue", false);
}

async function salvar() {
  if (!podeSalvar.value || salvando.value) return;
  salvando.value = true;
  erro.value = "";
  try {
    await apiPost("/api/transferencias/sem-lacre", {
      empresaId: props.empresaId,
      contaOrigemId: origemId.value,
      contaDestinoId: destinoId.value,
      valorEspecieDeclarado: paraCentavos(fisico.value) / 100,
      valorMoedasDeclarado: paraCentavos(moedas.value) / 100,
      observacao: observacao.value.trim() || null
    });
    emit("criada");
    emit("update:modelValue", false);
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="520" persistent @update:model-value="fechar">
    <div class="tr-modal" data-teste="transferencia-sem-lacre">
      <div class="tr-faixa">
        <div class="tr-head">
          <span class="tr-ic"><v-icon size="19">mdi-cash-fast</v-icon></span>
          <h2 class="tr-titulo">Transferência sem lacre</h2>
          <v-icon class="tr-x" size="19" aria-label="Fechar" :disabled="salvando" @click="fechar">mdi-close</v-icon>
        </div>
      </div>

      <div class="tr-corpo">
        <p class="sl-explica">
          Dinheiro no meio do turno, <strong>sem malote e sem lacre</strong>. O operador do PDV confirma o recebimento
          na tela do Caixa; até lá, o valor não entra no caixa.
        </p>

        <div class="tr-secao">1 · Origem e destino</div>
        <div class="tr-rota">
          <label class="tr-campo">
            <span class="tr-campo-lbl">Origem / Saída</span>
            <select v-model="origemId" class="tr-input" data-teste="sem-lacre-origem">
              <option value="">—</option>
              <option v-for="c in origens" :key="c.id" :value="c.id">{{ c.nome }}</option>
            </select>
          </label>
          <v-icon class="tr-seta" size="17">mdi-arrow-right</v-icon>
          <label class="tr-campo">
            <span class="tr-campo-lbl">Destino / Entrada</span>
            <select v-model="destinoId" class="tr-input" data-teste="sem-lacre-destino">
              <option value="">—</option>
              <option v-for="c in destinos" :key="c.id" :value="c.id">{{ c.nome }}</option>
            </select>
          </label>
        </div>
        <div v-if="origem && origem.saldoAtual !== undefined" class="tr-saldo-conta">
          <v-icon size="16" :icon="origem.ehCofre ? 'mdi-safe-square-outline' : 'mdi-wallet-outline'" />
          <span
            >Disponível em {{ origem.nome }}: <strong>{{ dinheiro(origem.saldoAtual ?? 0) }}</strong></span
          >
        </div>
        <p v-if="destino?.ehContaPdv" class="sl-aviso" role="status">
          Só vai se o {{ destino.nome }} estiver com o caixa aberto agora.
        </p>

        <div class="tr-secao">2 · Valor transferido</div>
        <section class="tr-malote" aria-label="Valor transferido: dinheiro físico e moedas">
          <p>Informe o dinheiro físico e as moedas. O total é a soma dos dois.</p>
          <div class="tr-dois">
            <CampoDinheiro v-model="fisico" label="Dinheiro físico" icone="mdi-cash" data-teste="sem-lacre-fisico" />
            <CampoDinheiro v-model="moedas" label="Moedas" icone="mdi-circle-multiple" data-teste="sem-lacre-moedas" />
          </div>
          <div class="tr-total-malote">
            <span>Total da transferência</span>
            <strong>{{ dinheiro(total) }}</strong>
          </div>
        </section>

        <label class="tr-campo">
          <span class="tr-campo-lbl">Observação <span class="tr-hint">(opcional)</span></span>
          <input v-model="observacao" class="tr-input" maxlength="500" placeholder="Ex.: Reforço de troco do PDV 2" />
        </label>
        <p v-if="erro" class="tr-erro" role="alert">{{ erro }}</p>
      </div>

      <div class="tr-acoes">
        <button type="button" class="tr-salvar-nova" :disabled="salvando" @click="fechar">Cancelar</button>
        <button
          type="button"
          class="tr-salvar"
          :disabled="!podeSalvar || salvando"
          data-teste="sem-lacre-salvar"
          @click="salvar"
        >
          {{ salvando ? "Enviando…" : "Enviar sem lacre" }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped src="./OperacaoTransferenciaModal.css"></style>
<style scoped>
.sl-explica {
  margin: 0 0 4px;
  color: rgba(var(--v-theme-on-surface), 0.8);
  font-size: 12px;
  line-height: 1.45;
}
.sl-aviso {
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--cat-transferencias-soft, #fff1eb);
  color: var(--cat-transferencias-tinta, #9c2f07);
  font-size: 12px;
}
</style>
