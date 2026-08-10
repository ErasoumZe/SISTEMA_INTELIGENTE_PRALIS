<script setup lang="ts">
import {
  TELA_TEMA_RESUMO_CAIXA,
  deCentavos,
  paraCentavos,
  // Mesma regra que o servico usa para decidir quem e retaguarda. Importada, nunca copiada.
  podeLancarSemCaixa,
  somarCentavos,
  valorTotalCentavos,
  type AuthSession,
  type TemaAplicacao
} from "@padaria/shared";
import type {
  AcaoNovo,
  CadastroForm,
  CaixaStatus,
  EntidadeOperacional,
  MercadoriaAprovacao,
  OperacaoResumo,
  OperacaoForm,
  Opcao,
  Opcoes,
  PermissoesPaginadas,
  ResumoCaixa,
  CaixaAbertoResumo,
  SolicitacaoCofre
} from "~/types/padaria";
import type { Notificacao } from "@padaria/shared/notificacoes";
import AppShell from "~/components/app/AppShell.vue";
import ConfirmacaoDialog from "~/components/comum/ConfirmacaoDialog.vue";
import WorkspaceDialogs from "~/components/workspace/WorkspaceDialogs.vue";
import { WORKSPACE_CONTEXT } from "~/components/workspace/workspace-context";
import { useCadastroView } from "~/composables/useCadastroView";
import { usePermissoes } from "~/composables/usePermissoes";
import { ErroApiCliente } from "~/composables/useApi";
import { avisoOpcoesIndisponiveis, carregarOpcaoOpcional } from "~/utils/opcoes-formulario";
import {
  dataHoraLocal,
  documentoEhCpf,
  formatarDataHora,
  mascararCep,
  mascararCnpj,
  mascararCpf,
  mascararDocumento,
  mascararWhatsapp
} from "~/utils/formatacao";
import {
  bloqueioCadastroUsuario,
  cadastroPayload,
  dinheiro,
  endpointOperacaoPorEntidade,
  formCadastroDeLinha,
  formCadastroVazio,
  formOperacaoVazio,
  itemTemaResumoCaixa,
  itemPorTela,
  mensagemErro,
  entidadePorTela,
  opcoesFiltradasPorEmpresa,
  acoesNovoPermitidas,
  categoriaInicialSaida,
  opcoesVazias,
  rotaTela,
  temaPadrao,
  tipoEndpointCadastro
} from "~/utils/domain";
import {
  estadoRecorrenciaVazio,
  formOperacaoDeDetalhe,
  itemDespesaVazio,
  itemMercadoriaVazio,
  montarPayloadOperacao,
  montarRecorrencia,
  totalItemMercadoriaForm,
  validarOperacaoParaEnvio,
  type OperacaoDetalhe
} from "~/utils/operacoes";
import {
  TAMANHO_PAGINA_OPERACOES,
  diaInicialEntradas,
  paramsListagemOperacoes,
  podeConsultarOutrosDias,
  totalPaginasOperacoes as calcularTotalPaginasOperacoes
} from "~/utils/entradas";
import { corMenuTela } from "~/utils/tema";
import { criarAcoesTema } from "~/utils/tema-acoes";
import { criarAcoesCaixa } from "~/utils/caixa-acoes";
import { criarAcoesSolicitacoesCofre } from "~/utils/solicitacoes-cofre";
import { criarAtualizadorCadastroLocal } from "~/utils/cadastro-local";
import { criarGuardaAberturaOperacao } from "~/utils/abertura-operacao";
import { contaTravadaDeCaixa, nomeDaContaDoLancamento } from "~/utils/perfil-caixa";
import { criarAcoesLancamento } from "~/utils/lancamento-acoes";
import { aplicarRegrasDoAlvoNasListas, regrasComOcultasPreservadas } from "~/utils/permissoes-payload";

type TipoPagina =
  | "inicio"
  | "operacoes"
  | "caixa"
  | "historico_caixas"
  | "fechamento"
  | "relatorio_produtos"
  | "relatorio_vendas"
  | "contas_pagar"
  | "notas_fiscais"
  | "tree"
  | "cadastro"
  | "placeholder";

const props = withDefaults(
  defineProps<{
    telaInicial?: string;
    tipoPagina?: TipoPagina;
  }>(),
  {
    tipoPagina: "placeholder"
  }
);
const tipoPagina = computed(() => props.tipoPagina);
const paginaInicialNeutra = computed(() => tipoPagina.value === "inicio");

const router = useRouter();
const { apiUrl, apiGet, apiGetPaginado, apiPost, apiPut, apiPatch, apiDelete, carregarSessao, aplicarTema } = useApi();

const workspaceCarregado = useState("padaria.workspace.carregado", () => false);
const telaInicialNormalizada = computed(() =>
  paginaInicialNeutra.value ? "" : props.telaInicial && itemPorTela[props.telaInicial] ? props.telaInicial : "entradas"
);

const sessao = useState<AuthSession | null>("padaria.workspace.sessao", () => null);
const opcoes = useState<Opcoes>("padaria.workspace.opcoes", () => opcoesVazias());
const empresas = useState<Opcao[]>("padaria.workspace.empresas", () => []);
const operacoes = useState<OperacaoResumo[]>("padaria.workspace.operacoes", () => []);
const resumo = useState<ResumoCaixa | null>("padaria.workspace.resumo", () => null);
const caixaStatus = useState<CaixaStatus | null>("padaria.workspace.caixaStatus", () => null);
// D4: o que a retaguarda programou para o caixa aberto. Vazio quando nao ha caixa aberto.
const caixaSolicitacoes = useState<SolicitacaoCofre[]>("padaria.workspace.caixaSolicitacoes", () => []);
// D4 (lado da RETAGUARDA): os caixas abertos da empresa e as solicitacoes do caixa escolhido.
// Estado separado do de cima de proposito: aquele e o do operador (o proprio caixa aberto dele),
// este e o da Tesouraria olhando o caixa de outra pessoa.
const caixasAbertos = useState<CaixaAbertoResumo[]>("padaria.workspace.caixasAbertos", () => []);
const caixaSolicitacaoId = useState("padaria.workspace.caixaSolicitacaoId", () => "");
const solicitacoesCofreRetaguarda = useState<SolicitacaoCofre[]>(
  "padaria.workspace.solicitacoesCofreRetaguarda",
  () => []
);
const notificacoes = ref<Notificacao[]>([]);
const telaAtiva = useState("padaria.workspace.telaAtiva", () => telaInicialNormalizada.value);
const empresaSelecionadaId = useState("padaria.workspace.empresaSelecionadaId", () => "");
const carregando = ref(!workspaceCarregado.value);
const empresaCarregando = ref(false);
const atualizandoOperacoesAutomaticamente = ref(false);
const erro = ref("");

const snackbar = reactive({ show: false, text: "", color: "success" });
const confirmacao = reactive({ aberto: false, titulo: "Confirmar ação", mensagem: "", textoConfirmar: "Confirmar" });
let resolverConfirmacao: ((valor: boolean) => void) | null = null;

function confirmarAcao(mensagem: string, titulo = "Confirmar ação", textoConfirmar = "Confirmar") {
  if (resolverConfirmacao) resolverConfirmacao(false);
  Object.assign(confirmacao, { aberto: true, titulo, mensagem, textoConfirmar });
  return new Promise<boolean>((resolve) => {
    resolverConfirmacao = resolve;
  });
}

function responderConfirmacao(confirmou: boolean) {
  confirmacao.aberto = false;
  resolverConfirmacao?.(confirmou);
  resolverConfirmacao = null;
}

const modalOperacaoAberto = ref(false);
const modalCadastroAberto = ref(false);
const modalTemaAberto = ref(false);
const modalCopiaAberto = ref(false);

const entidadeNova = ref<EntidadeOperacional>("venda");
const operacaoEditandoId = ref("");
// Foto do documento (nota/cupom) de despesas e mercadorias: anexada no modal de lancamento.
const fotoDocumento = useFotoDocumento();
const fotoNota = useFotoDocumento();
// Detalhe (somente leitura) da venda integrada (CREARE) — itens, pagamento e total. O cargo caixa
// so visualiza; editar exige entradas_editar (na pratica, admin).
const modalVendaDetalheAberto = ref(false);
const vendaDetalhe = ref<OperacaoDetalhe | null>(null);
const vendaDetalheCarregando = ref(false);
// Modo discriminacao: reutiliza o modal de operacao, mas salva so os itens via PATCH .../discriminar
// (feito por outro setor, DEPOIS, sem exigir caixa aberto). Fila filtravel abaixo.
const modoDiscriminacao = ref(false);
const filtroPendentesDiscriminacao = ref(false);
// Fila de aprovacao de compras vindas de NF-e (retaguarda, tela de mercadorias).
const mostrarAprovacaoMercadorias = ref(false);
const mercadoriasAguardando = ref<MercadoriaAprovacao[]>([]);
const aprovacaoMercadoriasCarregando = ref(false);
const aprovacaoMercadoriaSalvandoId = ref("");
const form = ref<OperacaoForm>(formOperacaoVazio());
const discriminandoDespesa = ref(false);
const discriminandoMercadoria = ref(false);
const itensDespesa = ref([itemDespesaVazio()]);
const itensMercadoria = ref([itemMercadoriaVazio()]);
const erroDiscriminacaoLinha = ref<number | null>(null);
const erroDiscriminacaoCampo = ref<string | null>(null);
// Recorrencia (D3): estado do bloco fica AQUI, junto dos demais campos que salvam, porque e daqui
// que salvarOperacao monta o payload. O bloco da tela so le e escreve via provide/inject.
const recorrencia = ref(estadoRecorrenciaVazio());
const recorrenciaPayload = computed(() => montarRecorrencia(recorrencia.value));
const itensVenda = ref([{ descricaoProduto: "", quantidade: "1", valorUnitario: "", valorTotal: "", produtoId: "" }]);
const tiposPagamento = ref([{ formaPagamentoId: "", totalPago: "", numeroVendas: "1" }]);
const salvandoOperacao = ref(false);
const caixaSalvando = ref(false);

const cadastroTela = ref("");
const cadastroEditandoId = ref("");
const cadastroSalvando = ref(false);
const formCadastro = ref<CadastroForm>(formCadastroVazio());
const permissoesFiltros = reactive({
  q: "",
  tipoPermissao: "",
  alvoId: "",
  permissao: ""
});
const permissoesFiltrosAplicados = reactive({
  q: "",
  tipoPermissao: "",
  alvoId: "",
  permissao: ""
});
const permissoesPagina = ref<PermissoesPaginadas>({ itens: [], total: 0, page: 1, pageSize: 10 });
const permissoesBuscou = ref(false);
const permissoesCarregandoBusca = ref(false);
const permissaoExcluindoId = ref("");

const tema = useState<TemaAplicacao>("padaria.workspace.tema", () => temaPadrao());
const temaAtual = useState<TemaAplicacao>("padaria.workspace.temaAtual", () => temaPadrao());
const temaResumoCaixa = useState<TemaAplicacao>("padaria.workspace.temaResumoCaixa", () => temaPadrao());
const temaTelaAtual = useState("padaria.workspace.temaTelaAtual", () => "");
const temaResumoCaixaAtual = useState("padaria.workspace.temaResumoCaixaAtual", () => "");
const temaTelaEdicao = ref("entradas");
const temaSalvando = ref(false);

const copiaModo = ref<"exportar" | "importar">("importar");
const copiaNivel = ref<"simples" | "completo">("simples");
const copiaTipo = ref("");
const copiaRegistroId = ref("");
const copiaEmpresaOrigemId = ref("");
const copiaEmpresaDestinoId = ref("");
const copiaSalvando = ref(false);

const paginaOperacoes = ref(1);
const totalOperacoes = ref(0);
// Soma em dinheiro do filtro inteiro (S6). null quando a listagem nao manda — so Entradas manda.
const totalLiquidoOperacoes = ref<number | null>(null);
// Dia que a tela de Entradas esta listando (S6). Filtro de data: o operador confere o dia corrente
// e a retaguarda navega para outros dias. Vazio ate a primeira carga (ver sincronizarDiaEntradas).
const diaEntradas = ref("");

const empresasDisponiveis = computed(() => empresas.value);
const empresaId = computed(() => empresaSelecionadaId.value);
const opcoesEmpresa = computed(() => opcoesFiltradasPorEmpresa(opcoes.value, empresaId.value));
const empresaAtiva = computed(
  () => empresasDisponiveis.value.find((empresa) => empresa.id === empresaId.value) ?? null
);
const colaboradoresDisponiveisUsuario = computed(() =>
  opcoesEmpresa.value.colaboradores.filter(
    (colaborador) => !colaborador.usuarioId || colaborador.usuarioId === cadastroEditandoId.value
  )
);
const colaboradoresSelectUsuario = computed(() => [
  { id: "__novo__", nome: "Novo" },
  ...colaboradoresDisponiveisUsuario.value
]);
const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const caixaAberto = computed(() => caixaStatus.value?.caixaAberto ?? null);
const {
  temPermissao,
  podeAcessarTela,
  dependeCaixaAberto,
  telasPermitidas,
  telasDesabilitadasMenu,
  motivosTelasDesabilitadas
} = usePermissoes(permissoesUsuario, () => Boolean(caixaAberto.value));
const podeConfigurarTema = computed(() => temPermissao("aparencia_editar"));
// Recorrencia (D3): so Admin, Gerencia e Financeiro criam serie de lancamentos.
const podeUsarRecorrencia = computed(() => temPermissao("lancamentos_recorrencia_criar"));
// R-121: para o operador de caixa a saida SEMPRE sai da conta do PDV aberto. A tela trava o campo
// nessa conta; o servidor recusa qualquer outra. Vazio para os demais perfis, que escolhem livre.
//
// Quem responde "e operador?" e `utils/perfil-caixa`, que usa a MESMA `podeLancarSemCaixa` do
// servidor. Antes a tela decidia por `caixa_operar && !caixas_gerenciar` — outra regra, que
// divergia da API nos dois sentidos.
const contaTravadaDoCaixa = computed(() => contaTravadaDeCaixa(sessao.value?.perfil, caixaAberto.value));
// O NOME e exibido a parte porque a conta do PDV pode nao estar em `contas_usuarios` do operador —
// e ai ela nao existe na lista de opcoes e o campo apareceria cinza e VAZIO. A trava vem do caixa,
// nao do vinculo: entao a tela sempre diz de qual conta a saida vai sair, com o PDV como reserva.
const contaTravadaDoCaixaNome = computed(() =>
  nomeDaContaDoLancamento({
    contaTravada: contaTravadaDoCaixa.value,
    contaDoFormulario: form.value.contaOrigemId,
    contas: opcoesEmpresa.value.contas,
    pdvNome: caixaAberto.value?.pdvNome
  })
);
const telaBloqueadaPorCaixa = computed(() => {
  const item = itemPorTela[telaAtiva.value];
  return item ? dependeCaixaAberto(item) && !caixaAberto.value : false;
});
// Opcoes do seletor de aparencia com rotulo explicito: "padrao" (global) primeiro, o resumo do
// caixa, e cada tela como "Somente a tela: X" — deixa claro se a cor vale para tudo ou uma so.
const telasTemaPermitidas = computed(() => [
  { id: "padrao", titulo: "Padrão (todas as telas)" },
  { id: itemTemaResumoCaixa.id, titulo: itemTemaResumoCaixa.titulo },
  ...telasPermitidas.value.map((tela) => ({ id: tela.id, titulo: `Somente a tela: ${tela.titulo}` }))
]);
const telasShell = computed(() => {
  // Cor do icone dirigida pela Aparencia da empresa: categorizada ou personalizada colore;
  // sem configuracao carregada, corMenuTela devolve o default estatico da categoria.
  return telasPermitidas.value.map((item) => ({
    ...item,
    cor: corMenuTela(empresaAtiva.value?.configuracoesAparencia, item.id)
  }));
});
const motivoTelaAtivaDesabilitada = computed(
  () => motivosTelasDesabilitadas.value[telaAtiva.value] ?? "Tela indisponivel para este perfil."
);
const telaAtual = computed(() => itemPorTela[telaAtiva.value] ?? telasPermitidas.value[0]);
const telaSuportaDiscriminacao = computed(() => telaAtiva.value === "mercadorias" || telaAtiva.value === "despesas");
const permissaoDiscriminarTela = computed(() => {
  if (telaAtiva.value === "mercadorias") return "mercadorias_discriminar" as const;
  if (telaAtiva.value === "despesas") return "despesas_discriminar" as const;
  return null;
});
const podeDiscriminarTela = computed(() => {
  const permissao = permissaoDiscriminarTela.value;
  return permissao ? temPermissao(permissao) : false;
});
const operacoesDaTela = computed(() =>
  filtroPendentesDiscriminacao.value && telaSuportaDiscriminacao.value
    ? operacoes.value.filter((operacao) => operacao.pendenteDiscriminacao)
    : operacoes.value
);
// `operacoes` JA e a pagina vinda do servidor; o total tambem. O fatiamento em memoria saiu junto
// com a paginacao falsa (ver carregarOperacoes).
const totalPaginasOperacoes = computed(() => calcularTotalPaginasOperacoes(totalOperacoes.value));
const operacoesPaginadas = computed(() => operacoesDaTela.value);
// Filtro de data das Entradas: quem esta preso ao caixa aberto nao troca de dia (o servidor forca o
// dia do caixa em resolverEscopoEntradasDoDia); a tela mostra o campo desabilitado em vez de fingir
// que funciona.
const podeConsultarOutrosDiasEntradas = computed(() => podeConsultarOutrosDias(permissoesUsuario.value));
// "+ NOVO" = 3 eixos (Entradas / Transferencias / Saidas). Sem trava de caixa AQUI: quem nao opera
// caixa (Tesouraria, Financeiro) precisa do botao mesmo assim; a trava de caixa aberto continua em
// abrirOperacao, que avisa e leva para /caixa quando a entidade exige caixa.
const acoesNovo = computed(() => acoesNovoPermitidas(permissoesUsuario.value));
const {
  dadosCadastro,
  descricaoTela,
  colunasCadastro,
  treeGrupos,
  treeAreasSetores,
  regrasDaLinha,
  permissoesDaSecao,
  estadoRegraPermissao,
  definirRegraPermissao
} = useCadastroView({
  opcoes,
  opcoesEmpresa,
  empresas,
  permissoesPagina,
  formCadastro
});
// M4/ADR-003: somas monetarias do preview em centavos inteiros (mesma aritmetica do
// servidor); paraCentavos tolera virgula ("10,50") e string vazia.
const totalItensDespesa = computed(() => deCentavos(somarCentavos(...itensDespesa.value.map((item) => item.valor))));
const totalItensMercadoria = computed(() =>
  deCentavos(somarCentavos(...itensMercadoria.value.map((item) => totalItemMercadoriaForm(item))))
);
const totalItensVenda = computed(() => deCentavos(somarCentavos(...itensVenda.value.map((item) => item.valorTotal))));
const totalTiposPagamento = computed(() =>
  deCentavos(somarCentavos(...tiposPagamento.value.map((item) => item.totalPago)))
);
// R-042: a conta do Valor Total vive em @padaria/shared (valorTotalCentavos), testada. Aqui era
// uma expressao inline sem funcao e sem teste — foi assim que a regra caiu em desuso sem nada
// quebrar. O servidor recalcula a mesma coisa e nao confia neste numero (ver valoresJuros).
const valorTotalOperacao = computed(() =>
  deCentavos(
    valorTotalCentavos({
      valorOriginal: form.value.valorOriginal,
      // "" no form = sem juros; o contrato so conhece 'percentual' | 'valor' | null.
      jurosTipo: form.value.jurosTipo || null,
      jurosValorInformado: form.value.jurosValorInformado,
      valorDesconto: form.value.valorDesconto
    })
  )
);
const alvosFiltroPermissoes = computed(() => {
  const tipo = permissoesFiltros.tipoPermissao;
  if (tipo === "cargo") return opcoesEmpresa.value.cargos.map((item) => ({ id: item.id, nome: item.nome ?? item.id }));
  if (tipo === "setor") return opcoesEmpresa.value.setores.map((item) => ({ id: item.id, nome: item.nome ?? item.id }));
  if (tipo === "usuario")
    return opcoesEmpresa.value.usuarios.map((item) => ({
      id: item.usuarioId ?? item.id,
      nome: item.nome ?? item.email ?? item.usuarioId ?? item.id
    }));
  return [
    ...opcoesEmpresa.value.cargos.map((item) => ({ id: item.id, nome: `Cargo: ${item.nome ?? item.id}` })),
    ...opcoesEmpresa.value.setores.map((item) => ({ id: item.id, nome: `Setor: ${item.nome ?? item.id}` })),
    ...opcoesEmpresa.value.usuarios.map((item) => ({
      id: item.usuarioId ?? item.id,
      nome: `Usuário: ${item.nome ?? item.email ?? item.usuarioId ?? item.id}`
    }))
  ];
});

// Excluir o ultimo item de uma pagina pode deixar a pagina atual fora do total: volta e recarrega
// (com paginacao no servidor, ficar numa pagina inexistente devolveria lista vazia).
watch(totalPaginasOperacoes, (total) => {
  if (paginaOperacoes.value > total) {
    paginaOperacoes.value = total;
    void carregarOperacoes();
  }
});

// Ao filtrar a fila de pendencias, volta para a primeira pagina e recarrega os lancamentos
// (a fila ignora o caixa, entao precisa buscar no servidor, nao apenas filtrar em memoria).
watch(filtroPendentesDiscriminacao, () => {
  paginaOperacoes.value = 1;
  void carregarOperacoes();
});
watch(telaAtiva, () => {
  filtroPendentesDiscriminacao.value = false;
  mostrarAprovacaoMercadorias.value = false;
});
// Ao abrir a fila de aprovacao de NF-e, busca os cabecalhos aguardando (visao independente do caixa).
watch(mostrarAprovacaoMercadorias, (ativo) => {
  if (ativo) void carregarMercadoriasAguardando();
});

watch([discriminandoDespesa, totalItensDespesa], () => {
  if (discriminandoDespesa.value)
    form.value.valorOriginal = totalItensDespesa.value ? totalItensDespesa.value.toFixed(2) : "";
});

watch([discriminandoMercadoria, totalItensMercadoria], () => {
  if (discriminandoMercadoria.value)
    form.value.valorOriginal = totalItensMercadoria.value ? totalItensMercadoria.value.toFixed(2) : "";
});

watch([totalItensVenda, totalTiposPagamento, entidadeNova], () => {
  if (entidadeNova.value !== "venda") return;
  const totalDetalhado = totalItensVenda.value || totalTiposPagamento.value;
  if (totalDetalhado) form.value.valorOriginal = totalDetalhado.toFixed(2);
});

watch(
  () => form.value.temNotaFiscal,
  (temNota) => {
    if (temNota) form.value.computar = true;
  }
);

watch(
  () => permissoesFiltros.tipoPermissao,
  () => {
    permissoesFiltros.alvoId = "";
  }
);

watch([telaAtiva, empresaId], ([tela, idEmpresa]) => {
  if (!sessao.value || !tela || !idEmpresa) return;
  if (temaTelaAtual.value !== `${idEmpresa}:${tela}`) void carregarTemaTela(tela);
  if (temaResumoCaixaAtual.value !== `${idEmpresa}:${TELA_TEMA_RESUMO_CAIXA}`) void carregarTemaResumoCaixa();
});

watch(
  telaInicialNormalizada,
  async (novaTela) => {
    if (paginaInicialNeutra.value) {
      telaAtiva.value = "";
      if (workspaceCarregado.value && sessao.value) {
        erro.value = "";
        paginaOperacoes.value = 1;
        await carregarStatusCaixa(empresaId.value);
        if (temaTelaAtual.value !== `${empresaId.value}:padrao`) await carregarTemaTela("padrao");
      }
      return;
    }

    if (!novaTela || !itemPorTela[novaTela]) return;
    if (novaTela === telaAtiva.value && workspaceCarregado.value) return;
    telaAtiva.value = novaTela;
    paginaOperacoes.value = 1;
    if (!workspaceCarregado.value || !sessao.value) return;
    erro.value = "";
    if (!telasDoUsuario().includes(novaTela)) {
      erro.value = "Sem permissão para acessar esta página.";
      return;
    }
    await carregarDadosTela(novaTela, empresaId.value);
  },
  { immediate: true }
);

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

function atualizarDocumentoCadastro(valor: string) {
  const documento = mascararDocumento(valor);
  formCadastro.value.documento = documento;
  if (cadastroTela.value === "clientes" && !documentoEhCpf(documento)) formCadastro.value.dataNascimento = "";
}

function telasDoUsuario() {
  return Object.keys(itemPorTela).filter((id) => {
    const item = itemPorTela[id];
    return item && podeAcessarTela(item);
  });
}

function caixaIdFiltroTela(tela = telaAtiva.value) {
  const item = itemPorTela[tela];
  if (!item || !dependeCaixaAberto(item)) return "";
  return caixaAberto.value?.id ?? "";
}

async function selecionarEmpresa(id: string) {
  if (!id || id === empresaSelecionadaId.value) return;
  empresaSelecionadaId.value = id;
  await trocarEmpresa(id);
}

async function carregarEmpresas() {
  empresas.value = sessao.value?.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
  opcoes.value.empresas = empresas.value;
  if (empresas.value.length && !empresaSelecionadaId.value) empresaSelecionadaId.value = empresas.value[0]?.id ?? "";
}

async function carregarDadosTela(tela: string, idEmpresa = empresaId.value) {
  if (!idEmpresa && tela !== "empresas") return;
  empresaCarregando.value = true;
  try {
    await Promise.all([carregarStatusCaixa(idEmpresa), carregarNotificacoes(idEmpresa)]);
    if (telaBloqueadaPorCaixa.value) {
      const dados = opcoesVazias();
      dados.empresas = empresas.value;
      opcoes.value = dados;
      operacoes.value = [];
      return;
    }
    if (tela === "empresas") {
      await carregarEmpresas();
    } else {
      await carregarDadosPagina(idEmpresa, tela);
    }
    await carregarOperacoes(idEmpresa);
    // D4: os caixas abertos so interessam a tela de Transferencias (painel da retaguarda).
    if (tela === "transferencias") await carregarCaixasAbertos();
  } finally {
    empresaCarregando.value = false;
  }
}

async function carregarNotificacoes(idEmpresa = empresaId.value) {
  if (!idEmpresa) {
    notificacoes.value.splice(0);
    return;
  }
  const itens = await apiGet<Notificacao[]>(`/api/notificacoes?empresaId=${encodeURIComponent(idEmpresa)}`);
  notificacoes.value.splice(0, notificacoes.value.length, ...itens);
}

async function verificarNotificacao(notificacaoId: string) {
  try {
    await apiPut(`/api/notificacoes/${notificacaoId}/verificar?empresaId=${encodeURIComponent(empresaId.value)}`, {});
    await carregarNotificacoes();
    notificar("Notificacao verificada.");
  } catch (error) {
    notificar(mensagemErro(error), "error");
  }
}

async function trocarEmpresa(idEmpresa = empresaId.value) {
  if (paginaInicialNeutra.value) {
    await carregarStatusCaixa(idEmpresa);
    await carregarTemaTela("padrao");
    await carregarTemaResumoCaixa();
    return;
  }
  await carregarDadosTela(telaAtiva.value, idEmpresa);
  await carregarTemaTela(telaAtiva.value);
  await carregarTemaResumoCaixa();
}

async function carregarDadosPagina(idEmpresa = empresaId.value, tela = telaAtiva.value) {
  const params = new URLSearchParams({ t: String(Date.now()) });
  if (idEmpresa) params.set("empresaId", idEmpresa);
  const query = `?${params.toString()}`;
  const dados = opcoesVazias();
  dados.empresas = empresas.value;
  // Opcoes que falharem por falta de permissao (403) sao registradas aqui; a tela renderiza mesmo
  // assim e o usuario recebe um aviso discreto no fim (falha silenciosa e proibida).
  const faltas: string[] = [];
  const gruposVazios: Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas"> = {
    gruposDespesas: [],
    gruposMercadorias: [],
    gruposRetiradas: []
  };

  if (tela === "contas") {
    // Tela de Contas (D8): a listagem precisa do fundo, do saldo ATUAL derivado e de quem opera a
    // conta — /api/contas/saldos. As demais telas seguem no GET /api/contas (id+nome), que e lista
    // de opcao de formulario e nao paga as consultas de movimento.
    // Os usuarios alimentam a grade "quem pode movimentar" do formulario.
    [dados.contas, dados.usuarios] = await Promise.all([
      carregarOpcaoOpcional(faltas, "Contas", () => apiGet<Opcao[]>(`/api/contas/saldos${query}`), []),
      carregarOpcaoOpcional(faltas, "Usuários", () => apiGet<Opcao[]>(`/api/usuarios${query}`), [])
    ]);
  } else if (tela === "entradas") {
    [dados.contas, dados.produtos, dados.pdvs, dados.formasPagamento] = await Promise.all([
      carregarOpcaoOpcional(faltas, "Contas", () => apiGet<Opcao[]>(`/api/contas${query}`), []),
      carregarOpcaoOpcional(faltas, "Produtos", () => apiGet<Opcao[]>(`/api/produtos${query}`), []),
      carregarOpcaoOpcional(faltas, "PDVs", () => apiGet<Opcao[]>(`/api/pdvs${query}`), []),
      carregarOpcaoOpcional(faltas, "Formas de pagamento", () => apiGet<Opcao[]>(`/api/formas_pagamento${query}`), [])
    ]);
  } else if (tela === "fechamento") {
    dados.contas = await carregarOpcaoOpcional(faltas, "Contas", () => apiGet<Opcao[]>(`/api/contas${query}`), []);
  } else if (tela === "caixa") {
    [dados.pdvs, dados.turnos, dados.maquininhas] = await Promise.all([
      carregarOpcaoOpcional(faltas, "PDVs", () => apiGet<Opcao[]>(`/api/pdvs${query}`), []),
      carregarOpcaoOpcional(
        faltas,
        "Turnos",
        () => apiGetPaginado<Opcao>(`/api/turnos${query}`).then((r) => r.itens),
        []
      ),
      carregarOpcaoOpcional(
        faltas,
        "Maquininhas",
        () => apiGetPaginado<Opcao>(`/api/maquininhas${query}`).then((r) => r.itens),
        []
      )
    ]);
  } else if (tela === "historico_caixas") {
    // Opcoes dos filtros da retaguarda (PDV/turno/operador). A listagem em si e paginada e
    // filtrada pelo servidor dentro da propria tela.
    [dados.pdvs, dados.turnos, dados.colaboradores] = await Promise.all([
      carregarOpcaoOpcional(faltas, "PDVs", () => apiGet<Opcao[]>(`/api/pdvs${query}`), []),
      carregarOpcaoOpcional(
        faltas,
        "Turnos",
        () => apiGetPaginado<Opcao>(`/api/turnos${query}`).then((r) => r.itens),
        []
      ),
      carregarOpcaoOpcional(faltas, "Colaboradores", () => apiGet<Opcao[]>(`/api/colaboradores${query}`), [])
    ]);
  } else if (tela === "pdv") {
    [dados.contas, dados.pdvs] = await Promise.all([
      carregarOpcaoOpcional(faltas, "Contas", () => apiGet<Opcao[]>(`/api/contas${query}`), []),
      carregarOpcaoOpcional(faltas, "PDVs", () => apiGet<Opcao[]>(`/api/pdvs${query}`), [])
    ]);
  } else if (tela === "transferencias") {
    // Origem/Destino: SO as contas que o usuario opera (contas_usuarios; admin ve todas). Ver
    // /api/contas-usuarios/minhas-contas. Sem vinculo => vazio (o modal mostra o aviso).
    dados.contas = await carregarOpcaoOpcional(
      faltas,
      "Contas",
      () => apiGet<Opcao[]>(`/api/contas-usuarios/minhas-contas${query}`),
      []
    );
  } else if (tela === "despesas") {
    Object.assign(
      dados,
      await carregarOpcaoOpcional(
        faltas,
        "Grupos",
        () => apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`),
        gruposVazios
      )
    );
    // Conta do lancamento: escopo por usuario (contas_usuarios; admin ve todas).
    // gruposPatrimonio: segunda origem do campo Grupo da discriminacao (§5, item 6). Opcional —
    // quem nao tem permissao de patrimonio segue lancando so com os grupos de despesa.
    [dados.contas, dados.fornecedores, dados.colaboradores, dados.gruposPatrimonio, dados.patrimonioItens] =
      await Promise.all([
        carregarOpcaoOpcional(
          faltas,
          "Contas",
          () => apiGet<Opcao[]>(`/api/contas-usuarios/minhas-contas${query}`),
          []
        ),
        carregarOpcaoOpcional(faltas, "Fornecedores", () => apiGet<Opcao[]>(`/api/fornecedores${query}`), []),
        // E6: colaboradores sao a SEGUNDA origem do item na discriminacao de despesa (a primeira e
        // patrimonio). A tela de despesas nao os carregava — o select ficava so com "—" e nao havia
        // como discriminar, ja que a descricao livre saiu.
        carregarOpcaoOpcional(faltas, "Colaboradores", () => apiGet<Opcao[]>(`/api/colaboradores${query}`), []),
        carregarOpcaoOpcional(
          faltas,
          "Grupos de patrimonio",
          async () => (await apiGet<Pick<Opcoes, "gruposPatrimonio">>(`/api/patrimonio${query}`)).gruposPatrimonio,
          []
        ),
        // E6: os ITENS de patrimonio sao a origem do item na discriminacao de despesa. Rota ENXUTA
        // (so id/nome/grupo) que aceita tambem quem apenas LANCA despesa — sem ela, quem nao tem
        // `cadastro_patrimonio_visualizar` ficaria sem como discriminar, agora que a descricao livre
        // saiu da tela.
        carregarOpcaoOpcional(
          faltas,
          "Itens de patrimonio",
          () => apiGet<Opcao[]>(`/api/patrimonio/opcoes-itens${query}`),
          []
        )
      ]);
  } else if (tela === "contas_pagar") {
    dados.pdvs = await carregarOpcaoOpcional(faltas, "PDVs", () => apiGet<Opcao[]>(`/api/pdvs${query}`), []);
  } else if (tela === "mercadorias" || tela === "pedidos") {
    Object.assign(
      dados,
      await carregarOpcaoOpcional(
        faltas,
        "Grupos",
        () => apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`),
        gruposVazios
      )
    );
    // Conta origem e obrigatoria no form de mercadoria (sem ela o select fica "No data available").
    // Conta origem: escopo por usuario (contas_usuarios; admin ve todas).
    // gruposPatrimonio: segunda origem do campo Grupo da discriminacao (§5, item 6).
    [dados.contas, dados.fornecedores, dados.unidadesMedida, dados.produtos, dados.gruposPatrimonio] =
      await Promise.all([
        carregarOpcaoOpcional(
          faltas,
          "Contas",
          () => apiGet<Opcao[]>(`/api/contas-usuarios/minhas-contas${query}`),
          []
        ),
        carregarOpcaoOpcional(faltas, "Fornecedores", () => apiGet<Opcao[]>(`/api/fornecedores${query}`), []),
        carregarOpcaoOpcional(faltas, "Unidades de medida", () => apiGet<Opcao[]>(`/api/unidades_medida${query}`), []),
        carregarOpcaoOpcional(faltas, "Produtos", () => apiGet<Opcao[]>(`/api/produtos${query}`), []),
        carregarOpcaoOpcional(
          faltas,
          "Grupos de patrimonio",
          async () => (await apiGet<Pick<Opcoes, "gruposPatrimonio">>(`/api/patrimonio${query}`)).gruposPatrimonio,
          []
        )
      ]);
  } else if (tela === "retiradas") {
    Object.assign(
      dados,
      await carregarOpcaoOpcional(
        faltas,
        "Grupos",
        () => apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`),
        gruposVazios
      )
    );
    // Conta origem e obrigatoria no form de retirada (sem ela o select fica "No data available").
    // Conta origem: escopo por usuario (contas_usuarios; admin ve todas).
    [dados.contas, dados.fornecedores, dados.colaboradores, dados.sociosGestores] = await Promise.all([
      carregarOpcaoOpcional(faltas, "Contas", () => apiGet<Opcao[]>(`/api/contas-usuarios/minhas-contas${query}`), []),
      carregarOpcaoOpcional(faltas, "Fornecedores", () => apiGet<Opcao[]>(`/api/fornecedores${query}`), []),
      carregarOpcaoOpcional(faltas, "Colaboradores", () => apiGet<Opcao[]>(`/api/colaboradores${query}`), []),
      carregarOpcaoOpcional(faltas, "Sócios e Gestores", () => apiGet<Opcao[]>(`/api/socios-gestores${query}`), [])
    ]);
  } else if (tela === "grupos") {
    Object.assign(
      dados,
      await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`)
    );
  } else if (tela === "patrimonio") {
    // Uma chamada traz grupos + itens; os setores alimentam o select do item.
    const [patrimonio, setores] = await Promise.all([
      apiGet<Pick<Opcoes, "gruposPatrimonio" | "patrimonioItens">>(`/api/patrimonio${query}`),
      carregarOpcaoOpcional(faltas, "Setores", () => apiGet<Opcao[]>(`/api/setores${query}`), [])
    ]);
    Object.assign(dados, patrimonio);
    dados.setores = setores;
  } else if (tela === "unidades") {
    dados.unidadesMedida = await apiGet<Opcao[]>(`/api/unidades_medida${query}`);
  } else if (tela === "turnos") {
    dados.turnos = (await apiGetPaginado<Opcao>(`/api/turnos${query}`)).itens;
  } else if (tela === "areas_setores") {
    Object.assign(dados, await apiGet<Pick<Opcoes, "areas" | "setores">>(`/api/areas_setores${query}`));
  } else if (tela === "usuarios") {
    [dados.usuarios, dados.colaboradores, dados.setores, dados.cargos] = await Promise.all([
      apiGet<Opcao[]>(`/api/usuarios${query}`),
      apiGet<Opcao[]>(`/api/colaboradores${query}`),
      apiGet<Opcao[]>(`/api/setores${query}`),
      apiGet<Opcao[]>(`/api/cargos${query}`)
    ]);
  } else if (tela === "permissoes") {
    Object.assign(
      dados,
      await apiGet<
        Pick<
          Opcoes,
          | "permissoes"
          | "cargos"
          | "cargosPermissoes"
          | "setores"
          | "setoresPermissoes"
          | "usuarios"
          | "usuariosPermissoes"
        >
      >(`/api/permissoes${query}`)
    );
    permissoesBuscou.value = false;
    permissoesPagina.value = { itens: [], total: 0, page: 1, pageSize: permissoesPagina.value.pageSize };
  } else if (tela === "colaboradores") {
    [dados.colaboradores, dados.cargos, dados.setores] = await Promise.all([
      apiGet<Opcao[]>(`/api/colaboradores${query}`),
      apiGet<Opcao[]>(`/api/cargos${query}`),
      apiGet<Opcao[]>(`/api/setores${query}`)
    ]);
    dados.turnos = (await apiGetPaginado<Opcao>(`/api/turnos${query}`)).itens;
  } else if (tela === "fornecedores") {
    dados.fornecedores = await apiGet<Opcao[]>(`/api/fornecedores${query}`);
  } else if (tela === "socios_gestores") {
    dados.sociosGestores = await apiGet<Opcao[]>(`/api/socios-gestores${query}`);
  } else if (tela === "maquininhas") {
    dados.maquininhas = (await apiGetPaginado<Opcao>(`/api/maquininhas${query}`)).itens;
  } else if (tela === "clientes") {
    dados.clientes = await apiGet<Opcao[]>(`/api/clientes${query}`);
  } else if (tela === "formas_pagamento") {
    dados.formasPagamento = await apiGet<Opcao[]>(`/api/formas_pagamento${query}`);
  } else if (tela === "produtos") {
    const [produtos, grupos, unidades] = await Promise.all([
      apiGet<Opcao[]>(`/api/produtos${query}`),
      apiGet<Pick<Opcoes, "gruposMercadorias">>(`/api/grupos${query}`),
      apiGet<Opcao[]>(`/api/unidades_medida${query}`)
    ]);
    dados.produtos = produtos;
    dados.gruposMercadorias = grupos.gruposMercadorias;
    dados.unidadesMedida = unidades;
  } else if (tela === "relatorio_vendas") {
    [dados.pdvs, dados.clientes, dados.colaboradores, dados.formasPagamento, dados.turnos] = await Promise.all([
      carregarOpcaoOpcional(faltas, "PDVs", () => apiGet<Opcao[]>(`/api/pdvs${query}`), []),
      carregarOpcaoOpcional(faltas, "Clientes", () => apiGet<Opcao[]>(`/api/clientes${query}`), []),
      carregarOpcaoOpcional(faltas, "Colaboradores", () => apiGet<Opcao[]>(`/api/colaboradores${query}`), []),
      carregarOpcaoOpcional(faltas, "Formas de pagamento", () => apiGet<Opcao[]>(`/api/formas_pagamento${query}`), []),
      carregarOpcaoOpcional(
        faltas,
        "Turnos",
        () => apiGetPaginado<Opcao>(`/api/turnos${query}`).then((r) => r.itens),
        []
      )
    ]);
  }

  if (temPermissao("caixa_operar") && idEmpresa && !dados.pdvs.length) {
    dados.pdvs = await carregarOpcaoOpcional(faltas, "PDVs", () => apiGet<Opcao[]>(`/api/pdvs${query}`), []);
  }

  const aviso = avisoOpcoesIndisponiveis(faltas);
  if (aviso) notificar(aviso, "warning");
  opcoes.value = dados;
}

async function carregarTudo() {
  carregando.value = true;
  erro.value = "";
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      workspaceCarregado.value = false;
      await router.push("/login");
      return;
    }
    await carregarEmpresas();
    const perfilEmpresaId = sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? "";
    if (perfilEmpresaId && empresas.value.some((empresa) => empresa.id === perfilEmpresaId)) {
      empresaSelecionadaId.value = perfilEmpresaId;
    }
    const telas = telasDoUsuario();
    if (!paginaInicialNeutra.value && !telas.includes(telaAtiva.value)) {
      erro.value = "Sem permissão para acessar esta página.";
      return;
    }
    await Promise.all([carregarStatusCaixa(empresaId.value), carregarNotificacoes(empresaId.value)]);
    if (!paginaInicialNeutra.value) await carregarDadosTela(telaAtiva.value, empresaId.value);
    await carregarTemaTela(paginaInicialNeutra.value ? "padrao" : telaAtiva.value);
    await carregarTemaResumoCaixa();
    workspaceCarregado.value = true;
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

// Mantem `diaEntradas` coerente com o perfil e com o caixa: quem pode navegar entre dias comeca em
// hoje e depois manda no campo; quem esta preso ao caixa acompanha o dia CONTABIL do caixa aberto
// (abrir ou fechar caixa troca o dia listado), que e o que o servidor forca de qualquer forma.
function sincronizarDiaEntradas() {
  if (podeConsultarOutrosDiasEntradas.value) {
    if (!diaEntradas.value) diaEntradas.value = diaInicialEntradas({ podeConsultarOutrosDias: true });
    return;
  }
  diaEntradas.value = diaInicialEntradas({
    podeConsultarOutrosDias: false,
    dataMovimentoCaixa: caixaAberto.value?.dataMovimento
  });
}

async function carregarOperacoes(idEmpresa = empresaId.value) {
  if (!idEmpresa) return;
  const entidade = entidadePorTela[telaAtiva.value];
  if (!entidade) return;
  // Fila de pendentes: mostra lancamentos sem discriminacao de qualquer caixa (inclusive os
  // vindos de NF-e com caixa_id NULL), ignorando o filtro de caixa aberto.
  const pendentes = filtroPendentesDiscriminacao.value && telaSuportaDiscriminacao.value;
  const caixaId = caixaIdFiltroTela();
  const item = itemPorTela[telaAtiva.value];
  if (!pendentes && item && dependeCaixaAberto(item) && !caixaId) {
    operacoes.value = [];
    totalOperacoes.value = 0;
    return;
  }
  // So Entradas recorta por DIA (D7). As demais telas seguem com o escopo do caixa/periodo delas.
  if (telaAtiva.value === "entradas") sincronizarDiaEntradas();
  const params = paramsListagemOperacoes({
    empresaId: idEmpresa,
    pagina: paginaOperacoes.value,
    pendenteDiscriminacao: pendentes,
    caixaId,
    dia: telaAtiva.value === "entradas" ? diaEntradas.value : ""
  });
  const pagina = await apiGetPaginado<OperacaoResumo, { totalLiquido?: number }>(
    `/api/${endpointOperacaoPorEntidade[entidade]}?${params.toString()}`
  );
  operacoes.value = pagina.itens;
  totalOperacoes.value = pagina.total;
  // Totalizador do topo (S6): so a listagem de Entradas manda o total em dinheiro do filtro.
  totalLiquidoOperacoes.value = pagina.meta?.totalLiquido ?? null;
}

// Fila de aprovacao (NF-e): visao de retaguarda, ignora o caixa. Carregada sob demanda ao ligar
// o toggle na tela de mercadorias.
async function carregarMercadoriasAguardando(idEmpresa = empresaId.value) {
  if (!idEmpresa) {
    mercadoriasAguardando.value = [];
    return;
  }
  aprovacaoMercadoriasCarregando.value = true;
  try {
    mercadoriasAguardando.value = (
      await apiGetPaginado<MercadoriaAprovacao>(
        `/api/mercadorias/aguardando-aprovacao?empresaId=${idEmpresa}&pageSize=100`
      )
    ).itens;
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    aprovacaoMercadoriasCarregando.value = false;
  }
}

async function aprovarMercadoriaAguardando(id: string, computar: boolean) {
  aprovacaoMercadoriaSalvandoId.value = id;
  try {
    await apiPatch(`/api/mercadorias/${id}/aprovar`, { empresaId: empresaId.value, computar });
    mercadoriasAguardando.value = mercadoriasAguardando.value.filter((m) => m.id !== id);
    notificar(computar ? "Compra aprovada e computada no financeiro." : "Compra aprovada (somente fiscal).");
    await carregarStatusCaixa(empresaId.value);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    aprovacaoMercadoriaSalvandoId.value = "";
  }
}

async function recusarMercadoriaAguardando(id: string) {
  aprovacaoMercadoriaSalvandoId.value = id;
  try {
    await apiPatch(`/api/mercadorias/${id}/recusar`, { empresaId: empresaId.value });
    mercadoriasAguardando.value = mercadoriasAguardando.value.filter((m) => m.id !== id);
    notificar("Compra recusada.");
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    aprovacaoMercadoriaSalvandoId.value = "";
  }
}

async function carregarStatusCaixa(idEmpresa = empresaId.value) {
  if (!idEmpresa) return;
  if (!temPermissao("caixa_operar")) {
    caixaStatus.value = null;
    resumo.value = null;
    caixaSolicitacoes.value = [];
    return;
  }
  caixaStatus.value = await apiGet<CaixaStatus>(`/api/caixa/status?empresaId=${idEmpresa}`);
  resumo.value = caixaStatus.value?.resumo ?? null;
  // D4: as solicitacoes da retaguarda viajam junto com o status porque e o mesmo instante de
  // decisao do operador — ele olha o saldo e o que pediram dele na mesma tela, nao em duas.
  const caixaId = caixaStatus.value?.caixaAberto?.id;
  caixaSolicitacoes.value = caixaId ? await apiGet<SolicitacaoCofre[]>(`/api/caixa/${caixaId}/solicitacoes-cofre`) : [];
}

async function atualizarOperacoesAutomaticamente() {
  if (
    tipoPagina.value !== "operacoes" ||
    !sessao.value ||
    !empresaId.value ||
    atualizandoOperacoesAutomaticamente.value ||
    empresaCarregando.value
  ) {
    return;
  }

  atualizandoOperacoesAutomaticamente.value = true;
  try {
    // O robo inclui vendas fora desta aplicacao. Recarrega primeiro o caixa e depois usa
    // esse mesmo caixa para atualizar a tabela, mantendo os cartoes e as linhas coerentes.
    await carregarStatusCaixa(empresaId.value);
    await carregarOperacoes(empresaId.value);
  } catch (error) {
    console.error("Falha ao atualizar os lancamentos automaticamente", error);
  } finally {
    atualizandoOperacoesAutomaticamente.value = false;
  }
}

type ChaveOpcaoOperacao =
  | "contas"
  | "fornecedores"
  | "colaboradores"
  | "sociosGestores"
  | "produtos"
  | "formasPagamento"
  | "pdvs"
  | "unidadesMedida"
  | "grupos";

// Opcoes que o modal de cada operacao precisa. O +NOVO e global (abre qualquer operacao de
// qualquer tela), entao carregamos as opcoes por ENTIDADE ao abrir o modal — senao os selects
// (fornecedor, grupo, conta, colaborador...) ficam "No data available" quando a operacao e aberta
// fora da sua propria tela (ex.: abrir "Nova Despesa" estando na tela Entradas).
const opcoesPorEntidade: Record<EntidadeOperacional, ChaveOpcaoOperacao[]> = {
  venda: ["contas", "produtos", "pdvs", "formasPagamento"],
  despesa: ["contas", "fornecedores", "grupos"],
  mercadoria: ["contas", "fornecedores", "produtos", "unidadesMedida", "grupos"],
  // R-128 fez do FORNECEDOR o credor padrao da retirada — e o chip que ja vem ativo ao abrir. Sem
  // carregar a lista, o caminho normal da retirada abria um select vazio. Nao precisa de decisao de
  // permissao: `GET /api/fornecedores` aceita `despesas_visualizar`/`mercadorias_visualizar`, e todo
  // cargo padrao com `retiradas` tem os dois. `colaboradores` fica para o credor LEGADO reabrir com
  // nome, nao para lancamento novo.
  retirada: ["contas", "fornecedores", "colaboradores", "sociosGestores", "grupos"],
  transferencia: ["contas"]
};

async function carregarOpcoesParaOperacao(entidade: EntidadeOperacional, idEmpresa = empresaId.value) {
  const params = new URLSearchParams({ t: String(Date.now()) });
  if (idEmpresa) params.set("empresaId", idEmpresa);
  const query = `?${params.toString()}`;
  const alvo = opcoes.value;

  const tarefas: Record<ChaveOpcaoOperacao, () => Promise<void>> = {
    contas: async () => {
      // Modal aberto pelo "+ NOVO" global: contas do usuario (contas_usuarios; admin ve todas).
      alvo.contas = await apiGet<Opcao[]>(`/api/contas-usuarios/minhas-contas${query}`);
    },
    fornecedores: async () => {
      alvo.fornecedores = await apiGet<Opcao[]>(`/api/fornecedores${query}`);
    },
    colaboradores: async () => {
      alvo.colaboradores = await apiGet<Opcao[]>(`/api/colaboradores${query}`);
    },
    sociosGestores: async () => {
      alvo.sociosGestores = await apiGet<Opcao[]>(`/api/socios-gestores${query}`);
    },
    produtos: async () => {
      alvo.produtos = await apiGet<Opcao[]>(`/api/produtos${query}`);
    },
    formasPagamento: async () => {
      alvo.formasPagamento = await apiGet<Opcao[]>(`/api/formas_pagamento${query}`);
    },
    pdvs: async () => {
      alvo.pdvs = await apiGet<Opcao[]>(`/api/pdvs${query}`);
    },
    unidadesMedida: async () => {
      alvo.unidadesMedida = await apiGet<Opcao[]>(`/api/unidades_medida${query}`);
    },
    grupos: async () => {
      Object.assign(
        alvo,
        await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`)
      );
    }
  };

  const rotuloOpcao: Record<ChaveOpcaoOperacao, string> = {
    contas: "Contas",
    fornecedores: "Fornecedores",
    colaboradores: "Colaboradores",
    sociosGestores: "Sócios e Gestores",
    produtos: "Produtos",
    formasPagamento: "Formas de pagamento",
    pdvs: "PDVs",
    unidadesMedida: "Unidades de medida",
    grupos: "Grupos"
  };
  // Cada lista carrega isolada: um 403 numa opcao secundaria nao impede as demais nem trava o modal
  // (+NOVO global). O que faltar vira aviso discreto.
  const faltas: string[] = [];
  await Promise.all(
    opcoesPorEntidade[entidade].map((chave) =>
      carregarOpcaoOpcional(faltas, rotuloOpcao[chave], tarefas[chave], undefined)
    )
  );
  const aviso = avisoOpcoesIndisponiveis(faltas);
  if (aviso) notificar(aviso, "warning");
}

const acoesLancamento = criarAcoesLancamento({
  api: { get: apiGet, post: apiPost, put: apiPut },
  refs: {
    form,
    entidadeNova,
    operacaoEditandoId,
    modalOperacaoAberto,
    discriminandoDespesa,
    discriminandoMercadoria,
    itensVenda,
    tiposPagamento,
    itensDespesa,
    itensMercadoria,
    recorrencia
  },
  rotaDaEntidade: (entidade) => endpointOperacaoPorEntidade[entidade],
  empresaId: () => empresaId.value,
  produtos: () => opcoesEmpresa.value.produtos,
  recorrencia: () => recorrenciaPayload.value,
  // Falha ao carregar OPCOES nao impede abrir: a tela continua utilizavel e o que faltou vira aviso
  // discreto. Diferente do GET do detalhe, que propaga e mantem o modal fechado.
  carregarOpcoes: async (entidade) => {
    try {
      await carregarOpcoesParaOperacao(entidade);
    } catch (error) {
      notificar(mensagemErro(error), "error");
    }
  },
  // So as fotos: sao composables, nao refs. O resto do reset vive no fio, onde o teste alcanca.
  limparFotos: () => {
    fotoDocumento.limpar();
    fotoNota.limpar();
  },
  notificar
});

const abrirOperacaoUmaVez = criarGuardaAberturaOperacao();

async function abrirOperacao(entidade: EntidadeOperacional, operacao?: { id: string }) {
  return abrirOperacaoUmaVez(
    () =>
      modalOperacaoAberto.value && entidadeNova.value === entidade && operacaoEditandoId.value === (operacao?.id ?? ""),
    async () => {
      // Tesouraria: a transferencia NAO depende de caixa aberto — o tesoureiro move dinheiro entre
      // contas (cofre -> caixas -> banco) e nao opera caixa. O caixaId e opcional no backend da
      // transferencia, entao so as demais entidades (venda/despesa/mercadoria/retirada) exigem caixa.
      if (!caixaAberto.value && entidade !== "transferencia") {
        notificar("Abra um caixa antes de registrar lancamentos.", "warning");
        void router.push("/caixa");
        return;
      }
      modoDiscriminacao.value = false;
      // A ORDEM (reset → opcoes → GET → preenchimento → abrir) vive em `utils/lancamento-acoes`,
      // onde o teste alcanca. Abrir antes do preenchimento faz a tela piscar com o formulario vazio
      // e, no operador, renderizar o campo Conta antes de a conta gravada chegar.
      try {
        const detalhe = await acoesLancamento.abrirLancamento(entidade, operacao?.id);
        if (detalhe && operacao?.id) {
          if ((entidade === "despesa" || entidade === "mercadoria") && detalhe.fotoDocumentoUrl) {
            void fotoDocumento.carregarExistente(apiUrl, endpointOperacaoPorEntidade[entidade], operacao.id);
          }
          if (detalhe.fotoNotaUrl) {
            void fotoNota.carregarExistente(apiUrl, endpointOperacaoPorEntidade[entidade], operacao.id, "foto-nota");
          }
        }
      } catch (error) {
        // Erro no detalhe NAO abre o modal — melhor nao abrir do que abrir mentindo.
        notificar(mensagemErro(error), "error");
      }
    }
  );
}

// Detalhe somente leitura da venda (integrada): itens + pagamento + total. Reusa o GET de detalhe.
// Exibido INLINE na lista (OperacoesPage expande a linha); aqui so carregamos os dados.
async function abrirDetalheVenda(operacao: { id: string }) {
  vendaDetalhe.value = null;
  vendaDetalheCarregando.value = true;
  try {
    vendaDetalhe.value = await apiGet<OperacaoDetalhe>(`/api/vendas/${operacao.id}`);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    vendaDetalheCarregando.value = false;
  }
}

// Abre o modal em modo discriminacao: carrega o cabecalho existente + itens, forca o modo de itens
// e NAO exige caixa aberto (a discriminacao e feita por outro setor, depois).
async function abrirDiscriminacao(entidade: EntidadeOperacional, operacao: { id: string }) {
  if (entidade !== "despesa" && entidade !== "mercadoria") return;
  entidadeNova.value = entidade;
  operacaoEditandoId.value = operacao.id;
  modoDiscriminacao.value = true;
  fotoDocumento.limpar();
  fotoNota.limpar();
  form.value = formOperacaoVazio();
  discriminandoDespesa.value = entidade === "despesa";
  discriminandoMercadoria.value = entidade === "mercadoria";
  itensDespesa.value = [itemDespesaVazio()];
  itensMercadoria.value = [itemMercadoriaVazio()];
  // Recorrencia nunca "vaza" de um lancamento para o proximo: sem este reset, quem criou uma serie
  // de 12 e abriu o modal de novo criaria outra serie de 12 sem perceber.
  recorrencia.value = estadoRecorrenciaVazio();
  try {
    await carregarOpcoesParaOperacao(entidade);
    const detalhe = await apiGet<OperacaoDetalhe>(`/api/${endpointOperacaoPorEntidade[entidade]}/${operacao.id}`);
    // A MESMA funcao que o fio usa para abrir em edicao: enquanto havia uma copia aqui, um campo
    // novo em `FormOperacaoPreenchido` precisava ser espelhado nos dois lugares e so um tinha teste.
    acoesLancamento.aplicarDetalhe(entidade, detalhe);
    if (detalhe.fotoDocumentoUrl) {
      void fotoDocumento.carregarExistente(apiUrl, endpointOperacaoPorEntidade[entidade], operacao.id);
    }
    if (detalhe.fotoNotaUrl) {
      void fotoNota.carregarExistente(apiUrl, endpointOperacaoPorEntidade[entidade], operacao.id, "foto-nota");
    }
    // O cabecalho pendente nao tem itens: `aplicarDetalhe` desligaria o modo de itens.
    discriminandoDespesa.value = entidade === "despesa";
    discriminandoMercadoria.value = entidade === "mercadoria";
  } catch (error) {
    notificar(mensagemErro(error), "error");
    return;
  }
  modalOperacaoAberto.value = true;
}

function executarAcaoNovo(acao: AcaoNovo) {
  if (acao.telaDestino) {
    void router.push(rotaTela(acao.telaDestino));
    return;
  }
  if (!acao.entidade) return;
  // "Saidas" abre o modal unico de lancamento na categoria que o perfil pode criar; as tres
  // continuam alternaveis nos botoes do topo, sem fechar.
  void abrirOperacao(acao.id === "saidas" ? categoriaInicialSaida(permissoesUsuario.value) : acao.entidade);
}

// Alterna a categoria do lancamento SEM fechar o modal (3 botoes do topo, PROJECT_BRAIN/17 §4).
// Mantem o que ja foi digitado (valor, datas, descricao) e limpa so o que e proprio da categoria
// anterior: o grupo (cada categoria tem o seu) e o credor que a nova categoria nao aceita. Recarrega
// as opcoes porque cada entidade usa listas diferentes (mercadoria precisa de produtos/unidades).
async function trocarCategoriaLancamento(entidade: EntidadeOperacional) {
  if (entidade === entidadeNova.value) return;
  entidadeNova.value = entidade;
  // Limpar o formulario e do `useOperacaoLancamento`, que observa a categoria e e dono do mapa de
  // credores. Aqui ficavam grupos e credor: o credor era limpado um id por vez, nunca o
  // `credorTipo`, e o fornecedor da retirada era apagado — que a R-128 tornou valido. Com a
  // limpeza fora daqui, esta funcao nao tem mais regra que possa divergir do mapa, e a que existe
  // roda dentro do componente, onde o teste alcanca.
  try {
    await carregarOpcoesParaOperacao(entidade);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  }
}

// Discriminacao: envia SO os itens via PATCH .../discriminar (sem trava de caixa). O servidor
// valida a soma contra o valor do cabecalho e recalcula o total de cada item pelo desconto.
async function salvarDiscriminacao() {
  erroDiscriminacaoLinha.value = null;
  erroDiscriminacaoCampo.value = null;
  const entidade = entidadeNova.value;
  const payload = montarPayloadOperacao(entidade, {
    empresaId: empresaId.value,
    form: form.value,
    itensVenda: itensVenda.value,
    tiposPagamento: tiposPagamento.value,
    itensDespesa: itensDespesa.value,
    itensMercadoria: itensMercadoria.value,
    discriminandoDespesa: discriminandoDespesa.value,
    discriminandoMercadoria: discriminandoMercadoria.value,
    produtos: opcoesEmpresa.value.produtos
  });
  const corpo =
    entidade === "mercadoria"
      ? {
          empresaId: empresaId.value,
          descontoGeralTipo: payload.descontoGeralTipo,
          descontoGeralValor: payload.descontoGeralValor,
          itensMercadoria: payload.itensMercadoria
        }
      : {
          empresaId: empresaId.value,
          descontoGeralTipo: payload.descontoGeralTipo,
          descontoGeralValor: payload.descontoGeralValor,
          itensDespesa: payload.itensDespesa
        };
  const itens = entidade === "mercadoria" ? payload.itensMercadoria : payload.itensDespesa;
  if (!itens.length) {
    notificar("Informe ao menos um item para discriminar.", "error");
    return;
  }
  const endpoint = endpointOperacaoPorEntidade[entidade];
  await apiPatch(`/api/${endpoint}/${operacaoEditandoId.value}/discriminar`, corpo);
  const fotoUrl = await fotoDocumento.enviar(apiUrl, endpoint, operacaoEditandoId.value);
  const indice = operacoes.value.findIndex((operacao) => operacao.id === operacaoEditandoId.value);
  const linha = operacoes.value[indice];
  if (indice >= 0 && linha) {
    operacoes.value.splice(indice, 1, {
      ...linha,
      pendenteDiscriminacao: false,
      ...(fotoUrl ? { fotoDocumentoUrl: fotoUrl } : {})
    });
  }
  modalOperacaoAberto.value = false;
  notificar("Discriminacao salva com sucesso.");
}

// Recorrencia (D3): a serie criada tem de aparecer na mensagem. Quando o teto de 12 meses corta a
// serie, dizer so "salvo" deixaria a pessoa achar que os 24 lancamentos que pediu existem.
function mensagemLancamentoSalvo(resultado: { serie?: number; serieLimitada?: boolean }) {
  if (!resultado.serie) return "Lançamento salvo com sucesso.";
  const base = `Serie criada: ${resultado.serie} lancamentos.`;
  return resultado.serieLimitada ? `${base} A serie foi limitada a 12 meses.` : base;
}

async function salvarOperacao() {
  salvandoOperacao.value = true;
  try {
    if (modoDiscriminacao.value) {
      await salvarDiscriminacao();
      return;
    }
    // Montagem do corpo, pre-validacao e a decisao POST vs PUT vivem em `utils/lancamento-acoes`,
    // onde o teste captura a requisicao inteira. Aqui ficam fotos, linha local e o 422 da
    // discriminacao, que dependem do DOM e do estado da tela.
    const enviada = await acoesLancamento.enviarLancamento();
    if (!enviada) return;
    const { salva: operacaoSalva, editandoId, rota: endpoint } = enviada;
    const fotoUrl = await fotoDocumento.enviar(apiUrl, endpoint, operacaoSalva.id);
    const fotoNotaUrl = await fotoNota.enviar(apiUrl, endpoint, operacaoSalva.id, "foto-nota", "fotoNotaUrl");
    const linhaAtualizada = {
      id: operacaoSalva.id,
      empresaId: empresaId.value,
      dataReferencia: form.value.dataReferencia,
      descricao: form.value.descricao,
      valorOriginal: String(Number(form.value.valorOriginal || 0)),
      computar: operacaoSalva.computar,
      status: entidadeNova.value === "transferencia" ? (form.value.agendadaPara ? "agendada" : "pendente") : "aprovado",
      ...(fotoUrl ? { fotoDocumentoUrl: fotoUrl } : {}),
      ...(fotoNotaUrl ? { fotoNotaUrl } : {})
    };
    if (editandoId) {
      const indice = operacoes.value.findIndex((operacao) => operacao.id === editandoId);
      if (indice >= 0) operacoes.value.splice(indice, 1, { ...operacoes.value[indice], ...linhaAtualizada });
    } else {
      operacoes.value.unshift(linhaAtualizada);
    }
    modalOperacaoAberto.value = false;
    notificar(editandoId ? "Lançamento atualizado com sucesso." : mensagemLancamentoSalvo(operacaoSalva));
    await carregarStatusCaixa(empresaId.value);
    return { id: operacaoSalva.id };
  } catch (error) {
    if (error instanceof ErroApiCliente && error.status === 422 && error.details && typeof error.details === "object") {
      const detalhe = error.details as { linhaProvavel?: unknown; campoProvavel?: unknown };
      erroDiscriminacaoLinha.value = Number(detalhe.linhaProvavel) || null;
      erroDiscriminacaoCampo.value = typeof detalhe.campoProvavel === "string" ? detalhe.campoProvavel : null;
      await nextTick();
      document
        .querySelector<HTMLElement>(
          `[data-linha-discriminacao="${erroDiscriminacaoLinha.value}"] [data-campo-discriminacao="${erroDiscriminacaoCampo.value}"]`
        )
        ?.focus();
    }
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoOperacao.value = false;
  }
}

// Atualizacao local de cadastro: mapeamento tela->item + upsert nas listas reativas extraidos
// para utils/cadastro-local.ts (factory testavel). O componente injeta os getters de estado e o
// callback de permissoes; a factory muta as mesmas listas reativas (comportamento identico).
const { atualizarCadastroLocal } = criarAtualizadorCadastroLocal({
  empresaId: () => empresaId.value,
  opcoes: () => opcoes.value,
  empresas: () => empresas.value,
  onPermissoesSalvas: () => {
    if (permissoesBuscou.value) void buscarPermissoes(permissoesPagina.value.page || 1);
  }
});

function abrirCadastroNovo(tela: string, valores: Partial<CadastroForm> = {}) {
  cadastroTela.value = tela;
  cadastroEditandoId.value = "";
  formCadastro.value = { ...formCadastroVazio(), ...valores };
  modalCadastroAberto.value = true;
}

function abrirCadastroFilho(linha: Record<string, string | undefined>) {
  if (cadastroTela.value === "grupos" || telaAtiva.value === "grupos") {
    abrirCadastroNovo("grupos", {
      tipoGrupo: (linha.tipoGrupo as CadastroForm["tipoGrupo"]) || "despesa",
      grupoPaiId: linha.id ?? ""
    });
  } else {
    abrirCadastroNovo("areas_setores", {
      tipoAreaSetor: "setor",
      areaId: linha.tipoAreaSetor === "area" ? (linha.id ?? "") : (linha.areaId ?? ""),
      setorPaiId: linha.tipoAreaSetor === "setor" ? (linha.id ?? "") : ""
    });
  }
}

function abrirCadastroEditar(linha: Record<string, string | undefined>) {
  cadastroTela.value = telaAtiva.value;
  cadastroEditandoId.value = linha.id ?? "";
  formCadastro.value = formCadastroDeLinha(linha, regrasDaLinha(linha));
  modalCadastroAberto.value = true;
}

// Trava do rebaixamento silencioso: a linha da listagem pode chegar sem `role`, e ai o formulario de
// edicao fica com o papel DESCONHECIDO. Salvar assim mandava "usuario_comum" e rebaixava o alvo. A
// mensagem pede recarregar porque e exatamente isso que repovoa a linha.
const bloqueioCadastro = computed(() =>
  bloqueioCadastroUsuario(cadastroTela.value, formCadastro.value, Boolean(cadastroEditandoId.value))
);

async function salvarCadastro() {
  // Segunda tranca do lado do cliente (a primeira e o botao desabilitado): o dialogo tambem salva
  // por Enter, e o `cadastroPayload` omite o campo de qualquer forma.
  if (bloqueioCadastro.value) {
    notificar(bloqueioCadastro.value, "error");
    return;
  }
  cadastroSalvando.value = true;
  try {
    const endpoint = tipoEndpointCadastro(cadastroTela.value, formCadastro.value);
    const formSnapshot: CadastroForm = {
      ...formCadastro.value,
      empresaIds: [...formCadastro.value.empresaIds],
      produtoConversoes: formCadastro.value.produtoConversoes.map((conversao) => ({ ...conversao })),
      // S-06: a listagem esconde 52 permissoes do form e o servidor faz REPLACE total — sem
      // reinjetar aqui, salvar pela tela apaga o que ela mesma escondeu. A fonte e `opcoes`
      // (completa e sem paginacao), nao `permissoesPagina` (uma pagina, que nasce vazia).
      regras:
        cadastroTela.value === "permissoes"
          ? regrasComOcultasPreservadas(formCadastro.value, opcoes.value)
          : { ...formCadastro.value.regras }
    };
    const idEditando = cadastroEditandoId.value;
    const payload = cadastroPayload(cadastroTela.value, formSnapshot, empresaId.value);
    const enviar = (corpo: unknown) =>
      idEditando
        ? apiPut<{ id?: string } | undefined>(`/api/${endpoint}/${idEditando}`, corpo)
        : apiPost<{ id?: string }>(`/api/${endpoint}`, corpo);
    let resultado: { id?: string } | undefined;
    try {
      resultado = await enviar(payload);
    } catch (error) {
      // Produto duplicado (nome/codigo de barras na loja): oferece "cadastrar mesmo assim".
      if (error instanceof ErroApiCliente && error.codigo === "DUPLICATE_PRODUCT") {
        if (!(await confirmarAcao(error.message, "Produto já cadastrado", "Cadastrar mesmo assim"))) return;
        resultado = await enviar({ ...(payload as Record<string, unknown>), forcar: true });
      } else {
        throw error;
      }
    }
    // S-06: `opcoes` e a fonte das ocultas no proximo save e nao e recarregada nesta tela. Sem
    // sincronizar aqui, um segundo save da sessao parte de um retrato velho. Grava-se DEPOIS do
    // 2xx e a partir do `formSnapshot` (o objeto que foi enviado), nao do `formCadastro`, cujos
    // selects seguem editaveis. O servidor persiste o `regras` literal — o Zod e tudo-ou-nada.
    if (cadastroTela.value === "permissoes") {
      opcoes.value = aplicarRegrasDoAlvoNasListas(opcoes.value, formSnapshot, formSnapshot.regras) as Opcoes;
    }
    modalCadastroAberto.value = false;
    notificar(idEditando ? "Cadastro atualizado com sucesso." : "Cadastro criado com sucesso.");
    const idSalvo = idEditando || resultado?.id;
    if (!atualizarCadastroLocal(cadastroTela.value || telaAtiva.value, formSnapshot, idSalvo)) {
      const empresaParaRecarregar = cadastroTela.value === "empresas" && resultado?.id ? resultado.id : empresaId.value;
      await carregarDadosTela(cadastroTela.value || telaAtiva.value, empresaParaRecarregar);
    }
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    cadastroSalvando.value = false;
  }
}

function queryPermissoes(page = 1) {
  const params = new URLSearchParams({
    empresaId: empresaId.value,
    page: String(page),
    pageSize: String(permissoesPagina.value.pageSize)
  });
  if (permissoesFiltrosAplicados.q) params.set("q", permissoesFiltrosAplicados.q);
  if (permissoesFiltrosAplicados.tipoPermissao) params.set("tipoPermissao", permissoesFiltrosAplicados.tipoPermissao);
  if (permissoesFiltrosAplicados.alvoId) params.set("alvoId", permissoesFiltrosAplicados.alvoId);
  if (permissoesFiltrosAplicados.permissao) params.set("permissao", permissoesFiltrosAplicados.permissao);
  return params;
}

async function buscarPermissoes(page = 1, aplicarFiltros = false) {
  if (!empresaId.value) return;
  if (aplicarFiltros) {
    Object.assign(permissoesFiltrosAplicados, { ...permissoesFiltros });
  }
  permissoesCarregandoBusca.value = true;
  try {
    permissoesPagina.value = await apiGetPaginado<Record<string, string | undefined>>(
      `/api/permissoes/regras?${queryPermissoes(page).toString()}`
    );
    permissoesBuscou.value = true;
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    permissoesCarregandoBusca.value = false;
  }
}

function limparFiltrosPermissoes() {
  Object.assign(permissoesFiltros, { q: "", tipoPermissao: "", alvoId: "", permissao: "" });
  Object.assign(permissoesFiltrosAplicados, { q: "", tipoPermissao: "", alvoId: "", permissao: "" });
  permissoesPagina.value = { itens: [], total: 0, page: 1, pageSize: permissoesPagina.value.pageSize };
  permissoesBuscou.value = false;
}

async function excluirPermissao(linha: Record<string, string | undefined>) {
  const tipoPermissao = linha.tipoPermissao || linha.tipo;
  const alvoId = linha.alvoId || linha.cargoId || linha.setorId || linha.usuarioId;
  const permissao = linha.permissao;
  if (!tipoPermissao || !alvoId || !permissao) return;
  if (
    !(await confirmarAcao(
      `Excluir a permissão ${permissao} de ${linha.alvo || alvoId}?`,
      "Excluir permissão",
      "Excluir permissão"
    ))
  )
    return;
  permissaoExcluindoId.value = linha.id ?? `${tipoPermissao}:${alvoId}:${permissao}`;
  try {
    const params = new URLSearchParams({
      empresaId: empresaId.value,
      tipoPermissao,
      alvoId,
      permissao
    });
    await apiDelete(`/api/permissoes/regras?${params.toString()}`);
    notificar("Permissão excluída com sucesso.");
    await buscarPermissoes(permissoesPagina.value.page || 1);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    permissaoExcluindoId.value = "";
  }
}

function atualizarColaboradorUsuario(valor: string) {
  if (valor === "__novo__") {
    formCadastro.value.novoColaborador = true;
    formCadastro.value.colaboradorId = "";
    if (!formCadastro.value.novoColaboradorNome) formCadastro.value.novoColaboradorNome = formCadastro.value.nome;
    formCadastro.value.novoColaboradorSetorId = formCadastro.value.setorId || "";
    return;
  }
  formCadastro.value.novoColaborador = false;
  formCadastro.value.colaboradorId = valor;
}

// Acoes assincronas de tema: orquestracao extraida para utils/tema-acoes.ts (factory testavel).
// O componente injeta os refs reativos de tema + o port de API + callbacks.
const { carregarTemaTela, carregarTemaResumoCaixa, abrirTema, salvarTema } = criarAcoesTema({
  refs: {
    tema,
    temaAtual,
    temaResumoCaixa,
    temaTelaAtual,
    temaResumoCaixaAtual,
    temaTelaEdicao,
    temaSalvando,
    modalTemaAberto
  },
  empresaId: () => empresaId.value,
  telaAtiva: () => telaAtiva.value,
  empresaAtiva: () => empresaAtiva.value,
  telaResumoCaixa: TELA_TEMA_RESUMO_CAIXA,
  api: { get: apiGet, put: apiPut },
  aplicarTema,
  notificar,
  mensagemErro,
  temaPadrao
});

// Aparencia vive no menu lateral (tela "aparencia"): ao entrar, abre a customizacao de cores.
watch(
  () => telaAtiva.value,
  (tela) => {
    if (tela === "aparencia" && podeConfigurarTema.value) void abrirTema("padrao");
  },
  { immediate: true }
);

// Acoes de caixa: orquestracao extraida para utils/caixa-acoes.ts (factory testavel). O componente
// injeta as dependencias reais (API, refs reativos, callbacks); a logica de cada acao vive na factory.
const { abrirCaixaOperacional, retornarSaldoOperacional, executarSolicitacaoCofre, fecharCaixaOperacional } =
  criarAcoesCaixa({
    api: { post: apiPost },
    empresaId: () => empresaId.value,
    telaAtiva: () => telaAtiva.value,
    setSalvando: (valor) => {
      caixaSalvando.value = valor;
    },
    carregarStatusCaixa,
    carregarDadosTela,
    notificar,
    mensagemErro,
    confirmar: (mensagem) => confirmarAcao(mensagem, "Confirmar retorno", "Lançar retorno")
  });

// D4 · lado da RETAGUARDA. Usa a factory testavel de `utils/solicitacoes-cofre.ts`; aqui so entram
// as dependencias reais (API, notificacao, confirmacao).
const acoesSolicitacoes = criarAcoesSolicitacoesCofre({
  api: { get: apiGet, post: apiPost },
  notificar,
  mensagemErro
});

// Programar entrega ao cofre exige DUAS coisas, e a tela precisa das duas para nao oferecer um
// painel que a API recusa: a permissao tecnica e o PAPEL de retaguarda. A regra do papel vem de
// `@padaria/shared` — a mesma funcao que o servico usa, nao uma copia da lista de cargos.
const podeProgramarEntregaCofre = computed(() => {
  const perfil = sessao.value?.perfil;
  return Boolean(perfil) && temPermissao("transferencias_criar") && podeLancarSemCaixa(perfil!);
});

async function carregarCaixasAbertos() {
  // Perfil de Caixa nao ve o painel nem carrega a lista de todos os caixas abertos da empresa.
  if (!empresaId.value || !podeProgramarEntregaCofre.value) {
    caixasAbertos.value = [];
    solicitacoesCofreRetaguarda.value = [];
    return;
  }
  caixasAbertos.value = await apiGet<CaixaAbertoResumo[]>(`/api/caixa/abertos?empresaId=${empresaId.value}`);
  // Mantem a selecao se o caixa continuar aberto; senao escolhe o primeiro (ou nenhum).
  const aindaAberto = caixasAbertos.value.some((caixa) => caixa.id === caixaSolicitacaoId.value);
  const escolhido = aindaAberto ? caixaSolicitacaoId.value : (caixasAbertos.value[0]?.id ?? "");
  await selecionarCaixaSolicitacao(escolhido);
}

async function selecionarCaixaSolicitacao(caixaId: string) {
  caixaSolicitacaoId.value = caixaId;
  solicitacoesCofreRetaguarda.value = caixaId ? await acoesSolicitacoes.listar(caixaId) : [];
}

async function programarSolicitacaoCofre(payload: {
  caixaId: string;
  tipo: "sangria" | "retorno";
  valor: number;
  observacao: string | null;
  idempotenciaChave: string;
  aoConcluir?: (sucesso: boolean) => void;
}) {
  caixaSalvando.value = true;
  try {
    const lista = await acoesSolicitacoes.programar(payload);
    payload.aoConcluir?.(lista !== null);
    if (lista) solicitacoesCofreRetaguarda.value = lista;
  } finally {
    caixaSalvando.value = false;
  }
}

async function cancelarSolicitacaoCofre(payload: {
  caixaId: string;
  solicitacaoId: string;
  motivo: string;
  aoConcluir?: (sucesso: boolean) => void;
}) {
  caixaSalvando.value = true;
  try {
    const lista = await acoesSolicitacoes.cancelar(payload.caixaId, payload.solicitacaoId, payload.motivo);
    // Só o sucesso fecha o diálogo e limpa o motivo — em erro o operador reenvia com um clique.
    payload.aoConcluir?.(lista !== null);
    if (lista) solicitacoesCofreRetaguarda.value = lista;
  } finally {
    caixaSalvando.value = false;
  }
}

function abrirImportacao(tela = telaAtiva.value) {
  copiaModo.value = "importar";
  copiaTipo.value = tipoCopiaTela(tela);
  copiaRegistroId.value = "";
  copiaEmpresaOrigemId.value = "";
  copiaEmpresaDestinoId.value = empresaId.value;
  modalCopiaAberto.value = true;
}

function abrirExportacao(linha: Record<string, string | undefined>) {
  copiaModo.value = "exportar";
  copiaTipo.value = tipoCopiaTela(telaAtiva.value);
  copiaRegistroId.value = linha.id ?? "";
  copiaEmpresaOrigemId.value = empresaId.value;
  copiaEmpresaDestinoId.value = "";
  modalCopiaAberto.value = true;
}

function tipoCopiaTela(tela = telaAtiva.value) {
  const mapa: Record<string, string> = {
    contas: "contas",
    grupos: "grupos",
    unidades: "unidades-medida",
    areas_setores: "areas-setores",
    fornecedores: "fornecedores",
    socios_gestores: "socios-gestores",
    maquininhas: "maquininhas",
    produtos: "produtos",
    colaboradores: "colaboradores"
  };
  return mapa[tela] ?? tela.replaceAll("_", "-");
}

function caminhoCopia(tipo: string) {
  return tipo;
}

async function executarCopia() {
  copiaSalvando.value = true;
  try {
    const caminho = caminhoCopia(copiaTipo.value);
    const resultado =
      copiaModo.value === "importar"
        ? await apiPost<{ inseridos: number }>(`/api/${caminho}/importar`, {
            empresaOrigemId: copiaEmpresaOrigemId.value,
            empresaDestinoId: copiaEmpresaDestinoId.value,
            modo: copiaNivel.value
          })
        : await apiPost<{ inseridos: number }>(`/api/${caminho}/${copiaRegistroId.value}/exportar`, {
            empresaDestinoId: copiaEmpresaDestinoId.value,
            modo: copiaNivel.value
          });
    modalCopiaAberto.value = false;
    notificar(`${resultado.inseridos ?? 0} registro(s) processado(s).`);
    await carregarDadosTela(telaAtiva.value, empresaId.value);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    copiaSalvando.value = false;
  }
}

async function restaurarPadraoCargo(linha: Record<string, string | undefined>) {
  const cargoId = linha.alvoId;
  if (!cargoId) return;
  const nome = linha.alvo ?? "cargo";
  if (
    !(await confirmarAcao(
      `Restaurar as permissões do cargo "${nome}" para o padrão? Isso substitui as regras atuais, inclusive as desligadas manualmente.`,
      "Restaurar permissões",
      "Restaurar padrão"
    ))
  ) {
    return;
  }
  try {
    // S-06: o endpoint devolve o que gravou. Sem consumir isso, `opcoes` fica com o retrato
    // ANTERIOR a restauracao e o proximo save pela tela reinjeta as ocultas velhas, desfazendo a
    // restauracao em silencio. Sincronizamos com a resposta do servidor — sem chamada extra.
    const aplicado = await apiPost<{ cargoId: string; regras: Record<string, boolean> } | undefined>(
      `/api/permissoes/cargo/${cargoId}/restaurar-padrao`,
      {}
    );
    if (!aplicado?.regras) throw new Error("Restauracao sem as regras aplicadas na resposta");
    opcoes.value = aplicarRegrasDoAlvoNasListas(
      opcoes.value,
      { tipoPermissao: "cargo", cargoId, setorId: "", usuarioId: "" },
      aplicado.regras
    ) as Opcoes;
    notificar(`Permissões do cargo "${nome}" restauradas para o padrão.`);
    if (permissoesBuscou.value) await buscarPermissoes(permissoesPagina.value.page || 1);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  }
}

function lidarExtraCadastro(payload: { event: string; linha: Record<string, string | undefined> }) {
  if (payload.event === "restaurarPadraoCargo") void restaurarPadraoCargo(payload.linha);
}

provide(WORKSPACE_CONTEXT, {
  opcoesEmpresa,
  empresaId,
  modalOperacaoAberto,
  entidadeNova,
  trocarCategoriaLancamento,
  operacaoEditandoId,
  modoDiscriminacao,
  form,
  discriminandoDespesa,
  discriminandoMercadoria,
  valorTotalOperacao,
  itensVenda,
  tiposPagamento,
  itensDespesa,
  itensMercadoria,
  erroDiscriminacaoLinha,
  erroDiscriminacaoCampo,
  salvandoOperacao,
  salvarOperacao,
  contaTravadaDoCaixa,
  contaTravadaDoCaixaNome,
  podeUsarRecorrencia,
  recorrencia,
  fotoDocumentoPreview: fotoDocumento.previewUrl,
  fotoDocumentoExistente: fotoDocumento.existente,
  selecionarFotoDocumento: fotoDocumento.selecionar,
  fotoNotaPreview: fotoNota.previewUrl,
  fotoNotaExistente: fotoNota.existente,
  selecionarFotoNota: fotoNota.selecionar,
  modalCadastroAberto,
  cadastroEditandoId,
  cadastroTela,
  formCadastro,
  mascararCpf,
  mascararCnpj,
  atualizarDocumentoCadastro,
  documentoEhCpf,
  mascararWhatsapp,
  mascararCep,
  colaboradoresSelectUsuario,
  atualizarColaboradorUsuario,
  empresasDisponiveis,
  dadosCadastro,
  permissoesDaSecao,
  estadoRegraPermissao,
  definirRegraPermissao,
  cadastroSalvando,
  bloqueioCadastro,
  salvarCadastro,
  modalTemaAberto,
  temaTelaEdicao,
  telasTemaPermitidas,
  abrirTema,
  tema,
  temaSalvando,
  salvarTema,
  modalCopiaAberto,
  copiaModo,
  copiaNivel,
  copiaEmpresaOrigemId,
  copiaEmpresaDestinoId,
  copiaSalvando,
  executarCopia
});

function atualizarPaginaOperacoes(pagina: number) {
  paginaOperacoes.value = pagina;
  // Com a paginacao no servidor, mudar de pagina e uma nova consulta — antes era so um slice.
  void carregarOperacoes();
}

// Filtro de data das Entradas (S6). Trocar o dia recomeca na pagina 1: a pagina 4 do dia anterior
// nao tem relacao com o dia novo e voltaria uma lista vazia.
function atualizarDiaEntradas(dia: string) {
  if (!dia || dia === diaEntradas.value || !podeConsultarOutrosDiasEntradas.value) return;
  diaEntradas.value = dia;
  paginaOperacoes.value = 1;
  void carregarOperacoes();
}

const pageContext = computed(() => ({
  resumo: resumo.value,
  telaAtual: telaAtual.value,
  telaAtiva: telaAtiva.value,
  empresaAtiva: empresaAtiva.value,
  operacoesPaginadas: operacoesPaginadas.value,
  // Lista COMPLETA da tela (sem paginar) — usada pela Tesouraria para somar o total do periodo.
  operacoesTela: operacoesDaTela.value,
  // Total do FILTRO INTEIRO (vem do servidor), nao o tamanho da pagina — e ele que o totalizador
  // do topo e o controle de paginas usam. Antes era operacoesDaTela.length, que com a paginacao
  // falsa dava sempre no maximo 10.
  totalOperacoes: totalOperacoes.value,
  totalLiquidoOperacoes: totalLiquidoOperacoes.value,
  // Filtro de data das Entradas (S6): o dia listado e se o perfil pode trocar de dia.
  diaEntradas: diaEntradas.value,
  podeConsultarOutrosDiasEntradas: podeConsultarOutrosDiasEntradas.value,
  paginaOperacoes: paginaOperacoes.value,
  totalPaginasOperacoes: totalPaginasOperacoes.value,
  descricao: descricaoTela(telaAtiva.value),
  // Permissoes da Tesouraria (a de visualizar ja e o gate da rota/menu).
  podeCriarTransferencia: temPermissao("transferencias_criar"),
  podeEditarTransferencia: temPermissao("transferencias_editar"),
  caixaStatus: caixaStatus.value,
  mostrarFiltroDiscriminacao: telaSuportaDiscriminacao.value,
  pendentesDiscriminacaoAtivo: filtroPendentesDiscriminacao.value,
  podeDiscriminar: podeDiscriminarTela.value,
  podeEditarEntrada: temPermissao("entradas_editar"),
  vendaDetalhe: vendaDetalhe.value,
  modalVendaDetalheAberto: modalVendaDetalheAberto.value,
  vendaDetalheCarregando: vendaDetalheCarregando.value,
  mostrarAprovacaoMercadorias: telaAtiva.value === "mercadorias" && temPermissao("mercadorias_aprovar"),
  aprovacaoMercadoriasAtiva: mostrarAprovacaoMercadorias.value,
  mercadoriasAguardando: mercadoriasAguardando.value,
  aprovacaoMercadoriasCarregando: aprovacaoMercadoriasCarregando.value,
  aprovacaoMercadoriaSalvandoId: aprovacaoMercadoriaSalvandoId.value,
  opcoesEmpresa: opcoesEmpresa.value,
  sessao: sessao.value,
  caixaSalvando: caixaSalvando.value,
  empresaId: empresaId.value,
  caixaIdFiltro: caixaIdFiltroTela(),
  treeTela: telaAtiva.value === "areas_setores" ? "areas_setores" : "grupos",
  treeItens: telaAtiva.value === "areas_setores" ? treeAreasSetores() : treeGrupos(),
  colunasCadastro: colunasCadastro(telaAtiva.value),
  linhasCadastro: dadosCadastro(telaAtiva.value),
  permissoesFiltros,
  alvosFiltroPermissoes: alvosFiltroPermissoes.value,
  permissoesCarregandoBusca: permissoesCarregandoBusca.value,
  permissoesBuscou: permissoesBuscou.value,
  permissoesPagina: permissoesPagina.value,
  permissaoExcluindoId: permissaoExcluindoId.value,
  abrirOperacao,
  abrirDiscriminacao,
  alternarFiltroPendentes: (valor: boolean) => {
    filtroPendentesDiscriminacao.value = valor;
  },
  alternarAprovacaoMercadorias: (valor: boolean) => {
    mostrarAprovacaoMercadorias.value = valor;
  },
  aprovarMercadoriaAguardando,
  recusarMercadoriaAguardando,
  abrirDetalheVenda,
  fecharDetalheVenda: (valor: boolean) => {
    modalVendaDetalheAberto.value = valor;
  },
  atualizarPaginaOperacoes,
  recarregarOperacoes: carregarOperacoes,
  atualizarDiaEntradas,
  abrirCaixaOperacional,
  retornarSaldoOperacional,
  caixaSolicitacoes: caixaSolicitacoes.value,
  executarSolicitacaoCofre,
  // D4 · lado da retaguarda (tela de Transferencias).
  podeProgramarEntregaCofre: podeProgramarEntregaCofre.value,
  podeConferirTransferencia: temPermissao("transferencias_conferir"),
  caixasAbertos: caixasAbertos.value,
  caixaSolicitacaoId: caixaSolicitacaoId.value,
  solicitacoesCofreRetaguarda: solicitacoesCofreRetaguarda.value,
  selecionarCaixaSolicitacao,
  programarSolicitacaoCofre,
  cancelarSolicitacaoCofre,
  notificacoes: notificacoes.value,
  verificarNotificacao,
  fecharCaixaOperacional,
  recarregarCaixa: async () => {
    await carregarStatusCaixa(empresaId.value);
    await carregarOperacoes(empresaId.value);
  },
  abrirCadastroNovo: () => abrirCadastroNovo(telaAtiva.value),
  abrirImportacao: () => abrirImportacao(telaAtiva.value),
  abrirExportacao,
  abrirCadastroEditar,
  abrirCadastroFilho,
  lidarExtraCadastro,
  atualizarBuscaPermissoes: (valor: string) => {
    permissoesFiltros.q = valor;
  },
  atualizarTipoPermissaoFiltro: (valor: string) => {
    permissoesFiltros.tipoPermissao = valor;
  },
  atualizarAlvoFiltro: (valor: string) => {
    permissoesFiltros.alvoId = valor;
  },
  atualizarPermissaoFiltro: (valor: string) => {
    permissoesFiltros.permissao = valor;
  },
  buscarPermissoes: () => buscarPermissoes(1, true),
  limparFiltrosPermissoes,
  excluirPermissao,
  atualizarPaginaPermissoes: buscarPermissoes
}));

let intervaloAtualizacaoOperacoes: ReturnType<typeof setInterval> | null = null;

function atualizarAoRetomarPagina() {
  if (document.visibilityState === "visible") void atualizarOperacoesAutomaticamente();
}

onMounted(() => {
  window.addEventListener("focus", atualizarAoRetomarPagina);
  document.addEventListener("visibilitychange", atualizarAoRetomarPagina);
  intervaloAtualizacaoOperacoes = setInterval(() => {
    if (document.visibilityState === "visible") void atualizarOperacoesAutomaticamente();
  }, 30_000);

  if (workspaceCarregado.value && sessao.value) {
    carregando.value = false;
    erro.value = "";
    aplicarTema(temaAtual.value, temaResumoCaixa.value);
    void atualizarOperacoesAutomaticamente();
    return;
  }
  void carregarTudo();
});

onBeforeUnmount(() => {
  window.removeEventListener("focus", atualizarAoRetomarPagina);
  document.removeEventListener("visibilitychange", atualizarAoRetomarPagina);
  if (intervaloAtualizacaoOperacoes) clearInterval(intervaloAtualizacaoOperacoes);
});
</script>

<template>
  <div v-if="carregando" class="min-h-screen panel-bg d-flex align-center justify-center">
    <v-progress-circular indeterminate color="primary" size="48" />
  </div>

  <v-main v-else-if="erro" class="min-h-screen panel-bg d-flex align-center justify-center pa-4">
    <v-alert type="error" variant="tonal" max-width="720">{{ erro }}</v-alert>
  </v-main>

  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasShell"
    :tela-ativa="telaAtiva"
    :empresas="empresasDisponiveis"
    :empresa-id="empresaSelecionadaId"
    :caixa-status="caixaStatus"
    :notificacoes="notificacoes"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="empresaCarregando"
    @selecionar-empresa="selecionarEmpresa"
    @verificar-notificacao="verificarNotificacao"
  >
    <template #caixa>
      <div v-if="temPermissao('caixa_operar')" class="caixa-card">
        <div v-if="caixaAberto" class="d-flex align-start justify-space-between ga-2">
          <div>
            <div class="caixa-title">Caixa: {{ caixaAberto.pdvNome }}</div>
            <div class="caixa-meta">Aberto em: {{ formatarDataHora(caixaAberto.dataHoraAbertura) }}</div>
          </div>
          <span class="status-pill">Aberto</span>
        </div>
        <div v-else>
          <div class="caixa-title">Não há caixa aberto</div>
          <div class="caixa-meta">Abra um caixa para operar as telas financeiras.</div>
        </div>
        <v-btn
          v-if="caixaAberto"
          class="mt-4 caixa-edit"
          block
          size="small"
          variant="tonal"
          prepend-icon="mdi-cash-register"
          to="/caixa"
        >
          Gerenciar caixa
        </v-btn>
        <!-- Unico caminho de abertura: a tela /caixa (form inline da CaixaResumoPage). Este botao
             so NAVEGA para la — nao existe mais modal de abertura. -->
        <v-btn
          v-else
          class="mt-4 caixa-edit"
          block
          size="small"
          variant="tonal"
          prepend-icon="mdi-cash-plus"
          to="/caixa"
        >
          Ir para o caixa
        </v-btn>
      </div>
    </template>

    <template v-if="acoesNovo.length" #actions>
      <v-menu>
        <template #activator="{ props: menuProps }">
          <v-btn v-bind="menuProps" class="sidebar-new-button" block prepend-icon="mdi-plus">Novo</v-btn>
        </template>
        <!-- 3 itens (Mobills): Entradas NAVEGA (venda so por integracao), Transferencias e Saidas
             abrem o modal do eixo — Saidas ja alterna Despesa/Mercadoria/Retirada por dentro. -->
        <v-list min-width="288" class="fab-novo-list">
          <v-list-item
            v-for="acao in acoesNovo"
            :key="acao.id"
            :title="acao.titulo"
            :subtitle="acao.subtitulo"
            @click="executarAcaoNovo(acao)"
          >
            <template #prepend>
              <v-icon :icon="acao.icone" class="fab-novo-icone" :style="{ color: acao.cor }" />
            </template>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <v-alert v-if="empresaCarregando" type="info" variant="tonal" class="mb-4">Carregando dados...</v-alert>

    <v-alert v-else-if="telaBloqueadaPorCaixa" type="warning" variant="tonal" class="mb-4">
      {{ motivoTelaAtivaDesabilitada }}
    </v-alert>

    <slot v-else v-bind="pageContext" />
    <WorkspaceDialogs />
    <ConfirmacaoDialog
      :aberto="confirmacao.aberto"
      :titulo="confirmacao.titulo"
      :mensagem="confirmacao.mensagem"
      :texto-confirmar="confirmacao.textoConfirmar"
      @responder="responderConfirmacao"
    />

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
