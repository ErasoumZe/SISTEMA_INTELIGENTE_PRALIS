<script setup lang="ts">
import type { CaixaStatus, Opcao, ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import EntregasAguardandoConferencia from "~/components/caixa/EntregasAguardandoConferencia.vue";
import CaixaCampanhasResumo from "~/components/caixa/CaixaCampanhasResumo.vue";
import CaixaResumoMaloteAbertura from "~/components/caixa/CaixaResumoMaloteAbertura.vue";
import CaixaUltimosLancamentosDialog from "~/components/caixa/CaixaUltimosLancamentosDialog.vue";
import CaixaVendasCanceladasDialog from "~/components/caixa/CaixaVendasCanceladasDialog.vue";
import CaixaCategoriaResumoDialog from "~/components/caixa/CaixaCategoriaResumoDialog.vue";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import CaixaFechamentoAnexos from "~/components/caixa/CaixaFechamentoAnexos.vue";
import CaixaFechamentoConfirmacaoDialog from "~/components/caixa/CaixaFechamentoConfirmacaoDialog.vue";
import CaixaRetornoSangriaDialog from "~/components/caixa/CaixaRetornoSangriaDialog.vue";
import CaixaSangriasDialog from "~/components/caixa/CaixaSangriasDialog.vue";
import CampoObservacaoVoz from "~/components/caixa/CampoObservacaoVoz.vue";
import { deCentavos, paraCentavos } from "@padaria/shared";
const { apiGet } = useApi();

const props = defineProps<{
  resumo: ResumoCaixa | null;
  status: CaixaStatus | null;
  empresaId: string;
  pdvs: Opcao[];
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
      maquininhaId?: string | null;
      lacreAbertura: string;
      caixaResponsavelNome: string;
      supervisorResponsavelNome: string;
      valorEspecieContado?: number;
      valorMoedasContado?: number;
      observacaoDivergencia?: string | null;
      observacao: string | null;
    }
  ): void;
  (event: "executarPlanejamento", payload: { caixaId: string; planejamentoId: string }): void;
  // D5: lacre por movimento (opcional, R-026). D6: `lacreRetorno` e o do retorno final que o
  // proprio fechamento cria quando ainda ha sobra. B2: `idempotenciaChave` identifica a INTENCAO;
  // `aoConcluir` traz o desfecho de volta, porque `emit` nao devolve o retorno do handler.
  (
    event: "retornarSaldo",
    payload: {
      caixaId: string;
      valor: number;
      valorEspecie: number;
      valorMoedas: number;
      lacreId: string;
      lacreNumero: string;
      responsavelNome: string;
      observacao: string | null;
      idempotenciaChave: string;
      aoConcluir: (sucesso: boolean) => void;
    }
  ): void;
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
  Array<{ id: string; tipo: "folha_fechamento" | "comprovante_cartao"; nomeOriginal: string; relatorio: unknown }>
>([]);
const revisaoFechamentoAberta = ref(false);
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
// D1: o valor da entrega e digitavel. Vazio significa "a sobra inteira" — o padrao continua sendo
// devolver tudo, mas o operador pode enviar parte agora e o resto depois (varios movimentos).
// `observacao` e propria da entrega, separada da observacao do FECHAMENTO: sao dois atos, e
// misturar as duas fazia a nota do fechamento virar parte da intencao da entrega — qualquer
// correcao no texto do fechamento rodaria a chave de idempotencia e liberaria uma entrega dupla.
const entrega = reactive({
  valor: "",
  valorEspecie: "",
  valorMoedas: "",
  lacreId: "",
  responsavelNome: "",
  observacao: ""
});
const modalRetornoSangriaAberto = ref(false);
const modalSangriasAberto = ref(false);
const modalVendasCanceladasAberto = ref(false);
const modalCategoriaResumoAberto = ref(false);
const categoriaResumoSelecionada = ref<CardCategoria | null>(null);
const vendasCanceladasQuantidade = ref(0);
const lacresRetornoDisponiveis = ref<Array<{ id: string; numero: string }>>([]);
type CategoriaComUltimos = "despesas" | "mercadorias" | "retiradas";
const categoriaUltimosLancamentos = ref<CategoriaComUltimos | null>(null);

// B2 · a chave de idempotencia da tela.
// Regra: uma chave por INTENCAO. Ela nasce no primeiro envio, sobrevive a erro e a cancelamento
// (o retry precisa da MESMA chave, senao o servidor trata como entrega nova e duplica o dinheiro),
// e so e trocada quando o ato termina bem ou quando o operador muda de fato o que quer entregar.
const chaveEntrega = ref("");
const intencaoDaChave = ref("");

// `crypto.randomUUID` exige contexto seguro. Em https e em localhost existe; num acesso por IP da
// rede da loja (http://192.168.x.x) o navegador nao o expoe, e sem o fallback a tela quebraria
// justamente onde ela roda todo dia.
function novoUuid(): string {
  const aleatorio = globalThis.crypto;
  if (typeof aleatorio?.randomUUID === "function") return aleatorio.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/gu, (caractere) => {
    const digito = Number(caractere);
    return (digito ^ (Math.floor(Math.random() * 256) & (15 >> (digito / 4)))).toString(16);
  });
}

// A "intencao" e o conjunto que o servidor compara para decidir entre retry e ato novo. Se ele
// mudar, a chave TEM de mudar — senao o servidor devolve 409 e o operador fica travado sem
// entender por que. Se nao mudar, a chave TEM de ficar — e o que impede a entrega dupla.
function chaveParaIntencao(assinatura: string): string {
  if (chaveEntrega.value && intencaoDaChave.value === assinatura) return chaveEntrega.value;
  chaveEntrega.value = novoUuid();
  intencaoDaChave.value = assinatura;
  return chaveEntrega.value;
}

function limparEntrega() {
  entrega.valor = "";
  entrega.valorEspecie = "";
  entrega.valorMoedas = "";
  entrega.lacreId = "";
  entrega.responsavelNome = "";
  entrega.observacao = "";
  chaveEntrega.value = "";
  intencaoDaChave.value = "";
}

const caixaAberto = computed(() => props.status?.caixaAberto ?? null);
const resumoAtual = computed(() => props.resumo ?? props.status?.resumo ?? null);
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
const temSaldoLivre = computed(() => saldoLivre.value > 0);

// A trava ja existia na API desde a Fatia 1, mas o operador so a descobria clicando e levando 400.
// Uma computada, um motivo, e o botao para antes — sem uma segunda definicao da regra na tela.
const motivoTravado = computed(() => {
  if (planejamentosPendentes.value.length)
    return "há transferencia de retorno planejada aguardando execucao ou cancelamento";
  return null;
});
const fechamentoTravado = computed(() => motivoTravado.value !== null);
const blocoTravas = useTemplateRef<HTMLElement>("blocoTravas");
const maquininhasSelect = computed(() =>
  (props.maquininhas ?? []).map((item) => ({
    ...item,
    nome: `${item.apelido ?? item.nome} · ${item.numeroSerie ?? "sem série"}`
  }))
);
// O vinculo continua suportado pela API e pelo historico, mas nao faz parte desta rodada de
// operacao no PDV. A flag oculta somente o seletor, sem apagar valores ja existentes.
const exibirMaquininhaNaAbertura = false;

// Cockpit por categoria: a cor entra como ACENTO (barra/chip/total) via os tokens --cat-* da main,
// nunca como fundo de bloco. Os valores vem SEMPRE da API (nada recalculado no front). "Resultado"
// (saldo fisico) e o card-ancora. Sem card de deficit (fundo simples, PROJECT_BRAIN/12).
type CardCategoria = { chave: string; titulo: string; icone: string; valor: number; detalhe?: string };
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
    { chave: "entradas", titulo: "Entradas", icone: "mdi-arrow-down-bold-circle-outline", valor: r.totalEntradas },
    {
      chave: "transferencias",
      titulo: "Transferencias",
      icone: "mdi-bank-transfer",
      valor: entrada,
      detalhe: "De entrada"
    },
    {
      chave: "sangrias",
      titulo: "Sangrias",
      icone: "mdi-bank-transfer-out",
      valor: saida,
      detalhe: saida > 0 ? "Ver historico e lacres" : "Nenhuma sangria realizada"
    },
    { chave: "despesas", titulo: "Despesas", icone: "mdi-cash-minus", valor: r.totalDespesas },
    {
      chave: "mercadorias",
      titulo: "Mercadorias",
      icone: "mdi-package-variant-closed",
      valor: r.totalMercadorias ?? 0
    },
    { chave: "retiradas", titulo: "Retiradas", icone: "mdi-cash-remove", valor: r.totalRetiradas }
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

function classeFormaPagamento(nome: string) {
  const normalizado = nomeFormaPagamento(nome);
  if (normalizado.includes("pix")) return "pagamento-pix";
  if (normalizado.includes("credito")) return "pagamento-credito";
  if (normalizado.includes("debito")) return "pagamento-debito";
  if (normalizado.includes("dinheiro") || normalizado.includes("especie")) return "pagamento-dinheiro";
  if (normalizado.includes("crediario")) return "pagamento-crediario";
  if (normalizado.includes("voucher")) return "pagamento-voucher";
  if (normalizado.includes("furto") || normalizado.includes("desvio")) return "pagamento-desvio";
  return "pagamento-outros";
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
    Boolean(maloteDeclarado.value) &&
    aberturaComposicaoInformada.value &&
    (Number(aberturaExtra.valorEspecie || 0) !== maloteDeclarado.value!.valorEspecieDeclarado ||
      Number(aberturaExtra.valorMoedas || 0) !== maloteDeclarado.value!.valorMoedasDeclarado)
);
const aberturaComposicaoPendente = computed(() =>
  Boolean(aberturaExtra.numeroLacre.trim() && maloteDeclarado.value && !aberturaComposicaoInformada.value)
);
const observacaoAberturaPendente = computed(
  () => aberturaDivergente.value && !aberturaExtra.observacaoDivergencia.trim()
);
const lacreAberturaPendente = computed(() => !aberturaExtra.numeroLacre.trim());
const responsaveisAberturaPendentes = computed(
  () => !aberturaExtra.caixaResponsavelNome.trim() || !aberturaExtra.supervisorResponsavelNome.trim()
);
const aberturaBloqueada = computed(
  () =>
    !abertura.pdvId ||
    lacreAberturaPendente.value ||
    responsaveisAberturaPendentes.value ||
    !maloteDeclarado.value ||
    carregandoMalote.value ||
    aberturaComposicaoPendente.value ||
    observacaoAberturaPendente.value
);

watch(
  () => caixaAberto.value?.id,
  (caixaId) => {
    if (!caixaId) {
      fechamento.observacao = "";
      fechamento.lacreFechamento = "";
      fechamento.valorTotal = "";
      fechamento.valorEspecie = "";
      fechamento.valorMoedas = "";
      fechamento.caixaResponsavelNome = "";
      fechamento.supervisorResponsavelNome = "";
      return;
    }

    // A abertura identifica o operador de origem; o fechamento pode ser feito por outra pessoa.
    // Só sugere o nome se o operador ainda não preencheu um valor próprio.
    if (!fechamento.caixaResponsavelNome.trim()) {
      fechamento.caixaResponsavelNome = caixaAberto.value?.caixaResponsavelNomeAbertura ?? "";
    }
  },
  { immediate: true }
);

function abrir() {
  if (aberturaBloqueada.value) return;
  emit("abrirCaixa", {
    pdvId: abertura.pdvId,
    usuarioCaixaId: props.usuarioId,
    turnoId: abertura.turnoId || null,
    maquininhaId: aberturaExtra.maquininhaId || null,
    lacreAbertura: aberturaExtra.numeroLacre.trim(),
    caixaResponsavelNome: aberturaExtra.caixaResponsavelNome.trim(),
    supervisorResponsavelNome: aberturaExtra.supervisorResponsavelNome.trim(),
    valorEspecieContado: Number(aberturaExtra.valorEspecie || 0),
    valorMoedasContado: Number(aberturaExtra.valorMoedas || 0),
    observacaoDivergencia: aberturaExtra.observacaoDivergencia || null,
    observacao: null
  });
}

// D1: entrega PARCIAL durante o turno. Sem valor digitado, envia a sobra inteira. O servidor
// recalcula o teto sob trava — o numero que a tela viu nunca e prova de nada.
const valorEntregaEfetivo = computed(() => {
  const digitado = Number(entrega.valor || 0);
  return digitado > 0 ? digitado : saldoLivre.value;
});
// D1 na TELA: o servidor continua sendo a autoridade (ele recalcula sob trava), mas deixar o
// operador disparar um valor que ja se sabe impossivel so gera 400 e desconfianca. Aqui o aviso
// e imediato e o botao nao dispara.
const entregaAcimaDoSaldoLivre = computed(() => valorEntregaEfetivo.value > saldoLivre.value);
const entregaComposicaoInvalida = computed(
  () => Number(entrega.valorEspecie || 0) + Number(entrega.valorMoedas || 0) !== valorEntregaEfetivo.value
);
const lacreEntregaPendente = computed(() => !entrega.lacreId);
const entregaBloqueada = computed(
  () =>
    Boolean(props.salvando) ||
    valorEntregaEfetivo.value <= 0 ||
    entregaAcimaDoSaldoLivre.value ||
    entregaComposicaoInvalida.value ||
    lacreEntregaPendente.value ||
    !entrega.responsavelNome.trim()
);

const entregaIniciada = computed(
  () =>
    entrega.valor.trim().length > 0 ||
    entrega.valorEspecie.trim().length > 0 ||
    entrega.valorMoedas.trim().length > 0 ||
    entrega.lacreId.length > 0 ||
    entrega.observacao.trim().length > 0
);

const mensagemErroEntrega = computed(() => {
  if (!entregaIniciada.value) return "";
  if (entregaAcimaDoSaldoLivre.value) return `Máximo disponível: ${dinheiro(saldoLivre.value)}.`;
  if (entregaComposicaoInvalida.value) return "Dinheiro físico + moedas deve ser igual ao valor entregue.";
  if (lacreEntregaPendente.value) return "Informe o lacre do retorno / sangria.";
  if (!entrega.responsavelNome.trim()) return "Informe o responsável pela sangria.";
  if (valorEntregaEfetivo.value <= 0) return "Informe um valor para a transferência.";
  return "";
});

function retornarSaldo(fecharModalAoSalvar = false) {
  const caixa = caixaAberto.value;
  // Guarda de duplo clique: enquanto `salvando` estiver ligado o ato nao repete. O botao tambem
  // fica em loading/disabled, mas Enter no campo e clique rapido furam o visual.
  if (!caixa || entregaBloqueada.value) return;
  const valor = valorEntregaEfetivo.value;
  const lacreId = entrega.lacreId;
  const lacreNumero = lacresRetornoDisponiveis.value.find((lacre) => lacre.id === lacreId)?.numero ?? "";
  const observacao = entrega.observacao || null;
  emit("retornarSaldo", {
    caixaId: caixa.id,
    valor,
    valorEspecie: Number(entrega.valorEspecie || 0),
    valorMoedas: Number(entrega.valorMoedas || 0),
    lacreId,
    lacreNumero,
    responsavelNome: entrega.responsavelNome.trim(),
    observacao,
    idempotenciaChave: chaveParaIntencao(
      `avulsa|${caixa.id}|${valor}|${entrega.valorEspecie}|${entrega.valorMoedas}|${lacreId}|${entrega.responsavelNome.trim()}|${observacao ?? ""}`
    ),
    // Limpa SO no sucesso confirmado. Em erro (ou confirmacao negada) valor, lacre, observacao e
    // a chave ficam de pe: o operador tenta de novo com um clique, e o retry carrega a MESMA
    // chave — que e o que impede a segunda entrega do mesmo envelope.
    aoConcluir: (sucesso: boolean) => {
      if (!sucesso) return;
      lacresRetornoDisponiveis.value = lacresRetornoDisponiveis.value.filter((lacre) => lacre.id !== lacreId);
      limparEntrega();
      if (fecharModalAoSalvar) modalRetornoSangriaAberto.value = false;
    }
  });
}

function categoriaTemUltimos(chave: string): chave is CategoriaComUltimos {
  return chave === "despesas" || chave === "mercadorias" || chave === "retiradas";
}

function abrirUltimosLancamentos(chave: string, valor: number) {
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

async function abrirRetornoSangria() {
  const caixa = caixaAberto.value;
  if (!caixa) return;
  entrega.responsavelNome = caixa.caixaResponsavelNomeAbertura || caixa.usuarioCaixaNome;
  try {
    lacresRetornoDisponiveis.value = await apiGet<Array<{ id: string; numero: string }>>(
      `/api/caixa/${encodeURIComponent(caixa.id)}/lacres-retorno`
    );
  } catch {
    lacresRetornoDisponiveis.value = [];
  }
  modalRetornoSangriaAberto.value = true;
}

// D6: um unico ato. Se ainda ha sobra, o servidor devolve o restante ao cofre dentro da MESMA
// transacao do fechamento; se o saldo ja e zero, apenas fecha. Nao existe segundo botao.
function fechar() {
  const caixa = caixaAberto.value;
  // Travado por entrega em transito: o botao continua focavel de proposito (`aria-disabled`, nao
  // `disabled`), porque botao morto nao entra na navegacao por teclado e o leitor de tela nunca
  // chega ao motivo. Clicar leva ao motivo, que e a unica coisa util a fazer aqui.
  if (fechamentoTravado.value) {
    blocoTravas.value?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
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
                <div class="abertura-conferencia__esperado">
                  Esperado: <strong>{{ dinheiro(maloteDeclarado.valor) }}</strong> — espécie
                  <strong>{{ dinheiro(maloteDeclarado.valorEspecieDeclarado) }}</strong> e moedas
                  <strong>{{ dinheiro(maloteDeclarado.valorMoedasDeclarado) }}</strong
                  >.
                </div>
                <v-row dense class="abertura-conferencia__campos">
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
              hint="Opcional"
              clearable
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
          </v-col>
        </v-row>
      </template>

      <template v-else>
        <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
          <v-alert type="success" variant="tonal" class="flex-grow-1 mb-0">
            Caixa aberto em {{ formatarDataHora(caixaAberto.dataHoraAbertura) }} no {{ caixaAberto.pdvNome }}.
            <span v-if="caixaAberto.caixaResponsavelNomeAbertura">
              <v-icon icon="mdi-account-cash-outline" size="small" class="ms-2" />
              Caixa responsável: {{ caixaAberto.caixaResponsavelNomeAbertura }}.
            </span>
            <span v-if="caixaAberto.supervisorResponsavelNomeAbertura">
              <v-icon icon="mdi-account-supervisor-outline" size="small" class="ms-2" />
              Supervisor: {{ caixaAberto.supervisorResponsavelNomeAbertura }}.
            </span>
            <span v-if="caixaAberto.maquininhaId">
              Maquininha: {{ caixaAberto.maquininhaApelido }} · {{ caixaAberto.maquininhaNumeroSerie }}.
            </span>
            <span v-if="lacresRetornoDisponiveis.length">
              · {{ lacresRetornoDisponiveis.length }} lacre(s) de sangria disponível(is):
              {{ lacresRetornoDisponiveis.map((lacre) => lacre.numero).join(", ") }}.
            </span>
            <span v-if="lacreFechamentoReservado">
              · Lacre reservado para fechamento: <strong>{{ lacreFechamentoReservado }}</strong
              >. Confirme o número físico e digite-o no fechamento.
            </span>
          </v-alert>
        </div>

        <!-- Cockpit por categoria: cor como acento (barra/chip/total), fundo do card neutro.
             Grid auto-responsivo (nunca aperta) — restyle da grade real, sem o cockpit pesado
             que foi revertido. Totais vindos da API; "Resultado" e o card-ancora. -->
        <div v-if="resumoAtual" class="cat-grid">
          <div
            v-for="cat in categorias"
            :key="cat.chave"
            class="cat-card"
            :class="['cat-card--clicavel', `cat-${cat.chave}`]"
            role="button"
            tabindex="0"
            @click="abrirUltimosLancamentos(cat.chave, cat.valor)"
            @keydown.enter.prevent="abrirUltimosLancamentos(cat.chave, cat.valor)"
            @keydown.space.prevent="abrirUltimosLancamentos(cat.chave, cat.valor)"
          >
            <span class="cat-bar" aria-hidden="true" />
            <div class="cat-body">
              <div class="cat-head">
                <span class="cat-chip"><v-icon :icon="cat.icone" size="18" /></span>
                <span class="cat-titulo">{{ cat.titulo }}</span>
              </div>
              <div class="cat-valor">{{ dinheiro(cat.valor) }}</div>
              <div v-if="cat.detalhe" class="cat-detalhe">{{ cat.detalhe }}</div>
              <div v-if="categoriaTemUltimos(cat.chave) && cat.valor !== 0" class="cat-card__acao">
                Ver últimas movimentações <v-icon icon="mdi-chevron-right" size="14" />
              </div>
              <CaixaResumoMaloteAbertura
                v-if="cat.chave === 'transferencias' && caixaAberto"
                :caixa-id="caixaAberto.id"
              />
            </div>
          </div>

          <div
            class="cat-card cat-canceladas cat-card--clicavel"
            role="button"
            tabindex="0"
            @click="modalVendasCanceladasAberto = true"
            @keydown.enter.prevent="modalVendasCanceladasAberto = true"
            @keydown.space.prevent="modalVendasCanceladasAberto = true"
          >
            <span class="cat-bar" aria-hidden="true" />
            <div class="cat-body">
              <div class="cat-head">
                <span class="cat-chip"><v-icon icon="mdi-cancel" size="18" /></span>
                <span class="cat-titulo">Vendas canceladas</span>
              </div>
              <div class="cat-valor">{{ vendasCanceladasQuantidade }}</div>
              <div class="cat-detalhe">
                {{ vendasCanceladasQuantidade === 1 ? "venda cancelada" : "vendas canceladas" }}
              </div>
              <div class="cat-card__acao">Ver detalhes <v-icon icon="mdi-chevron-right" size="14" /></div>
            </div>
          </div>

          <div class="cat-card cat-resultado cat-card--ancora">
            <span class="cat-bar" aria-hidden="true" />
            <div class="cat-body">
              <div class="cat-head">
                <span class="cat-chip"><v-icon icon="mdi-cash-multiple" size="18" /></span>
                <span class="cat-titulo">Resultado no caixa</span>
              </div>
              <div class="cat-valor">{{ dinheiro(resumoAtual.saldo) }}</div>
              <div class="cat-detalhe">saldo fisico do turno</div>
            </div>
          </div>
        </div>

        <div v-if="formasPagamento.length" class="pagamentos-resumo mt-4">
          <div class="pagamentos-resumo__titulo">
            <span>Vendas por forma de pagamento</span>
            <span class="pagamentos-resumo__atualizacao">Atualização automática a cada 1 minuto</span>
          </div>
          <div class="pagamentos-grid">
            <div
              v-for="forma in formasPagamento"
              :key="forma.chave"
              class="pagamento-card"
              :class="classeFormaPagamento(forma.titulo)"
            >
              <span class="pagamento-card__icone"><v-icon :icon="forma.icone" size="18" /></span>
              <span class="pagamento-card__titulo">{{ forma.titulo }}</span>
              <strong class="pagamento-card__valor">{{ dinheiro(forma.valor) }}</strong>
              <span class="pagamento-card__quantidade">
                {{ forma.quantidade }} {{ forma.quantidade === 1 ? "venda" : "vendas" }}
              </span>
            </div>
          </div>
        </div>

        <v-divider class="my-5" />

        <!-- R-199: bloco SOMENTE LEITURA. Fica fora do fluxo de dinheiro da tela de proposito —
             nenhum numero daqui entra em saldo, total ou fechamento. -->
        <CaixaCampanhasResumo
          v-if="caixaAberto"
          :empresa-id="caixaAberto.empresaId"
          :pdv-id="caixaAberto.pdvId"
          :dia="caixaAberto.dataMovimento"
        />

        <!-- D7: o deficit e o evento mais grave do modulo. O operador precisa saber ANTES de
           confirmar que vai ficar com uma quebra no nome dele — nao descobrir por snackbar. -->
        <v-alert
          v-if="fechamentoDivergente"
          :type="diferencaFechamento < 0 ? 'error' : 'warning'"
          variant="tonal"
          class="my-5"
          data-teste="alerta-quebra"
        >
          <div class="text-subtitle-2 mb-1">
            Conferência física: {{ dinheiro(totalFechamentoContado) }} contado para {{ dinheiro(saldoAtual) }} esperado
          </div>
          <template v-if="diferencaFechamento < 0"
            >A falta de <strong>{{ dinheiro(Math.abs(diferencaFechamento)) }}</strong> gera quebra de caixa e notifica a
            Tesouraria.</template
          >
          <template v-else
            >Há sobra de <strong>{{ dinheiro(diferencaFechamento) }}</strong
            >; não há quebra positiva, mas a Tesouraria será notificada.</template
          >
          A observação é obrigatória e fica registrada com o responsável e o horário do servidor.
        </v-alert>

        <!-- G1/R-171 · o que ja saiu e ninguem conferiu: a unica coisa que trava o fechamento.
             R-179/Fatia 3: o bloco "Entregas solicitadas pela Tesouraria" saiu daqui junto com o
             painel que o alimentava. Executar uma ordem era um SEGUNDO caminho para o mesmo ato do
             botao de entregar abaixo — mesmo dinheiro, mesmas contas, outra porta. -->
        <div ref="blocoTravas" tabindex="-1">
          <v-alert
            v-if="planejamentosPendentes.length"
            type="warning"
            variant="tonal"
            class="mb-4"
            data-teste="planejamentos-retorno"
          >
            <div class="text-subtitle-2 mb-2">Transferências de retorno programadas</div>
            <div
              v-for="planejamento in planejamentosPendentes"
              :key="planejamento.id"
              class="d-flex align-center flex-wrap ga-2 mb-2"
            >
              <span
                >{{ dinheiro(planejamento.valor) }} · lacre {{ planejamento.lacre }} ·
                {{ planejamento.contaDestinoNome }}</span
              >
              <v-btn
                size="small"
                color="warning"
                :loading="salvando"
                @click="emit('executarPlanejamento', { caixaId: caixaAberto!.id, planejamentoId: planejamento.id })"
              >
                Executar agora
              </v-btn>
            </div>
            Execute cada linha quando o dinheiro sair da gaveta. Enquanto houver linha programada, o fechamento fica
            bloqueado. Cancelamentos devem ser feitos pela retaguarda.
          </v-alert>
          <EntregasAguardandoConferencia :entregas="entregasPendentes" />
        </div>

        <v-row dense>
          <v-col v-if="temSaldoLivre" cols="12" class="pt-0 pb-5">
            <div class="retorno-sangria-faixa">
              <v-btn
                color="warning"
                prepend-icon="mdi-bank-transfer-out"
                class="botao-retorno-sangria"
                data-teste="botao-entregar"
                @click="abrirRetornoSangria"
              >
                <span class="botao-retorno-sangria__conteudo">
                  <span>Transferência de retorno / sangria</span>
                  <span class="botao-retorno-sangria__subtitulo">Retire dinheiro do caixa para o cofre</span>
                </span>
              </v-btn>
            </div>
          </v-col>
          <v-col cols="12" class="fechamento-caixa">
            <v-alert v-if="temSobra" type="warning" variant="tonal" class="mb-4">
              <template v-if="planejamentosPendentes.length">
                Há {{ dinheiro(saldoAtual) }} em espécie no caixa;
                {{ dinheiro(deCentavos(totalPlanejadoCentavos)) }} estão reservados para as transferências de retorno
                programadas. Somente os {{ dinheiro(saldoLivre) }}
                livres podem ser transferidos à parte.
              </template>
              <template v-else>
                Há {{ dinheiro(saldoAtual) }} em espécie no caixa. Você pode transferir parte agora ou fechar o caixa —
                ao fechar, o restante volta ao cofre automaticamente, no mesmo ato.
              </template>
            </v-alert>
            <div class="text-h6 mb-1">Fechamento do caixa</div>
            <v-alert type="info" variant="tonal" density="compact" class="mb-4" data-teste="valor-esperado-fechamento">
              Valor esperado para fechar: <strong>{{ dinheiro(saldoAtual) }}</strong>
            </v-alert>
            <div class="text-body-2 mb-4">Conte o físico, anexe a folha obrigatória e os comprovantes de cartão.</div>
            <div
              v-if="caixaAberto.caixaResponsavelNomeAbertura || caixaAberto.supervisorResponsavelNomeAbertura"
              class="fechamento-abertura-responsavel mb-4"
            >
              <v-icon icon="mdi-account-cash-outline" size="small" />
              <span v-if="caixaAberto.caixaResponsavelNomeAbertura">
                Caixa que abriu: <strong>{{ caixaAberto.caixaResponsavelNomeAbertura }}</strong>
              </span>
              <span v-if="caixaAberto.supervisorResponsavelNomeAbertura">
                · Supervisor na abertura: <strong>{{ caixaAberto.supervisorResponsavelNomeAbertura }}</strong>
              </span>
            </div>
            <v-row dense>
              <v-col cols="12" md="4">
                <CampoObservacaoVoz
                  v-model="fechamento.observacao"
                  :label="fechamentoDivergente ? 'Observação da divergência (obrigatória)' : 'Observação do fechamento'"
                  :error="observacaoObrigatoriaPendente"
                  :messages="observacaoObrigatoriaPendente ? 'Explique a falta antes de fechar o caixa.' : ''"
                  data-teste="observacao-fechamento"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field
                  v-model="fechamento.lacreFechamento"
                  :label="
                    lacreFechamentoReservado
                      ? 'Lacre reservado para fechamento (obrigatório)'
                      : 'Lacre de fechamento (obrigatório)'
                  "
                  placeholder="Ex.: FCH-001"
                  :hint="
                    lacreFechamentoReservado
                      ? 'Digite manualmente o número físico reservado no malote. Ele precisa ser exatamente igual ao informado pela Tesouraria.'
                      : 'Identifica o lacre físico colocado ao fechar a gaveta. Obrigatório em todo fechamento.'
                  "
                  persistent-hint
                  :color="lacreFechamentoPendente ? 'error' : 'primary'"
                  :base-color="lacreFechamentoPendente ? 'error' : undefined"
                  :error="lacreFechamentoPendente"
                  :error-messages="lacreFechamentoPendente ? 'Informe o lacre antes de fechar o caixa.' : ''"
                  prepend-inner-icon="mdi-lock-alert-outline"
                  required
                  data-teste="lacre-fechamento"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="fechamento.caixaResponsavelNome"
                  label="Caixa responsavel no fechamento (obrigatorio)"
                  placeholder="Digite o nome do responsavel pelo caixa"
                  :error="!fechamento.caixaResponsavelNome.trim()"
                  :error-messages="!fechamento.caixaResponsavelNome.trim() ? 'Informe o caixa responsavel.' : ''"
                  prepend-inner-icon="mdi-account-cash-outline"
                  required
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="fechamento.supervisorResponsavelNome"
                  label="Supervisor responsavel no fechamento (obrigatorio)"
                  placeholder="Digite o nome do supervisor"
                  :error="!fechamento.supervisorResponsavelNome.trim()"
                  :error-messages="
                    !fechamento.supervisorResponsavelNome.trim() ? 'Informe o supervisor responsavel.' : ''
                  "
                  prepend-inner-icon="mdi-account-supervisor-outline"
                  required
                />
              </v-col>
              <v-col cols="12" md="4">
                <CampoDinheiro
                  v-model="fechamento.valorTotal"
                  label="Valor total contado no fechamento"
                  icone="mdi-cash-multiple"
                  :hint="`Esperado para fechar: ${dinheiro(saldoAtual)}`"
                  persistent-hint
                  :error="fechamentoComposicaoInvalida"
                  :error-messages="
                    fechamentoComposicaoInvalida ? 'Total deve ser igual a dinheiro físico mais moedas.' : ''
                  "
                />
              </v-col>
              <v-col cols="12" md="4">
                <CampoDinheiro
                  v-model="fechamento.valorEspecie"
                  label="Dinheiro fisico contado no fechamento"
                  icone="mdi-cash"
                />
              </v-col>
              <v-col cols="12" md="4">
                <CampoDinheiro
                  v-model="fechamento.valorMoedas"
                  label="Moedas contadas no fechamento"
                  icone="mdi-circle-multiple-outline"
                />
              </v-col>
              <v-col cols="12">
                <CaixaFechamentoAnexos
                  :caixa-id="caixaAberto?.id ?? null"
                  @folha-enviada="folhaFechamentoEnviada = $event"
                  @anexos-atualizados="anexosFechamento = $event"
                />
              </v-col>
              <v-col cols="12">
                <v-btn
                  :color="temDeficit ? 'error' : 'primary'"
                  prepend-icon="mdi-lock"
                  :disabled="
                    observacaoObrigatoriaPendente ||
                    fechamentoComposicaoInvalida ||
                    lacreFechamentoPendente ||
                    responsaveisFechamentoPendentes ||
                    !fechamentoComposicaoInformada ||
                    !folhaFechamentoEnviada
                  "
                  :aria-disabled="fechamentoTravado ? 'true' : undefined"
                  :class="{ 'botao-travado': fechamentoTravado }"
                  :loading="salvando"
                  :aria-describedby="fechamentoTravado ? 'motivo-fechamento-travado' : undefined"
                  data-teste="botao-fechar"
                  @click="fechar"
                >
                  {{ fechamentoComQuebra ? "Fechar com quebra" : "Fechar caixa" }}
                </v-btn>
                <p
                  v-if="fechamentoTravado"
                  id="motivo-fechamento-travado"
                  class="text-caption mt-2 mb-0"
                  data-teste="motivo-fechamento-travado"
                >
                  Fechamento travado: {{ motivoTravado }}
                </p>
              </v-col>
            </v-row>
          </v-col>
        </v-row>

        <CaixaRetornoSangriaDialog
          v-if="caixaAberto"
          :aberto="modalRetornoSangriaAberto"
          :saldo-livre="saldoLivre"
          :valor="entrega.valor"
          :valor-especie="entrega.valorEspecie"
          :valor-moedas="entrega.valorMoedas"
          :lacre-id="entrega.lacreId"
          :lacres-disponiveis="lacresRetornoDisponiveis"
          :observacao="entrega.observacao"
          :responsavel-nome="entrega.responsavelNome"
          :bloqueado="entregaBloqueada"
          :mensagem-erro="mensagemErroEntrega"
          :salvando="salvando ?? false"
          @update:aberto="modalRetornoSangriaAberto = $event"
          @update:valor="entrega.valor = $event"
          @update:valor-especie="entrega.valorEspecie = $event"
          @update:valor-moedas="entrega.valorMoedas = $event"
          @update:lacre-id="entrega.lacreId = $event"
          @update:responsavel-nome="entrega.responsavelNome = $event"
          @update:observacao="entrega.observacao = $event"
          @salvar="retornarSaldo($event)"
        />
        <CaixaSangriasDialog
          v-if="caixaAberto"
          :aberto="modalSangriasAberto"
          :caixa-id="caixaAberto.id"
          @update:aberto="modalSangriasAberto = $event"
        />
        <CaixaVendasCanceladasDialog
          v-if="caixaAberto"
          :aberto="modalVendasCanceladasAberto"
          :caixa-id="caixaAberto.id"
          @update:aberto="modalVendasCanceladasAberto = $event"
        />
        <CaixaCategoriaResumoDialog
          v-if="categoriaResumoSelecionada"
          :aberto="modalCategoriaResumoAberto"
          :titulo="categoriaResumoSelecionada.titulo"
          :icone="categoriaResumoSelecionada.icone"
          :valor="categoriaResumoSelecionada.valor"
          :detalhe="categoriaResumoSelecionada.detalhe"
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
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
/* Travado, mas vivo: fica cinza e com cursor de recusa, e continua focavel — quem chega por
   teclado precisa poder alcancar o botao para descobrir por que ele nao fecha. */
.botao-travado {
  opacity: 0.55;
  cursor: not-allowed;
}

.botao-retorno-sangria {
  min-height: 52px;
  padding-block: 8px;
}

.retorno-sangria-faixa {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(var(--v-theme-warning), 0.14);
}

.botao-retorno-sangria__conteudo {
  display: grid;
  text-align: left;
}

.botao-retorno-sangria__subtitulo {
  display: block;
  margin-top: 2px;
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
}

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

.abertura-conferencia__campos {
  margin-top: 12px;
}

.abertura-conferencia__titulo {
  color: rgb(var(--v-theme-primary));
  font-size: 0.9rem;
  font-weight: 800;
}

.abertura-conferencia__esperado {
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 0.875rem;
}

.abertura-conferencia__erro {
  color: rgb(var(--v-theme-error));
  font-size: 0.8125rem;
  font-weight: 600;
}

.fechamento-caixa {
  border: 1px solid rgb(var(--v-theme-error));
  border-radius: 12px;
  padding: 20px;
  background: color-mix(in srgb, rgb(var(--v-theme-error)) 8%, transparent);
}

.fechamento-abertura-responsavel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.875rem;
}

/* Grade auto-responsiva: cada card tem largura minima confortavel e quebra sozinho — nunca aperta
   como no cockpit "fiel ao mockup" que foi revertido no contexto real. */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(174px, 1fr));
  gap: 12px;
}

/* Card NA COR da categoria (decisao do Jose, 04/08/2026 — antes era neutro de proposito, com a cor
   so na barra de 4px). Fundo em -soft, borda em -base e barra mais grossa: os cinco retangulos
   passam a ser reconheciveis de longe, que era o pedido.
   O valor usa -tinta e nao -base porque ele fica SOBRE o -soft; a base perderia contraste — e a
   tinta e a unica variante medida para os DOIS modos (auditoria de 04/08/2026). */
.cat-card {
  position: relative;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--cat);
  border-radius: 14px;
  background: var(--cat-soft);
}

.cat-card--clicavel {
  cursor: pointer;
}

.cat-card--clicavel:hover {
  filter: brightness(1.08);
}

.cat-card--clicavel:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.cat-canceladas {
  --cat: rgb(var(--v-theme-error));
  --cat-soft: rgba(var(--v-theme-error), 0.12);
  --cat-faixa: rgb(var(--v-theme-error));
  --cat-tinta: rgb(var(--v-theme-error));
}

.cat-card__acao {
  display: flex;
  align-items: center;
  margin-top: 6px;
  font-size: 0.7rem;
  font-weight: 700;
}

.cat-bar {
  flex: 0 0 6px;
  background: var(--cat);
}

.cat-body {
  min-width: 0;
  padding: 12px 14px;
}

.cat-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cat-chip {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  /* O chip agora fica SOBRE o fundo -soft: se ele tambem fosse -soft, sumiria. Cheio, com icone
     branco, ele volta a ser o ponto de leitura do card. */
  background: var(--cat-faixa);
  color: #fff;
}

.cat-titulo {
  overflow: hidden;
  color: var(--cat-tinta);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.cat-valor {
  margin-top: 8px;
  color: var(--cat-tinta);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
}

.cat-detalhe {
  margin-top: 2px;
  color: var(--padaria-muted-foreground, #71717a);
  font-size: 11px;
  font-weight: 600;
}

/* Card-ancora (Resultado): ocupa a linha inteira, barra e valor mais fortes. Continua neutro no
   fundo — o destaque e por peso/tamanho/largura, nao por bloco colorido. */
.cat-card--ancora {
  grid-column: 1 / -1;
}

.cat-card--ancora .cat-bar {
  flex-basis: 6px;
}

.cat-card--ancora .cat-valor {
  font-size: 26px;
}

/* Token por categoria. Fixos da main.css.
   base = borda e barra · faixa = chip (icone branco por cima) · soft = fundo do card ·
   tinta = titulo e valor (TEXTO sobre o soft). O -strong saiu: ele foi escolhido por contraste
   sobre o soft CLARO e, com o soft escuro, virava escuro-sobre-escuro. */
.cat-entradas {
  --cat: var(--cat-entradas-base);
  --cat-soft: var(--cat-entradas-soft);
  --cat-tinta: var(--cat-entradas-tinta);
  --cat-faixa: var(--cat-entradas-faixa);
}
.cat-transferencias {
  --cat: var(--cat-transferencias-base);
  --cat-soft: var(--cat-transferencias-soft);
  --cat-tinta: var(--cat-transferencias-tinta);
  --cat-faixa: var(--cat-transferencias-faixa);
}
.cat-sangrias {
  --cat: rgb(var(--v-theme-warning));
  --cat-soft: color-mix(in srgb, rgb(var(--v-theme-warning)) 16%, transparent);
  --cat-tinta: rgb(var(--v-theme-warning));
  --cat-faixa: rgb(var(--v-theme-warning));
}
.cat-despesas {
  --cat: var(--cat-despesas-base);
  --cat-soft: var(--cat-despesas-soft);
  --cat-tinta: var(--cat-despesas-tinta);
  --cat-faixa: var(--cat-despesas-faixa);
}
.cat-mercadorias {
  --cat: var(--cat-mercadorias-base);
  --cat-soft: var(--cat-mercadorias-soft);
  --cat-tinta: var(--cat-mercadorias-tinta);
  --cat-faixa: var(--cat-mercadorias-faixa);
}
.cat-retiradas {
  --cat: var(--cat-retiradas-base);
  --cat-soft: var(--cat-retiradas-soft);
  --cat-tinta: var(--cat-retiradas-tinta);
  --cat-faixa: var(--cat-retiradas-faixa);
}
.cat-resultado {
  --cat: var(--cat-resultado-base);
  --cat-soft: var(--cat-resultado-soft);
  --cat-tinta: var(--cat-resultado-tinta);
  --cat-faixa: var(--cat-resultado-faixa);
}

.pagamentos-resumo {
  border-top: 1px solid rgba(127, 127, 127, 0.2);
  padding-top: 14px;
}

.pagamentos-resumo__titulo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: var(--padaria-foreground, #252525);
  font-size: 13px;
  font-weight: 800;
}

.pagamentos-resumo__atualizacao {
  color: var(--padaria-muted-foreground, #71717a);
  font-size: 11px;
  font-weight: 600;
}

.pagamentos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}

.pagamento-card {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--pagamento-cor);
  border-radius: 12px;
  background: color-mix(in srgb, var(--pagamento-cor) 10%, transparent);
}

.pagamento-card__icone {
  display: grid;
  grid-row: span 2;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--pagamento-cor);
  color: #fff;
}

.pagamento-card__titulo,
.pagamento-card__quantidade {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pagamento-card__titulo {
  color: var(--pagamento-cor);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.pagamento-card__valor {
  color: var(--pagamento-cor);
  font-size: 17px;
  line-height: 1.1;
}

.pagamento-card__quantidade {
  grid-column: 2;
  color: var(--padaria-muted-foreground, #71717a);
  font-size: 10px;
  font-weight: 600;
}

.pagamento-pix {
  --pagamento-cor: #008f82;
}
.pagamento-credito {
  --pagamento-cor: #6d28d9;
}
.pagamento-debito {
  --pagamento-cor: #2563eb;
}
.pagamento-dinheiro {
  --pagamento-cor: #15803d;
}
.pagamento-crediario {
  --pagamento-cor: #b45309;
}
.pagamento-voucher {
  --pagamento-cor: #c2410c;
}
.pagamento-desvio {
  --pagamento-cor: #dc2626;
}
.pagamento-outros {
  --pagamento-cor: #64748b;
}

@media (width <= 560px) {
  .pagamentos-resumo__titulo {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .pagamentos-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Celular: as categorias empilham em 1 coluna (a barra de cor e o total continuam visiveis). No
   tablet o auto-fill/minmax ja mantem cards com largura confortavel (>=190px). */
@media (width <= 560px) {
  .cat-grid {
    grid-template-columns: 1fr;
  }

  .cat-grid .cat-card:not(.cat-resultado) {
    height: 68px;
    min-height: 68px;
  }

  .cat-grid .cat-card:not(.cat-resultado) .cat-body {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 10px;
    padding: 10px 12px;
  }

  .cat-grid .cat-card:not(.cat-resultado) .cat-head {
    flex: 1 1 auto;
    min-width: 0;
  }

  .cat-grid .cat-card:not(.cat-resultado) .cat-chip {
    flex: 0 0 26px;
    width: 26px;
    height: 26px;
  }

  .cat-grid .cat-card:not(.cat-resultado) .cat-valor {
    flex: 0 0 auto;
    margin-top: 0;
    font-size: 18px;
  }

  .cat-grid .cat-card:not(.cat-resultado) .cat-detalhe,
  .cat-grid .cat-card:not(.cat-resultado) .cat-card__acao,
  .cat-grid .cat-card:not(.cat-resultado) :deep(.malote-abertura) {
    display: none;
  }
}
</style>
