<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { CONFIRMAR_ACAO_KEY, type ConfirmarAcao } from "~/utils/confirmacao-acao";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataSomenteDia } from "~/utils/formatacao";
import {
  conferenciaMaquininhaDoRelatorio,
  etapaDoRelatorioMaquininha,
  dataHoraOuTraco,
  numero,
  texto,
  type Dossie,
  type LinhaRelatorio
} from "~/utils/relatorio-fechamento";
import RelatorioFechamentoDetalhes from "./RelatorioFechamentoDetalhes.vue";
import RelatorioFechamentoFolhaDigital from "./RelatorioFechamentoFolhaDigital.vue";
import RelatorioFechamentoPainelConferencia from "./RelatorioFechamentoPainelConferencia.vue";
import RelatorioFechamentoParadaComputador from "./RelatorioFechamentoParadaComputador.vue";
import RelatorioFechamentoQuebraDialog from "./RelatorioFechamentoQuebraDialog.vue";
import RelatorioFechamentoQuemFechou from "./RelatorioFechamentoQuemFechou.vue";
import RelatorioFechamentoTransferencias from "./RelatorioFechamentoTransferencias.vue";

// O popup do fechamento de UM caixa: carrega o dossie, mostra as secoes e executa as decisoes da Tesouraria
// (Fechou certo, Teve quebra, Alterar status). A pagina so abre/fecha e recarrega a fila quando algo muda.
const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  caixa: LinhaRelatorio | null;
  empresaId: string;
  podeConferir: boolean;
  podeConferirTransferencia?: boolean;
  // O bloco consome GET /api/transferencias: sem `transferencias_visualizar` ele daria 403.
  podeVerTransferencias?: boolean;
}>();
const emit = defineEmits<{ (event: "alterado"): void }>();

type EstadoTransferencias = {
  pendentes: number;
  lacreDiferente: boolean;
  erro: boolean;
  retornos: Array<{ nome: string; valor: number; lacre: string }>;
};

const { apiGet, apiPost, apiUrl } = useApi();
const confirmarAcao = inject<ConfirmarAcao>(CONFIRMAR_ACAO_KEY, async () => false);

const dossie = ref<Dossie | null>(null);
const carregando = ref(false);
const erroDossie = ref("");
const blocoTransferencias = ref<InstanceType<typeof RelatorioFechamentoTransferencias> | null>(null);
const estadoTransferencias = ref<EstadoTransferencias>({
  pendentes: 0,
  lacreDiferente: false,
  erro: false,
  retornos: []
});
const enviandoFechouCerto = ref(false);
const erroFechouCerto = ref("");
const dialogoQuebra = ref(false);
const resultadoQuebra = ref<"conferido" | "divergente">("divergente");
const revisandoQuebra = ref(false);
const enviandoQuebra = ref(false);
const erroQuebra = ref("");

const maquininha = computed(() => conferenciaMaquininhaDoRelatorio(dossie.value?.relatorioMaquininha));
const etapaMaquininha = computed(() => etapaDoRelatorioMaquininha(dossie.value?.relatorioMaquininha));
const ultimaConferencia = computed(() => dossie.value?.conferenciasTesouraria.at(-1) ?? null);
const lacreFechamentoInformado = computed(() => {
  const lacre = dossie.value?.resumo?.lacreFechamento;
  return typeof lacre === "string" ? lacre : null;
});

// `silencioso`: recarrega os dados SEM trocar o dossie pelo spinner. Depois de conferir uma
// transferencia o bloco precisa continuar montado (senao o aviso de sucesso some e o scroll volta ao topo).
async function carregar(silencioso = false) {
  const caixaId = props.caixa?.id;
  if (!caixaId) return;
  if (!silencioso) carregando.value = true;
  erroDossie.value = "";
  try {
    dossie.value = await apiGet<Dossie>(`/api/relatorios/fechamentos/${caixaId}`);
  } catch (error) {
    erroDossie.value = mensagemErro(error);
  } finally {
    if (!silencioso) carregando.value = false;
  }
}

watch(
  () => [aberto.value, props.caixa?.id] as const,
  ([visivel, caixaId]) => {
    if (!visivel || !caixaId) return;
    dossie.value = null;
    erroFechouCerto.value = "";
    estadoTransferencias.value = { pendentes: 0, lacreDiferente: false, erro: false, retornos: [] };
    void carregar();
  },
  { immediate: true }
);

function fechar() {
  aberto.value = false;
  dossie.value = null;
  erroDossie.value = "";
}

async function aoAlterarTransferencias() {
  await carregar(true);
  emit("alterado");
}

// "Fechou certo": recebe o retorno pendente como o caixa declarou e registra a conferencia da Tesouraria.
// Cada passo e o mesmo ato de antes (`/confirmar` da transferencia + `/conferir` do fechamento), so que num clique.
async function fecharCerto() {
  const caixaId = props.caixa?.id;
  if (!caixaId || enviandoFechouCerto.value) return;
  const { retornos } = estadoTransferencias.value;
  const total = retornos.reduce((soma, item) => soma + item.valor, 0);
  const lista = retornos.map((item) => `${item.nome} ${dinheiro(item.valor)} (${item.lacre})`).join("; ");
  const confirmou = await confirmarAcao(
    retornos.length
      ? `Vai receber ${retornos.length} retorno(s) do caixa como ele declarou: ${lista}. Total ${dinheiro(total)}. Depois marca o caixa como Conferido pela Tesouraria.`
      : "O retorno do caixa já foi recebido. Isto marca o caixa como Conferido pela Tesouraria.",
    "O caixa fechou certo?",
    "Sim, fechou certo"
  );
  if (!confirmou) return;
  enviandoFechouCerto.value = true;
  erroFechouCerto.value = "";
  try {
    const falha = await blocoTransferencias.value?.receberComoDeclarado();
    if (falha) {
      erroFechouCerto.value = falha;
      return;
    }
    await carregar(true);
    if (dossie.value?.situacaoTesouraria !== "fechado_sem_pendencias") {
      erroFechouCerto.value =
        "Há diferença ou pendência neste caixa. Confira os dados abaixo e use Teve quebra se for o caso.";
      return;
    }
    await apiPost(`/api/relatorios/fechamentos/${caixaId}/conferir`, { resultado: "conferido", observacao: null });
    await carregar(true);
    emit("alterado");
  } catch (error) {
    erroFechouCerto.value = mensagemErro(error);
  } finally {
    enviandoFechouCerto.value = false;
  }
}

function abrirQuebra(resultado: "conferido" | "divergente", revisao: boolean) {
  resultadoQuebra.value = resultado;
  revisandoQuebra.value = revisao;
  erroQuebra.value = "";
  dialogoQuebra.value = true;
}

async function registrarQuebra(observacao: string) {
  const caixaId = props.caixa?.id;
  if (!caixaId) return;
  enviandoQuebra.value = true;
  erroQuebra.value = "";
  try {
    await apiPost(`/api/relatorios/fechamentos/${caixaId}/conferir`, { resultado: resultadoQuebra.value, observacao });
    await carregar();
    dialogoQuebra.value = false;
    emit("alterado");
  } catch (error) {
    erroQuebra.value = mensagemErro(error);
  } finally {
    enviandoQuebra.value = false;
  }
}

function anexoUrl(anexo: { id: string }) {
  return `${apiUrl}/api/relatorios/fechamentos/${props.caixa?.id}/anexos/${anexo.id}`;
}
</script>

<template>
  <v-dialog
    v-model="aberto"
    max-width="920"
    scrollable
    class="dialogo-dossie"
    @update:model-value="!$event && fechar()"
  >
    <v-card class="dialogo-dossie__card">
      <v-toolbar color="primary" density="compact"
        ><v-toolbar-title
          >Fechamento · {{ caixa?.pdvNome
          }}<template v-if="caixa?.dataMovimento">
            · {{ formatarDataSomenteDia(caixa.dataMovimento) }}</template
          ></v-toolbar-title
        ><v-btn icon="mdi-close" size="large" aria-label="Fechar o fechamento" title="Fechar" @click.stop="fechar"
      /></v-toolbar>
      <v-card-text class="pa-4">
        <div v-if="carregando" class="py-10" role="status" aria-live="polite">
          <v-progress-circular indeterminate color="primary" /><span class="ml-3">Carregando o fechamento…</span>
        </div>
        <template v-else-if="dossie">
          <RelatorioFechamentoQuemFechou
            class="mb-3"
            :caixa="dossie.caixa"
            :resumo="dossie.resumo"
            :texto="texto"
            :data-hora="dataHoraOuTraco"
          />
          <RelatorioFechamentoPainelConferencia
            class="mb-3"
            :situacao="dossie.situacaoTesouraria"
            :pode-conferir-transferencia="podeConferirTransferencia === true"
            :pode-conferir-final="podeConferir"
            :retorno-visivel="podeVerTransferencias === true"
            :retorno-com-erro="estadoTransferencias.erro"
            :pendentes="estadoTransferencias.pendentes"
            :lacre-diferente="estadoTransferencias.lacreDiferente"
            :ultima="ultimaConferencia"
            :enviando="enviandoFechouCerto"
            :erro="erroFechouCerto"
            :data-hora="dataHoraOuTraco"
            @fechou-certo="fecharCerto"
            @registrar-divergencia="abrirQuebra('divergente', false)"
            @revisar-final="abrirQuebra($event, true)"
          />
          <RelatorioFechamentoTransferencias
            v-if="caixa && podeVerTransferencias"
            ref="blocoTransferencias"
            :empresa-id="empresaId"
            :caixa-id="caixa.id"
            :pode-conferir="podeConferirTransferencia === true"
            :lacre-fechamento-informado="lacreFechamentoInformado"
            @estado="estadoTransferencias = $event"
            @alterado="aoAlterarTransferencias"
          />
          <RelatorioFechamentoFolhaDigital
            :caixa="dossie.caixa"
            :resumo="dossie.resumo"
            :maquininha="maquininha"
            :etapa-maquininha="etapaMaquininha"
            :relatorio-vendas="dossie.relatorioVendas"
            :ajuste="dossie.ajuste"
            :vendas-canceladas="dossie.vendasCanceladas"
            :dinheiro="dinheiro"
            :numero="numero"
            :texto="texto"
            :data-hora="dataHoraOuTraco"
          />
          <RelatorioFechamentoParadaComputador :paradas="dossie.indisponibilidades ?? []" />
          <RelatorioFechamentoDetalhes
            :conferencias="dossie.conferencias"
            :quebras="dossie.quebras"
            :decisoes="dossie.conferenciasTesouraria"
            :anexos="dossie.anexos"
            :anexo-url="anexoUrl"
            :dinheiro="dinheiro"
            :numero="numero"
            :texto="texto"
          />
        </template>
        <v-alert v-else-if="erroDossie" type="error" variant="tonal" role="alert">
          {{ erroDossie }}
          <template #append>
            <v-btn size="small" variant="text" @click="carregar()">Tentar novamente</v-btn>
            <v-btn size="small" variant="text" @click="fechar">Fechar</v-btn>
          </template>
        </v-alert>
      </v-card-text>
    </v-card>
  </v-dialog>

  <RelatorioFechamentoQuebraDialog
    v-model="dialogoQuebra"
    :resultado="resultadoQuebra"
    :revisao="revisandoQuebra"
    :enviando="enviandoQuebra"
    :erro="erroQuebra"
    @confirmar="registrarQuebra"
  />
</template>

<style scoped>
.dialogo-dossie__card {
  min-width: 0;
  max-height: min(88dvh, 820px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dialogo-dossie :deep(.v-overlay__content) {
  width: min(calc(100vw - 32px), 920px);
  max-height: min(88dvh, 820px);
}
.dialogo-dossie__card > .v-card-text {
  overflow-y: auto;
}
@media (max-width: 599px) {
  .dialogo-dossie :deep(.v-overlay__content) {
    width: calc(100vw - 16px) !important;
    max-height: calc(100dvh - 16px) !important;
    margin: 8px;
  }
  .dialogo-dossie__card {
    max-height: calc(100dvh - 16px);
  }
  .dialogo-dossie__card > .v-card-text {
    padding: 12px !important;
  }
  .dialogo-dossie :deep(.v-toolbar-title) {
    min-width: 0;
    font-size: 0.92rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
