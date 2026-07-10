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
  CadastroForm,
  CaixaStatus,
  EntidadeOperacional,
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
import {
  dataHoraLocal,
  documentoEhCpf,
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
  opcoesNovo,
  opcoesVazias,
  rotaTela,
  temaPadrao,
  tipoEndpointCadastro
} from "~/utils/domain";
import {
  formOperacaoDeDetalhe,
  montarPayloadOperacao,
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
  | "fechamento"
  | "relatorio_produtos"
  | "relatorio_vendas"
  | "contas_pagar"
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
const { apiUrl, apiGet, apiGetPaginado, apiPost, apiPut, apiDelete, carregarSessao, aplicarTema } = useApi();

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
const form = ref<OperacaoForm>(formOperacaoVazio());
const discriminandoDespesa = ref(false);
const discriminandoMercadoria = ref(false);
const itensDespesa = ref([{ descricao: "", valor: "", grupoDespesaId: "" }]);
const itensMercadoria = ref([
  {
    descricao: "",
    quantidade: "1",
    valorUnitario: "",
    valorTotal: "",
    produtoId: "",
    grupoMercadoriaId: "",
    unidadeMedidaId: ""
  }
]);
const itensVenda = ref([{ descricaoProduto: "", quantidade: "1", valorUnitario: "", valorTotal: "", produtoId: "" }]);
const tiposPagamento = ref([{ formaPagamentoId: "", totalPago: "", numeroVendas: "1" }]);
const salvandoOperacao = ref(false);
const caixaSalvando = ref(false);
const modalCaixaDrawerAberto = ref(false);
const modoCaixaDrawer = ref<"abrir" | "editar">("abrir");
const tokenCaixaConfirmado = ref(false);
const formCaixaDrawer = reactive({
  pdvId: "",
  dataHoraAbertura: "",
  tokenEdicao: ""
});

const formMalote = ref({ codigo: "", lacres: [""] });
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
  return telasPermitidas.value
    .filter((item) => item.id !== "caixa")
    .map((item) => ({ ...item, cor: corMenuTela(empresaAtiva.value?.configuracoesAparencia, item.id) }));
});
const motivoTelaAtivaDesabilitada = computed(
  () => motivosTelasDesabilitadas.value[telaAtiva.value] ?? "Tela indisponivel para este perfil."
);
const telaAtual = computed(() => itemPorTela[telaAtiva.value] ?? telasPermitidas.value[0]);
const operacoesDaTela = computed(() => operacoes.value);
const totalPaginasOperacoes = computed(() => Math.max(1, Math.ceil(operacoesDaTela.value.length / 10)));
const operacoesPaginadas = computed(() =>
  operacoesDaTela.value.slice((paginaOperacoes.value - 1) * 10, paginaOperacoes.value * 10)
);
const acoesNovo = computed(() => {
  if (!caixaAberto.value) return [];
  return opcoesNovo.filter((item) => temPermissao(item.permissao));
});
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
  deCentavos(somarCentavos(...itensMercadoria.value.map((item) => item.valorTotal)))
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

async function abrirModalCaixaDrawer(modo: "abrir" | "editar") {
  modoCaixaDrawer.value = modo;
  tokenCaixaConfirmado.value = false;
  formCaixaDrawer.tokenEdicao = "";
  // O botao "Abrir caixa" e global; a lista de PDVs pode nao ter sido carregada pela tela atual
  // (ex.: Painel). Garante os PDVs da empresa ativa antes de montar o dropdown do dialogo.
  if (empresaId.value) {
    opcoes.value.pdvs = await apiGet<Opcao[]>(`/api/pdvs?empresaId=${empresaId.value}`);
  }
  formCaixaDrawer.pdvId = caixaAberto.value?.pdvId || opcoesEmpresa.value.pdvs[0]?.id || "";
  formCaixaDrawer.dataHoraAbertura = caixaAberto.value
    ? dataHoraLocal(caixaAberto.value.dataHoraAbertura)
    : dataHoraLocal();
  modalCaixaDrawerAberto.value = true;
}

async function salvarCaixaDrawer() {
  if (modoCaixaDrawer.value === "abrir") {
    const ok = await abrirCaixaOperacional({
      pdvId: formCaixaDrawer.pdvId,
      usuarioCaixaId: sessao.value?.perfil?.usuarioId || "",
      dataHoraAbertura: formCaixaDrawer.dataHoraAbertura,
      observacao: null
    });
    if (ok) modalCaixaDrawerAberto.value = false;
    return;
  }

  if (!caixaAberto.value) return;
  const ok = await editarAberturaCaixa({
    caixaId: caixaAberto.value.id,
    tokenEdicao: formCaixaDrawer.tokenEdicao,
    pdvId: formCaixaDrawer.pdvId,
    usuarioCaixaId: sessao.value?.perfil?.usuarioId || "",
    dataHoraAbertura: formCaixaDrawer.dataHoraAbertura,
    observacao: null
  });
  if (ok) modalCaixaDrawerAberto.value = false;
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

  if (tela === "entradas") {
    [dados.contas, dados.produtos, dados.pdvs, dados.formasPagamento] = await Promise.all([
      apiGet<Opcao[]>(`/api/contas${query}`),
      apiGet<Opcao[]>(`/api/produtos${query}`),
      apiGet<Opcao[]>(`/api/pdvs${query}`),
      apiGet<Opcao[]>(`/api/formas_pagamento${query}`)
    ]);
  } else if (tela === "fechamento") {
    dados.contas = await apiGet<Opcao[]>(`/api/contas${query}`);
  } else if (tela === "caixa") {
    dados.pdvs = await apiGet<Opcao[]>(`/api/pdvs${query}`);
  } else if (tela === "pdv") {
    [dados.contas, dados.pdvs] = await Promise.all([
      apiGet<Opcao[]>(`/api/contas${query}`),
      apiGet<Opcao[]>(`/api/pdvs${query}`)
    ]);
  } else if (tela === "transferencias") {
    [dados.contas, dados.malotes] = await Promise.all([
      apiGet<Opcao[]>(`/api/contas${query}`),
      apiGet<Opcao[]>(`/api/malotes${query}`)
    ]);
  } else if (tela === "despesas") {
    const grupos = await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(
      `/api/grupos${query}`
    );
    Object.assign(dados, grupos);
    [dados.contas, dados.fornecedores] = await Promise.all([
      apiGet<Opcao[]>(`/api/contas${query}`),
      apiGet<Opcao[]>(`/api/fornecedores${query}`)
    ]);
  } else if (tela === "contas_pagar") {
    [dados.pdvs] = await Promise.all([apiGet<Opcao[]>(`/api/pdvs${query}`)]);
  } else if (tela === "mercadorias" || tela === "pedidos") {
    const grupos = await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(
      `/api/grupos${query}`
    );
    Object.assign(dados, grupos);
    // Conta origem e obrigatoria no form de mercadoria (sem ela o select fica "No data available").
    [dados.contas, dados.fornecedores, dados.unidadesMedida, dados.produtos] = await Promise.all([
      apiGet<Opcao[]>(`/api/contas${query}`),
      apiGet<Opcao[]>(`/api/fornecedores${query}`),
      apiGet<Opcao[]>(`/api/unidades_medida${query}`),
      apiGet<Opcao[]>(`/api/produtos${query}`)
    ]);
  } else if (tela === "retiradas") {
    const grupos = await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(
      `/api/grupos${query}`
    );
    Object.assign(dados, grupos);
    // Conta origem e obrigatoria no form de retirada (sem ela o select fica "No data available").
    [dados.contas, dados.fornecedores, dados.colaboradores] = await Promise.all([
      apiGet<Opcao[]>(`/api/contas${query}`),
      apiGet<Opcao[]>(`/api/fornecedores${query}`),
      apiGet<Opcao[]>(`/api/colaboradores${query}`)
    ]);
  } else if (tela === "grupos") {
    Object.assign(
      dados,
      await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`)
    );
  } else if (tela === "unidades") {
    dados.unidadesMedida = await apiGet<Opcao[]>(`/api/unidades_medida${query}`);
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
    [dados.pdvs, dados.clientes, dados.colaboradores, dados.formasPagamento] = await Promise.all([
      apiGet<Opcao[]>(`/api/pdvs${query}`),
      apiGet<Opcao[]>(`/api/clientes${query}`),
      apiGet<Opcao[]>(`/api/colaboradores${query}`),
      apiGet<Opcao[]>(`/api/formas_pagamento${query}`)
    ]);
  }

  if (temPermissao("caixa_operar") && idEmpresa) {
    const cargas: Promise<unknown>[] = [];
    if (!dados.pdvs.length) cargas.push(apiGet<Opcao[]>(`/api/pdvs${query}`).then((pdvs) => (dados.pdvs = pdvs)));
    await Promise.all(cargas);
  }

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
  const caixaId = caixaIdFiltroTela();
  const item = itemPorTela[telaAtiva.value];
  if (item && dependeCaixaAberto(item) && !caixaId) {
    operacoes.value = [];
    return;
  }
  if (caixaId) params.set("caixaId", caixaId);
  operacoes.value = await apiGet<OperacaoResumo[]>(
    `/api/${endpointOperacaoPorEntidade[entidade]}?${params.toString()}`
  );
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
      alvo.contas = await apiGet<Opcao[]>(`/api/contas${query}`);
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

  await Promise.all(opcoesPorEntidade[entidade].map((chave) => tarefas[chave]()));
}

async function abrirOperacao(entidade: EntidadeOperacional, operacao?: { id: string }) {
  if (!caixaAberto.value) {
    notificar("Abra um caixa antes de registrar lancamentos.", "warning");
    void router.push("/caixa");
    return;
  }
  entidadeNova.value = entidade;
  operacaoEditandoId.value = operacao?.id ?? "";
  form.value = formOperacaoVazio();
  discriminandoDespesa.value = false;
  discriminandoMercadoria.value = false;
  itensVenda.value = [{ descricaoProduto: "", quantidade: "1", valorUnitario: "", valorTotal: "", produtoId: "" }];
  tiposPagamento.value = [{ formaPagamentoId: "", totalPago: "", numeroVendas: "1" }];
  itensDespesa.value = [{ descricao: "", valor: "", grupoDespesaId: "" }];
  itensMercadoria.value = [
    {
      descricao: "",
      quantidade: "1",
      valorUnitario: "",
      valorTotal: "",
      produtoId: "",
      grupoMercadoriaId: "",
      unidadeMedidaId: ""
    }
  ];
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
    } catch (error) {
      notificar(mensagemErro(error), "error");
      return;
    }
  }
  modalOperacaoAberto.value = true;
}

function executarAcaoNovo(acao: (typeof opcoesNovo)[number]) {
  if (acao.entidade) void abrirOperacao(acao.entidade);
  if (acao.tela === "malote") abrirMaloteNovo();
}

async function salvarOperacao() {
  salvandoOperacao.value = true;
  try {
    const payload = montarPayloadOperacao(entidadeNova.value, {
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
    const operacaoSalva = editandoId
      ? await apiPut<{ id: string; computar: boolean }>(`/api/${endpoint}/${editandoId}`, payload)
      : await apiPost<{ id: string; computar: boolean }>(`/api/${endpoint}`, payload);
    const linhaAtualizada = {
      id: operacaoSalva.id,
      empresaId: empresaId.value,
      dataReferencia: form.value.dataReferencia,
      descricao: form.value.descricao,
      valorOriginal: String(Number(form.value.valorOriginal || 0)),
      computar: operacaoSalva.computar,
      status: "aprovado"
    };
    if (editandoId) {
      const indice = operacoes.value.findIndex((operacao) => operacao.id === editandoId);
      if (indice >= 0) operacoes.value.splice(indice, 1, { ...operacoes.value[indice], ...linhaAtualizada });
    } else {
      operacoes.value.unshift(linhaAtualizada);
    }
    modalOperacaoAberto.value = false;
    notificar(editandoId ? "Lancamento atualizado com sucesso." : "Lancamento salvo com sucesso.");
    await carregarStatusCaixa(empresaId.value);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoOperacao.value = false;
  }
}

function abrirMaloteNovo() {
  maloteEditandoId.value = "";
  formMalote.value = { codigo: "", lacres: [""] };
  modalMaloteAberto.value = true;
}

async function abrirMaloteEditar(linha: Record<string, string | undefined>) {
  if (!linha.id) return;
  maloteEditandoCarregandoId.value = linha.id;
  try {
    const lacres = await apiGet<Array<{ numero: string }>>(`/api/malotes/${linha.id}/lacres`);
    maloteEditandoId.value = linha.id;
    formMalote.value = {
      codigo: linha.codigo ?? "",
      lacres: lacres.map((lacre) => lacre.numero).concat(lacres.length ? [] : [""])
    };
    modalMaloteAberto.value = true;
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    maloteEditandoCarregandoId.value = "";
  }
}

async function salvarMalote() {
  maloteSalvando.value = true;
  try {
    const payload = {
      empresaId: empresaId.value,
      codigo: formMalote.value.codigo,
      lacres: formMalote.value.lacres.map((lacre) => lacre.trim()).filter(Boolean)
    };
    const malote = maloteEditandoId.value
      ? await apiPut<Opcao & { codigo?: string; lacres?: string[] }>(`/api/malotes/${maloteEditandoId.value}`, payload)
      : await apiPost<Opcao & { codigo?: string; lacres?: string[] }>("/api/malotes", payload);
    const indiceAtual = opcoes.value.malotes.findIndex((item) => item.id === malote.id);
    if (indiceAtual >= 0)
      opcoes.value.malotes.splice(indiceAtual, 1, { ...opcoes.value.malotes[indiceAtual], ...malote });
    else opcoes.value.malotes.unshift(malote);
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
const { abrirCaixaOperacional, editarAberturaCaixa, acertarSaldoOperacional, fecharCaixaOperacional } = criarAcoesCaixa(
  {
    api: { post: apiPost, put: apiPut },
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
  }
);

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

function lidarExtraCadastro(payload: { event: string; linha: Record<string, string | undefined> }) {
  if (payload.event === "maloteEditar") void abrirMaloteEditar(payload.linha);
}

provide(WORKSPACE_CONTEXT, {
  modalCaixaDrawerAberto,
  modoCaixaDrawer,
  formCaixaDrawer,
  opcoesEmpresa,
  tokenCaixaConfirmado,
  caixaSalvando,
  salvarCaixaDrawer,
  modalOperacaoAberto,
  entidadeNova,
  operacaoEditandoId,
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
  totalOperacoes: operacoesDaTela.value.length,
  paginaOperacoes: paginaOperacoes.value,
  totalPaginasOperacoes: totalPaginasOperacoes.value,
  descricao: descricaoTela(telaAtiva.value),
  caixaStatus: caixaStatus.value,
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
  atualizarPaginaOperacoes,
  abrirCaixaOperacional,
  acertarSaldoOperacional,
  fecharCaixaOperacional,
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

onMounted(() => {
  if (workspaceCarregado.value && sessao.value) {
    carregando.value = false;
    erro.value = "";
    aplicarTema(temaAtual.value, temaResumoCaixa.value);
    return;
  }
  void carregarTudo();
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
            <div class="caixa-meta">
              Aberto em: {{ new Date(caixaAberto.dataHoraAbertura).toLocaleString("pt-BR") }}
            </div>
          </div>
          <span class="status-pill">Aberto</span>
        </div>
        <div v-else>
          <div class="caixa-title">Nao ha caixa aberto</div>
          <div class="caixa-meta">Abra um caixa para operar as telas financeiras.</div>
        </div>
        <v-btn
          class="mt-4 caixa-edit"
          block
          size="small"
          variant="tonal"
          :prepend-icon="caixaAberto ? 'mdi-pencil' : 'mdi-cash-register'"
          @click="abrirModalCaixaDrawer(caixaAberto ? 'editar' : 'abrir')"
        >
          {{ caixaAberto ? "Editar" : "Abrir caixa" }}
        </v-btn>
      </div>
    </template>

    <template v-if="acoesNovo.length" #actions>
      <v-menu>
        <template #activator="{ props: menuProps }">
          <v-btn v-bind="menuProps" class="sidebar-new-button" block prepend-icon="mdi-plus">Novo</v-btn>
        </template>
        <v-list min-width="320">
          <v-list-item
            v-for="acao in acoesNovo"
            :key="acao.titulo"
            :prepend-icon="acao.icone"
            :title="acao.titulo"
            :subtitle="acao.subtitulo"
            @click="executarAcaoNovo(acao)"
          />
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
