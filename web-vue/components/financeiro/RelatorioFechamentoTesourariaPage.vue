<script setup lang="ts">
import { computed, inject, reactive, ref, watch } from "vue";
import type { LinhaHistoricoCaixa } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { CONFIRMAR_ACAO_KEY, type ConfirmarAcao } from "~/utils/confirmacao-acao";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";
import RelatorioFechamentoDetalhes from "./RelatorioFechamentoDetalhes.vue";
import RelatorioFechamentoFolhaDigital from "./RelatorioFechamentoFolhaDigital.vue";
import RelatorioFechamentoPainelConferencia from "./RelatorioFechamentoPainelConferencia.vue";
import RelatorioFechamentoQuemFechou from "./RelatorioFechamentoQuemFechou.vue";
import RelatorioFechamentoTransferencias from "./RelatorioFechamentoTransferencias.vue";

const props = defineProps<{
  empresaId: string;
  pdvs: Opcao[];
  turnos: Opcao[];
  podeConferir: boolean;
  podeConferirTransferencia?: boolean;
  // O bloco consome GET /api/transferencias: sem `transferencias_visualizar` ele daria 403.
  podeVerTransferencias?: boolean;
}>();

type Situacao =
  | "aberto"
  | "em_fechamento"
  | "aguardando_tesouraria"
  | "fechado_sem_pendencias"
  | "com_quebra"
  | "conferido_tesouraria"
  | "divergencia_confirmada_tesouraria";
type LinhaRelatorio = LinhaHistoricoCaixa & { situacaoTesouraria: Situacao };
type Anexo = {
  id: string;
  tipo: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  criadoEm: string | null;
};
type Dossie = {
  caixa: Record<string, unknown>;
  resumo: Record<string, unknown> | null;
  situacaoTesouraria: Situacao;
  transferencias: Array<Record<string, unknown>>;
  conferencias: Array<Record<string, unknown>>;
  conferenciasTesouraria: Array<{
    id: string;
    resultado: "conferido" | "divergente";
    observacao: string | null;
    conferidoPor: string;
    conferidoPorNome: string | null;
    conferidoEm: string | null;
  }>;
  quebras: Array<Record<string, unknown>>;
  relatorioVendas: Record<string, unknown> | null;
  relatorioMaquininha: Record<string, unknown> | null;
  anexos: Anexo[];
  lancamentos: Record<string, Array<Record<string, unknown>>>;
  vendasCanceladas: Array<Record<string, unknown>>;
  ajuste: Record<string, unknown> | null;
};
type LinhaMaquininha = { forma: string; inicial: number | null; acumulado: number | null; liquido: number | null };

const { apiGet, apiGetPaginado, apiPost, apiUrl } = useApi();
const filtros = reactive({ dataInicio: "", dataFim: "", pdvId: "", turnoId: "", status: "" });
const statusOpcoes = [
  { title: "Todos os estados", value: "" },
  { title: "Aberto", value: "aberto" },
  { title: "Em fechamento", value: "em_fechamento" },
  { title: "Fechado", value: "fechado" },
  { title: "Ajustado", value: "ajustado" }
];
const abaAtiva = ref<"conferir" | "historico">("conferir");
const linhas = ref<LinhaRelatorio[]>([]);
const carregando = ref(false);
const erro = ref("");
const pagina = ref(1);
const itensPorPagina = 20;
const total = ref(0);
const dossie = ref<Dossie | null>(null);
const blocoTransferencias = ref<InstanceType<typeof RelatorioFechamentoTransferencias> | null>(null);
const transferenciasPendentes = ref(0);
const lacreFechamentoDiferente = ref(false);
const enviandoFechouCerto = ref(false);
const erroFechouCerto = ref("");
const confirmarAcao = inject<ConfirmarAcao>(CONFIRMAR_ACAO_KEY, async () => false);
const caixaSelecionado = ref<LinhaRelatorio | null>(null);
const carregandoDossie = ref(false);
const erroDossie = ref("");
const dialogoAberto = ref(false);
const dialogoConferencia = ref(false);
const dialogoAcaoFutura = ref(false);
const resultadoConferencia = ref<"conferido" | "divergente">("conferido");
// Revisao = a Tesouraria muda uma decisao que ja tinha tomado; o motivo e obrigatorio nos dois sentidos.
const revisandoConferencia = ref(false);
const observacaoConferencia = ref("");
const confirmandoConferencia = ref(false);
const erroConferencia = ref("");
const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / itensPorPagina)));
const linhasParaConferir = computed(() =>
  linhas.value.filter((linha) =>
    ["aguardando_tesouraria", "fechado_sem_pendencias", "com_quebra"].includes(linha.situacaoTesouraria)
  )
);
const linhasHistorico = computed(() =>
  linhas.value.filter((linha) =>
    ["conferido_tesouraria", "divergencia_confirmada_tesouraria"].includes(linha.situacaoTesouraria)
  )
);
const caixasEmOperacao = computed(() =>
  linhas.value.filter(
    (linha) =>
      !linhasParaConferir.value.some((pendente) => pendente.id === linha.id) &&
      !linhasHistorico.value.some((historico) => historico.id === linha.id)
  )
);
const linhasDaAba = computed(() => (abaAtiva.value === "conferir" ? linhasParaConferir.value : linhasHistorico.value));
const periodoInvertido = computed(() =>
  Boolean(filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim)
);
const conferenciaMaquininha = computed<LinhaMaquininha[]>(() => {
  const relatorio = registro(dossie.value?.relatorioMaquininha);
  return ["credito", "debito", "pix", "voucher"].map((forma) => {
    const inicial = valorOpcional(relatorio[`${forma}Inicial`]);
    const acumulado = valorOpcional(relatorio[`${forma}Final`]);
    return {
      forma: forma === "pix" ? "Pix" : `${forma.slice(0, 1).toUpperCase()}${forma.slice(1)}`,
      inicial,
      acumulado,
      liquido: inicial === null || acumulado === null ? null : acumulado - inicial
    };
  });
});
const ultimaConferenciaTesouraria = computed(() => dossie.value?.conferenciasTesouraria.at(-1) ?? null);

function parametros() {
  const params = new URLSearchParams({
    empresaId: props.empresaId,
    page: String(pagina.value),
    pageSize: String(itensPorPagina)
  });
  for (const [chave, valor] of Object.entries(filtros)) if (valor) params.set(chave, valor);
  return params;
}

async function buscar() {
  if (!props.empresaId || periodoInvertido.value) return;
  carregando.value = true;
  erro.value = "";
  try {
    const resultado = await apiGetPaginado<LinhaRelatorio>(`/api/relatorios/fechamentos?${parametros().toString()}`);
    linhas.value = resultado.itens;
    total.value = resultado.total;
  } catch (error) {
    erro.value = mensagemErro(error);
    linhas.value = [];
    total.value = 0;
  } finally {
    carregando.value = false;
  }
}

function aplicarFiltros() {
  pagina.value = 1;
  void buscar();
}
function limparFiltros() {
  Object.assign(filtros, { dataInicio: "", dataFim: "", pdvId: "", turnoId: "", status: "" });
  aplicarFiltros();
}

async function abrirDossie(linha: LinhaRelatorio) {
  erroFechouCerto.value = "";
  caixaSelecionado.value = linha;
  dossie.value = null;
  erroDossie.value = "";
  dialogoAberto.value = true;
  await carregarDossie(linha.id);
}

// `silencioso`: recarrega os dados SEM trocar o dossie pelo spinner. Depois de conferir uma
// transferencia o bloco precisa continuar montado (senao o aviso de sucesso some e o scroll volta ao topo).
async function carregarDossie(caixaId: string, silencioso = false) {
  if (!silencioso) carregandoDossie.value = true;
  erroDossie.value = "";
  try {
    dossie.value = await apiGet<Dossie>(`/api/relatorios/fechamentos/${caixaId}`);
  } catch (error) {
    erroDossie.value = mensagemErro(error);
  } finally {
    if (!silencioso) carregandoDossie.value = false;
  }
}

async function aoAlterarTransferencias() {
  if (caixaSelecionado.value) await carregarDossie(caixaSelecionado.value.id, true);
  await buscar();
}

function fecharDossie() {
  dialogoAberto.value = false;
  dossie.value = null;
  caixaSelecionado.value = null;
  erroDossie.value = "";
}

function aoAlterarDossie(aberto: boolean) {
  if (!aberto) fecharDossie();
}

function abrirConferencia(resultado: "conferido" | "divergente", revisao = false) {
  resultadoConferencia.value = resultado;
  revisandoConferencia.value = revisao;
  observacaoConferencia.value = "";
  erroConferencia.value = "";
  dialogoConferencia.value = true;
}

// "Fechou certo": recebe o retorno pendente como o caixa declarou e registra a conferencia da Tesouraria.
// Cada passo e o mesmo ato de antes (`/confirmar` da transferencia + `/conferir` do fechamento), so que num clique.
async function fecharCerto() {
  const caixa = caixaSelecionado.value;
  if (!caixa || enviandoFechouCerto.value) return;
  const confirmou = await confirmarAcao(
    "O retorno do caixa entra como o caixa declarou (valor, lacre e conta) e o fechamento fica registrado como conferido pela Tesouraria.",
    "Fechou certo?",
    "Fechou certo"
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
    await carregarDossie(caixa.id, true);
    if (dossie.value?.situacaoTesouraria !== "fechado_sem_pendencias") {
      erroFechouCerto.value =
        "Há diferença ou pendência neste caixa. Confira os dados abaixo e use Teve quebra se for o caso.";
      return;
    }
    await apiPost(`/api/relatorios/fechamentos/${caixa.id}/conferir`, { resultado: "conferido", observacao: null });
    await Promise.all([carregarDossie(caixa.id, true), buscar()]);
  } catch (error) {
    erroFechouCerto.value = mensagemErro(error);
  } finally {
    enviandoFechouCerto.value = false;
  }
}

function aoMudarEstadoTransferencias(estado: { pendentes: number; lacreDiferente: boolean }) {
  transferenciasPendentes.value = estado.pendentes;
  lacreFechamentoDiferente.value = estado.lacreDiferente;
}

function abrirAcaoFutura() {
  dialogoAcaoFutura.value = true;
}

async function registrarConferencia() {
  if (!caixaSelecionado.value) return;
  if (
    (resultadoConferencia.value === "divergente" || revisandoConferencia.value) &&
    !observacaoConferencia.value.trim()
  ) {
    erroConferencia.value = revisandoConferencia.value
      ? "Informe o motivo da alteração de status."
      : "Informe o motivo da quebra.";
    return;
  }
  confirmandoConferencia.value = true;
  erroConferencia.value = "";
  try {
    await apiPost(`/api/relatorios/fechamentos/${caixaSelecionado.value.id}/conferir`, {
      resultado: resultadoConferencia.value,
      observacao: observacaoConferencia.value.trim() || null
    });
    await Promise.all([carregarDossie(caixaSelecionado.value.id), buscar()]);
    dialogoConferencia.value = false;
  } catch (error) {
    erroConferencia.value = mensagemErro(error);
  } finally {
    confirmandoConferencia.value = false;
  }
}

function corSituacao(situacao: Situacao) {
  return {
    aberto: "info",
    em_fechamento: "warning",
    aguardando_tesouraria: "deep-orange",
    fechado_sem_pendencias: "success",
    com_quebra: "error",
    conferido_tesouraria: "success",
    divergencia_confirmada_tesouraria: "deep-orange"
  }[situacao];
}
function textoSituacao(situacao: Situacao) {
  return {
    aberto: "Aberto",
    em_fechamento: "Em fechamento",
    aguardando_tesouraria: "Aguardando Tesouraria",
    fechado_sem_pendencias: "Fechado sem pendências",
    com_quebra: "Com quebra",
    conferido_tesouraria: "Conferido pela Tesouraria",
    divergencia_confirmada_tesouraria: "Divergência confirmada pela Tesouraria"
  }[situacao];
}
function corSituacaoSeguro(situacao: unknown) {
  const valor = typeof situacao === "string" ? situacao : "";
  return corSituacao(valor as Situacao) ?? "secondary";
}
function textoSituacaoSeguro(situacao: unknown) {
  const valor = typeof situacao === "string" ? situacao : "";
  return textoSituacao(valor as Situacao) ?? "Status não informado";
}
function numero(valor: unknown) {
  return typeof valor === "number" ? valor : Number(valor ?? 0);
}
function valorOpcional(valor: unknown) {
  return valor === null || valor === undefined || valor === "" ? null : numero(valor);
}
function texto(valor: unknown) {
  return typeof valor === "string" && valor ? valor : "--";
}
function formatarDataHoraOuTraco(valor: unknown) {
  return valor ? formatarDataHora(String(valor)) : "--";
}
function registro(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}
function anexoUrl(anexo: { id: string }) {
  return `${apiUrl}/api/relatorios/fechamentos/${caixaSelecionado.value?.id}/anexos/${anexo.id}`;
}

watch(pagina, () => void buscar());
watch(
  () => props.empresaId,
  () => {
    pagina.value = 1;
    void buscar();
  },
  { immediate: true }
);
</script>

<template>
  <v-card class="relatorio-fechamento">
    <v-card-text>
      <div class="d-flex flex-wrap justify-space-between align-center ga-3 mb-5">
        <div>
          <div class="text-overline text-primary">TESOURARIA</div>
          <h2 class="text-h6">Relatório de fechamento</h2>
          <p class="text-body-2 text-medium-emphasis mb-0">Consulte cada fechamento por PDV e turno.</p>
        </div>
        <v-chip :color="props.podeConferir ? 'success' : 'primary'" variant="tonal" prepend-icon="mdi-shield-check">{{
          props.podeConferir ? "Conferência auditável" : "Somente leitura"
        }}</v-chip>
      </div>

      <v-row dense>
        <v-col cols="12" sm="6" md="2"
          ><v-text-field v-model="filtros.dataInicio" type="date" label="Data inicial" hide-details="auto"
        /></v-col>
        <v-col cols="12" sm="6" md="2"
          ><v-text-field
            v-model="filtros.dataFim"
            type="date"
            label="Data final"
            :error="periodoInvertido"
            :error-messages="periodoInvertido ? 'A data final é anterior à inicial.' : undefined"
            hide-details="auto"
        /></v-col>
        <v-col cols="12" sm="6" md="3"
          ><v-select
            v-model="filtros.pdvId"
            :items="pdvs"
            item-title="nome"
            item-value="id"
            label="PDV"
            clearable
            hide-details
        /></v-col>
        <v-col cols="12" sm="6" md="3"
          ><v-select
            v-model="filtros.turnoId"
            :items="turnos"
            item-title="nome"
            item-value="id"
            label="Turno"
            clearable
            hide-details
        /></v-col>
        <v-col cols="12" md="2"
          ><v-select v-model="filtros.status" :items="statusOpcoes" label="Situação" hide-details
        /></v-col>
      </v-row>
      <div class="d-flex flex-wrap ga-2 mt-4">
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-magnify"
          :loading="carregando"
          :disabled="periodoInvertido"
          @click="aplicarFiltros"
          >Filtrar</v-btn
        >
        <v-btn color="secondary" variant="outlined" prepend-icon="mdi-filter-remove" @click="limparFiltros"
          >Limpar</v-btn
        >
      </div>

      <v-alert v-if="erro" type="error" variant="tonal" class="mt-4">{{ erro }}</v-alert>

      <v-progress-linear v-if="carregando" indeterminate color="primary" class="mt-5" />
      <template v-else>
        <v-tabs v-model="abaAtiva" color="primary" class="mt-4 abas-tesouraria" grow>
          <v-tab value="conferir">Para conferir nesta página ({{ linhasParaConferir.length }})</v-tab>
          <v-tab value="historico">Histórico nesta página ({{ linhasHistorico.length }})</v-tab>
        </v-tabs>
        <v-alert v-if="caixasEmOperacao.length" type="info" variant="tonal" density="compact" class="mt-3">
          {{ caixasEmOperacao.length }} caixa(s) em abertura ou fechamento operacional não entram na fila da Tesouraria.
        </v-alert>
        <v-window v-model="abaAtiva" class="mt-3">
          <v-window-item value="conferir">
            <v-alert v-if="!linhasParaConferir.length" type="info" variant="tonal" density="compact">
              Nenhum caixa aguardando conferência da Tesouraria nesta página.
            </v-alert>
          </v-window-item>
          <v-window-item value="historico">
            <v-alert v-if="!linhasHistorico.length" type="info" variant="tonal" density="compact">
              Nenhum caixa já concluído pela Tesouraria nesta página.
            </v-alert>
          </v-window-item>
        </v-window>
        <v-row class="mt-2" dense>
          <v-col v-for="linha in linhasDaAba" :key="linha.id" cols="12" md="6" xl="4">
            <v-card variant="outlined" class="h-100 cartao-caixa">
              <v-card-text>
                <div class="d-flex justify-space-between ga-2 align-start">
                  <div>
                    <div class="text-overline">{{ formatarDataSomenteDia(linha.dataMovimento) }}</div>
                    <div class="text-h6">{{ linha.pdvNome }}</div>
                    <div class="text-body-2 text-medium-emphasis">
                      {{ linha.turnoNome || "Turno não informado" }} ·
                      {{ linha.colaboradorNome || linha.usuarioCaixaNome || "--" }}
                    </div>
                  </div>
                  <v-chip
                    :color="corSituacaoSeguro(linha.situacaoTesouraria)"
                    size="small"
                    variant="tonal"
                    class="status-caixa"
                    >{{ textoSituacaoSeguro(linha.situacaoTesouraria) }}</v-chip
                  >
                </div>
                <v-divider class="my-3" />
                <div class="d-flex justify-space-between">
                  <span class="text-medium-emphasis">Abertura</span
                  ><span>{{ linha.dataHoraAbertura ? formatarDataHora(linha.dataHoraAbertura) : "--" }}</span>
                </div>
                <div class="d-flex justify-space-between mt-1">
                  <span class="text-medium-emphasis">Fechamento</span
                  ><span>{{ linha.dataHoraFechamento ? formatarDataHora(linha.dataHoraFechamento) : "Em curso" }}</span>
                </div>
                <div class="d-flex justify-space-between mt-3 text-subtitle-1">
                  <span>Saldo físico</span><strong>{{ dinheiro(linha.saldo) }}</strong>
                </div>
                <v-chip v-if="linha.temAjuste" color="error" size="small" class="mt-3" variant="tonal"
                  >Ajuste / diferença registrado</v-chip
                >
              </v-card-text>
              <v-card-actions
                ><v-btn
                  block
                  color="primary"
                  variant="flat"
                  prepend-icon="mdi-clipboard-text-search-outline"
                  @click="abrirDossie(linha)"
                  >Conferir caixa</v-btn
                ></v-card-actions
              >
            </v-card>
          </v-col>
          <v-col v-if="!linhas.length" cols="12"
            ><v-alert type="info" variant="tonal">Nenhum fechamento para os filtros informados.</v-alert></v-col
          >
        </v-row>
      </template>
      <v-pagination
        v-if="totalPaginas > 1"
        v-model="pagina"
        class="mt-5"
        :length="totalPaginas"
        density="comfortable"
      />
    </v-card-text>
  </v-card>

  <v-dialog
    v-model="dialogoAberto"
    max-width="920"
    scrollable
    class="dialogo-dossie"
    @update:model-value="aoAlterarDossie"
  >
    <v-card class="dialogo-dossie__card">
      <v-toolbar color="primary" density="compact"
        ><v-toolbar-title>Fechamento · {{ caixaSelecionado?.pdvNome }}</v-toolbar-title
        ><v-btn icon="mdi-close" aria-label="Fechar folha digital" title="Fechar" @click.stop="fecharDossie"
      /></v-toolbar>
      <v-card-text class="pa-4">
        <div v-if="carregandoDossie" class="py-10">
          <v-progress-circular indeterminate color="primary" /><span class="ml-3">Carregando dossiê auditável…</span>
        </div>
        <template v-else-if="dossie">
          <v-alert :color="corSituacaoSeguro(dossie.situacaoTesouraria)" variant="tonal" density="compact" class="mb-3"
            ><strong>{{ textoSituacao(dossie.situacaoTesouraria) }}</strong> · confira os fatos abaixo; a decisão da
            Tesouraria não recalcula valores nem altera lacres.</v-alert
          >
          <RelatorioFechamentoQuemFechou
            class="mb-3"
            :caixa="dossie.caixa"
            :resumo="dossie.resumo"
            :texto="texto"
            :data-hora="formatarDataHoraOuTraco"
          />
          <RelatorioFechamentoPainelConferencia
            class="mb-3"
            :situacao="dossie.situacaoTesouraria"
            :pode-conferir-transferencia="props.podeConferirTransferencia === true"
            :pode-conferir-final="props.podeConferir"
            :retorno-visivel="props.podeVerTransferencias === true"
            :pendentes="transferenciasPendentes"
            :lacre-diferente="lacreFechamentoDiferente"
            :ultima="ultimaConferenciaTesouraria"
            :enviando="enviandoFechouCerto"
            :erro="erroFechouCerto"
            :data-hora="formatarDataHoraOuTraco"
            @fechou-certo="fecharCerto"
            @registrar-divergencia="abrirConferencia('divergente')"
            @revisar-final="abrirConferencia($event, true)"
          />
          <div class="dossie-acoes-futuras mb-3" aria-label="Ações futuras do fechamento">
            <v-btn variant="outlined" color="primary" prepend-icon="mdi-file-excel-outline" @click="abrirAcaoFutura()"
              >Exportar para planilha</v-btn
            >
          </div>
          <RelatorioFechamentoTransferencias
            v-if="caixaSelecionado && props.podeVerTransferencias"
            ref="blocoTransferencias"
            :empresa-id="props.empresaId"
            :caixa-id="caixaSelecionado.id"
            :pode-conferir="props.podeConferirTransferencia === true"
            :lacre-fechamento-informado="
              typeof dossie.resumo?.lacreFechamento === 'string' ? dossie.resumo.lacreFechamento : null
            "
            @estado="aoMudarEstadoTransferencias"
            @alterado="aoAlterarTransferencias"
          />
          <RelatorioFechamentoFolhaDigital
            :caixa="dossie.caixa"
            :resumo="dossie.resumo"
            :maquininha="conferenciaMaquininha"
            :transferencias="dossie.transferencias"
            :relatorio-vendas="dossie.relatorioVendas"
            :ajuste="dossie.ajuste"
            :vendas-canceladas="dossie.vendasCanceladas"
            :dinheiro="dinheiro"
            :numero="numero"
            :texto="texto"
            :data-hora="formatarDataHoraOuTraco"
          />

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
        <v-alert v-else-if="erroDossie" type="error" variant="tonal">
          {{ erroDossie }}
          <template #append>
            <v-btn size="small" variant="text" @click="caixaSelecionado && carregarDossie(caixaSelecionado.id)">
              Tentar novamente
            </v-btn>
            <v-btn size="small" variant="text" @click="fecharDossie">Fechar</v-btn>
          </template>
        </v-alert>
      </v-card-text>
    </v-card>
  </v-dialog>

  <v-dialog v-model="dialogoConferencia" max-width="520">
    <v-card>
      <v-card-title>{{
        revisandoConferencia
          ? "Alterar status da conferência"
          : resultadoConferencia === "conferido"
            ? "Confirmar conferência da Tesouraria"
            : "Registrar quebra"
      }}</v-card-title>
      <v-card-text>
        <template v-if="revisandoConferencia"
          ><p>
            O status passa para
            <strong>{{ resultadoConferencia === "conferido" ? "Conferido" : "Quebra / divergência" }}</strong
            >. A decisão anterior continua no histórico e os valores financeiros não mudam.
          </p>
          <v-textarea
            v-model="observacaoConferencia"
            label="Motivo da alteração"
            auto-grow
            counter="1000"
            :error-messages="erroConferencia"
        /></template>
        <p v-else-if="resultadoConferencia === 'conferido'">
          Você confirma que a folha, os lacres, os valores e os anexos deste caixa foram conferidos e estão sem
          pendências?
        </p>
        <template v-else
          ><p>
            Descreva a quebra que a Tesouraria encontrou. Este registro avisa a quebra, não altera os valores
            financeiros e fica no histórico.
          </p>
          <v-textarea
            v-model="observacaoConferencia"
            label="O que aconteceu (motivo da quebra)"
            auto-grow
            counter="1000"
            :error-messages="erroConferencia"
        /></template>
        <v-alert
          v-if="resultadoConferencia === 'conferido' && !revisandoConferencia && erroConferencia"
          type="error"
          variant="tonal"
          >{{ erroConferencia }}</v-alert
        >
      </v-card-text>
      <v-card-actions class="pa-4 pt-0"
        ><v-spacer /><v-btn variant="text" :disabled="confirmandoConferencia" @click="dialogoConferencia = false"
          >Voltar</v-btn
        ><v-btn
          :color="resultadoConferencia === 'conferido' ? 'success' : 'deep-orange'"
          variant="flat"
          :loading="confirmandoConferencia"
          @click="registrarConferencia"
          >{{
            revisandoConferencia
              ? "Alterar status"
              : resultadoConferencia === "conferido"
                ? "Confirmar"
                : "Registrar quebra"
          }}</v-btn
        ></v-card-actions
      >
    </v-card>
  </v-dialog>

  <v-dialog v-model="dialogoAcaoFutura" max-width="480">
    <v-card>
      <v-card-title>Exportar para planilha</v-card-title>
      <v-card-text>
        <p>A exportação será disponibilizada em uma próxima entrega.</p>
        <v-alert type="info" variant="tonal">Nenhum arquivo foi gerado e nenhum dado foi alterado.</v-alert>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0"
        ><v-spacer /><v-btn color="primary" variant="flat" @click="dialogoAcaoFutura = false"
          >Entendi</v-btn
        ></v-card-actions
      >
    </v-card>
  </v-dialog>
</template>

<style scoped>
.cartao-caixa {
  border-top: 3px solid rgb(var(--v-theme-primary));
}
.status-caixa {
  max-width: 100%;
  white-space: normal;
}
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
.dossie-acoes-futuras {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.dossie-grid {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(130px, 1.2fr);
  gap: 9px 16px;
}
@media (max-width: 599px) {
  .dialogo-dossie :deep(.v-overlay__content) {
    width: calc(100vw - 16px) !important;
    max-height: calc(100dvh - 16px) !important;
    margin: 8px;
  }
  .dialogo-dossie__card {
    max-height: calc(100dvh - 16px);
    display: flex;
    flex-direction: column;
  }
  .dialogo-dossie__card > .v-card-text {
    padding: 12px !important;
  }
  .dossie-acoes-futuras {
    justify-content: stretch;
  }
  .dossie-acoes-futuras :deep(.v-btn) {
    flex: 1 1 100%;
  }
  .dialogo-dossie :deep(.v-toolbar-title) {
    min-width: 0;
    font-size: 0.92rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cartao-caixa :deep(.v-card-text > .d-flex:first-child) {
    flex-wrap: wrap;
  }
  .dossie-grid {
    grid-template-columns: 1fr;
    gap: 3px;
  }
  .dossie-grid strong {
    margin-bottom: 8px;
  }
  .v-table :deep(thead) {
    display: none;
  }
  .v-table :deep(tbody),
  .v-table :deep(tr),
  .v-table :deep(td) {
    display: block;
    width: 100%;
  }
  .v-table :deep(tr) {
    padding: 10px 0;
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
  .v-table :deep(td) {
    min-height: 0;
    padding: 4px 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .v-table :deep(td[data-rotulo]) {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: 12px;
    text-align: right;
  }
  .v-table :deep(td[data-rotulo]::before) {
    content: attr(data-rotulo);
    color: var(--cx-ink-soft);
    text-align: left;
    font-weight: 500;
  }
}
</style>
