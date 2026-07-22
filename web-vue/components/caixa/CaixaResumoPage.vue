<script setup lang="ts">
import type { DetalheCaixaResponse, LinhaHistoricoCaixa, Permissao } from "@padaria/shared";
import type { CaixaStatus, EntidadeOperacional, Opcao, OperacaoResumo, ResumoCaixa } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { dataHoraLocal, formatarDataHora } from "~/utils/formatacao";
import {
  CORES_COCKPIT,
  itemDeLancamento,
  itemDeOperacao,
  mapearCaixasSelecionaveis,
  montarSecoesCockpit,
  saldoDosTotais,
  totaisDoDetalhe,
  totaisDoResumo,
  type CategoriaLancavel,
  type ItemCockpit
} from "~/utils/cockpit-caixa";
import CaixaAutorizacoes from "~/components/caixa/CaixaAutorizacoes.vue";
import CaixaSeletor from "~/components/caixa/cockpit/CaixaSeletor.vue";
import CaixaSecaoCategoria from "~/components/caixa/cockpit/CaixaSecaoCategoria.vue";
import CaixaResultado from "~/components/caixa/cockpit/CaixaResultado.vue";

const props = defineProps<{
  resumo: ResumoCaixa | null;
  status: CaixaStatus | null;
  pdvs: Opcao[];
  turnos?: Opcao[];
  empresaId: string;
  permissoes: Permissao[];
  usuarioId: string;
  usuarioNome: string;
  podeGerenciarCaixas?: boolean;
  salvando?: boolean;
}>();

const emit = defineEmits<{
  (
    event: "abrirCaixa",
    payload: {
      pdvId: string;
      usuarioCaixaId: string;
      turnoId?: string | null;
      dataHoraAbertura: string;
      observacao: string | null;
    }
  ): void;
  (event: "acertarSaldo", payload: { caixaId: string; observacao: string | null }): void;
  (event: "fecharCaixa", payload: { caixaId: string; observacao: string | null }): void;
  (event: "recarregar"): void;
  (event: "lancar", entidade: EntidadeOperacional): void;
  (event: "editar", payload: { entidade: EntidadeOperacional; id: string }): void;
  (event: "discriminar", payload: { entidade: EntidadeOperacional; id: string }): void;
}>();

const { apiGet, apiGetPaginado } = useApi();

const abertura = reactive({ pdvId: "", turnoId: "", dataHoraAbertura: dataHoraLocal() });

const caixaAberto = computed(() => props.status?.caixaAberto ?? null);
const resumoProprio = computed(() => props.resumo ?? props.status?.resumo ?? null);

// --- Seletor de caixa (gerente) --------------------------------------------------------------
const historico = ref<LinhaHistoricoCaixa[]>([]);
const carregandoHistorico = ref(false);
const caixaSelecionadoId = ref("");
const erro = ref("");

const opcoesSeletor = computed(() => mapearCaixasSelecionaveis(historico.value, caixaAberto.value));
const caixaSelecionado = computed(
  () => opcoesSeletor.value.find((opcao) => opcao.id === caixaSelecionadoId.value) ?? null
);
// Auditoria = gerente olhando um caixa que NAO e o seu proprio aberto (fechado ou de outro operador).
const modoAuditoria = computed(() => Boolean(caixaSelecionado.value) && !caixaSelecionado.value?.ehProprioAberto);
const somenteLeitura = computed(() => modoAuditoria.value);
// Ha um caixa para exibir o cockpit (o proprio aberto ou um selecionado pelo gerente).
const temCockpit = computed(() => Boolean(caixaAberto.value) || Boolean(caixaSelecionado.value));

// --- Auditoria: detalhe do caixa selecionado -------------------------------------------------
const detalhe = ref<DetalheCaixaResponse | null>(null);
const carregandoDetalhe = ref(false);

// --- Modo proprio: listas por categoria (lazy no expandir) -----------------------------------
type EstadoLista = { itens: ItemCockpit[]; carregando: boolean; carregado: boolean };
function estadoListaVazio(): EstadoLista {
  return { itens: [], carregando: false, carregado: false };
}
const listasProprio = reactive<Record<CategoriaLancavel, EstadoLista>>({
  entradas: estadoListaVazio(),
  transferencias: estadoListaVazio(),
  despesas: estadoListaVazio(),
  mercadorias: estadoListaVazio(),
  retiradas: estadoListaVazio()
});

const secoesAbertas = reactive<Record<string, boolean>>({});

const totais = computed(() =>
  modoAuditoria.value ? totaisDoDetalhe(detalhe.value) : totaisDoResumo(resumoProprio.value)
);
const saldo = computed(() => saldoDosTotais(totais.value));
const secoes = computed(() => montarSecoesCockpit(props.permissoes, totais.value, !modoAuditoria.value));
const precisaAcerto = computed(() => !modoAuditoria.value && saldo.value > 0);
const podeVerResultado = computed(
  () => props.permissoes.includes("caixa_operar") || props.permissoes.includes("caixas_gerenciar")
);

function itensDaSecao(categoria: CategoriaLancavel): ItemCockpit[] {
  if (modoAuditoria.value) {
    const grupo = detalhe.value?.lancamentos.find((item) => item.categoria === categoria);
    return (grupo?.itens ?? []).map(itemDeLancamento);
  }
  return listasProprio[categoria].itens;
}
function carregandoDaSecao(categoria: CategoriaLancavel): boolean {
  return modoAuditoria.value ? carregandoDetalhe.value : listasProprio[categoria].carregando;
}

async function carregarHistorico() {
  if (!props.empresaId || !props.podeGerenciarCaixas) return;
  carregandoHistorico.value = true;
  try {
    const resultado = await apiGetPaginado<LinhaHistoricoCaixa, { totais: unknown }>(
      `/api/caixa/historico?empresaId=${props.empresaId}&pageSize=100`
    );
    historico.value = resultado.itens ?? [];
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregandoHistorico.value = false;
  }
}

async function carregarDetalhe(caixaId: string) {
  carregandoDetalhe.value = true;
  detalhe.value = null;
  try {
    detalhe.value = await apiGet<DetalheCaixaResponse>(`/api/caixa/${caixaId}/detalhe`);
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregandoDetalhe.value = false;
  }
}

async function carregarListaProprio(categoria: CategoriaLancavel, endpoint: string) {
  const caixaId = caixaAberto.value?.id;
  if (!caixaId) return;
  const alvo = listasProprio[categoria];
  alvo.carregando = true;
  try {
    const params = new URLSearchParams({ empresaId: props.empresaId, caixaId });
    const dados = await apiGet<OperacaoResumo[]>(`/api/${endpoint}?${params.toString()}`);
    alvo.itens = dados.map(itemDeOperacao);
    alvo.carregado = true;
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    alvo.carregando = false;
  }
}

function alternarSecao(categoria: CategoriaLancavel, endpoint: string) {
  const aberta = !secoesAbertas[categoria];
  secoesAbertas[categoria] = aberta;
  if (aberta && !modoAuditoria.value && !listasProprio[categoria].carregado) {
    void carregarListaProprio(categoria, endpoint);
  }
}

// Recarrega o que estiver aberto do caixa proprio (apos um lancamento salvo, por ex.).
function recarregarListasProprioAbertas() {
  for (const secao of secoes.value) {
    if (secoesAbertas[secao.categoria]) {
      listasProprio[secao.categoria].carregado = false;
      void carregarListaProprio(secao.categoria, secao.endpoint);
    }
  }
}

// Define o caixa selecionado por padrao: o proprio aberto; senao (gerente) o primeiro do historico.
function selecionarPadrao() {
  if (caixaSelecionadoId.value && opcoesSeletor.value.some((opcao) => opcao.id === caixaSelecionadoId.value)) return;
  caixaSelecionadoId.value = caixaAberto.value?.id ?? opcoesSeletor.value[0]?.id ?? "";
}

watch(
  () => props.pdvs,
  (pdvs) => {
    if (!abertura.pdvId && pdvs[0]?.id) abertura.pdvId = pdvs[0].id;
  },
  { immediate: true }
);

watch(
  () => [props.empresaId, props.podeGerenciarCaixas] as const,
  () => {
    void carregarHistorico();
  },
  { immediate: true }
);

// Quando o status muda (abriu/fechou/lancou) ou o historico chega: reseleciona e recarrega.
watch(
  [caixaAberto, opcoesSeletor],
  () => {
    selecionarPadrao();
  },
  { immediate: true }
);

// Ao trocar o caixa selecionado: auditoria carrega o detalhe; modo proprio zera as listas lazy.
watch(
  [caixaSelecionadoId, modoAuditoria],
  () => {
    if (modoAuditoria.value && caixaSelecionadoId.value) {
      void carregarDetalhe(caixaSelecionadoId.value);
    } else {
      for (const estado of Object.values(listasProprio)) {
        estado.itens = [];
        estado.carregado = false;
      }
      recarregarListasProprioAbertas();
    }
  },
  { immediate: true }
);

// Apos um lancamento (o pai recarrega o status): atualiza os totais (via resumo, ja reativo) e as listas.
watch(
  () => props.status,
  () => {
    if (!modoAuditoria.value) recarregarListasProprioAbertas();
  }
);

function abrir() {
  emit("abrirCaixa", {
    pdvId: abertura.pdvId,
    usuarioCaixaId: props.usuarioId,
    turnoId: abertura.turnoId || null,
    dataHoraAbertura: abertura.dataHoraAbertura,
    observacao: null
  });
}
function acertar() {
  const caixa = caixaAberto.value;
  if (caixa) emit("acertarSaldo", { caixaId: caixa.id, observacao: null });
}
function fechar(observacao: string | null) {
  const caixa = caixaAberto.value;
  if (caixa) emit("fecharCaixa", { caixaId: caixa.id, observacao });
}
</script>

<template>
  <v-card>
    <v-card-title>Caixa</v-card-title>
    <v-card-text>
      <v-alert v-if="!pdvs.length" type="warning" variant="tonal" class="mb-4">
        Cadastre um PDV com conta vinculada antes de abrir caixa.
      </v-alert>
      <v-alert v-if="erro" type="error" variant="tonal" class="mb-4" closable @click:close="erro = ''">{{
        erro
      }}</v-alert>

      <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
        <v-alert v-if="caixaAberto" type="success" variant="tonal" class="flex-grow-1 mb-0">
          Caixa aberto em {{ formatarDataHora(caixaAberto.dataHoraAbertura) }} no {{ caixaAberto.pdvNome }}.
        </v-alert>
        <CaixaAutorizacoes
          :empresa-id="empresaId"
          :caixa-aberto="caixaAberto"
          :permissoes="permissoes"
          @alterado="emit('recarregar')"
        />
      </div>

      <!-- Seletor de caixa: so para quem gerencia caixas (audita qualquer caixa do periodo). -->
      <CaixaSeletor
        v-if="podeGerenciarCaixas && opcoesSeletor.length"
        v-model="caixaSelecionadoId"
        :opcoes="opcoesSeletor"
        :carregando="carregandoHistorico"
        class="mb-4"
      />

      <!-- Cards de total por categoria (cor do Xmind) + saldo. -->
      <div v-if="temCockpit" class="cockpit-cards mb-5">
        <v-sheet
          v-for="secao in secoes"
          :key="`card-${secao.categoria}`"
          class="pa-3 rounded-lg cockpit-card"
          :style="{ '--cor-secao': secao.cor }"
        >
          <div class="text-caption text-medium-emphasis">{{ secao.titulo }}</div>
          <div class="text-h6">{{ dinheiro(secao.total) }}</div>
        </v-sheet>
        <v-sheet class="pa-3 rounded-lg cockpit-card" :style="{ '--cor-secao': CORES_COCKPIT.resultado }">
          <div class="text-caption text-medium-emphasis">Resultado</div>
          <div class="text-h6">{{ dinheiro(saldo) }}</div>
        </v-sheet>
      </div>

      <!-- Seis secoes colapsaveis por categoria. -->
      <div v-if="temCockpit" class="d-grid ga-3">
        <CaixaSecaoCategoria
          v-for="secao in secoes"
          :key="secao.categoria"
          :secao="secao"
          :aberta="Boolean(secoesAbertas[secao.categoria])"
          :itens="itensDaSecao(secao.categoria)"
          :carregando="carregandoDaSecao(secao.categoria)"
          :somente-leitura="somenteLeitura"
          @alternar="alternarSecao(secao.categoria, secao.endpoint)"
          @lancar="emit('lancar', $event)"
          @editar="emit('editar', $event)"
          @discriminar="emit('discriminar', $event)"
        />
        <CaixaResultado
          v-if="podeVerResultado"
          :aberta="Boolean(secoesAbertas.resultado)"
          :cor="CORES_COCKPIT.resultado"
          :saldo="saldo"
          :editavel="!modoAuditoria && Boolean(caixaAberto)"
          :precisa-acerto="precisaAcerto"
          :salvando="salvando"
          :detalhe="modoAuditoria ? detalhe : null"
          @alternar="secoesAbertas.resultado = !secoesAbertas.resultado"
          @acertar="acertar"
          @fechar="fechar"
        />
      </div>

      <!-- Abertura de caixa: quando o operador nao tem caixa aberto proprio. -->
      <template v-if="!caixaAberto">
        <v-divider v-if="temCockpit" class="my-5" />
        <div class="text-subtitle-2 mb-2">Abrir caixa</div>
        <v-row dense>
          <v-col cols="12" md="3">
            <v-select v-model="abertura.pdvId" :items="pdvs" item-title="nome" item-value="id" label="PDV" />
          </v-col>
          <v-col cols="12" md="3">
            <v-select
              v-model="abertura.turnoId"
              :items="turnos ?? []"
              item-title="nome"
              item-value="id"
              label="Turno"
              clearable
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-text-field v-model="abertura.dataHoraAbertura" type="datetime-local" label="Data e hora de abertura" />
          </v-col>
          <v-col cols="12" md="3">
            <v-text-field :model-value="usuarioNome" label="Usuario do caixa" readonly />
          </v-col>
          <v-col cols="12">
            <v-btn
              color="primary"
              prepend-icon="mdi-cash-register"
              :loading="salvando"
              :disabled="!abertura.pdvId"
              @click="abrir"
            >
              Abrir caixa
            </v-btn>
          </v-col>
        </v-row>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.cockpit-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.cockpit-card {
  border-left: 4px solid var(--cor-secao);
  background: rgba(var(--v-theme-surface-variant), 0.35);
}
</style>
