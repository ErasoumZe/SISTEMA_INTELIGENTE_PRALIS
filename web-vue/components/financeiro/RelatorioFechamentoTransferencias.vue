<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { OperacaoResumo } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import { resumirSangrias, textoSangrias } from "~/utils/transferencias-relatorio";
import SituacaoMalote from "./SituacaoMalote.vue";
import TransferenciaConferenciaDialog from "./TransferenciaConferenciaDialog.vue";

// Transferencias DESTE caixa (abertura, sangrias e retorno final) dentro do Relatorio de fechamento:
// e aqui que a Tesouraria confere o que o caixa devolveu. A tela de Transferencias e so
// acompanhamento. As regras de quem pode conferir sao as de antes (pendente, sem planejamento de
// retorno, permissao `transferencias_conferir`); o servidor continua sendo quem decide.
const props = defineProps<{
  empresaId: string;
  caixaId: string;
  podeConferir: boolean;
  // Lacre de fechamento que o operador DIGITOU ao fechar (vem do resumo do fechamento).
  lacreFechamentoInformado?: string | null;
}>();
const emit = defineEmits<{ (event: "alterado"): void }>();

const { apiGetPaginado } = useApi();
const itens = ref<OperacaoResumo[]>([]);
const carregando = ref(false);
const erro = ref("");
const aviso = ref<{ texto: string; tipo: "success" | "warning" } | null>(null);
const emConferencia = ref<OperacaoResumo | null>(null);

const pendentes = computed(() => itens.value.filter((item) => item.status === "pendente"));

// Fatos do turno, todos derivados do que a API ja devolve (nada recalcula dinheiro): quantas sangrias,
// qual o estado das bolsas do malote e se o lacre usado no fechamento e o que a Tesouraria reservou.
const abertura = computed(() => itens.value.find((item) => item.tipoMovimento === "abertura") ?? null);
const lacresDoMalote = computed(() => abertura.value?.lacres ?? []);
const sangrias = computed(() =>
  itens.value.filter((item) => item.tipoMovimento !== "abertura" && Boolean(item.nLacreDoc?.trim()))
);
const totalSangriasCentavos = computed(() =>
  sangrias.value.reduce((total, item) => total + Math.round(Number(item.valorOriginal) * 100), 0)
);
const textoBolsas = computed(() => textoSangrias(resumirSangrias(lacresDoMalote.value)));
const lacreAbertura = computed(() => lacresDoMalote.value.find((lacre) => lacre.tipo === "abertura") ?? null);
const lacreReservado = computed(() => lacresDoMalote.value.find((lacre) => lacre.tipo === "fechamento") ?? null);
const fechamentoInformado = computed(() => props.lacreFechamentoInformado?.trim() || null);
// "bateu" so quando os dois numeros existem e sao iguais; qualquer outro caso aparece com palavra propria.
const conferenciaFechamento = computed(() => {
  const reservado = lacreReservado.value?.numero ?? null;
  if (!fechamentoInformado.value)
    return { chave: "aberto", texto: "Ainda não informado (caixa aberto)", icone: "mdi-clock-outline" };
  if (!lacreReservado.value)
    return { chave: "sem_reserva", texto: "Sem lacre reservado para comparar", icone: "mdi-help-circle-outline" };
  if (reservado === null)
    return { chave: "oculto", texto: "Número reservado oculto para o seu perfil", icone: "mdi-eye-off-outline" };
  return reservado === fechamentoInformado.value
    ? { chave: "confere", texto: "Confere com o reservado pela Tesouraria", icone: "mdi-check-circle-outline" }
    : { chave: "diferente", texto: `Diferente do reservado (${reservado})`, icone: "mdi-alert-circle-outline" };
});

// O retorno FINAL nasce no fechamento sem lacre proprio; ele sai lacrado com o lacre de fechamento.
function ehRetornoFinal(item: OperacaoResumo) {
  return item.tipoMovimento !== "abertura" && !item.nLacreDoc?.trim() && Boolean(fechamentoInformado.value);
}
function lacreDaLinha(item: OperacaoResumo) {
  if (item.nLacreDoc?.trim()) return `Lacre ${item.nLacreDoc}`;
  return ehRetornoFinal(item) ? `Lacre de fechamento ${fechamentoInformado.value}` : "Sem lacre";
}
function nomeDaLinha(item: OperacaoResumo) {
  if (item.tipoMovimento === "abertura") return "Malote (abertura)";
  return ehRetornoFinal(item) ? "Retorno final" : "Sangria";
}

function cabecalhoLacre(numero: string | null | undefined) {
  return numero ? `Lacre ${numero}` : "Número oculto";
}

function podeConferirItem(item: OperacaoResumo) {
  return Boolean(props.podeConferir && item.status === "pendente" && !item.possuiPlanejamentoRetorno);
}

// Cada busca ganha um numero; so a ULTIMA grava o resultado. Sem isto, trocar de caixa depressa deixava a
// resposta antiga sobrescrever a nova e a conferencia abria a transferencia do caixa errado.
let buscaAtual = 0;
const total = ref(0);
const truncada = computed(() => total.value > itens.value.length);

async function carregar() {
  if (!props.caixaId || !props.empresaId) return;
  const minhaBusca = ++buscaAtual;
  carregando.value = true;
  erro.value = "";
  try {
    const params = new URLSearchParams({ empresaId: props.empresaId, caixaId: props.caixaId, pageSize: "50" });
    const resultado = await apiGetPaginado<OperacaoResumo>(`/api/transferencias?${params.toString()}`);
    if (minhaBusca !== buscaAtual) return;
    total.value = resultado.total;
    // Cronologico: abertura, sangrias e retorno final na ordem em que aconteceram.
    itens.value = [...resultado.itens].sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  } catch (error) {
    if (minhaBusca !== buscaAtual) return;
    erro.value = mensagemErro(error);
    itens.value = [];
    total.value = 0;
  } finally {
    if (minhaBusca === buscaAtual) carregando.value = false;
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
        <h3 id="rft-titulo" class="rft__titulo">Lacres, sangrias e conferência</h3>
      </div>
      <v-chip v-if="pendentes.length" color="warning" variant="tonal" size="small" prepend-icon="mdi-clock-outline">
        {{ pendentes.length }} para conferir
      </v-chip>
    </div>

    <v-alert v-if="aviso" :type="aviso.tipo" variant="tonal" density="compact" closable @click:close="aviso = null">{{
      aviso.texto
    }}</v-alert>
    <v-alert v-if="truncada" type="warning" variant="tonal" density="compact" data-teste="aviso-truncada">
      Mostrando {{ itens.length }} de {{ total }} transferências deste caixa: sangrias e bolsas abaixo podem estar
      incompletas.
    </v-alert>

    <dl v-if="!carregando && !erro && itens.length" class="rft__fatos" data-teste="fatos-do-caixa">
      <div>
        <dt>Sangrias</dt>
        <dd data-teste="fato-sangrias">{{ sangrias.length }} · {{ dinheiro(totalSangriasCentavos / 100) }}</dd>
      </div>
      <div>
        <dt>Bolsas do malote</dt>
        <dd data-teste="fato-bolsas">{{ textoBolsas }}</dd>
      </div>
      <div>
        <dt>Lacre de abertura</dt>
        <dd>{{ lacreAbertura ? cabecalhoLacre(lacreAbertura.numero) : "Sem malote identificado" }}</dd>
      </div>
      <div>
        <dt>Lacre de fechamento</dt>
        <dd data-teste="fato-fechamento" :data-estado="conferenciaFechamento.chave">
          <v-icon :icon="conferenciaFechamento.icone" size="16" aria-hidden="true" />
          {{ fechamentoInformado ? `Lacre ${fechamentoInformado}` : "—" }} · {{ conferenciaFechamento.texto }}
        </dd>
      </div>
    </dl>

    <v-progress-linear v-if="carregando" indeterminate aria-label="Carregando transferências do caixa" />
    <v-alert v-else-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
    <p v-else-if="!itens.length" class="rft__vazio">Este caixa não tem transferências registradas.</p>
    <ul v-else class="rft__lista">
      <li v-for="item in itens" :key="item.id" class="rft__item" :data-transferencia-id="item.id">
        <div class="rft__quando">
          <strong>{{ nomeDaLinha(item) }}</strong>
          <small>{{ item.criadoEm ? formatarDataHora(item.criadoEm) : "-" }}</small>
        </div>
        <div class="rft__valor cx-num">
          <strong>{{ dinheiro(Number(item.valorOriginal)) }}</strong>
          <small v-if="item.valorEspecieDeclarado != null && item.valorMoedasDeclarado != null">
            Dinheiro {{ dinheiro(Number(item.valorEspecieDeclarado)) }} · Moedas
            {{ dinheiro(Number(item.valorMoedasDeclarado)) }}
          </small>
        </div>
        <div class="rft__lacre">{{ lacreDaLinha(item) }}</div>
        <SituacaoMalote :operacao="item" />
        <v-btn
          v-if="podeConferirItem(item)"
          size="small"
          variant="tonal"
          class="rft__acao"
          :aria-label="`Conferir ${nomeDaLinha(item).toLowerCase()} de ${dinheiro(Number(item.valorOriginal))}`"
          data-teste="botao-conferir-transferencia"
          @click="emConferencia = item"
          >Conferir</v-btn
        >
      </li>
    </ul>

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
.rft__fatos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--cx-sp-2) var(--cx-sp-4);
  margin: 0;
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}
.rft__fatos dt {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.rft__fatos dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-weight: 700;
}
.rft__fatos dd[data-estado="diferente"] {
  color: var(--cx-negative);
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
