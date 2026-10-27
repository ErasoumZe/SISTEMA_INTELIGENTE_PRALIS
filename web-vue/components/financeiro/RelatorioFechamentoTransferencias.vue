<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { OperacaoResumo } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import { rotuloMovimento } from "~/utils/transferencias-relatorio";
import SituacaoMalote from "./SituacaoMalote.vue";
import TransferenciaConferenciaDialog from "./TransferenciaConferenciaDialog.vue";

// Transferencias DESTE caixa (abertura, sangrias e retorno final) dentro do Relatorio de fechamento:
// e aqui que a Tesouraria confere o que o caixa devolveu. A tela de Transferencias e so
// acompanhamento. As regras de quem pode conferir sao as de antes (pendente, sem planejamento de
// retorno, permissao `transferencias_conferir`); o servidor continua sendo quem decide.
const props = defineProps<{ empresaId: string; caixaId: string; podeConferir: boolean }>();
const emit = defineEmits<{ (event: "alterado"): void }>();

const { apiGetPaginado } = useApi();
const itens = ref<OperacaoResumo[]>([]);
const carregando = ref(false);
const erro = ref("");
const aviso = ref<{ texto: string; tipo: "success" | "warning" } | null>(null);
const emConferencia = ref<OperacaoResumo | null>(null);

const pendentes = computed(() => itens.value.filter((item) => item.status === "pendente"));

function podeConferirItem(item: OperacaoResumo) {
  return Boolean(props.podeConferir && item.status === "pendente" && !item.possuiPlanejamentoRetorno);
}

async function carregar() {
  if (!props.caixaId || !props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const params = new URLSearchParams({ empresaId: props.empresaId, caixaId: props.caixaId, pageSize: "50" });
    const resultado = await apiGetPaginado<OperacaoResumo>(`/api/transferencias?${params.toString()}`);
    // Cronologico: abertura, sangrias e retorno final na ordem em que aconteceram.
    itens.value = [...resultado.itens].sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  } catch (error) {
    erro.value = mensagemErro(error);
    itens.value = [];
  } finally {
    carregando.value = false;
  }
}

function avisar(texto: string, tipo?: string) {
  aviso.value = { texto, tipo: tipo === "warning" ? "warning" : "success" };
}

async function aoRecarregar() {
  await carregar();
  emit("alterado");
}

watch(() => props.caixaId, carregar, { immediate: true });
</script>

<template>
  <section class="rft" aria-labelledby="rft-titulo" data-teste="transferencias-do-caixa">
    <div class="rft__topo">
      <div>
        <div class="text-overline">TRANSFERÊNCIAS DO CAIXA</div>
        <h3 id="rft-titulo" class="rft__titulo">Abertura, sangrias e retorno final</h3>
      </div>
      <v-chip v-if="pendentes.length" color="warning" variant="tonal" size="small" prepend-icon="mdi-clock-outline">
        {{ pendentes.length }} para conferir
      </v-chip>
    </div>

    <v-progress-linear v-if="carregando" indeterminate aria-label="Carregando transferências do caixa" />
    <v-alert v-else-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
    <p v-else-if="!itens.length" class="rft__vazio">Este caixa não tem transferências registradas.</p>
    <ul v-else class="rft__lista">
      <li v-for="item in itens" :key="item.id" class="rft__item" :data-transferencia-id="item.id">
        <div class="rft__quando">
          <strong>{{ rotuloMovimento(item) }}</strong>
          <small>{{ item.criadoEm ? formatarDataHora(item.criadoEm) : "-" }}</small>
        </div>
        <div class="rft__valor cx-num">
          <strong>{{ dinheiro(Number(item.valorOriginal)) }}</strong>
          <small v-if="item.valorEspecieDeclarado != null && item.valorMoedasDeclarado != null">
            Dinheiro {{ dinheiro(Number(item.valorEspecieDeclarado)) }} · Moedas
            {{ dinheiro(Number(item.valorMoedasDeclarado)) }}
          </small>
        </div>
        <div class="rft__lacre">{{ item.nLacreDoc ? `Lacre ${item.nLacreDoc}` : "Sem lacre" }}</div>
        <SituacaoMalote :operacao="item" />
        <v-btn
          v-if="podeConferirItem(item)"
          size="small"
          variant="tonal"
          class="rft__acao"
          data-teste="botao-conferir-transferencia"
          @click="emConferencia = item"
          >Conferir</v-btn
        >
      </li>
    </ul>

    <v-alert
      v-if="aviso"
      :type="aviso.tipo"
      variant="tonal"
      density="compact"
      closable
      class="mt-2"
      @click:close="aviso = null"
      >{{ aviso.texto }}</v-alert
    >

    <TransferenciaConferenciaDialog
      :operacao="emConferencia"
      @fechar="emConferencia = null"
      @notificar="avisar"
      @recarregar="aoRecarregar"
    />
  </section>
</template>

<style scoped>
.rft {
  display: grid;
  gap: var(--cx-sp-3);
  margin-bottom: var(--cx-sp-3);
  padding: var(--cx-sp-4);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}
.rft__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}
.rft__titulo {
  margin: 0;
  font-size: var(--cx-fs-lead);
  font-weight: 800;
}
.rft__vazio {
  margin: 0;
  color: var(--cx-ink-soft);
}
.rft__lista {
  display: grid;
  gap: var(--cx-sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.rft__item {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(150px, 1fr) minmax(90px, auto) auto auto;
  align-items: center;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
}
.rft__quando,
.rft__valor {
  display: grid;
  min-width: 0;
}
.rft__quando small,
.rft__valor small,
.rft__lacre {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.rft__acao {
  min-width: 44px;
  min-height: 44px;
}
@media (width <= 760px) {
  .rft__item {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .rft__lacre,
  .rft__item :deep(.situacao-malote) {
    grid-column: 1 / -1;
    justify-self: start;
  }
  .rft__acao {
    grid-column: 1 / -1;
  }
}
</style>
