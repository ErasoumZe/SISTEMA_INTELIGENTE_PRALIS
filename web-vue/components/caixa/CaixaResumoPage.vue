<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import type { CaixaStatus, Opcao, ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import CaixaCampanhasResumo from "~/components/caixa/CaixaCampanhasResumo.vue";
import CaixaResumoOperacao from "~/components/caixa/CaixaResumoOperacao.vue";
import CaixaUltimosLancamentosDialog from "~/components/caixa/CaixaUltimosLancamentosDialog.vue";
import CaixaVendasCanceladasDialog from "~/components/caixa/CaixaVendasCanceladasDialog.vue";
import CaixaVendasDoTurnoDialog from "~/components/caixa/CaixaVendasDoTurnoDialog.vue";
import CaixaCategoriaResumoDialog from "~/components/caixa/CaixaCategoriaResumoDialog.vue";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import CaixaFechamentoConfirmacaoDialog from "~/components/caixa/CaixaFechamentoConfirmacaoDialog.vue";
import CaixaSangriasDialog from "~/components/caixa/CaixaSangriasDialog.vue";
import CaixaFechamentoWizard from "~/components/caixa/CaixaFechamentoWizard.vue";
import CaixaAberturaConfirmacaoDialog from "~/components/caixa/CaixaAberturaConfirmacaoDialog.vue";
import CaixaIndisponibilidadeDialog from "~/components/caixa/CaixaIndisponibilidadeDialog.vue";
import CaixaInicioFechamentoDialog from "~/components/caixa/CaixaInicioFechamentoDialog.vue";
import { deCentavos, paraCentavos } from "@padaria/shared";
const { apiGet, apiPost } = useApi();
const route = useRoute();
const router = useRouter();

const props = defineProps<{
  resumo: ResumoCaixa | null;
  status: CaixaStatus | null;
  empresaId: string;
  pdvs: Opcao[];
  formasPagamento?: Opcao[];
  turnos?: Opcao[];
  maquininhas?: Opcao[];
  usuarioId: string;
  usuarioNome: string;
  salvando?: boolean;
}>();

const emit = defineEmits<{
  (
    event: "abrirCaixa",
    payload: {
      pdvId: string;
      usuarioCaixaId: string;
      turnoId?: string | null;
      maquininhaId: string;
      lacreAbertura: string;
      caixaResponsavelNome: string;
      supervisorResponsavelNome: string;
      valorEspecieContado?: number;
      valorMoedasContado?: number;
      observacaoDivergencia?: string | null;
      observacao: string | null;
      confirmadoPeloResumo?: true;
    }
  ): void;
  (event: "executarPlanejamento", payload: { caixaId: string; planejamentoId: string }): void;
  (
    event: "fecharCaixa",
    payload: {
      caixaId: string;
      observacao: string | null;
      lacreFechamento: string;
      caixaResponsavelNome: string;
      supervisorResponsavelNome: string;
      valorEspecieFechamento: number;
      valorMoedasFechamento: number;
      confirmadoPelaRevisao: true;
    }
  ): void;
  (event: "recarregar"): void;
}>();

const abertura = reactive({
  pdvId: "",
  turnoId: ""
});
// Campos auxiliares da abertura conforme a FOTO 5.
const aberturaExtra = reactive({
  numeroLacre: "",
  maquininhaId: "",
  valorEspecie: "",
  valorMoedas: "",
  conferenciaConfirmada: null as boolean | null,
  observacaoDivergencia: "",
  caixaResponsavelNome: "",
  supervisorResponsavelNome: ""
});
const fechamento = reactive({
  observacao: "",
  lacreFechamento: "",
  valorTotal: "",
  valorEspecie: "",
  valorMoedas: "",
  caixaResponsavelNome: "",
  supervisorResponsavelNome: ""
});
const folhaFechamentoEnviada = ref(false);
const anexosFechamento = ref<
  Array<{
    id: string;
    tipo: "folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare";
    nomeOriginal: string;
    relatorio: unknown;
  }>
>([]);
const revisaoFechamentoAberta = ref(false);
const confirmacaoInicioFechamentoAberta = ref(false);
const iniciandoFechamento = ref(false);
const erroInicioFechamento = ref("");
const maloteDeclarado = ref<{
  valor: number;
  valorEspecieDeclarado: number;
  valorMoedasDeclarado: number;
  lacresRetorno: Array<{ id: string; numero: string }>;
  lacreFechamento: { id: string; numero: string } | null;
} | null>(null);
const erroMalote = ref("");
const carregandoMalote = ref(false);
let consultaMaloteAtual = 0;
const modalSangriasAberto = ref(false);
const modalIndisponibilidadeAberto = ref(false);
const salvandoIndisponibilidade = ref(false);
const erroIndisponibilidade = ref("");
const confirmacaoAberturaAberta = ref(false);
const modalVendasCanceladasAberto = ref(false);
const modalVendasDoTurnoAberto = ref(false);
const modalCategoriaResumoAberto = ref(false);
const categoriaResumoSelecionada = ref<CardCategoria | null>(null);
const vendasCanceladasQuantidade = ref(0);
const lacresRetornoDisponiveis = ref<Array<{ id: string; numero: string }>>([]);
type CategoriaComUltimos = "despesas" | "mercadorias" | "retiradas";
const categoriaUltimosLancamentos = ref<CategoriaComUltimos | null>(null);

const caixaAberto = computed(() => props.status?.caixaAberto ?? null);
const pdvDesligado = computed(() => Boolean(props.status?.indisponibilidadeAberta));
const resumoAtual = computed(() => props.resumo ?? props.status?.resumo ?? null);
const detalhesCaixaVisiveis = ref(true);
const telaCompacta = ref(false);
let observadorTelaCompacta: MediaQueryList | null = null;

function atualizarTelaCompacta() {
  telaCompacta.value = observadorTelaCompacta?.matches ?? false;
  if (!telaCompacta.value) detalhesCaixaVisiveis.value = true;
}

onMounted(() => {
  observadorTelaCompacta = window.matchMedia?.("(max-width: 600px)") ?? null;
  atualizarTelaCompacta();
  if (telaCompacta.value) detalhesCaixaVisiveis.value = false;
  observadorTelaCompacta?.addEventListener("change", atualizarTelaCompacta);
});

onBeforeUnmount(() => observadorTelaCompacta?.removeEventListener("change", atualizarTelaCompacta));
watch(
  () => caixaAberto.value?.id,
  async (caixaId) => {
    if (!caixaId) {
      lacresRetornoDisponiveis.value = [];
      vendasCanceladasQuantidade.value = 0;
      return;
    }
    try {
      lacresRetornoDisponiveis.value = await apiGet<Array<{ id: string; numero: string }>>(
        `/api/caixa/${encodeURIComponent(caixaId)}/lacres-retorno`
      );
    } catch {
      lacresRetornoDisponiveis.value = [];
    }
    try {
      const vendasCanceladas = await apiGet<Array<{ id: string }>>(
        `/api/caixa/${encodeURIComponent(caixaId)}/vendas-canceladas`
      );
      vendasCanceladasQuantidade.value = vendasCanceladas.length;
    } catch {
      vendasCanceladasQuantidade.value = 0;
    }
  },
  { immediate: true }
);
const saldoAtual = computed(() => Number(resumoAtual.value?.saldo ?? 0));
// D7: sobra e deficit sao situacoes DIFERENTES e precisam de tratamento visual diferente.
// A sobra nunca vira quebra positiva — ela volta ao cofre. O deficit vira quebra no nome do
// operador, e ele tem que saber disso ANTES de confirmar, nao por snackbar vermelho depois.
const temSobra = computed(() => saldoAtual.value > 0);
const temDeficit = computed(() => saldoAtual.value < 0);
const deficitAbsoluto = computed(() => Math.abs(saldoAtual.value));
// D7: observacao e obrigatoria quando ha quebra — a mesma regra do servidor, espelhada na tela
// para que o botao nao dispare um 400 previsivel.
const totalFechamentoContado = computed(() => Number(fechamento.valorTotal || 0));
const totalFechamentoPorComposicao = computed(
  () => Number(fechamento.valorEspecie || 0) + Number(fechamento.valorMoedas || 0)
);
const fechamentoComposicaoInformada = computed(
  () =>
    fechamento.valorTotal.trim() !== "" && fechamento.valorEspecie.trim() !== "" && fechamento.valorMoedas.trim() !== ""
);
const fechamentoComposicaoInvalida = computed(
  () =>
    fechamentoComposicaoInformada.value &&
    paraCentavos(totalFechamentoContado.value) !== paraCentavos(totalFechamentoPorComposicao.value)
);
const diferencaFechamento = computed(() => totalFechamentoContado.value - saldoAtual.value);
// Antes da contagem, os campos vazios são apenas "ainda não informado" — não R$ 0,00.
// A quebra e sua justificativa só existem depois que o caixa declarar espécie e moedas.
const fechamentoDivergente = computed(() => fechamentoComposicaoInformada.value && diferencaFechamento.value !== 0);
const fechamentoComQuebra = computed(() => fechamentoComposicaoInformada.value && diferencaFechamento.value < 0);
const observacaoObrigatoriaPendente = computed(() => fechamentoDivergente.value && !fechamento.observacao.trim());
const lacreFechamentoPendente = computed(() => !fechamento.lacreFechamento.trim());
const lacreFechamentoReservado = computed(() => props.status?.lacreFechamentoReservado ?? null);
const responsaveisFechamentoPendentes = computed(
  () => !fechamento.caixaResponsavelNome.trim() || !fechamento.supervisorResponsavelNome.trim()
);

// G1/R-171 · a trava vem do MESMO retrato que trouxe o saldo, e nao de uma regra recalculada aqui:
// o servidor continua sendo a autoridade, a tela so mostra a recusa dele antes do clique.
const entregasPendentes = computed(() => props.status?.entregasPendentes ?? []);
const planejamentosPendentes = computed(() => props.status?.planejamentosPendentes ?? []);
const totalPlanejadoCentavos = computed(() =>
  planejamentosPendentes.value.reduce((total, planejamento) => total + paraCentavos(planejamento.valor), 0)
);
const saldoLivre = computed(() =>
  deCentavos(Math.max(0, paraCentavos(saldoAtual.value) - totalPlanejadoCentavos.value))
);

// A trava ja existia na API desde a Fatia 1, mas o operador so a descobria clicando e levando 400.
// Uma computada, um motivo, e o botao para antes — sem uma segunda definicao da regra na tela.
const motivoTravado = computed(() => {
  if (planejamentosPendentes.value.length)
    return "há transferencia de retorno planejada aguardando execucao ou cancelamento";
  return null;
});
const fechamentoTravado = computed(() => motivoTravado.value !== null);
const etapaFechamento = computed(
  () => route.query.etapa === "fechamento" || caixaAberto.value?.status === "em_fechamento"
);
const maquininhasSelect = computed(() =>
  (props.maquininhas ?? []).map((item) => ({
    ...item,
    nome: `${item.apelido ?? item.nome} · ${item.numeroSerie ?? "sem série"}`
  }))
);
const pdvSelecionado = computed(() => props.pdvs.find((item) => item.id === abertura.pdvId));
const turnoSelecionado = computed(() => (props.turnos ?? []).find((item) => item.id === abertura.turnoId));
const maquininhaSelecionada = computed(() =>
  (props.maquininhas ?? []).find((item) => item.id === aberturaExtra.maquininhaId)
);
// A abertura registra a maquininha escolhida para o turno. O seletor usa os equipamentos já
// cadastrados na empresa; a integração de vendas/cartão continua independente desta escolha.
const exibirMaquininhaNaAbertura = true;

// Cockpit por categoria: a cor entra como ACENTO (barra/chip/total) via os tokens --cat-* da main,
// nunca como fundo de bloco. Os valores vem SEMPRE da API (nada recalculado no front). "Resultado"
// (saldo fisico) e o card-ancora. Sem card de deficit (fundo simples, PROJECT_BRAIN/12).
type CardCategoria = { chave: string; titulo: string; icone: string; valor: number; detalhe?: string; tom: string };
type CardFormaPagamento = {
  chave: string;
  titulo: string;
  icone: string;
  valor: number;
  quantidade: number;
};

const categorias = computed<CardCategoria[]>(() => {
  const r = resumoAtual.value;
  if (!r) return [];
  const entrada = r.totalTransferenciasEntrada ?? 0;
  const saida = r.totalTransferenciasSaida ?? 0;
  return [
    {
      chave: "entradas",
      titulo: "Entradas",
      icone: "mdi-arrow-down-bold-circle-outline",
      valor: r.totalEntradas,
      tom: "var(--cat-entradas-faixa)"
    },
    {
      chave: "transferencias",
      titulo: "Transferencias",
      icone: "mdi-bank-transfer",
      valor: entrada,
      detalhe: "De entrada",
      tom: "var(--cat-transferencias-faixa)"
    },
    {
      chave: "sangrias",
      titulo: "Sangrias",
      icone: "mdi-bank-transfer-out",
      valor: saida,
      detalhe: saida > 0 ? "Ver historico e lacres" : "Nenhuma sangria realizada",
      tom: "#9a5b00"
    },
    {
      chave: "despesas",
      titulo: "Despesas",
      icone: "mdi-cash-minus",
      valor: r.totalDespesas,
      tom: "var(--cat-despesas-faixa)"
    },
    {
      chave: "mercadorias",
      titulo: "Mercadorias",
      icone: "mdi-package-variant-closed",
      valor: r.totalMercadorias ?? 0,
      tom: "var(--cat-mercadorias-faixa)"
    },
    {
      chave: "retiradas",
      titulo: "Retiradas",
      icone: "mdi-cash-remove",
      valor: r.totalRetiradas,
      tom: "var(--cat-retiradas-faixa)"
    }
  ];
});

const formasPagamento = computed<CardFormaPagamento[]>(() =>
  (resumoAtual.value?.porFormaPagamento ?? []).map((item) => ({
    chave: item.formaPagamentoId ?? item.formaPagamento,
    titulo: item.formaPagamento,
    icone: iconeFormaPagamento(item.formaPagamento),
    valor: item.total,
    quantidade: item.quantidade
  }))
);

function nomeFormaPagamento(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function iconeFormaPagamento(nome: string) {
  const normalizado = nomeFormaPagamento(nome);
  if (normalizado.includes("pix")) return "mdi-qrcode";
  if (normalizado.includes("credito") || normalizado.includes("debito")) return "mdi-credit-card-outline";
  if (normalizado.includes("dinheiro") || normalizado.includes("especie")) return "mdi-cash";
  if (normalizado.includes("crediario")) return "mdi-account-clock-outline";
  if (normalizado.includes("voucher")) return "mdi-ticket-outline";
  if (normalizado.includes("furto") || normalizado.includes("desvio")) return "mdi-alert-outline";
  return "mdi-cash-multiple";
}

watch(
  () => props.pdvs,
  (pdvs) => {
    if (!abertura.pdvId && pdvs[0]?.id) abertura.pdvId = pdvs[0].id;
  },
  { immediate: true }
);

watch([() => abertura.pdvId, () => aberturaExtra.numeroLacre], async ([pdvId, lacre]) => {
  const consultaAtual = ++consultaMaloteAtual;
  maloteDeclarado.value = null;
  erroMalote.value = "";
  aberturaExtra.valorEspecie = "";
  aberturaExtra.valorMoedas = "";
  aberturaExtra.observacaoDivergencia = "";
  aberturaExtra.conferenciaConfirmada = null;
  if (!pdvId || !lacre.trim()) return;
  carregandoMalote.value = true;
  try {
    const malote = await apiGet<{
      valor: number;
      valorEspecieDeclarado: number;
      valorMoedasDeclarado: number;
      lacresRetorno: Array<{ id: string; numero: string }>;
      lacreFechamento: { id: string; numero: string } | null;
    }>(
      `/api/caixa/malote?empresaId=${encodeURIComponent(props.empresaId)}&pdvId=${encodeURIComponent(pdvId)}&lacre=${encodeURIComponent(lacre.trim())}`
    );
    if (consultaAtual !== consultaMaloteAtual) return;
    maloteDeclarado.value = malote;
  } catch (falha) {
    if (consultaAtual !== consultaMaloteAtual) return;
    erroMalote.value =
      falha instanceof Error && falha.message
        ? falha.message
        : "Nao foi possivel consultar o malote. Confira o lacre e tente novamente.";
  } finally {
    if (consultaAtual === consultaMaloteAtual) carregandoMalote.value = false;
  }
});

const aberturaComposicaoInformada = computed(
  () => aberturaExtra.valorEspecie.trim() !== "" && aberturaExtra.valorMoedas.trim() !== ""
);
const aberturaDivergente = computed(
  () =>
    aberturaExtra.conferenciaConfirmada === false &&
    Boolean(maloteDeclarado.value) &&
    aberturaComposicaoInformada.value &&
    (Number(aberturaExtra.valorEspecie || 0) !== maloteDeclarado.value!.valorEspecieDeclarado ||
      Number(aberturaExtra.valorMoedas || 0) !== maloteDeclarado.value!.valorMoedasDeclarado)
);
const aberturaComposicaoPendente = computed(() =>
  Boolean(
    aberturaExtra.numeroLacre.trim() &&
    maloteDeclarado.value &&
    aberturaExtra.conferenciaConfirmada === false &&
    !aberturaComposicaoInformada.value
  )
);
const observacaoAberturaPendente = computed(
  () => aberturaDivergente.value && !aberturaExtra.observacaoDivergencia.trim()
);
const lacreAberturaPendente = computed(() => !aberturaExtra.numeroLacre.trim());
const responsaveisAberturaPendentes = computed(
  () => !aberturaExtra.caixaResponsavelNome.trim() || !aberturaExtra.supervisorResponsavelNome.trim()
);
// O fechamento usa o relatório da maquininha que foi escolhida AQUI. Sem esse vínculo, o operador
// poderia trocar o equipamento no fim do turno e o relatório perderia a rastreabilidade do PDV.
const maquininhaAberturaPendente = computed(() => !aberturaExtra.maquininhaId);
const aberturaBloqueada = computed(
  () =>
    !abertura.pdvId ||
    lacreAberturaPendente.value ||
    responsaveisAberturaPendentes.value ||
    maquininhaAberturaPendente.value ||
    !maloteDeclarado.value ||
    carregandoMalote.value ||
    aberturaExtra.conferenciaConfirmada === null ||
    aberturaComposicaoPendente.value ||
    observacaoAberturaPendente.value
);

watch(
  () => caixaAberto.value?.id,
  (caixaId) => {
    if (!caixaId) return;

    // A abertura identifica o operador de origem; o fechamento pode ser feito por outra pessoa.
    // Só sugere o nome se o operador ainda não preencheu um valor próprio.
    if (!fechamento.caixaResponsavelNome.trim()) {
      fechamento.caixaResponsavelNome = caixaAberto.value?.caixaResponsavelNomeAbertura ?? "";
    }
    if (!fechamento.supervisorResponsavelNome.trim()) {
      fechamento.supervisorResponsavelNome = caixaAberto.value?.supervisorResponsavelNomeAbertura ?? "";
    }
  },
  { immediate: true }
);

function dadosAbertura() {
  return {
    pdvId: abertura.pdvId,
    usuarioCaixaId: props.usuarioId,
    turnoId: abertura.turnoId || null,
    maquininhaId: aberturaExtra.maquininhaId,
    lacreAbertura: aberturaExtra.numeroLacre.trim(),
    caixaResponsavelNome: aberturaExtra.caixaResponsavelNome.trim(),
    supervisorResponsavelNome: aberturaExtra.supervisorResponsavelNome.trim(),
    ...(aberturaExtra.conferenciaConfirmada === false
      ? {
          valorEspecieContado: Number(aberturaExtra.valorEspecie),
          valorMoedasContado: Number(aberturaExtra.valorMoedas),
          observacaoDivergencia: aberturaExtra.observacaoDivergencia || null
        }
      : {}),
    observacao: null
  };
}
function abrir() {
  if (aberturaBloqueada.value) return;
  confirmacaoAberturaAberta.value = true;
}
function confirmarAbertura() {
  confirmacaoAberturaAberta.value = false;
  emit("abrirCaixa", { ...dadosAbertura(), confirmadoPeloResumo: true });
}

async function registrarIndisponibilidade(payload: { motivos: string[]; motivoOutro: string | null }) {
  if (!caixaAberto.value || salvandoIndisponibilidade.value) return;
  salvandoIndisponibilidade.value = true;
  erroIndisponibilidade.value = "";
  try {
    await apiPost(`/api/caixa/${encodeURIComponent(caixaAberto.value.id)}/indisponibilidades`, payload);
    modalIndisponibilidadeAberto.value = false;
    emit("recarregar");
  } catch (erro) {
    erroIndisponibilidade.value =
      erro instanceof Error ? erro.message : "Não foi possível registrar a parada do computador.";
  } finally {
    salvandoIndisponibilidade.value = false;
  }
}

async function registrarRetornoIndisponibilidade() {
  if (!caixaAberto.value || salvandoIndisponibilidade.value) return;
  salvandoIndisponibilidade.value = true;
  erroIndisponibilidade.value = "";
  try {
    await apiPost(`/api/caixa/${encodeURIComponent(caixaAberto.value.id)}/indisponibilidades/retornar`, {});
    modalIndisponibilidadeAberto.value = false;
    emit("recarregar");
  } catch (erro) {
    erroIndisponibilidade.value =
      erro instanceof Error ? erro.message : "Não foi possível registrar o retorno do computador.";
  } finally {
    salvandoIndisponibilidade.value = false;
  }
}

function categoriaTemUltimos(chave: string): chave is CategoriaComUltimos {
  return chave === "despesas" || chave === "mercadorias" || chave === "retiradas";
}

function abrirUltimosLancamentos(chave: string, valor: number) {
  // Entradas sao as vendas do PDV no turno. Saldo tambem contem transferencias e outros movimentos,
  // entao a consulta de vendas pertence somente a este cartao.
  if (chave === "entradas") {
    modalVendasDoTurnoAberto.value = true;
    return;
  }
  if (chave === "sangrias") {
    modalSangriasAberto.value = true;
    return;
  }
  if (categoriaTemUltimos(chave) && valor !== 0) {
    categoriaUltimosLancamentos.value = chave;
    return;
  }
  const categoria = categorias.value.find((item) => item.chave === chave);
  if (!categoria) return;
  categoriaResumoSelecionada.value = {
    ...categoria,
    detalhe: categoria.detalhe || "Valor registrado no turno atual."
  };
  modalCategoriaResumoAberto.value = true;
}

function atualizarDialogUltimosLancamentos(aberto: boolean) {
  if (!aberto) categoriaUltimosLancamentos.value = null;
}

// D6: um unico ato. Se ainda ha sobra, o servidor devolve o restante ao cofre dentro da MESMA
// transacao do fechamento; se o saldo ja e zero, apenas fecha. Nao existe segundo botao.
function fechar() {
  const caixa = caixaAberto.value;
  if (fechamentoTravado.value) return;
  // Mesma guarda de duplo clique da entrega: fechar duas vezes nao pode nem chegar a sair da tela.
  if (
    !caixa ||
    props.salvando ||
    observacaoObrigatoriaPendente.value ||
    fechamentoComposicaoInvalida.value ||
    lacreFechamentoPendente.value ||
    responsaveisFechamentoPendentes.value ||
    !fechamentoComposicaoInformada.value ||
    !folhaFechamentoEnviada.value
  )
    return;
  revisaoFechamentoAberta.value = true;
}

function abrirEtapaFechamento() {
  erroInicioFechamento.value = "";
  confirmacaoInicioFechamentoAberta.value = true;
}

async function confirmarInicioFechamento() {
  if (!caixaAberto.value || iniciandoFechamento.value) return;
  iniciandoFechamento.value = true;
  erroInicioFechamento.value = "";
  try {
    await apiPost(`/api/caixa/${encodeURIComponent(caixaAberto.value.id)}/iniciar-fechamento`, {});
    confirmacaoInicioFechamentoAberta.value = false;
    await router.push({ query: { ...route.query, etapa: "fechamento" } });
    emit("recarregar");
  } catch (erro) {
    erroInicioFechamento.value = erro instanceof Error ? erro.message : "Não foi possível encerrar as vendas.";
  } finally {
    iniciandoFechamento.value = false;
  }
}

function confirmarFechamento() {
  const caixa = caixaAberto.value;
  if (!caixa || props.salvando) return;
  revisaoFechamentoAberta.value = false;
  emit("fecharCaixa", {
    caixaId: caixa.id,
    observacao: fechamento.observacao || null,
    lacreFechamento: fechamento.lacreFechamento.trim(),
    caixaResponsavelNome: fechamento.caixaResponsavelNome.trim(),
    supervisorResponsavelNome: fechamento.supervisorResponsavelNome.trim(),
    valorEspecieFechamento: Number(fechamento.valorEspecie || 0),
    valorMoedasFechamento: Number(fechamento.valorMoedas || 0),
    confirmadoPelaRevisao: true
  });
}
</script>

<template>
  <v-card>
    <!-- Titulo removido: o nome da tela ja e o cabecalho da pagina (VIS-10). -->
    <v-card-text>
      <v-alert v-if="!pdvs.length" type="warning" variant="tonal" class="mb-4">
        Cadastre um PDV com conta vinculada antes de abrir caixa.
      </v-alert>

      <!-- Abertura de Caixa fiel ao desenho do Rodrigo (FOTO 5): enxuta, 4 campos em 2x2. -->
      <template v-if="!caixaAberto">
        <v-row dense class="caixa-abertura-form">
          <v-col cols="12" md="6">
            <v-select v-model="abertura.pdvId" :items="pdvs" item-title="nome" item-value="id" label="Ponto de Venda" />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="abertura.turnoId"
              :items="turnos ?? []"
              item-title="nome"
              item-value="id"
              label="Turno"
              clearable
            />
          </v-col>
          <v-col cols="12">
            <v-text-field
              v-model="aberturaExtra.numeroLacre"
              label="Transf. Entrada / N° Lacre"
              placeholder="Ex.: 001"
              hint="Identifica o lacre do malote que trouxe o fundo ao caixa. Não é o lacre usado no fechamento."
              persistent-hint
              color="error"
              base-color="error"
              :error="lacreAberturaPendente"
              :error-messages="lacreAberturaPendente ? 'Informe o lacre para consultar e conferir o malote.' : ''"
              prepend-inner-icon="mdi-lock-alert-outline"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="aberturaExtra.caixaResponsavelNome"
              label="Caixa responsavel (obrigatorio)"
              placeholder="Digite o nome do responsavel pelo caixa"
              :error="!aberturaExtra.caixaResponsavelNome.trim()"
              :error-messages="!aberturaExtra.caixaResponsavelNome.trim() ? 'Informe o caixa responsavel.' : ''"
              prepend-inner-icon="mdi-account-cash-outline"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="aberturaExtra.supervisorResponsavelNome"
              label="Supervisor responsavel (obrigatorio)"
              placeholder="Digite o nome do supervisor"
              :error="!aberturaExtra.supervisorResponsavelNome.trim()"
              :error-messages="
                !aberturaExtra.supervisorResponsavelNome.trim() ? 'Informe o supervisor responsavel.' : ''
              "
              prepend-inner-icon="mdi-account-supervisor-outline"
              required
            />
          </v-col>
          <v-col v-if="aberturaExtra.numeroLacre" cols="12">
            <v-alert v-if="carregandoMalote" type="info" density="compact"
              >Consultando a composição declarada do malote…</v-alert
            >
            <v-alert v-else-if="maloteDeclarado" :type="aberturaDivergente ? 'warning' : 'success'" density="compact">
              Malote declarado: {{ dinheiro(maloteDeclarado.valor) }} — dinheiro
              {{ dinheiro(maloteDeclarado.valorEspecieDeclarado) }} e moedas
              {{ dinheiro(maloteDeclarado.valorMoedasDeclarado) }}.
              <span v-if="maloteDeclarado.lacresRetorno.length">
                {{ maloteDeclarado.lacresRetorno.length }} lacre(s) de retorno:
                {{ maloteDeclarado.lacresRetorno.map((lacre) => lacre.numero).join(", ") }}.
              </span>
              <span v-if="maloteDeclarado.lacreFechamento">
                Lacre reservado para fechar este caixa: <strong>{{ maloteDeclarado.lacreFechamento.numero }}</strong
                >. Mantenha-o aberto e digite esse número ao fechar.
              </span>
              <span v-if="aberturaDivergente">
                A contagem diverge; descreva o motivo para abrir com o valor contado.</span
              >
            </v-alert>
            <v-alert v-else-if="erroMalote" type="error" density="compact">{{ erroMalote }}</v-alert>
          </v-col>
          <template v-if="maloteDeclarado">
            <v-col cols="12">
              <div class="abertura-conferencia">
                <div class="abertura-conferencia__titulo">Conferência do malote recebido</div>
                <div class="abertura-conferencia__decisao">
                  <strong>Confira o fundo recebido contra o que a Tesouraria cadastrou para este lacre.</strong>
                  <div class="abertura-conferencia__esperado">
                    <span>Valor esperado pela Tesouraria</span>
                    <strong>{{ dinheiro(maloteDeclarado.valor) }}</strong>
                    <small>
                      Espécie {{ dinheiro(maloteDeclarado.valorEspecieDeclarado) }} · moedas
                      {{ dinheiro(maloteDeclarado.valorMoedasDeclarado) }}
                    </small>
                  </div>
                  <div class="abertura-conferencia__acoes">
                    <v-btn
                      color="success"
                      :variant="aberturaExtra.conferenciaConfirmada === true ? 'flat' : 'tonal'"
                      @click="aberturaExtra.conferenciaConfirmada = true"
                    >
                      Confirmar
                    </v-btn>
                    <v-btn
                      color="error"
                      :variant="aberturaExtra.conferenciaConfirmada === false ? 'flat' : 'outlined'"
                      @click="aberturaExtra.conferenciaConfirmada = false"
                    >
                      Não confirmar
                    </v-btn>
                  </div>
                  <small v-if="aberturaExtra.conferenciaConfirmada === true"
                    >Composição confirmada. Você pode abrir o caixa.</small
                  >
                  <small v-else-if="aberturaExtra.conferenciaConfirmada === false"
                    >Informe a contagem física encontrada.</small
                  >
                </div>
                <v-row v-if="aberturaExtra.conferenciaConfirmada === false" dense class="abertura-conferencia__campos">
                  <v-col cols="12" md="6">
                    <CampoDinheiro
                      v-model="aberturaExtra.valorEspecie"
                      label="Dinheiro físico contado (obrigatório)"
                      icone="mdi-cash"
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <CampoDinheiro
                      v-model="aberturaExtra.valorMoedas"
                      label="Moedas contadas (obrigatório)"
                      icone="mdi-circle-multiple-outline"
                    />
                  </v-col>
                  <v-col v-if="aberturaDivergente" cols="12">
                    <v-text-field
                      v-model="aberturaExtra.observacaoDivergencia"
                      label="Motivo da divergência"
                      :hint="
                        aberturaDivergente
                          ? 'Obrigatório: explique a diferença encontrada.'
                          : 'Preencha somente se a conferência divergir.'
                      "
                      :persistent-hint="aberturaDivergente"
                      :error="observacaoAberturaPendente"
                      :error-messages="
                        observacaoAberturaPendente ? 'Informe o motivo da divergência para continuar.' : ''
                      "
                      :required="aberturaDivergente"
                    />
                  </v-col>
                </v-row>
                <p v-if="aberturaComposicaoPendente" class="abertura-conferencia__erro mb-0">
                  Informe espécie e moedas contadas para conferir o malote.
                </p>
              </div>
            </v-col>
          </template>
          <v-col v-if="exibirMaquininhaNaAbertura" cols="12" md="6">
            <v-select
              v-model="aberturaExtra.maquininhaId"
              :items="maquininhasSelect"
              item-title="nome"
              item-value="id"
              label="Maq. Cartão / N° Série"
              hint="Obrigatória: será usada no relatório final deste turno."
              :error="maquininhaAberturaPendente"
              :error-messages="maquininhaAberturaPendente ? 'Selecione a maquininha do PDV.' : ''"
              required
            />
          </v-col>
        </v-row>

        <!-- R-184: o operador nao escolhe o instante. A API registra o relogio do servidor no
             clique; mostrar um datetime editavel aqui criava duas verdades para a abertura. -->
        <v-row dense class="mt-2">
          <v-col cols="12" md="6">
            <v-text-field
              model-value="Registrada automaticamente ao abrir"
              label="Data e hora de abertura"
              prepend-inner-icon="mdi-clock-check-outline"
              readonly
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field :model-value="usuarioNome" label="Usuário do caixa" readonly density="comfortable" />
          </v-col>
          <v-col cols="12">
            <v-btn
              color="primary"
              prepend-icon="mdi-cash-register"
              :loading="salvando"
              :disabled="aberturaBloqueada"
              @click="abrir"
            >
              Abrir caixa
            </v-btn>
            <div class="caixa-abertura__aviso" role="note">
              <v-icon icon="mdi-storefront-check-outline" />
              Abra o caixa somente quando estiver no PDV: a primeira venda já começa a contar neste turno.
            </div>
          </v-col>
        </v-row>
      </template>

      <CaixaAberturaConfirmacaoDialog
        v-model:aberto="confirmacaoAberturaAberta"
        :salvando="Boolean(salvando)"
        :pdv-nome="pdvSelecionado?.nome ?? 'Não informado'"
        :turno-nome="turnoSelecionado?.nome ?? ''"
        :lacre="aberturaExtra.numeroLacre"
        :caixa-responsavel="aberturaExtra.caixaResponsavelNome"
        :supervisor="aberturaExtra.supervisorResponsavelNome"
        :maquininha="maquininhaSelecionada?.apelido ?? maquininhaSelecionada?.numeroSerie ?? ''"
        data-hora-abertura="Registrada automaticamente ao confirmar"
        :valor-especie="
          aberturaExtra.conferenciaConfirmada === false
            ? Number(aberturaExtra.valorEspecie)
            : (maloteDeclarado?.valorEspecieDeclarado ?? 0)
        "
        :valor-moedas="
          aberturaExtra.conferenciaConfirmada === false
            ? Number(aberturaExtra.valorMoedas)
            : (maloteDeclarado?.valorMoedasDeclarado ?? 0)
        "
        :divergente="aberturaDivergente"
        :motivo-divergencia="aberturaExtra.observacaoDivergencia.trim()"
        @confirmar="confirmarAbertura"
      />

      <template v-if="caixaAberto">
        <section
          v-if="!etapaFechamento"
          class="caixa-pdv-desligado"
          :class="{ 'caixa-pdv-desligado--ativo': pdvDesligado }"
          aria-label="Controle de indisponibilidade do PDV"
        >
          <div>
            <span class="caixa-pdv-desligado__titulo">
              <v-icon :icon="pdvDesligado ? 'mdi-monitor-off' : 'mdi-monitor'" size="18" />
              {{ pdvDesligado ? "PDV DESLIGADO" : "PDV LIGADO" }}
            </span>
            <span class="caixa-pdv-desligado__descricao">
              {{
                pdvDesligado
                  ? `Parado em ${formatarDataHora(status?.indisponibilidadeAberta?.iniciadoEm ?? "")}`
                  : "Operação normal"
              }}
            </span>
          </div>
          <v-switch
            :model-value="pdvDesligado"
            :color="pdvDesligado ? '#ef4444' : '#a855f7'"
            :aria-label="
              status?.indisponibilidadeAberta ? 'Registrar que o computador voltou' : 'Registrar PDV desligado'
            "
            :loading="salvandoIndisponibilidade"
            hide-details
            inset
            readonly
            @click="
              erroIndisponibilidade = '';
              modalIndisponibilidadeAberto = true;
            "
          />
        </section>
        <CaixaFechamentoWizard
          v-if="etapaFechamento && caixaAberto"
          :caixa="caixaAberto"
          :resumo="resumoAtual"
          :fechamento="fechamento"
          :saldo-atual="saldoAtual"
          :tem-sobra="temSobra"
          :tem-deficit="temDeficit"
          :diferenca-fechamento="diferencaFechamento"
          :total-fechamento-contado="totalFechamentoContado"
          :fechamento-divergente="fechamentoDivergente"
          :fechamento-com-quebra="fechamentoComQuebra"
          :fechamento-composicao-informada="fechamentoComposicaoInformada"
          :fechamento-composicao-invalida="fechamentoComposicaoInvalida"
          :observacao-obrigatoria-pendente="observacaoObrigatoriaPendente"
          :lacre-fechamento-pendente="lacreFechamentoPendente"
          :responsaveis-fechamento-pendentes="responsaveisFechamentoPendentes"
          :lacre-fechamento-reservado="lacreFechamentoReservado"
          :planejamentos-pendentes="planejamentosPendentes"
          :entregas-pendentes="entregasPendentes"
          :saldo-livre="saldoLivre"
          :total-planejado-centavos="totalPlanejadoCentavos"
          :fechamento-travado="fechamentoTravado"
          :motivo-travado="motivoTravado"
          :folha-fechamento-enviada="folhaFechamentoEnviada"
          :salvando="salvando"
          @solicitar-fechamento="fechar"
          @executar-planejamento="emit('executarPlanejamento', $event)"
          @folha-enviada="folhaFechamentoEnviada = $event"
          @anexos-atualizados="anexosFechamento = $event"
        />

        <template v-else>
          <section class="caixa-status-aberto mb-4" aria-label="Informações do caixa aberto">
            <div class="caixa-status-aberto__titulo">
              <span class="caixa-status-aberto__icone"><v-icon icon="mdi-check" size="20" /></span>
              <div>
                <strong>Caixa aberto</strong>
                <span>Operação em andamento</span>
              </div>
              <v-btn
                class="caixa-status-aberto__alternar"
                size="small"
                variant="text"
                :append-icon="detalhesCaixaVisiveis ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                :aria-expanded="detalhesCaixaVisiveis"
                aria-controls="caixa-status-itens"
                @click="detalhesCaixaVisiveis = !detalhesCaixaVisiveis"
              >
                {{ detalhesCaixaVisiveis ? "Ocultar" : "Ver dados" }}
              </v-btn>
            </div>
            <dl
              id="caixa-status-itens"
              v-show="detalhesCaixaVisiveis || !telaCompacta"
              class="caixa-status-aberto__itens"
            >
              <div>
                <dt>PDV</dt>
                <dd>{{ caixaAberto.pdvNome }}</dd>
              </div>
              <div>
                <dt>Aberto em</dt>
                <dd>{{ formatarDataHora(caixaAberto.dataHoraAbertura) }}</dd>
              </div>
              <div v-if="caixaAberto.caixaResponsavelNomeAbertura">
                <dt>Responsável</dt>
                <dd>{{ caixaAberto.caixaResponsavelNomeAbertura }}</dd>
              </div>
              <div v-if="caixaAberto.supervisorResponsavelNomeAbertura">
                <dt>Supervisor</dt>
                <dd>{{ caixaAberto.supervisorResponsavelNomeAbertura }}</dd>
              </div>
              <div v-if="caixaAberto.maquininhaId">
                <dt>Maquininha</dt>
                <dd>{{ caixaAberto.maquininhaApelido }} · {{ caixaAberto.maquininhaNumeroSerie }}</dd>
              </div>
              <div v-if="lacresRetornoDisponiveis.length">
                <dt>Lacres para sangria</dt>
                <dd>{{ lacresRetornoDisponiveis.map((lacre) => lacre.numero).join(", ") }}</dd>
              </div>
              <div v-if="lacreFechamentoReservado">
                <dt>Lacre reservado</dt>
                <dd>{{ lacreFechamentoReservado }}</dd>
              </div>
            </dl>
          </section>

          <!-- Resumo compacto: os valores continuam vindo da API; cada linha apenas abre a consulta já existente. -->
          <CaixaResumoOperacao
            v-if="resumoAtual"
            :categorias="categorias"
            :formas-pagamento="formasPagamento"
            :saldo="resumoAtual.saldo"
            :caixa-id="caixaAberto.id"
            :vendas-canceladas-quantidade="vendasCanceladasQuantidade"
            @selecionar-categoria="abrirUltimosLancamentos"
            @ver-vendas-canceladas="modalVendasCanceladasAberto = true"
          />
          <v-divider class="my-5" />

          <!-- R-199: bloco SOMENTE LEITURA. Fica fora do fluxo de dinheiro da tela de proposito —
             nenhum numero daqui entra em saldo, total ou fechamento. -->
          <CaixaCampanhasResumo
            v-if="caixaAberto"
            :empresa-id="caixaAberto.empresaId"
            :pdv-id="caixaAberto.pdvId"
            :dia="caixaAberto.dataMovimento"
          />

          <section class="caixa-acao-fechamento" aria-label="Encerramento do caixa">
            <div>
              <h2>Encerrar turno</h2>
              <p>Confira os valores e continue para a etapa de fechamento.</p>
            </div>
            <v-btn
              color="error"
              variant="flat"
              prepend-icon="mdi-lock"
              data-teste="ir-fechamento"
              @click="abrirEtapaFechamento"
            >
              Fechar caixa
            </v-btn>
          </section>
        </template>

        <CaixaSangriasDialog
          v-if="caixaAberto"
          :aberto="modalSangriasAberto"
          :caixa-id="caixaAberto.id"
          @update:aberto="modalSangriasAberto = $event"
        />
        <CaixaIndisponibilidadeDialog
          :aberto="modalIndisponibilidadeAberto"
          :salvando="salvandoIndisponibilidade"
          :erro="erroIndisponibilidade"
          :indisponibilidade-aberta="status?.indisponibilidadeAberta ?? null"
          @update:aberto="modalIndisponibilidadeAberto = $event"
          @registrar="registrarIndisponibilidade"
          @retornar="registrarRetornoIndisponibilidade"
        />
        <CaixaVendasCanceladasDialog
          v-if="caixaAberto"
          :aberto="modalVendasCanceladasAberto"
          :caixa-id="caixaAberto.id"
          @update:aberto="modalVendasCanceladasAberto = $event"
        />
        <CaixaVendasDoTurnoDialog
          v-if="caixaAberto"
          :aberto="modalVendasDoTurnoAberto"
          :caixa-id="caixaAberto.id"
          :formas-pagamento="props.formasPagamento ?? []"
          :relatorio-fechamento="etapaFechamento"
          @update:aberto="modalVendasDoTurnoAberto = $event"
        />
        <CaixaCategoriaResumoDialog
          v-if="categoriaResumoSelecionada"
          :aberto="modalCategoriaResumoAberto"
          :titulo="categoriaResumoSelecionada.titulo"
          :icone="categoriaResumoSelecionada.icone"
          :valor="categoriaResumoSelecionada.valor"
          :detalhe="categoriaResumoSelecionada.detalhe"
          :tom="categoriaResumoSelecionada.tom"
          @update:aberto="modalCategoriaResumoAberto = $event"
        />
        <CaixaUltimosLancamentosDialog
          v-if="caixaAberto && categoriaUltimosLancamentos"
          :aberto="true"
          :caixa-id="caixaAberto.id"
          :empresa-id="empresaId"
          :categoria="categoriaUltimosLancamentos"
          @update:aberto="atualizarDialogUltimosLancamentos"
        />
        <CaixaFechamentoConfirmacaoDialog
          :aberto="revisaoFechamentoAberta"
          :saldo-esperado="saldoAtual"
          :observacao="fechamento.observacao"
          :lacre-fechamento="fechamento.lacreFechamento.trim()"
          :caixa-responsavel-nome="fechamento.caixaResponsavelNome.trim()"
          :supervisor-responsavel-nome="fechamento.supervisorResponsavelNome.trim()"
          :valor-total="Number(fechamento.valorTotal || 0)"
          :valor-especie="Number(fechamento.valorEspecie || 0)"
          :valor-moedas="Number(fechamento.valorMoedas || 0)"
          :anexos="anexosFechamento"
          @editar="revisaoFechamentoAberta = false"
          @confirmar="confirmarFechamento"
        />
        <CaixaInicioFechamentoDialog
          :aberto="confirmacaoInicioFechamentoAberta"
          :pdv-nome="caixaAberto?.pdvNome ?? ''"
          :salvando="iniciandoFechamento"
          :erro="erroInicioFechamento"
          @update:aberto="confirmacaoInicioFechamentoAberta = $event"
          @confirmar="confirmarInicioFechamento"
        />
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.abertura-conferencia {
  border: 1px solid rgb(var(--v-theme-primary));
  border-radius: 12px;
  padding: 16px;
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 7%, transparent);
}

/* Respiro moderado e constante: separa os grupos operacionais sem alongar a tela do PDV. */
.caixa-abertura-form > :deep(.v-col) {
  padding-top: 8px;
  padding-bottom: 8px;
}
.caixa-abertura__aviso {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  max-width: 560px;
  margin-top: 10px;
  color: var(--cx-ink-soft);
  font-size: 0.78rem;
  line-height: 1.35;
}
.caixa-abertura__aviso :deep(.v-icon) {
  flex: 0 0 auto;
  margin-top: 1px;
  color: rgb(var(--v-theme-warning));
}

.abertura-conferencia__campos {
  margin-top: 12px;
}

.abertura-conferencia__titulo {
  color: rgb(var(--v-theme-primary));
  font-size: 0.9rem;
  font-weight: 800;
}

.abertura-conferencia__decisao {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--cx-line) 82%, rgb(var(--v-theme-primary)));
  border-radius: 10px;
  background: var(--cx-surface-raised, rgb(var(--v-theme-surface)));
  color: var(--cx-ink, rgb(var(--v-theme-on-surface)));
  font-size: 0.875rem;
}

.abertura-conferencia__esperado {
  display: grid;
  gap: 2px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, rgb(var(--v-theme-primary)) 38%, var(--cx-line));
  border-radius: 9px;
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 10%, var(--cx-surface));
}
.abertura-conferencia__esperado span,
.abertura-conferencia__esperado small {
  color: var(--cx-ink-soft, rgba(var(--v-theme-on-surface), 0.72));
  font-size: 0.75rem;
  font-weight: 700;
}
.abertura-conferencia__esperado strong {
  color: var(--cx-ink, rgb(var(--v-theme-on-surface)));
  font-size: 1.18rem;
}

.abertura-conferencia__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.abertura-conferencia__acoes :deep(.v-btn) {
  min-width: 142px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.abertura-conferencia__decisao small {
  color: var(--cx-ink-soft, rgba(var(--v-theme-on-surface), 0.72));
}

@media (max-width: 480px) {
  .abertura-conferencia__acoes :deep(.v-btn) {
    flex: 1;
    min-width: 0;
  }
}

.abertura-conferencia__erro {
  color: rgb(var(--v-theme-error));
  font-size: 0.8125rem;
  font-weight: 600;
}

.caixa-status-aberto {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3);
  border: 1px solid color-mix(in srgb, rgb(var(--v-theme-success)) 45%, var(--cx-line));
  border-radius: var(--cx-r-lg);
  background: color-mix(in srgb, rgb(var(--v-theme-success)) 12%, var(--cx-surface));
}

.caixa-status-aberto__titulo {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  color: var(--cx-ink);
}

.caixa-status-aberto__titulo > div {
  display: grid;
  gap: 1px;
}

.caixa-status-aberto__alternar {
  flex: 0 0 auto;
  margin-inline-start: auto;
}
.caixa-pdv-desligado {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 9px 14px;
  border: 1px solid rgba(168, 85, 247, 0.55);
  border-radius: 10px;
  background: rgba(168, 85, 247, 0.12);
}
.caixa-pdv-desligado--ativo {
  border-color: rgba(239, 68, 68, 0.6);
  background: rgba(239, 68, 68, 0.1);
}

.caixa-pdv-desligado__titulo,
.caixa-pdv-desligado__descricao {
  display: block;
}

.caixa-pdv-desligado__titulo {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #c084fc;
  font-size: var(--cx-fs-label);
  font-weight: 800;
  letter-spacing: 0.04em;
}
.caixa-pdv-desligado--ativo .caixa-pdv-desligado__titulo {
  color: #f87171;
}

.caixa-pdv-desligado__descricao {
  margin-top: 2px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: var(--cx-fs-caption);
}

.caixa-pdv-desligado :deep(.v-switch) {
  flex: 0 0 auto;
}

.caixa-status-aberto__titulo strong {
  font-size: var(--cx-fs-lead);
}
.caixa-status-aberto__titulo span:last-child {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.caixa-status-aberto__icone {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
  color: rgb(var(--v-theme-on-success));
}

.caixa-status-aberto__itens {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--cx-sp-2);
  margin: 0;
}

.caixa-status-aberto__itens > div {
  min-width: 0;
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border: 1px solid color-mix(in srgb, rgb(var(--v-theme-success)) 22%, var(--cx-line));
  border-radius: var(--cx-r-sm);
  background: var(--cx-surface);
}

.caixa-status-aberto__itens dt {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 700;
}

.caixa-status-aberto__itens dd {
  overflow-wrap: anywhere;
  margin: 2px 0 0;
  color: var(--cx-ink);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
  line-height: 1.2;
}

.caixa-acao-fechamento {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-4);
  margin-top: var(--cx-sp-5);
  padding-top: var(--cx-sp-4);
  border-top: 1px solid var(--cx-line);
}

.caixa-acao-fechamento h2,
.caixa-acao-fechamento p {
  margin: 0;
}
.caixa-acao-fechamento h2 {
  color: var(--cx-ink);
  font-size: var(--cx-fs-lead);
}
.caixa-acao-fechamento p {
  margin-top: 2px;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

@media (width <= 600px) {
  .caixa-status-aberto {
    padding: var(--cx-sp-3);
  }
  .caixa-status-aberto__titulo {
    flex-wrap: wrap;
  }
  .caixa-status-aberto__titulo > div {
    flex: 1 1 120px;
  }
  .caixa-status-aberto__alternar {
    margin-inline-start: 0;
  }
  .caixa-pdv-desligado {
    padding: 8px 12px;
  }
  .caixa-status-aberto__itens {
    grid-template-columns: minmax(0, 1fr);
  }
  .caixa-acao-fechamento {
    align-items: stretch;
    flex-direction: column;
  }
  .caixa-acao-fechamento :deep(.v-btn) {
    width: 100%;
    min-height: 46px;
  }
}

@media (width >= 601px) {
  .caixa-status-aberto__alternar {
    display: none;
  }
}
</style>
