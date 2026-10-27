<script setup lang="ts">
// Cockpit de TESOURARIA (rota /transferencias). O tesoureiro NAO opera caixa — ele move dinheiro
// entre contas (cofre -> caixas -> banco) por transferencia. Substitui a tabela generica pelo
// cockpit: cards Saida/Entrada/Saldo (cor --cat-transferencias) + lista limpa das transferencias.
// A criacao/edicao REUSA o modal de transferencia do workspace (eventos "nova"/"editar"); o botao
// NAO depende de caixa aberto.
//
// A lista recebe da API o trajeto nominal, lacre, estado e data de recebimento.
import { statusTransferenciaSchema, valorEntradaCentavos, type StatusTransferencia } from "@padaria/shared";
import { computed, inject, reactive, ref } from "vue";
import type { ItemMenu, OperacaoResumo, Opcao, ResumoCaixa } from "~/types/padaria";
import CancelarPlanejamentoRetornoDialog from "./CancelarPlanejamentoRetornoDialog.vue";
import TransferenciasFiltros from "./TransferenciasFiltros.vue";
import TransferenciasLista from "./TransferenciasLista.vue";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";
import {
  camposConferenciaVazios,
  lacreConfereEntrega,
  montarPayloadConfirmacao,
  bloqueiaEnvioPorSobra,
  montarPayloadRecusa,
  valorConferenciaValido
} from "~/utils/conferencia-transferencia";
import { CONFIRMAR_ACAO_KEY, type ConfirmarAcao } from "~/utils/confirmacao-acao";

const props = withDefaults(
  defineProps<{
    resumo: ResumoCaixa | null;
    telaAtual: ItemMenu | null | undefined;
    empresaAtiva: Opcao | null;
    operacoesPaginadas: OperacaoResumo[];
    operacoesTela: OperacaoResumo[];
    totalOperacoes: number;
    statusFiltro: StatusTransferencia | "";
    filtrosTransferencias: {
      dataInicio: string;
      dataFim: string;
      pdvId: string;
      usuario: string;
      contaOrigemId: string;
      contaDestinoId: string;
      lacre: string;
    };
    pdvs: Opcao[];
    contas: Opcao[];
    pagina: number;
    totalPaginas: number;
    podeCriar?: boolean;
    podeEditar?: boolean;
    podeCancelarPlanejamento?: boolean;
    salvando?: boolean;
    // Sem isto a tela oferecia "Conferir" para quem a API recusaria com 403.
    podeConferir?: boolean;
  }>(),
  {
    podeCriar: false,
    podeEditar: false,
    podeConferir: false,
    podeCancelarPlanejamento: false,
    salvando: false,
    operacoesTela: () => []
  }
);

const emit = defineEmits<{
  (event: "nova"): void;
  (event: "editar", operacao: OperacaoResumo): void;
  (event: "update:pagina", pagina: number): void;
  (event: "update:status-filtro", status: StatusTransferencia | ""): void;
  (event: "update:filtros-transferencias", filtros: typeof props.filtrosTransferencias): void;
  (event: "recarregar"): void;
  (event: "notificar", mensagem: string, tipo?: string): void;
  (
    event: "cancelarPlanejamento",
    payload: { planejamentoId: string; motivo: string; aoConcluir: (sucesso: boolean) => void }
  ): void;
}>();
const { apiGet, apiPost, apiUrl } = useApi();
// O provider vive no AppWorkspace e garante a mesma janela de confirmação para Caixa e Tesouraria.
// Sem ele (por exemplo, em um mount isolado de teste) a ação é cancelada por segurança.
const confirmarAcao = inject<ConfirmarAcao>(CONFIRMAR_ACAO_KEY, async () => false);
const confirmando = ref<OperacaoResumo | null>(null);
type AnexoConferencia = {
  id: string;
  tipo: "folha_fechamento" | "comprovante_cartao";
  nomeOriginal: string;
  mimeType?: string;
};
type FechamentoConferencia = {
  status: string;
  dataHoraFechamento: string | null;
  fechadoEm: string | null;
  fechadoPorNome: string | null;
  usuarioCaixaNome: string | null;
  colaboradorNome: string | null;
  lacreFechamento: string | null;
  caixaResponsavelNomeFechamento: string | null;
  supervisorResponsavelNomeFechamento: string | null;
  valorEspecieFechamento: number | null;
  valorMoedasFechamento: number | null;
  observacao: string | null;
};
const anexosConferencia = ref<AnexoConferencia[]>([]);
const carregandoAnexos = ref(false);
const erroAnexos = ref("");
const fechamentoConferencia = ref<FechamentoConferencia | null>(null);
const carregandoFechamento = ref(false);
const erroFechamento = ref("");
const previewAnexo = ref<AnexoConferencia | null>(null);
const rotacaoPreview = ref(0);
const folhasConferencia = computed(() => anexosConferencia.value.filter((anexo) => anexo.tipo === "folha_fechamento"));
const cartoesConferencia = computed(() =>
  anexosConferencia.value.filter((anexo) => anexo.tipo === "comprovante_cartao")
);
// Um unico objeto de campos, zerado a cada abertura: antes eram quatro refs soltas que
// sobreviviam ao fechamento do dialogo, e a segunda conferencia comecava com o valor da primeira
// ja preenchido — convite para confirmar sem contar.
const campos = reactive(camposConferenciaVazios());
const erroConferencia = ref("");
const salvandoConferencia = ref(false);
const modoRecusa = ref(false);
// R-183 · o desfecho da recusa. `false` mantem o comportamento de sempre (registra e reconfere);
// `true` encerra: o cofre credita o contado, a falta vira quebra e o caixa destrava.
const encerrarDivergencia = ref(false);
const sobraConfirmada = ref(false);
const cancelandoPlanejamento = ref<OperacaoResumo | null>(null);

function abrirConferencia(operacao: OperacaoResumo) {
  Object.assign(campos, camposConferenciaVazios());
  erroConferencia.value = "";
  modoRecusa.value = false;
  encerrarDivergencia.value = false;
  sobraConfirmada.value = false;
  confirmando.value = operacao;
  anexosConferencia.value = [];
  erroAnexos.value = "";
  fechamentoConferencia.value = null;
  erroFechamento.value = "";
  previewAnexo.value = null;
  rotacaoPreview.value = 0;
  carregandoAnexos.value = Boolean(operacao.caixaId && operacao.ehCaixaParaCofre);
  carregandoFechamento.value = carregandoAnexos.value;
  if (carregandoAnexos.value) {
    void carregarAnexosConferencia(operacao.id);
    void carregarFechamentoConferencia(operacao.id);
  }
}

async function carregarFechamentoConferencia(transferenciaId: string) {
  try {
    const fechamento = await apiGet<FechamentoConferencia>(
      `/api/transferencias/${transferenciaId}/fechamento-conferencia`
    );
    if (confirmando.value?.id === transferenciaId) fechamentoConferencia.value = fechamento;
  } catch {
    if (confirmando.value?.id === transferenciaId) erroFechamento.value = "Fechamento ainda não registrado.";
  } finally {
    if (confirmando.value?.id === transferenciaId) carregandoFechamento.value = false;
  }
}

function abrirAnexoPreview(anexo: AnexoConferencia) {
  if (!anexo.mimeType?.startsWith("image/")) return;
  previewAnexo.value = anexo;
  rotacaoPreview.value = 0;
}

function fecharAnexoPreview() {
  previewAnexo.value = null;
  rotacaoPreview.value = 0;
}

async function carregarAnexosConferencia(transferenciaId: string) {
  try {
    const anexos = await apiGet<AnexoConferencia[]>(`/api/transferencias/${transferenciaId}/anexos-fechamento`);
    if (confirmando.value?.id === transferenciaId) anexosConferencia.value = anexos;
  } catch {
    if (confirmando.value?.id === transferenciaId)
      erroAnexos.value = "Não foi possível carregar os anexos do fechamento.";
  } finally {
    if (confirmando.value?.id === transferenciaId) carregandoAnexos.value = false;
  }
}

function fecharConferencia() {
  confirmando.value = null;
  anexosConferencia.value = [];
  erroAnexos.value = "";
  carregandoAnexos.value = false;
  fechamentoConferencia.value = null;
  erroFechamento.value = "";
  carregandoFechamento.value = false;
  fecharAnexoPreview();
  modoRecusa.value = false;
  encerrarDivergencia.value = false;
  sobraConfirmada.value = false;
  Object.assign(campos, camposConferenciaVazios());
  erroConferencia.value = "";
}

// O servidor e quem sabe se esta linha e um retorno do Caixa: a tela nao conhece o tipo gravado.
// Vem no DTO da listagem, calculado com o predicado canonico.
const ehCaixaParaCofre = computed(() => confirmando.value?.ehCaixaParaCofre === true);
const tituloConferencia = computed(() => {
  if (modoRecusa.value) return ehCaixaParaCofre.value ? "Registrar divergência da sangria" : "Registrar divergência";
  return ehCaixaParaCofre.value ? "Conferir sangria" : "Conferir recebimento";
});
const valorFechamentoConferencia = computed(() => {
  const fechamento = fechamentoConferencia.value;
  if (!fechamento) return null;
  return Number(fechamento.valorEspecieFechamento ?? 0) + Number(fechamento.valorMoedasFechamento ?? 0);
});
const fechamentoFoiConcluido = computed(
  () => fechamentoConferencia.value?.status === "fechado" || fechamentoConferencia.value?.status === "ajustado"
);

// Decisao 5/R-187: o valor so e OBRIGATORIO no retorno do Caixa (e la 0 e legitimo). Na generica ele
// continua opcional — vazio significa "nao informei", e o payload omite o campo.
const valorValido = computed(() => valorConferenciaValido(campos.valorRecebido));
const valorPendente = computed(() => ehCaixaParaCofre.value && !valorValido.value);
const composicaoPendente = computed(
  () =>
    ehCaixaParaCofre.value &&
    (!valorConferenciaValido(campos.valorEspecieContado) || !valorConferenciaValido(campos.valorMoedasContado))
);
const composicaoInvalida = computed(
  () =>
    !composicaoPendente.value &&
    ehCaixaParaCofre.value &&
    Number(campos.valorEspecieContado) + Number(campos.valorMoedasContado) !== Number(campos.valorRecebido)
);
// Na Transferencia de retorno, "Confirmar" significa que lacre e valor bateram. A API ja impede
// que R$ 90 confirme uma entrega de R$ 100; espelhar a regra aqui evita abrir uma segunda
// confirmação para uma ação que inevitavelmente será recusada e deixa claro que o caminho é
// "Não bateu".
const valorDivergenteNaConferencia = computed(() => {
  if (modoRecusa.value || !ehCaixaParaCofre.value || !valorValido.value || !confirmando.value) return false;
  return (
    Number(campos.valorRecebido) !== Number(confirmando.value.valorOriginal) ||
    Number(campos.valorEspecieContado) !== Number(confirmando.value.valorEspecieDeclarado ?? 0) ||
    Number(campos.valorMoedasContado) !== Number(confirmando.value.valorMoedasDeclarado ?? 0)
  );
});
// Sem este bloqueio, deixar o campo vazio em uma entrega lacrada chegava ao servidor como
// `null` e recebia um 409 que parecia ser divergencia de valor. No modo de recusa, lacre
// diferente e uma evidencia valida e deve poder seguir junto do motivo.
const lacrePendente = computed(
  () => !modoRecusa.value && !lacreConfereEntrega(campos.lacre, confirmando.value?.nLacreDoc)
);
const entregaTemLacre = computed(() => Boolean(confirmando.value?.nLacreDoc?.trim()));
const motivoValido = computed(() => Boolean(campos.motivo.trim()));
// A sobra so aparece quando o contado passa do declarado — e ai o consentimento vira obrigatorio,
// senao o servidor recusa com 409. Mostrar a caixa sempre treinaria a pessoa a marcar sem ler.
const contadoAcimaDoDeclarado = computed(() => {
  const operacao = confirmando.value;
  if (!operacao || !valorConferenciaValido(campos.valorRecebido)) return false;
  return Number(campos.valorRecebido) > Number(operacao.valorOriginal);
});
const sobraPendenteDeConsentimento = computed(() =>
  bloqueiaEnvioPorSobra({
    modoRecusa: modoRecusa.value,
    encerrar: encerrarDivergencia.value,
    contouAMais: contadoAcimaDoDeclarado.value,
    confirmou: sobraConfirmada.value
  })
);

function textoConfirmacaoConferencia(operacao: OperacaoResumo): { titulo: string; mensagem: string; botao: string } {
  const declarado = dinheiro(Number(operacao.valorOriginal));
  const destino = operacao.contaDestinoNome || "a conta destino";
  const informouValor = valorConferenciaValido(campos.valorRecebido);
  const contado = informouValor ? dinheiro(Number(campos.valorRecebido)) : null;

  if (!modoRecusa.value) {
    const tipoMovimento = ehCaixaParaCofre.value ? "sangria" : "transferencia";
    const resumo = [
      `Total enviado: ${declarado}`,
      `Dinheiro fisico: ${dinheiro(Number(operacao.valorEspecieDeclarado ?? 0))}`,
      `Moedas: ${dinheiro(Number(operacao.valorMoedasDeclarado ?? 0))}`,
      `Data do movimento: ${formatarDataSomenteDia(operacao.dataReferencia)}`,
      `Registrado em: ${operacao.criadoEm ? formatarDataHora(operacao.criadoEm) : "-"}`,
      `Feito por: ${operacao.criadoPorNome || "Nao informado"}`,
      `Lacre do malote: ${operacao.nLacreDoc || "Sem lacre"}`,
      `Origem -> destino: ${operacao.contaOrigemNome || "-"} -> ${destino}`
    ];
    if (contado) {
      resumo.push(`Valor conferido: ${contado}`);
      resumo.push(
        `Conferencia: dinheiro ${dinheiro(Number(campos.valorEspecieContado || 0))} · moedas ${dinheiro(Number(campos.valorMoedasContado || 0))}`
      );
    }
    return {
      titulo: "Confirmar recebimento",
      mensagem: `${resumo.join("\n")}\n\nConfirma o recebimento desta ${tipoMovimento}?`,
      botao: "Confirmar recebimento"
    };
  }

  if (!encerrarDivergencia.value) {
    return {
      titulo: "Registrar divergência",
      mensagem:
        "Confirma registrar a divergência? A transferência continuará pendente e o fechamento do Caixa seguirá travado.",
      botao: "Registrar divergência"
    };
  }

  if (contadoAcimaDoDeclarado.value) {
    const sobra = dinheiro(Number(campos.valorRecebido) - Number(operacao.valorOriginal));
    return {
      titulo: "Encerrar divergência com sobra",
      mensagem: `Confirma encerrar a divergência? ${destino} receberá ${contado}, ${sobra} a mais que os ${declarado} declarados, sem criar quebra.`,
      botao: "Encerrar divergência"
    };
  }

  if (Number(campos.valorRecebido) === Number(operacao.valorOriginal)) {
    return {
      titulo: "Encerrar divergência",
      mensagem: `Confirma encerrar a divergência? ${destino} receberá os ${contado} contados; não haverá quebra financeira.`,
      botao: "Encerrar divergência"
    };
  }

  return {
    titulo: "Encerrar divergência",
    mensagem: `Confirma encerrar a divergência? ${destino} receberá ${contado}; a diferença para ${declarado} será registrada como quebra auditada.`,
    botao: "Encerrar divergência"
  };
}

// Voltar para "Conferir" desfaz a ESCOLHA de encerrar, e nao so esconde a caixa: escolha que
// sobrevive escondida e a origem de botao travado sem causa visivel.
function alternarModoRecusa() {
  modoRecusa.value = !modoRecusa.value;
  encerrarDivergencia.value = false;
  sobraConfirmada.value = false;
}
// "Nao bateu" so existe onde a rota de recusa existe. Na generica ela responde 404.
const podeRecusar = computed(() => ehCaixaParaCofre.value);

async function enviarConferencia() {
  const operacao = confirmando.value;
  if (!operacao || salvandoConferencia.value) return;
  if (
    valorPendente.value ||
    composicaoPendente.value ||
    composicaoInvalida.value ||
    (!modoRecusa.value && valorDivergenteNaConferencia.value)
  )
    return;
  if (modoRecusa.value && (!podeRecusar.value || !motivoValido.value)) return;
  if (sobraPendenteDeConsentimento.value) return;

  const confirmacao = textoConfirmacaoConferencia(operacao);
  if (!(await confirmarAcao(confirmacao.mensagem, confirmacao.titulo, confirmacao.botao))) return;

  erroConferencia.value = "";
  salvandoConferencia.value = true;
  try {
    // Duas rotas distintas de proposito: a recusa precisa ser COMMITADA com motivo, e por isso
    // nao e um desfecho do `/confirmar`.
    const rota = modoRecusa.value ? "recusar-conferencia" : "confirmar";
    const corpo = modoRecusa.value
      ? montarPayloadRecusa(campos, operacao.contaDestinoId ?? "", {
          encerrar: encerrarDivergencia.value,
          sobraConfirmada: sobraConfirmada.value
        })
      : montarPayloadConfirmacao(campos, operacao.contaDestinoId ?? "", ehCaixaParaCofre.value);
    await apiPost(`/api/transferencias/${operacao.id}/${rota}`, corpo);
    if (!modoRecusa.value) {
      emit("notificar", "Recebimento confirmado.");
    } else if (encerrarDivergencia.value) {
      emit("notificar", "Divergência encerrada e registrada.");
    } else {
      emit("notificar", "Divergência registrada; a entrega continua pendente.", "warning");
    }
    fecharConferencia();
    emit("recarregar");
  } catch (error) {
    erroConferencia.value = error instanceof Error ? error.message : "Falha ao conferir";
  } finally {
    salvandoConferencia.value = false;
  }
}

const rotulosStatus: Record<StatusTransferencia, string> = {
  pendente: "Pendente",
  recebido: "Recebido",
  agendada: "Agendada",
  cancelada: "Cancelada",
  divergente: "Divergente"
};
const opcoesStatus = [
  { title: "Todos os status", value: "" },
  ...statusTransferenciaSchema.options.map((status) => ({ title: rotulosStatus[status], value: status }))
];

function atualizarStatusFiltro(status: unknown) {
  const resultado = statusTransferenciaSchema.safeParse(status);
  emit("update:status-filtro", resultado.success ? resultado.data : "");
}
</script>

<template>
  <div class="tesouraria">
    <AppCabecalhoTela :titulo="telaAtual?.titulo ?? 'Tesouraria'">
      <template #subtitulo>
        Acompanhe o dinheiro em trânsito entre cofre, caixas e banco.
        <span class="tes-count"
          >{{ totalOperacoes }} registro{{ totalOperacoes === 1 ? "" : "s" }} encontrado{{
            totalOperacoes === 1 ? "" : "s"
          }}</span
        >
      </template>
    </AppCabecalhoTela>

    <v-card class="tes-list-card" rounded="lg" elevation="1">
      <TransferenciasFiltros
        :status="statusFiltro"
        :filtros="filtrosTransferencias"
        :opcoes-status="opcoesStatus"
        :pdvs="pdvs"
        :contas="contas"
        @update:status="atualizarStatusFiltro"
        @update:filtros="emit('update:filtros-transferencias', $event)"
      />
      <TransferenciasLista
        :operacoes="operacoesPaginadas"
        :total-operacoes="totalOperacoes"
        :pagina="pagina"
        :total-paginas="totalPaginas"
        :pode-editar="podeEditar"
        :pode-cancelar-planejamento="podeCancelarPlanejamento"
        :salvando="salvando"
        @editar="emit('editar', $event)"
        @cancelar-planejamento="cancelandoPlanejamento = $event"
        @update:pagina="emit('update:pagina', $event)"
      />
    </v-card>

    <v-dialog
      :model-value="Boolean(confirmando)"
      max-width="480"
      persistent
      no-click-animation
      @update:model-value="(v) => !v && fecharConferencia()"
    >
      <v-card class="pa-4 tes-conferencia-card">
        <v-card-title class="tes-conferencia-card__title">
          <span>{{ tituloConferencia }}</span>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            aria-label="Fechar conferência"
            @click="fecharConferencia"
          />
        </v-card-title>
        <section v-if="confirmando && !modoRecusa" class="tes-conferencia-resumo" data-teste="conferencia-resumo">
          <div class="tes-conferencia-resumo__titulo">Resumo da sangria — confira antes de aceitar</div>
          <div class="tes-conferencia-resumo__linha">
            <span>Total enviado</span><strong>{{ dinheiro(Number(confirmando.valorOriginal)) }}</strong>
          </div>
          <div class="tes-conferencia-resumo__linha">
            <span>Dinheiro fisico</span><strong>{{ dinheiro(Number(confirmando.valorEspecieDeclarado ?? 0)) }}</strong>
          </div>
          <div class="tes-conferencia-resumo__linha">
            <span>Moedas</span><strong>{{ dinheiro(Number(confirmando.valorMoedasDeclarado ?? 0)) }}</strong>
          </div>
          <div class="tes-conferencia-resumo__linha">
            <span>Data e hora</span
            ><strong
              >{{ formatarDataSomenteDia(confirmando.dataReferencia) }} ·
              {{ confirmando.criadoEm ? formatarDataHora(confirmando.criadoEm) : "-" }}</strong
            >
          </div>
          <div class="tes-conferencia-resumo__linha">
            <span>Feito por</span><strong>{{ confirmando.criadoPorNome || "Nao informado" }}</strong>
          </div>
          <div class="tes-conferencia-resumo__linha">
            <span>Lacre do malote</span><strong>{{ confirmando.nLacreDoc || "Sem lacre" }}</strong>
          </div>
          <div class="tes-conferencia-resumo__rota">
            {{ confirmando.contaOrigemNome || "-" }} -> {{ confirmando.contaDestinoNome || "-" }}
          </div>
          <div class="tes-conferencia-resumo__linha" data-teste="conferencia-observacao">
            <span>Observação</span><strong>{{ confirmando.observacao?.trim() || "Sem observação" }}</strong>
          </div>
        </section>
        <section v-if="confirmando?.ehCaixaParaCofre" class="tes-fechamento-resumo" aria-label="Fechamento do caixa">
          <div class="tes-fechamento-resumo__titulo">Fechamento do caixa — conferência separada</div>
          <v-progress-linear v-if="carregandoFechamento" indeterminate aria-label="Carregando fechamento" />
          <v-alert v-else-if="erroFechamento && !fechamentoConferencia" type="info" variant="tonal" density="compact">
            {{ erroFechamento }} Os dados do fechamento aparecerão quando o operador concluir o caixa.
          </v-alert>
          <v-alert
            v-else-if="fechamentoConferencia && !fechamentoFoiConcluido"
            type="info"
            variant="tonal"
            density="compact"
          >
            O Caixa ainda está aberto. Esta conferência é somente da sangria; o resumo do fechamento será liberado
            quando o operador concluir o turno.
          </v-alert>
          <div
            v-else-if="fechamentoConferencia && fechamentoFoiConcluido"
            class="tes-fechamento-resumo__grid"
            data-teste="fechamento-resumo"
          >
            <div>
              <span>Valor declarado no fechamento</span><strong>{{ dinheiro(valorFechamentoConferencia ?? 0) }}</strong>
            </div>
            <div>
              <span>Dinheiro físico</span
              ><strong>{{ dinheiro(fechamentoConferencia.valorEspecieFechamento ?? 0) }}</strong>
            </div>
            <div>
              <span>Moedas</span><strong>{{ dinheiro(fechamentoConferencia.valorMoedasFechamento ?? 0) }}</strong>
            </div>
            <div>
              <span>Lacre usado no fechamento</span
              ><strong>{{ fechamentoConferencia.lacreFechamento || "Não informado" }}</strong>
            </div>
            <div>
              <span>Operador do caixa</span
              ><strong>{{
                fechamentoConferencia.usuarioCaixaNome || fechamentoConferencia.colaboradorNome || "Não informado"
              }}</strong>
            </div>
            <div>
              <span>Responsável</span
              ><strong>{{ fechamentoConferencia.caixaResponsavelNomeFechamento || "Não informado" }}</strong>
            </div>
            <div>
              <span>Supervisor</span
              ><strong>{{ fechamentoConferencia.supervisorResponsavelNomeFechamento || "Não informado" }}</strong>
            </div>
            <div>
              <span>Fechado por</span><strong>{{ fechamentoConferencia.fechadoPorNome || "Não informado" }}</strong>
            </div>
            <div>
              <span>Data e hora</span
              ><strong>{{
                fechamentoConferencia.dataHoraFechamento
                  ? formatarDataHora(fechamentoConferencia.dataHoraFechamento)
                  : "Ainda aberto"
              }}</strong>
            </div>
            <div v-if="fechamentoConferencia.observacao" class="tes-fechamento-resumo__observacao">
              <span>Observação do fechamento</span><strong>{{ fechamentoConferencia.observacao }}</strong>
            </div>
          </div>
        </section>
        <section
          v-if="confirmando?.ehCaixaParaCofre"
          aria-label="Anexos do fechamento"
          data-teste="conferencia-anexos"
          class="tes-anexos"
        >
          <details>
            <summary>
              <span>Anexos do fechamento</span>
              <small>{{
                anexosConferencia.length
                  ? `${anexosConferencia.length} arquivo(s) disponível(is)`
                  : "Nenhum arquivo anexado"
              }}</small>
            </summary>
            <v-progress-linear v-if="carregandoAnexos" indeterminate aria-label="Carregando anexos" />
            <v-alert v-else-if="erroAnexos" type="warning" variant="tonal" density="compact">{{ erroAnexos }}</v-alert>
            <template v-else>
              <div class="text-body-2 mb-1">Folha de fechamento ({{ folhasConferencia.length }})</div>
              <a
                v-for="anexo in folhasConferencia"
                :key="anexo.id"
                :href="`${apiUrl}/api/transferencias/${confirmando.id}/anexos-fechamento/${anexo.id}`"
                target="_blank"
                rel="noopener noreferrer"
                class="tes-anexo-link"
                @click="
                  abrirAnexoPreview(anexo);
                  anexo.mimeType?.startsWith('image/') && $event.preventDefault();
                "
                >{{ anexo.nomeOriginal }}</a
              >
              <div class="text-body-2 mt-2 mb-1">Comprovantes de cartão ({{ cartoesConferencia.length }})</div>
              <a
                v-for="anexo in cartoesConferencia"
                :key="anexo.id"
                :href="`${apiUrl}/api/transferencias/${confirmando.id}/anexos-fechamento/${anexo.id}`"
                target="_blank"
                rel="noopener noreferrer"
                class="tes-anexo-link"
                @click="
                  abrirAnexoPreview(anexo);
                  anexo.mimeType?.startsWith('image/') && $event.preventDefault();
                "
                >{{ anexo.nomeOriginal }}</a
              >
              <p v-if="!anexosConferencia.length" class="text-body-2 mb-2">
                Nenhum anexo enviado ao fechamento deste caixa até agora.
              </p>
            </template>
          </details>
        </section>
        <v-text-field
          v-if="ehCaixaParaCofre"
          :model-value="confirmando?.contaDestinoNome || 'Conta de destino'"
          label="Conta que recebe"
          readonly
          data-teste="conferencia-conta"
        />
        <v-text-field
          v-else
          v-model="campos.contaDestinoId"
          label="ID da conta que recebeu (vazio = conta de destino)"
          data-teste="conferencia-conta"
        />
        <!-- R-026: movimento pode nao ter lacre. Vazio vira `null` no payload — nunca string
             vazia, que o schema recusaria e deixaria a conferencia impossivel. -->
        <v-text-field
          v-model="campos.lacre"
          class="mb-2"
          :label="entregaTemLacre ? 'Nº do lacre (obrigatório para esta entrega)' : 'Nº do lacre (vazio se não houver)'"
          :error="lacrePendente"
          :messages="lacrePendente ? 'Confira e informe o lacre registrado na entrega ou use Não bateu.' : undefined"
          data-teste="conferencia-lacre"
        />
        <!-- Decisao 5: no Caixa -> Cofre o valor contado e obrigatorio (0 e valido). Na generica
             ele continua opcional, e vazio significa "nao informei" — o payload omite o campo. -->
        <v-text-field
          v-model="campos.valorRecebido"
          class="mb-2"
          type="number"
          min="0"
          :label="ehCaixaParaCofre ? 'Valor recebido (obrigatório)' : 'Valor recebido (opcional)'"
          :error="valorPendente || valorDivergenteNaConferencia"
          :messages="
            valorDivergenteNaConferencia
              ? 'O valor contado é diferente do declarado. Use Não bateu para registrar a divergência.'
              : ehCaixaParaCofre
                ? 'Informe o valor contado. Zero é um valor válido.'
                : 'Deixe em branco se não for conferir o valor.'
          "
          data-teste="conferencia-valor"
        />
        <v-alert v-if="ehCaixaParaCofre" type="info" variant="tonal" density="compact" class="mb-2">
          Declarado no malote: dinheiro {{ dinheiro(Number(confirmando?.valorEspecieDeclarado ?? 0)) }} · moedas
          {{ dinheiro(Number(confirmando?.valorMoedasDeclarado ?? 0)) }}.
        </v-alert>
        <v-row v-if="ehCaixaParaCofre" dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="campos.valorEspecieContado"
              type="number"
              min="0"
              label="Dinheiro físico contado (obrigatório)"
              :error="composicaoPendente || composicaoInvalida"
              data-teste="conferencia-especie"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="campos.valorMoedasContado"
              type="number"
              min="0"
              label="Moedas contadas (obrigatório)"
              :error="composicaoPendente || composicaoInvalida"
              data-teste="conferencia-moedas"
            />
          </v-col>
        </v-row>
        <div v-if="ehCaixaParaCofre && (composicaoPendente || composicaoInvalida)" class="text-caption text-error mb-2">
          Informe dinheiro e moedas; a soma deve ser igual ao valor recebido.
        </div>
        <v-text-field
          v-if="modoRecusa"
          v-model="campos.motivo"
          label="Motivo da divergência (obrigatório)"
          :error="!motivoValido"
          data-teste="conferencia-motivo"
        />
        <!-- R-183 · o desfecho e uma ESCOLHA, e ela precisa estar aqui: sem encerrar, o caixa de
             onde o dinheiro saiu continua travado. -->
        <v-checkbox
          v-if="modoRecusa"
          v-model="encerrarDivergencia"
          density="compact"
          hide-details
          class="mb-1"
          data-teste="conferencia-encerrar"
          label="Encerrar a divergência agora (libera o fechamento do caixa)"
        />
        <v-checkbox
          v-if="modoRecusa && encerrarDivergencia && contadoAcimaDoDeclarado"
          v-model="sobraConfirmada"
          density="compact"
          hide-details
          class="mb-1"
          data-teste="conferencia-sobra"
          label="Confirmo que contei MAIS do que foi declarado"
        />
        <v-alert
          v-if="modoRecusa && !encerrarDivergencia"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-2"
        >
          A transferência continua <strong>pendente</strong> e o caixa segue travado. A divergência fica registrada e o
          operador e a Tesouraria são notificados.
        </v-alert>
        <v-alert v-if="modoRecusa && encerrarDivergencia" type="info" variant="tonal" density="compact" class="mb-2">
          A conta destino recebe <strong>o valor contado</strong>. Se faltou, a diferença vira quebra no nome de quem
          entregou — e ela não tem volta. Se sobrou, a conta recebe a mais e não há quebra.
        </v-alert>
        <v-alert v-if="erroConferencia" type="error" variant="tonal" density="compact">{{ erroConferencia }}</v-alert>
        <v-card-actions class="flex-wrap ga-2">
          <!-- "Nao bateu" so aparece onde a rota de recusa existe: na generica ela responde 404. -->
          <v-btn v-if="podeRecusar" variant="text" data-teste="conferencia-alternar" @click="alternarModoRecusa">
            {{ modoRecusa ? "Voltar a conferir" : "Não bateu" }}
          </v-btn>
          <v-spacer />
          <v-btn :disabled="salvandoConferencia" @click="fecharConferencia()">Fechar</v-btn>
          <v-btn
            :color="modoRecusa ? 'warning' : 'primary'"
            :disabled="
              valorPendente ||
              composicaoPendente ||
              composicaoInvalida ||
              valorDivergenteNaConferencia ||
              lacrePendente ||
              (modoRecusa && !motivoValido) ||
              sobraPendenteDeConsentimento ||
              salvandoConferencia
            "
            :loading="salvandoConferencia"
            data-teste="conferencia-enviar"
            @click="enviarConferencia"
          >
            {{ modoRecusa ? (encerrarDivergencia ? "Encerrar divergência" : "Registrar divergência") : "Confirmar" }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      :model-value="Boolean(previewAnexo)"
      max-width="760"
      @update:model-value="(v) => !v && fecharAnexoPreview()"
    >
      <v-card v-if="previewAnexo" class="tes-preview-card">
        <v-card-title class="d-flex align-center justify-space-between">
          <span class="text-truncate">{{ previewAnexo.nomeOriginal }}</span>
          <v-btn icon="mdi-close" variant="text" aria-label="Fechar prévia" @click="fecharAnexoPreview" />
        </v-card-title>
        <v-card-text class="tes-preview-body">
          <img
            :src="`${apiUrl}/api/transferencias/${confirmando?.id}/anexos-fechamento/${previewAnexo.id}`"
            :alt="previewAnexo.nomeOriginal"
            class="tes-preview-img"
            :style="{ transform: `rotate(${rotacaoPreview}deg)` }"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn
            variant="outlined"
            prepend-icon="mdi-rotate-left"
            @click="rotacaoPreview = (rotacaoPreview + 270) % 360"
            >Virar à esquerda</v-btn
          >
          <v-btn
            variant="outlined"
            prepend-icon="mdi-rotate-right"
            @click="rotacaoPreview = (rotacaoPreview + 90) % 360"
            >Virar à direita</v-btn
          >
          <v-btn variant="text" @click="fecharAnexoPreview">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <CancelarPlanejamentoRetornoDialog
      :model-value="Boolean(cancelandoPlanejamento)"
      :operacao="cancelandoPlanejamento"
      :salvando="salvando"
      @update:model-value="(aberto: boolean) => !aberto && (cancelandoPlanejamento = null)"
      @confirmar="emit('cancelarPlanejamento', $event)"
    />
  </div>
</template>

<style scoped>
.tesouraria {
  display: grid;
  gap: 18px;
}

/* `--cat-transferencias-tinta` e nao `-strong`, e sao as QUATRO ocorrencias do arquivo, nao uma.
   O `-strong` NAO tem contraparte no tema escuro: o bloco `:root[data-theme="dark"]` redefine so
   `-soft` e `-tinta` de cada categoria. Medido, sobre o canvas:
     -strong #bb460a   claro 4,86  ·  escuro 3,54   <- reprovava no escuro
     -tinta            claro 7,05  ·  escuro 8,35
   Trocar so o `.tes-count` consertaria o numero e deixaria as outras tres divergindo dentro do
   mesmo arquivo, entao vao as quatro. O fallback `#9a3412` saiu junto: fallback de hex existe para
   quando o token pode faltar, e este nao pode — se faltar, o defeito e o token, e ele tem de
   aparecer.
   NAO foi criado `--cat-*-strong` no bloco escuro: isso e camada de token (69 §1.1), afeta as seis
   categorias de uma vez, e o guardiao ainda nao alcanca o `:root`. Fica registrado como divida de
   sistema no roteiro. */
.tes-count {
  display: inline-block;
  margin-left: 4px;
  font-weight: 700;
  color: var(--cat-transferencias-tinta);
}
.tes-list-card {
  overflow: hidden;
}

.tes-conferencia-resumo {
  display: grid;
  gap: 5px;
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--cat-transferencias-base, #c2410c) 35%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--cx-surface-raised) 90%, var(--cat-transferencias-base, #fb4b0b));
  color: var(--cx-ink);
  font-size: 12px;
}
.tes-conferencia-card {
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}
.tes-conferencia-card__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 0 12px;
  color: var(--cx-ink);
  font-size: 20px;
  font-weight: 800;
}
.tes-conferencia-card :deep(.v-card-actions) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.tes-conferencia-card :deep(.v-card-actions .v-btn) {
  max-width: 100%;
  white-space: normal;
}
.tes-conferencia-resumo__titulo {
  margin-bottom: 3px;
  color: var(--cat-transferencias-tinta, #9a3412);
  font-size: 13px;
  font-weight: 800;
}
.tes-conferencia-resumo__linha {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.tes-conferencia-resumo__linha span {
  color: var(--cx-ink-soft);
}
.tes-conferencia-resumo__linha strong {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--cx-ink);
  overflow-wrap: anywhere;
}
.tes-conferencia-resumo__rota {
  margin-top: 3px;
  padding-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--cat-transferencias-base, #c2410c) 22%, transparent);
  font-weight: 700;
}
.tes-fechamento-resumo {
  display: grid;
  gap: 8px;
  margin: 0 0 12px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--cat-transferencias-base, #fb4b0b) 42%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--cx-surface-raised) 94%, var(--cat-transferencias-base, #fb4b0b));
  color: var(--cx-ink);
}
.tes-fechamento-resumo__titulo {
  color: var(--cat-transferencias-tinta, #9a3412);
  font-size: 13px;
  font-weight: 800;
}
.tes-fechamento-resumo__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 12px;
  font-size: 12px;
}
.tes-fechamento-resumo__grid > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.tes-fechamento-resumo__grid span {
  color: var(--cx-ink-soft);
}
.tes-fechamento-resumo__grid strong {
  color: var(--cx-ink);
  overflow-wrap: anywhere;
}
.tes-fechamento-resumo__observacao {
  grid-column: 1 / -1;
  border-top: 1px solid color-mix(in srgb, var(--cat-transferencias-base, #fb4b0b) 22%, transparent);
  padding-top: 6px;
}
.tes-anexos {
  margin: 0 0 12px;
  color: var(--cx-ink);
}
.tes-anexos details {
  border: 1px solid color-mix(in srgb, var(--cx-ink-soft) 28%, transparent);
  border-radius: 9px;
  padding: 8px 10px;
}
.tes-anexos summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  color: var(--cx-ink);
  font-size: 13px;
  font-weight: 700;
  list-style: none;
}
.tes-anexos summary::-webkit-details-marker {
  display: none;
}
.tes-anexos summary::after {
  content: "⌄";
  color: var(--cat-transferencias-base, #fb4b0b);
  font-size: 18px;
  transition: transform 0.15s ease;
}
.tes-anexos details[open] summary::after {
  transform: rotate(180deg);
}
.tes-anexos summary small {
  margin-left: auto;
  color: var(--cx-ink-soft);
  font-size: 11px;
  font-weight: 500;
}
.tes-anexo-link {
  display: block;
  margin: 7px 0;
  color: var(--cat-transferencias-base, #fb4b0b);
  overflow-wrap: anywhere;
  text-decoration: underline;
}
.tes-preview-body {
  display: grid;
  min-height: 260px;
  place-items: center;
  overflow: auto;
  background: #111820;
}
.tes-preview-img {
  max-width: 100%;
  max-height: 62vh;
  object-fit: contain;
  transition: transform 0.2s ease;
}
.tes-preview-card {
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}

/* ---- Responsivo (breakpoints do projeto) ---- */
@media (width <= 1024px) {
  .tes-row {
    grid-template-columns: 108px 76px 92px minmax(0, 1fr) 104px 96px;
  }
  /* Usuário, lacre e recebimento ficam compactos para preservar a densidade. */
  .tes-row-head > :nth-child(4),
  .tes-row-head > :nth-child(6),
  .tes-row-head > :nth-child(8),
  .tes-usuario,
  .tes-lacre,
  .tes-receb {
    display: none;
  }
}
@media (width <= 768px) {
  .tes-filtros {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 14px 12px 12px;
  }
  .tes-cards {
    grid-template-columns: 1fr;
  }
  .tes-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "desc valor"
      "meta acoes";
    row-gap: 4px;
  }
  .tes-row-head {
    display: none;
  }
  .tes-conf {
    grid-area: meta;
    display: inline-flex;
  }
  .tes-data {
    display: none;
  }
  .tes-row > [data-col="PDV"] {
    display: none;
  }
  .tes-row > [data-col="Criado por"] {
    display: none;
  }
  .tes-fechamento-resumo__grid {
    grid-template-columns: 1fr;
  }
  .tes-fechamento-resumo__observacao {
    grid-column: auto;
  }
  .tes-anexos summary {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .tes-anexos summary small {
    flex-basis: 100%;
    margin-left: 0;
  }
  .tes-conferencia-card {
    padding: 14px !important;
  }
  .tes-conferencia-card__title {
    font-size: 18px;
  }
  .tes-conferencia-card :deep(.v-spacer) {
    display: none;
  }
  .tes-conferencia-card :deep(.v-card-actions) {
    justify-content: flex-end;
  }
  .tes-desc {
    grid-area: desc;
  }
  .tes-valor {
    grid-area: valor;
    justify-self: end;
    text-align: right;
  }
  .tes-acoes {
    grid-area: acoes;
  }
}
@media (width <= 560px) {
  .tes-filtros {
    grid-template-columns: 1fr;
  }
  .tes-nova {
    width: 100%;
  }
}
</style>
