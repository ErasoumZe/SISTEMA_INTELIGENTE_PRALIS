<script setup lang="ts">
import {
  TELA_TEMA_RESUMO_CAIXA,
  deCentavos,
  paraCentavos,
  somarCentavos,
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
  ResumoCaixa
} from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
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
import { corMenuTela } from "~/utils/tema";
import { criarAcoesTema } from "~/utils/tema-acoes";
import { criarAcoesCaixa } from "~/utils/caixa-acoes";
import { criarAtualizadorCadastroLocal } from "~/utils/cadastro-local";

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
const telaAtiva = useState("padaria.workspace.telaAtiva", () => telaInicialNormalizada.value);
const empresaSelecionadaId = useState("padaria.workspace.empresaSelecionadaId", () => "");
const carregando = ref(!workspaceCarregado.value);
const empresaCarregando = ref(false);
const atualizandoOperacoesAutomaticamente = ref(false);
const erro = ref("");
const saindo = ref(false);

const snackbar = reactive({ show: false, text: "", color: "success" });

const modalOperacaoAberto = ref(false);
const modalMaloteAberto = ref(false);
const modalCadastroAberto = ref(false);
const modalTemaAberto = ref(false);
const modalCopiaAberto = ref(false);

const entidadeNova = ref<EntidadeOperacional>("venda");
const operacaoEditandoId = ref("");
// Foto do documento (nota/cupom) de despesas e mercadorias: anexada no modal de lancamento.
const fotoDocumento = useFotoDocumento();
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
// Recorrencia (D3): estado do bloco fica AQUI, junto dos demais campos que salvam, porque e daqui
// que salvarOperacao monta o payload. O bloco da tela so le e escreve via provide/inject.
const recorrencia = ref(estadoRecorrenciaVazio());
const recorrenciaPayload = computed(() => montarRecorrencia(recorrencia.value));
const itensVenda = ref([{ descricaoProduto: "", quantidade: "1", valorUnitario: "", valorTotal: "", produtoId: "" }]);
const tiposPagamento = ref([{ formaPagamentoId: "", totalPago: "", numeroVendas: "1" }]);
const salvandoOperacao = ref(false);
const caixaSalvando = ref(false);

const formMalote = ref({ numeroLacre: "", valor: 0 });
const maloteEditandoId = ref("");
const maloteSalvando = ref(false);
const maloteEditandoCarregandoId = ref("");

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
const perfilCaixaOperacional = computed(
  () => Boolean(sessao.value?.perfil) && temPermissao("caixa_operar") && !temPermissao("caixas_gerenciar")
);
const telaBloqueadaPorCaixa = computed(() => {
  const item = itemPorTela[telaAtiva.value];
  return item ? dependeCaixaAberto(item) && !caixaAberto.value : false;
});
// Opcoes do seletor de aparencia com rotulo explicito: "padrao" (global) primeiro, o resumo do
// caixa, e cada tela como "Somente a tela: X" — deixa claro se a cor vale para tudo ou uma so.
const telasTemaPermitidas = computed(() => [
  { id: "padrao", titulo: "Padrao (todas as telas)" },
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
const totalPaginasOperacoes = computed(() => Math.max(1, Math.ceil(operacoesDaTela.value.length / 10)));
const operacoesPaginadas = computed(() =>
  operacoesDaTela.value.slice((paginaOperacoes.value - 1) * 10, paginaOperacoes.value * 10)
);
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
const valorTotalOperacao = computed(() =>
  deCentavos(
    Math.max(
      0,
      paraCentavos(form.value.valorOriginal) +
        paraCentavos(form.value.valorAcrescimo) -
        paraCentavos(form.value.valorDesconto)
    )
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
      nome: `Usuario: ${item.nome ?? item.email ?? item.usuarioId ?? item.id}`
    }))
  ];
});

watch(totalPaginasOperacoes, (total) => {
  if (paginaOperacoes.value > total) paginaOperacoes.value = total;
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
      erro.value = "Sem permissao para acessar esta pagina.";
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

function limparWorkspacePersistido() {
  workspaceCarregado.value = false;
  sessao.value = null;
  opcoes.value = opcoesVazias();
  empresas.value = [];
  operacoes.value = [];
  resumo.value = null;
  caixaStatus.value = null;
  empresaSelecionadaId.value = "";
  tema.value = temaPadrao();
  temaAtual.value = temaPadrao();
  temaResumoCaixa.value = temaPadrao();
  temaTelaAtual.value = "";
  temaResumoCaixaAtual.value = "";
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
    await carregarStatusCaixa(idEmpresa);
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
  } finally {
    empresaCarregando.value = false;
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
      carregarOpcaoOpcional(faltas, "Usuarios", () => apiGet<Opcao[]>(`/api/usuarios${query}`), [])
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
    [dados.pdvs, dados.turnos] = await Promise.all([
      carregarOpcaoOpcional(faltas, "PDVs", () => apiGet<Opcao[]>(`/api/pdvs${query}`), []),
      carregarOpcaoOpcional(
        faltas,
        "Turnos",
        () => apiGetPaginado<Opcao>(`/api/turnos${query}`).then((r) => r.itens),
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
    [dados.contas, dados.malotes] = await Promise.all([
      carregarOpcaoOpcional(faltas, "Contas", () => apiGet<Opcao[]>(`/api/contas-usuarios/minhas-contas${query}`), []),
      carregarOpcaoOpcional(faltas, "Malotes", () => apiGet<Opcao[]>(`/api/malotes${query}`), [])
    ]);
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
    [dados.contas, dados.fornecedores, dados.gruposPatrimonio] = await Promise.all([
      carregarOpcaoOpcional(faltas, "Contas", () => apiGet<Opcao[]>(`/api/contas-usuarios/minhas-contas${query}`), []),
      carregarOpcaoOpcional(faltas, "Fornecedores", () => apiGet<Opcao[]>(`/api/fornecedores${query}`), []),
      carregarOpcaoOpcional(
        faltas,
        "Grupos de patrimonio",
        async () => (await apiGet<Pick<Opcoes, "gruposPatrimonio">>(`/api/patrimonio${query}`)).gruposPatrimonio,
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
    [dados.contas, dados.fornecedores, dados.colaboradores] = await Promise.all([
      carregarOpcaoOpcional(faltas, "Contas", () => apiGet<Opcao[]>(`/api/contas-usuarios/minhas-contas${query}`), []),
      carregarOpcaoOpcional(faltas, "Fornecedores", () => apiGet<Opcao[]>(`/api/fornecedores${query}`), []),
      carregarOpcaoOpcional(faltas, "Colaboradores", () => apiGet<Opcao[]>(`/api/colaboradores${query}`), [])
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
  } else if (tela === "malotes") {
    dados.malotes = await apiGet<Opcao[]>(`/api/malotes${query}`);
  } else if (tela === "colaboradores") {
    [dados.colaboradores, dados.cargos, dados.setores] = await Promise.all([
      apiGet<Opcao[]>(`/api/colaboradores${query}`),
      apiGet<Opcao[]>(`/api/cargos${query}`),
      apiGet<Opcao[]>(`/api/setores${query}`)
    ]);
    dados.turnos = (await apiGetPaginado<Opcao>(`/api/turnos${query}`)).itens;
  } else if (tela === "fornecedores") {
    dados.fornecedores = await apiGet<Opcao[]>(`/api/fornecedores${query}`);
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
      erro.value = "Sem permissao para acessar esta pagina.";
      return;
    }
    await carregarStatusCaixa(empresaId.value);
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

async function carregarOperacoes(idEmpresa = empresaId.value) {
  if (!idEmpresa) return;
  const entidade = entidadePorTela[telaAtiva.value];
  if (!entidade) return;
  const params = new URLSearchParams({ empresaId: idEmpresa });
  // Fila de pendentes: mostra lancamentos sem discriminacao de qualquer caixa (inclusive os
  // vindos de NF-e com caixa_id NULL), ignorando o filtro de caixa aberto.
  const pendentes = filtroPendentesDiscriminacao.value && telaSuportaDiscriminacao.value;
  const caixaId = caixaIdFiltroTela();
  const item = itemPorTela[telaAtiva.value];
  if (!pendentes && item && dependeCaixaAberto(item) && !caixaId) {
    operacoes.value = [];
    return;
  }
  if (pendentes) {
    params.set("pendenteDiscriminacao", "true");
  } else if (caixaId) {
    params.set("caixaId", caixaId);
  }
  operacoes.value = await apiGet<OperacaoResumo[]>(
    `/api/${endpointOperacaoPorEntidade[entidade]}?${params.toString()}`
  );
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
    return;
  }
  caixaStatus.value = await apiGet<CaixaStatus>(`/api/caixa/status?empresaId=${idEmpresa}`);
  resumo.value = caixaStatus.value?.resumo ?? null;
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

// Formato do GET de detalhe (/api/<tipo>/:id) usado para preencher o formulario de edicao.
function preencherFormOperacao(entidade: EntidadeOperacional, detalhe: OperacaoDetalhe) {
  const preenchido = formOperacaoDeDetalhe(entidade, detalhe);
  form.value = { ...form.value, ...preenchido.form };
  discriminandoDespesa.value = preenchido.discriminandoDespesa;
  discriminandoMercadoria.value = preenchido.discriminandoMercadoria;
  if (preenchido.itensVenda) itensVenda.value = preenchido.itensVenda;
  if (preenchido.tiposPagamento) tiposPagamento.value = preenchido.tiposPagamento;
  if (preenchido.itensDespesa) itensDespesa.value = preenchido.itensDespesa;
  if (preenchido.itensMercadoria) itensMercadoria.value = preenchido.itensMercadoria;
}

type ChaveOpcaoOperacao =
  | "contas"
  | "fornecedores"
  | "colaboradores"
  | "produtos"
  | "formasPagamento"
  | "pdvs"
  | "unidadesMedida"
  | "malotes"
  | "grupos";

// Opcoes que o modal de cada operacao precisa. O +NOVO e global (abre qualquer operacao de
// qualquer tela), entao carregamos as opcoes por ENTIDADE ao abrir o modal — senao os selects
// (fornecedor, grupo, conta, colaborador...) ficam "No data available" quando a operacao e aberta
// fora da sua propria tela (ex.: abrir "Nova Despesa" estando na tela Entradas).
const opcoesPorEntidade: Record<EntidadeOperacional, ChaveOpcaoOperacao[]> = {
  venda: ["contas", "produtos", "pdvs", "formasPagamento"],
  despesa: ["contas", "fornecedores", "grupos"],
  mercadoria: ["contas", "fornecedores", "produtos", "unidadesMedida", "grupos"],
  retirada: ["contas", "colaboradores", "grupos"],
  transferencia: ["contas", "malotes"]
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
    malotes: async () => {
      alvo.malotes = await apiGet<Opcao[]>(`/api/malotes${query}`);
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
    produtos: "Produtos",
    formasPagamento: "Formas de pagamento",
    pdvs: "PDVs",
    unidadesMedida: "Unidades de medida",
    malotes: "Malotes",
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

async function abrirOperacao(entidade: EntidadeOperacional, operacao?: { id: string }) {
  // Tesouraria: a transferencia NAO depende de caixa aberto — o tesoureiro move dinheiro entre
  // contas (cofre -> caixas -> banco) e nao opera caixa. O caixaId e opcional no backend da
  // transferencia, entao so as demais entidades (venda/despesa/mercadoria/retirada) exigem caixa.
  if (!caixaAberto.value && entidade !== "transferencia") {
    notificar("Abra um caixa antes de registrar lancamentos.", "warning");
    void router.push("/caixa");
    return;
  }
  entidadeNova.value = entidade;
  operacaoEditandoId.value = operacao?.id ?? "";
  modoDiscriminacao.value = false;
  fotoDocumento.limpar();
  form.value = formOperacaoVazio();
  discriminandoDespesa.value = false;
  discriminandoMercadoria.value = false;
  itensVenda.value = [{ descricaoProduto: "", quantidade: "1", valorUnitario: "", valorTotal: "", produtoId: "" }];
  tiposPagamento.value = [{ formaPagamentoId: "", totalPago: "", numeroVendas: "1" }];
  itensDespesa.value = [itemDespesaVazio()];
  itensMercadoria.value = [itemMercadoriaVazio()];
  // Recorrencia nunca "vaza" de um lancamento para o proximo: sem este reset, quem criou uma serie
  // de 12 e abriu o modal de novo criaria outra serie de 12 sem perceber.
  recorrencia.value = estadoRecorrenciaVazio();
  // Garante que os selects do modal tenham dados mesmo quando aberto por fora da sua tela (+NOVO global).
  try {
    await carregarOpcoesParaOperacao(entidade);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  }
  if (operacao?.id) {
    try {
      const detalhe = await apiGet<OperacaoDetalhe>(`/api/${endpointOperacaoPorEntidade[entidade]}/${operacao.id}`);
      preencherFormOperacao(entidade, detalhe);
      if ((entidade === "despesa" || entidade === "mercadoria") && detalhe.fotoDocumentoUrl) {
        void fotoDocumento.carregarExistente(apiUrl, endpointOperacaoPorEntidade[entidade], operacao.id);
      }
    } catch (error) {
      notificar(mensagemErro(error), "error");
      return;
    }
  }
  modalOperacaoAberto.value = true;
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
    preencherFormOperacao(entidade, detalhe);
    if (detalhe.fotoDocumentoUrl) {
      void fotoDocumento.carregarExistente(apiUrl, endpointOperacaoPorEntidade[entidade], operacao.id);
    }
    // O cabecalho pendente nao tem itens: preencherFormOperacao desligaria o modo de itens.
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
  form.value.grupoDespesaId = "";
  form.value.grupoMercadoriaId = "";
  form.value.grupoRetiradaId = "";
  if (entidade === "retirada") form.value.fornecedorId = "";
  if (entidade === "mercadoria") form.value.colaboradorId = "";
  try {
    await carregarOpcoesParaOperacao(entidade);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  }
}

// Discriminacao: envia SO os itens via PATCH .../discriminar (sem trava de caixa). O servidor
// valida a soma contra o valor do cabecalho e recalcula o total de cada item pelo desconto.
async function salvarDiscriminacao() {
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
      ? { empresaId: empresaId.value, itensMercadoria: payload.itensMercadoria }
      : { empresaId: empresaId.value, itensDespesa: payload.itensDespesa };
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
  if (!resultado.serie) return "Lancamento salvo com sucesso.";
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
    const payload = montarPayloadOperacao(entidadeNova.value, {
      empresaId: empresaId.value,
      form: form.value,
      itensVenda: itensVenda.value,
      tiposPagamento: tiposPagamento.value,
      itensDespesa: itensDespesa.value,
      itensMercadoria: itensMercadoria.value,
      discriminandoDespesa: discriminandoDespesa.value,
      discriminandoMercadoria: discriminandoMercadoria.value,
      produtos: opcoesEmpresa.value.produtos,
      // Recorrencia so na CRIACAO: editar um lancamento da serie mexe naquele, nao regenera a
      // serie inteira (cancelar/editar em bloco e entrega propria — PROJECT_BRAIN/18 D-04).
      ...(operacaoEditandoId.value ? {} : { recorrencia: recorrenciaPayload.value })
    });
    // Pre-validacao no cliente: mensagem clara em PT antes do 400 do servidor (ex.: despesa sem grupo).
    const erroValidacao = validarOperacaoParaEnvio(entidadeNova.value, {
      descricao: payload.descricao,
      grupoDespesaId: payload.grupoDespesaId,
      grupoMercadoriaId: payload.grupoMercadoriaId,
      contaOrigemId: payload.contaOrigemId,
      contaDestinoId: payload.contaDestinoId,
      fornecedorId: payload.fornecedorId,
      colaboradorId: payload.colaboradorId,
      qtdItensDespesa: payload.itensDespesa.length,
      qtdItensMercadoria: payload.itensMercadoria.length
    });
    if (erroValidacao) {
      notificar(erroValidacao, "error");
      return;
    }
    const editandoId = operacaoEditandoId.value;
    const endpoint = endpointOperacaoPorEntidade[entidadeNova.value];
    type OperacaoSalva = { id: string; computar: boolean; serie?: number; serieLimitada?: boolean };
    const operacaoSalva = editandoId
      ? await apiPut<OperacaoSalva>(`/api/${endpoint}/${editandoId}`, payload)
      : await apiPost<OperacaoSalva>(`/api/${endpoint}`, payload);
    // Anexa a foto do documento (nota/cupom) so em despesas/mercadorias, apos o registro existir.
    const fotoUrl =
      entidadeNova.value === "despesa" || entidadeNova.value === "mercadoria"
        ? await fotoDocumento.enviar(apiUrl, endpoint, operacaoSalva.id)
        : null;
    const linhaAtualizada = {
      id: operacaoSalva.id,
      empresaId: empresaId.value,
      dataReferencia: form.value.dataReferencia,
      descricao: form.value.descricao,
      valorOriginal: String(Number(form.value.valorOriginal || 0)),
      computar: operacaoSalva.computar,
      status: "aprovado",
      ...(fotoUrl ? { fotoDocumentoUrl: fotoUrl } : {})
    };
    if (editandoId) {
      const indice = operacoes.value.findIndex((operacao) => operacao.id === editandoId);
      if (indice >= 0) operacoes.value.splice(indice, 1, { ...operacoes.value[indice], ...linhaAtualizada });
    } else {
      operacoes.value.unshift(linhaAtualizada);
    }
    modalOperacaoAberto.value = false;
    notificar(editandoId ? "Lancamento atualizado com sucesso." : mensagemLancamentoSalvo(operacaoSalva));
    await carregarStatusCaixa(empresaId.value);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoOperacao.value = false;
  }
}

function abrirMaloteNovo() {
  maloteEditandoId.value = "";
  formMalote.value = { numeroLacre: "", valor: 0 };
  modalMaloteAberto.value = true;
}

// O malote E o lacre (D3): o item ja esta em opcoes.malotes (numero + valor), sem buscar lacres.
function abrirMaloteEditar(linha: Record<string, string | undefined>) {
  if (!linha.id) return;
  const malote = opcoes.value.malotes.find((item) => item.id === linha.id);
  maloteEditandoId.value = linha.id;
  formMalote.value = {
    numeroLacre: malote?.numeroLacre ?? linha.lacre ?? "",
    valor: Number(malote?.valor ?? 0)
  };
  modalMaloteAberto.value = true;
}

async function salvarMalote() {
  maloteSalvando.value = true;
  try {
    const payload = {
      empresaId: empresaId.value,
      numeroLacre: formMalote.value.numeroLacre.trim(),
      valor: formMalote.value.valor
    };
    const resposta = maloteEditandoId.value
      ? await apiPut<{ id?: string }>(`/api/malotes/${maloteEditandoId.value}`, payload)
      : await apiPost<{ id?: string }>("/api/malotes", payload);
    const id = resposta?.id ?? maloteEditandoId.value;
    const indiceAtual = opcoes.value.malotes.findIndex((item) => item.id === id);
    // Status: novo nasce "disponivel"; edicao mantem o status atual (ciclo e do caixa, nao do cadastro).
    const item: Opcao = {
      id,
      empresaId: empresaId.value,
      numeroLacre: payload.numeroLacre,
      valor: payload.valor,
      status: indiceAtual >= 0 ? (opcoes.value.malotes[indiceAtual]?.status ?? "disponivel") : "disponivel"
    };
    if (indiceAtual >= 0) opcoes.value.malotes.splice(indiceAtual, 1, item);
    else opcoes.value.malotes.unshift(item);
    modalMaloteAberto.value = false;
    notificar(maloteEditandoId.value ? "Malote atualizado com sucesso." : "Malote cadastrado com sucesso.");
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    maloteSalvando.value = false;
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
  // Malotes tem modal proprio (com lacres): o botao Editar embutido abre o editor de malote,
  // e nao o cadastro generico. Isso substitui a acao "Editar" extra duplicada que existia.
  if (telaAtiva.value === "malotes") {
    void abrirMaloteEditar(linha);
    return;
  }
  cadastroTela.value = telaAtiva.value;
  cadastroEditandoId.value = linha.id ?? "";
  formCadastro.value = formCadastroDeLinha(linha, regrasDaLinha(linha));
  modalCadastroAberto.value = true;
}

async function salvarCadastro() {
  cadastroSalvando.value = true;
  try {
    const endpoint = tipoEndpointCadastro(cadastroTela.value, formCadastro.value);
    const formSnapshot: CadastroForm = {
      ...formCadastro.value,
      empresaIds: [...formCadastro.value.empresaIds],
      produtoConversoes: formCadastro.value.produtoConversoes.map((conversao) => ({ ...conversao })),
      regras: { ...formCadastro.value.regras }
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
        if (!window.confirm(`${error.message} Cadastrar mesmo assim?`)) return;
        resultado = await enviar({ ...(payload as Record<string, unknown>), forcar: true });
      } else {
        throw error;
      }
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
  if (!window.confirm(`Excluir a permissao ${permissao} de ${linha.alvo || alvoId}?`)) return;
  permissaoExcluindoId.value = linha.id ?? `${tipoPermissao}:${alvoId}:${permissao}`;
  try {
    const params = new URLSearchParams({
      empresaId: empresaId.value,
      tipoPermissao,
      alvoId,
      permissao
    });
    await apiDelete(`/api/permissoes/regras?${params.toString()}`);
    notificar("Permissao excluida com sucesso.");
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
const { abrirCaixaOperacional, acertarSaldoOperacional, fecharCaixaOperacional } = criarAcoesCaixa({
  api: { post: apiPost },
  empresaId: () => empresaId.value,
  telaAtiva: () => telaAtiva.value,
  resumoSaldo: () => resumo.value?.saldo ?? null,
  setSalvando: (valor) => {
    caixaSalvando.value = valor;
  },
  carregarStatusCaixa,
  carregarDadosTela,
  notificar,
  mensagemErro,
  confirmar: (mensagem) => window.confirm(mensagem)
});

async function logout() {
  saindo.value = true;
  try {
    try {
      await fetch(`${apiUrl}/api/auth/sign-out`, { method: "POST", credentials: "include" });
    } catch {
      // Se a API estiver fora, o logout local ainda precisa liberar a tela.
    }
    limparWorkspacePersistido();
    await router.push("/login");
  } finally {
    saindo.value = false;
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
    !window.confirm(
      `Restaurar as permissoes do cargo "${nome}" para o padrao? Isso SUBSTITUI as regras atuais (inclusive as desligadas manualmente).`
    )
  ) {
    return;
  }
  try {
    await apiPost(`/api/permissoes/cargo/${cargoId}/restaurar-padrao`, {});
    notificar(`Permissoes do cargo "${nome}" restauradas para o padrao.`);
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
  salvandoOperacao,
  salvarOperacao,
  podeUsarRecorrencia,
  recorrencia,
  fotoDocumentoPreview: fotoDocumento.previewUrl,
  fotoDocumentoExistente: fotoDocumento.existente,
  selecionarFotoDocumento: fotoDocumento.selecionar,
  modalMaloteAberto,
  maloteEditandoId,
  formMalote,
  maloteSalvando,
  salvarMalote,
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
}

const pageContext = computed(() => ({
  resumo: resumo.value,
  telaAtual: telaAtual.value,
  telaAtiva: telaAtiva.value,
  empresaAtiva: empresaAtiva.value,
  operacoesPaginadas: operacoesPaginadas.value,
  // Lista COMPLETA da tela (sem paginar) — usada pela Tesouraria para somar o total do periodo.
  operacoesTela: operacoesDaTela.value,
  totalOperacoes: operacoesDaTela.value.length,
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
  maloteEditandoCarregandoId: maloteEditandoCarregandoId.value,
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
  abrirCaixaOperacional,
  acertarSaldoOperacional,
  fecharCaixaOperacional,
  recarregarCaixa: async () => {
    await carregarStatusCaixa(empresaId.value);
    await carregarOperacoes(empresaId.value);
  },
  abrirCadastroNovo: () => (telaAtiva.value === "malotes" ? abrirMaloteNovo() : abrirCadastroNovo(telaAtiva.value)),
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
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="empresaCarregando"
    :saindo="saindo"
    @selecionar-empresa="selecionarEmpresa"
    @logout="logout"
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
          <div class="caixa-title">Nao ha caixa aberto</div>
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

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
