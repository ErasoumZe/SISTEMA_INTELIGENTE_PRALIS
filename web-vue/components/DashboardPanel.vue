<script setup lang="ts">
import {
  TELA_TEMA_RESUMO_CAIXA,
  type AuthSession,
  type ConfiguracaoAparenciaEmpresa,
  type Permissao,
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
  ResumoCaixa,
  TreeItem
} from "~/types/padaria";
import {
  cadastroPayload,
  dinheiro,
  endpointOperacaoPorEntidade,
  formCadastroVazio,
  formOperacaoVazio,
  itemTemaResumoCaixa,
  itemPorTela,
  mensagemErro,
  entidadePorTela,
  opcoesFiltradasPorEmpresa,
  opcoesNovo,
  opcoesVazias,
  permissoes,
  rotaTela,
  secoesPermissoes,
  motivoTelaDesabilitada,
  telaDesabilitadaNoMenu,
  telaVisivelNoMenu,
  temaPadrao,
  tipoEndpointCadastro
} from "~/utils/domain";

type TipoPagina =
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

const router = useRouter();
const { apiUrl, apiGet, apiGetPaginado, apiPost, apiPut, apiDelete, carregarSessao, aplicarTema } = useApi();

const sessao = ref<AuthSession | null>(null);
const opcoes = ref<Opcoes>(opcoesVazias());
const empresas = ref<Opcao[]>([]);
const operacoes = ref<OperacaoResumo[]>([]);
const resumo = ref<ResumoCaixa | null>(null);
const caixaStatus = ref<CaixaStatus | null>(null);
const telaAtiva = ref(props.telaInicial && itemPorTela[props.telaInicial] ? props.telaInicial : "entradas");
const empresaSelecionadaId = ref("");
const carregando = ref(true);
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

const tema = ref<TemaAplicacao>(temaPadrao());
const temaAtual = ref<TemaAplicacao>(temaPadrao());
const temaResumoCaixa = ref<TemaAplicacao>(temaPadrao());
const temaTelaAtual = ref("");
const temaResumoCaixaAtual = ref("");
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
const camposTema = [
  "corPrimaria",
  "corSecundaria",
  "corFundo",
  "corCartao",
  "corSucesso",
  "corAviso",
  "corErro"
] as const satisfies ReadonlyArray<keyof TemaAplicacao>;

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
const podeConfigurarTema = computed(() => permissoesUsuario.value.includes("aparencia_editar"));
const caixaAberto = computed(() => caixaStatus.value?.caixaAberto ?? null);
const perfilCaixaOperacional = computed(
  () =>
    Boolean(sessao.value?.perfil) &&
    permissoesUsuario.value.includes("caixa_operar") &&
    !permissoesUsuario.value.includes("caixas_gerenciar")
);
const telaBloqueadaPorCaixa = computed(() => {
  const item = itemPorTela[telaAtiva.value];
  return item ? telaDesabilitadaNoMenu(permissoesUsuario.value, item, Boolean(caixaAberto.value)) : false;
});
const telasPermitidas = computed(() => {
  return Object.values(itemPorTela).filter((item) => telaVisivelNoMenu(permissoesUsuario.value, item));
});
const telasTemaPermitidas = computed(() => [...telasPermitidas.value, itemTemaResumoCaixa]);
const telasShell = computed(() => {
  return telasPermitidas.value.filter((item) => item.id !== "caixa");
});
const telasDesabilitadasMenu = computed(() =>
  telasPermitidas.value
    .filter((item) => telaDesabilitadaNoMenu(permissoesUsuario.value, item, Boolean(caixaAberto.value)))
    .map((item) => item.id)
);
const motivosTelasDesabilitadas = computed(() =>
  Object.fromEntries(
    telasPermitidas.value
      .filter((item) => telaDesabilitadaNoMenu(permissoesUsuario.value, item, Boolean(caixaAberto.value)))
      .map((item) => [
        item.id,
        motivoTelaDesabilitada(permissoesUsuario.value, item, Boolean(caixaAberto.value))
      ])
  )
);
const motivoTelaAtivaDesabilitada = computed(() => motivosTelasDesabilitadas.value[telaAtiva.value] ?? "Tela indisponivel para este perfil.");
const telaAtual = computed(() => itemPorTela[telaAtiva.value] ?? telasPermitidas.value[0]);
const operacoesDaTela = computed(() => operacoes.value);
const totalPaginasOperacoes = computed(() => Math.max(1, Math.ceil(operacoesDaTela.value.length / 10)));
const operacoesPaginadas = computed(() =>
  operacoesDaTela.value.slice((paginaOperacoes.value - 1) * 10, paginaOperacoes.value * 10)
);
const acoesNovo = computed(() => {
  if (!caixaAberto.value) return [];
  return opcoesNovo.filter((item) => permissoesUsuario.value.includes(item.permissao));
});
const totalItensDespesa = computed(() =>
  itensDespesa.value.reduce((total, item) => total + Number(item.valor || 0), 0)
);
const totalItensMercadoria = computed(() =>
  itensMercadoria.value.reduce((total, item) => total + Number(item.valorTotal || 0), 0)
);
const totalItensVenda = computed(() => itensVenda.value.reduce((total, item) => total + Number(item.valorTotal || 0), 0));
const totalTiposPagamento = computed(() =>
  tiposPagamento.value.reduce((total, item) => total + Number(item.totalPago || 0), 0)
);
const valorTotalOperacao = computed(() =>
  Math.max(
    0,
    Number(form.value.valorOriginal || 0) +
      Number(form.value.valorAcrescimo || 0) -
      Number(form.value.valorDesconto || 0)
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
  () => props.telaInicial,
  async (novaTela) => {
    if (!novaTela || novaTela === telaAtiva.value || !itemPorTela[novaTela]) return;
    telaAtiva.value = novaTela;
    paginaOperacoes.value = 1;
    if (sessao.value) await carregarDadosTela(novaTela, empresaId.value);
  }
);

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

function dataHoraLocal(valor: Date | string = new Date()) {
  const data = new Date(valor);
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 16);
}

function apenasDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

function mascararCpf(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 11);
  return digitos
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function mascararCnpj(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 14);
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function mascararDocumento(valor: string) {
  return apenasDigitos(valor).length > 11 ? mascararCnpj(valor) : mascararCpf(valor);
}

function documentoEhCpf(valor: string) {
  const digitos = apenasDigitos(valor);
  return digitos.length > 0 && digitos.length <= 11;
}

function atualizarDocumentoCadastro(valor: string) {
  const documento = mascararDocumento(valor);
  formCadastro.value.documento = documento;
  if (cadastroTela.value === "clientes" && !documentoEhCpf(documento)) formCadastro.value.dataNascimento = "";
}

function mascararWhatsapp(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 11);
  if (digitos.length <= 2) return digitos;
  const prefixo = digitos.length > 10 ? digitos.slice(2, 7) : digitos.slice(2, 6);
  const sufixo = digitos.length > 10 ? digitos.slice(7) : digitos.slice(6);
  return `(${digitos.slice(0, 2)}) ${prefixo}${sufixo ? `-${sufixo}` : ""}`;
}

function mascararCep(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

function abrirModalCaixaDrawer(modo: "abrir" | "editar") {
  modoCaixaDrawer.value = modo;
  tokenCaixaConfirmado.value = false;
  formCaixaDrawer.tokenEdicao = "";
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

function temPermissao(permissao: Permissao) {
  return permissoesUsuario.value.includes(permissao);
}

function telasDoUsuario() {
  return Object.keys(itemPorTela).filter((id) => {
    const item = itemPorTela[id];
    return item && temPermissao(item.permissao);
  });
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
  } else if (tela === "caixa" || tela === "pdv") {
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
    [dados.fornecedores, dados.unidadesMedida, dados.produtos] = await Promise.all([
      apiGet<Opcao[]>(`/api/fornecedores${query}`),
      apiGet<Opcao[]>(`/api/unidades_medida${query}`),
      apiGet<Opcao[]>(`/api/produtos${query}`)
    ]);
  } else if (tela === "retiradas") {
    const grupos = await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(
      `/api/grupos${query}`
    );
    Object.assign(dados, grupos);
    [dados.fornecedores, dados.colaboradores] = await Promise.all([
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

  if (permissoesUsuario.value.includes("caixa_operar") && idEmpresa) {
    const cargas: Promise<unknown>[] = [];
    if (!dados.pdvs.length) cargas.push(apiGet<Opcao[]>(`/api/pdvs${query}`).then((pdvs) => (dados.pdvs = pdvs)));
    if (!dados.contas.length) cargas.push(apiGet<Opcao[]>(`/api/contas${query}`).then((contas) => (dados.contas = contas)));
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
      await router.push("/login");
      return;
    }
    await carregarEmpresas();
    const perfilEmpresaId = sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? "";
    if (perfilEmpresaId && empresas.value.some((empresa) => empresa.id === perfilEmpresaId)) {
      empresaSelecionadaId.value = perfilEmpresaId;
    }
    const telas = telasDoUsuario();
    if (!telas.includes(telaAtiva.value)) {
      erro.value = "Sem permissao para acessar esta pagina.";
      return;
    }
    await carregarStatusCaixa(empresaId.value);
    await carregarDadosTela(telaAtiva.value, empresaId.value);
    await carregarTemaTela(telaAtiva.value);
    await carregarTemaResumoCaixa();
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
  operacoes.value = await apiGet<OperacaoResumo[]>(`/api/${endpointOperacaoPorEntidade[entidade]}?empresaId=${idEmpresa}`);
}

async function carregarStatusCaixa(idEmpresa = empresaId.value) {
  if (!idEmpresa) return;
  if (!permissoesUsuario.value.includes("caixa_operar")) {
    caixaStatus.value = null;
    resumo.value = null;
    return;
  }
  caixaStatus.value = await apiGet<CaixaStatus>(`/api/caixa/status?empresaId=${idEmpresa}`);
  resumo.value = caixaStatus.value.resumo;
}

function abrirOperacao(entidade: EntidadeOperacional) {
  if (!caixaAberto.value) {
    notificar("Abra um caixa antes de registrar lancamentos.", "warning");
    void router.push("/caixa");
    return;
  }
  entidadeNova.value = entidade;
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
  modalOperacaoAberto.value = true;
}

function executarAcaoNovo(acao: (typeof opcoesNovo)[number]) {
  if (acao.entidade) abrirOperacao(acao.entidade);
  if (acao.tela === "malote") abrirMaloteNovo();
}

async function salvarOperacao() {
  salvandoOperacao.value = true;
  try {
    const itensDespesaPayload =
      entidadeNova.value === "despesa" && discriminandoDespesa.value
        ? itensDespesa.value
            .filter((item) => item.descricao || item.valor)
            .map((item) => ({ ...item, valor: Number(item.valor || 0) }))
        : [];
    const itensMercadoriaPayload =
      entidadeNova.value === "mercadoria" && discriminandoMercadoria.value
        ? itensMercadoria.value
            .filter((item) => item.descricao || item.produtoId)
            .map((item) => ({
              ...item,
              quantidade: Number(item.quantidade || 0),
              valorUnitario: Number(item.valorUnitario || 0),
              valorTotal: Number(item.valorTotal || 0)
            }))
        : [];
    const itensVendaPayload =
      entidadeNova.value === "venda"
        ? itensVenda.value
            .filter((item) => item.descricaoProduto || item.produtoId || item.valorTotal)
            .map((item) => {
              const produto = opcoesEmpresa.value.produtos.find((opcao) => opcao.id === item.produtoId);
              return {
                produtoId: item.produtoId || null,
                descricaoProduto: item.descricaoProduto || produto?.descricao || produto?.nome || "Venda",
                quantidade: Number(item.quantidade || 0),
                valorUnitario: Number(item.valorUnitario || 0),
                valorTotal: Number(item.valorTotal || 0)
              };
            })
        : [];
    const tiposPagamentoPayload =
      entidadeNova.value === "venda"
        ? tiposPagamento.value
            .filter((item) => item.formaPagamentoId || item.totalPago)
            .map((item) => ({
              formaPagamentoId: item.formaPagamentoId || null,
              numeroVendas: Number(item.numeroVendas || 0),
              totalPago: Number(item.totalPago || 0)
            }))
        : [];

    const operacaoSalva = await apiPost<{ id: string; computar: boolean }>(`/api/${endpointOperacaoPorEntidade[entidadeNova.value]}`, {
      empresaId: empresaId.value,
      ...form.value,
      dataPagamento: form.value.dataPagamento || null,
      valorOriginal: Number(form.value.valorOriginal || 0),
      valorAcrescimo: Number(form.value.valorAcrescimo || 0),
      valorDesconto: Number(form.value.valorDesconto || 0),
      itensVenda: itensVendaPayload,
      tiposPagamento: tiposPagamentoPayload,
      itensDespesa: itensDespesaPayload,
      itensMercadoria: itensMercadoriaPayload
    });
    operacoes.value.unshift({
      id: operacaoSalva.id,
      empresaId: empresaId.value,
      dataReferencia: form.value.dataReferencia,
      descricao: form.value.descricao,
      valorOriginal: String(Number(form.value.valorOriginal || 0)),
      computar: form.value.temNotaFiscal ? true : form.value.computar,
      status: "aprovado"
    });
    modalOperacaoAberto.value = false;
    notificar("Lancamento salvo com sucesso.");
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

function upsertOpcao(lista: Opcao[], item: Opcao) {
  const indice = lista.findIndex((opcao) => opcao.id === item.id);
  if (indice >= 0) lista.splice(indice, 1, { ...lista[indice], ...item });
  else lista.unshift(item);
}

function removerOpcao(lista: Opcao[], id: string) {
  const indice = lista.findIndex((opcao) => opcao.id === id);
  if (indice >= 0) lista.splice(indice, 1);
}

function listaGrupoCadastro(tipoGrupo: CadastroForm["tipoGrupo"]) {
  if (tipoGrupo === "mercadoria") return opcoes.value.gruposMercadorias;
  if (tipoGrupo === "retirada") return opcoes.value.gruposRetiradas;
  if (tipoGrupo === "vendas") return opcoes.value.gruposVendas;
  return opcoes.value.gruposDespesas;
}

function atualizarCadastroLocal(tela: string, form: CadastroForm, id: string | undefined) {
  if (!id) return false;
  const empresaAtual = empresaId.value;
  const empresaDoItem = tela === "empresas" ? undefined : empresaAtual;
  const itemBase: Opcao = { id, ...(empresaDoItem ? { empresaId: empresaDoItem } : {}) };

  if (tela === "empresas") {
    const item = { ...itemBase, nome: form.nome, cnpj: form.cnpj || null };
    upsertOpcao(empresas.value, item);
    upsertOpcao(opcoes.value.empresas, item);
    return true;
  }

  if (tela === "contas") {
    upsertOpcao(opcoes.value.contas, { ...itemBase, nome: form.nome });
    return true;
  }

  if (tela === "formas_pagamento") {
    upsertOpcao(opcoes.value.formasPagamento, { ...itemBase, nome: form.nome });
    return true;
  }

  if (tela === "pdv") {
    upsertOpcao(opcoes.value.pdvs, { ...itemBase, nome: form.nome, contaId: form.contaId, ativo: form.ativo });
    return true;
  }

  if (tela === "fornecedores") {
    upsertOpcao(opcoes.value.fornecedores, { ...itemBase, nome: form.nome, documento: form.documento || undefined });
    return true;
  }

  if (tela === "clientes") {
    upsertOpcao(opcoes.value.clientes, {
      ...itemBase,
      nome: form.nome,
      documento: form.documento || undefined,
      dataNascimento: documentoEhCpf(form.documento) ? form.dataNascimento || undefined : undefined,
      whatsapp: form.whatsapp || undefined,
      email: form.email || undefined,
      cep: form.cep || undefined,
      rua: form.rua || undefined,
      numero: form.numero || undefined,
      complemento: form.complemento || undefined,
      bairro: form.bairro || undefined,
      cidade: form.cidade || undefined,
      estado: form.estado || undefined
    });
    return true;
  }

  if (tela === "produtos") {
    upsertOpcao(opcoes.value.produtos, {
      ...itemBase,
      codigo: form.codigo || undefined,
      codigoBarras: form.codigoBarras || undefined,
      descricao: form.descricao || form.nome,
      marca: form.marca || null,
      unidadeIndividualId: form.unidadeIndividualId,
      quantidadeIndividual: String(Number(form.quantidadeIndividual || 1)),
      grupoMercadoriaId: form.grupoMercadoriaId || null,
      conversoes: form.produtoConversoes
        .filter((conversao) => conversao.unidadeMedidaId && conversao.quantidade && conversao.unidadesIndividuais)
        .map((conversao) => ({
          unidadeMedidaId: conversao.unidadeMedidaId,
          quantidade: String(Number(conversao.quantidade || 0)),
          unidadesIndividuais: String(Number(conversao.unidadesIndividuais || 0))
        }))
    });
    return true;
  }

  if (tela === "colaboradores") {
    const cargo = opcoes.value.cargos.find((opcao) => opcao.id === form.cargoId);
    const setor = opcoes.value.setores.find((opcao) => opcao.id === form.setorId);
    upsertOpcao(opcoes.value.colaboradores, {
      ...itemBase,
      nome: form.nome,
      cpf: form.cpf || undefined,
      setorId: form.setorId || null,
      descricao: setor?.nome ?? setor?.descricao,
      cargoId: form.cargoId,
      cargoIds: [form.cargoId],
      cargoNome: cargo?.nome,
      cargos: cargo?.nome ? [cargo.nome] : []
    });
    return true;
  }

  if (tela === "unidades") {
    upsertOpcao(opcoes.value.unidadesMedida, { ...itemBase, nome: form.nome, sigla: form.sigla });
    return true;
  }

  if (tela === "grupos") {
    [
      opcoes.value.gruposDespesas,
      opcoes.value.gruposMercadorias,
      opcoes.value.gruposRetiradas,
      opcoes.value.gruposVendas
    ].forEach((lista) => removerOpcao(lista, id));
    upsertOpcao(listaGrupoCadastro(form.tipoGrupo), {
      ...itemBase,
      nome: form.nome,
      tipoGrupo: form.tipoGrupo,
      grupoPaiId: form.grupoPaiId || null
    });
    return true;
  }

  if (tela === "areas_setores") {
    removerOpcao(opcoes.value.areas, id);
    removerOpcao(opcoes.value.setores, id);
    if (form.tipoAreaSetor === "setor") {
      upsertOpcao(opcoes.value.setores, {
        ...itemBase,
        nome: form.nome,
        tipoAreaSetor: "setor",
        areaId: form.areaId || null,
        setorPaiId: form.setorPaiId || null
      });
    } else {
      upsertOpcao(opcoes.value.areas, { ...itemBase, nome: form.nome, tipoAreaSetor: "area" });
    }
    return true;
  }

  if (tela === "usuarios") {
    if (form.novoColaborador) return false;
    const empresaIds = form.empresaIds.length ? form.empresaIds : [empresaAtual].filter(Boolean);
    const usuarioAtual = opcoes.value.usuarios.find((opcao) => (opcao.usuarioId ?? opcao.id) === id);
    const colaboradorAnterior = opcoes.value.colaboradores.find((opcao) => opcao.id === usuarioAtual?.colaboradorId);
    const colaborador = opcoes.value.colaboradores.find((opcao) => opcao.id === form.colaboradorId);
    if (colaboradorAnterior && colaboradorAnterior.id !== colaborador?.id) colaboradorAnterior.usuarioId = undefined;
    upsertOpcao(opcoes.value.usuarios, {
      ...itemBase,
      usuarioId: id,
      empresaIds,
      empresaId: empresaIds[0] ?? empresaAtual,
      nome: form.nome,
      email: form.email,
      colaboradorId: form.colaboradorId,
      setorId: colaborador?.setorId ?? null,
      cargos: colaborador?.cargos ?? (colaborador?.cargoNome ? [colaborador.cargoNome] : [])
    });
    if (colaborador) colaborador.usuarioId = id;
    return true;
  }

  if (tela === "permissoes") {
    if (permissoesBuscou.value) void buscarPermissoes(permissoesPagina.value.page || 1);
    return true;
  }

  return false;
}

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
	formCadastro.value = {
	  ...formCadastroVazio(),
	  nome: linha.nome ?? "",
	  documento: linha.documento ? mascararDocumento(linha.documento) : "",
    dataNascimento: linha.dataNascimento ?? "",
    whatsapp: linha.whatsapp ? mascararWhatsapp(linha.whatsapp) : "",
    cep: linha.cep ? mascararCep(linha.cep) : "",
    rua: linha.rua ?? "",
    numero: linha.numero ?? "",
    complemento: linha.complemento ?? "",
    bairro: linha.bairro ?? "",
    cidade: linha.cidade ?? "",
    estado: linha.estado ?? "",
	  cnpj: linha.cnpj ?? "",
	  email: linha.email ?? "",
	  cpf: linha.cpf ?? "",
	  sigla: linha.sigla ?? "",
	  codigo: linha.codigo ?? "",
	  codigoBarras: linha.codigoBarras ?? "",
	  descricao: linha.descricao ?? linha.nome ?? "",
	  marca: linha.marca ?? "",
	  unidadeIndividualId: linha.unidadeIndividualId ?? linha.unidadeMedidaId ?? "",
	  quantidadeIndividual: linha.quantidadeIndividual ?? "1",
	  grupoMercadoriaId: linha.grupoMercadoriaId ?? "",
	  produtoConversoes: (() => {
	    try {
	      const conversoes = JSON.parse(linha.conversoes ?? "[]") as Array<{
	        unidadeMedidaId?: string;
	        quantidade?: string;
	        unidadesIndividuais?: string;
	      }>;
	      return conversoes.map((conversao) => ({
	        unidadeMedidaId: conversao.unidadeMedidaId ?? "",
	        quantidade: String(conversao.quantidade ?? ""),
	        unidadesIndividuais: String(conversao.unidadesIndividuais ?? "")
	      }));
	    } catch {
	      return [];
	    }
	  })(),
    contaId: linha.contaId ?? "",
    ativo: linha.ativo !== "Nao",
    tipoGrupo: (linha.tipoGrupo as CadastroForm["tipoGrupo"]) || "despesa",
    grupoPaiId: linha.grupoPaiId ?? "",
    tipoAreaSetor:
      (linha.tipoAreaSetor as CadastroForm["tipoAreaSetor"]) || (linha.areaId || linha.setorPaiId ? "setor" : "area"),
    areaId: linha.areaId ?? "",
    setorPaiId: linha.setorPaiId ?? "",
    setorId: linha.setorId ?? "",
    colaboradorId: linha.colaboradorId ?? "",
    cargoId: linha.cargoId ?? "",
    empresaIds: linha.empresaIds ? String(linha.empresaIds).split(",") : [],
    usuarioId: linha.usuarioId ?? "",
    regras: regrasDaLinha(linha)
  };
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
    const resultado = idEditando
      ? await apiPut<{ id?: string } | undefined>(`/api/cadastros/${endpoint}/${idEditando}`, payload)
      : await apiPost<{ id?: string }>(`/api/cadastros/${endpoint}`, payload);
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
  if (permissoesFiltrosAplicados.tipoPermissao)
    params.set("tipoPermissao", permissoesFiltrosAplicados.tipoPermissao);
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
      `/api/cadastros/permissoes?${queryPermissoes(page).toString()}`
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
    await apiDelete(`/api/cadastros/permissoes?${params.toString()}`);
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

async function buscarTema(tela: string) {
  const temaLocal = resolverTemaEmpresa(tela);
  if (temaLocal) return temaLocal;
  const params = new URLSearchParams({ tela, empresaId: empresaId.value });
  return apiGet<TemaAplicacao>(`/api/tema?${params.toString()}`);
}

function resolverTemaEmpresa(tela: string) {
  const configuracao = empresaAtiva.value?.configuracoesAparencia;
  if (!configuracao) return null;
  if (tela === "padrao") return { ...configuracao.padrao };
  const especifico = configuracao.especifico.find((item) => item.pagina === tela);
  return { ...configuracao.padrao, ...(especifico?.propriedades ?? {}) };
}

function diferencasTema(temaSalvo: TemaAplicacao, padrao: TemaAplicacao): Partial<TemaAplicacao> {
  return Object.fromEntries(
    camposTema.filter((campo) => temaSalvo[campo] !== padrao[campo]).map((campo) => [campo, temaSalvo[campo]])
  ) as Partial<TemaAplicacao>;
}

function aplicarTemaNaConfiguracaoLocal(tela: string, temaSalvo: TemaAplicacao) {
  const empresa = empresaAtiva.value;
  if (!empresa?.configuracoesAparencia) return;

  const configuracao: ConfiguracaoAparenciaEmpresa =
    tela === "padrao"
      ? {
          padrao: temaSalvo,
          especifico: empresa.configuracoesAparencia.especifico
            .map((item) => ({
              pagina: item.pagina,
              propriedades: diferencasTema({ ...temaSalvo, ...item.propriedades }, temaSalvo)
            }))
            .filter((item) => Object.keys(item.propriedades).length > 0)
        }
      : {
          padrao: empresa.configuracoesAparencia.padrao,
          especifico: empresa.configuracoesAparencia.especifico.filter((item) => item.pagina !== tela)
        };

  if (tela !== "padrao") {
    const propriedades = diferencasTema(temaSalvo, configuracao.padrao);
    if (Object.keys(propriedades).length > 0) configuracao.especifico.push({ pagina: tela, propriedades });
  }

  empresa.configuracoesAparencia = configuracao;
}

async function carregarTemaTela(tela: string) {
  try {
    const temaCarregado = await buscarTema(tela);
    temaAtual.value = temaCarregado;
    tema.value = temaCarregado;
    temaTelaAtual.value = `${empresaId.value}:${tela}`;
    aplicarTema(temaAtual.value, temaResumoCaixa.value);
  } catch {
    temaAtual.value = temaPadrao();
    tema.value = temaAtual.value;
    aplicarTema(temaAtual.value, temaResumoCaixa.value);
  }
}

async function carregarTemaResumoCaixa() {
  try {
    temaResumoCaixa.value = await buscarTema(TELA_TEMA_RESUMO_CAIXA);
    temaResumoCaixaAtual.value = `${empresaId.value}:${TELA_TEMA_RESUMO_CAIXA}`;
  } catch {
    temaResumoCaixa.value = temaPadrao();
  } finally {
    aplicarTema(temaAtual.value, temaResumoCaixa.value);
  }
}

async function abrirTema(tela = telaAtiva.value) {
  temaTelaEdicao.value = tela;
  try {
    tema.value = await buscarTema(tela);
    if (tela === TELA_TEMA_RESUMO_CAIXA) {
      temaResumoCaixa.value = tema.value;
    } else if (tela === telaAtiva.value) {
      temaAtual.value = tema.value;
    }
    aplicarTema(temaAtual.value, temaResumoCaixa.value);
  } catch {
    tema.value = tela === TELA_TEMA_RESUMO_CAIXA ? temaResumoCaixa.value : temaAtual.value;
  }
  modalTemaAberto.value = true;
}

async function salvarTema() {
  temaSalvando.value = true;
  try {
    const temaSalvo = { ...tema.value };
    await apiPut<void>("/api/tema", {
      empresaId: empresaId.value,
      tela: temaTelaEdicao.value,
      ...temaSalvo
    });
    aplicarTemaNaConfiguracaoLocal(temaTelaEdicao.value, temaSalvo);
    if (temaTelaEdicao.value === TELA_TEMA_RESUMO_CAIXA) {
      temaResumoCaixa.value = temaSalvo;
      temaResumoCaixaAtual.value = `${empresaId.value}:${TELA_TEMA_RESUMO_CAIXA}`;
    } else if (temaTelaEdicao.value === telaAtiva.value) {
      temaAtual.value = temaSalvo;
      temaTelaAtual.value = `${empresaId.value}:${temaTelaEdicao.value}`;
    }
    aplicarTema(temaAtual.value, temaResumoCaixa.value);
    modalTemaAberto.value = false;
    notificar("Aparencia salva com sucesso.");
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    temaSalvando.value = false;
  }
}

async function abrirCaixaOperacional(payload: {
  pdvId: string;
  usuarioCaixaId: string;
  dataHoraAbertura: string;
  observacao: string | null;
}) {
  caixaSalvando.value = true;
  try {
    caixaStatus.value = await apiPost<CaixaStatus>("/api/caixa/abrir", {
      empresaId: empresaId.value,
      ...payload
    });
    resumo.value = caixaStatus.value.resumo;
    notificar("Caixa aberto com sucesso.");
    return true;
  } catch (error) {
    notificar(mensagemErro(error), "error");
    return false;
  } finally {
    caixaSalvando.value = false;
  }
}

async function editarAberturaCaixa(payload: {
  caixaId: string;
  tokenEdicao: string;
  pdvId: string;
  usuarioCaixaId: string;
  dataHoraAbertura: string;
  observacao: string | null;
}) {
  caixaSalvando.value = true;
  try {
    const { caixaId, ...body } = payload;
    caixaStatus.value = await apiPut<CaixaStatus>(`/api/caixa/${caixaId}/abertura`, body);
    resumo.value = caixaStatus.value.resumo;
    notificar("Abertura atualizada com sucesso.");
    return true;
  } catch (error) {
    notificar(mensagemErro(error), "error");
    return false;
  } finally {
    caixaSalvando.value = false;
  }
}

async function acertarSaldoOperacional(payload: { caixaId: string; observacao: string | null }) {
  if (!resumo.value || !window.confirm(`A diferenca de ${dinheiro(resumo.value.saldo)} sera atribuida ao usuario do caixa.`)) {
    return;
  }
  caixaSalvando.value = true;
  try {
    await apiPost(`/api/caixa/${payload.caixaId}/acertar-saldo`, { observacao: payload.observacao });
    notificar("Saldo ajustado com sucesso.");
    await carregarStatusCaixa(empresaId.value);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    caixaSalvando.value = false;
  }
}

async function fecharCaixaOperacional(payload: { caixaId: string; observacao: string | null }) {
  caixaSalvando.value = true;
  try {
    caixaStatus.value = await apiPost<CaixaStatus>(`/api/caixa/${payload.caixaId}/fechar`, {
      observacao: payload.observacao
    });
    resumo.value = caixaStatus.value.resumo;
    notificar("Caixa fechado com sucesso.");
    await carregarOperacoes(empresaId.value);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    caixaSalvando.value = false;
  }
}

async function logout() {
  saindo.value = true;
  try {
    await fetch(`${apiUrl}/api/auth/sign-out`, { method: "POST", credentials: "include" });
    await router.push("/login");
  } finally {
    saindo.value = false;
  }
}

function dadosCadastro(tela: string): Array<Record<string, string | undefined>> {
  const listas = tela === "empresas" ? opcoes.value : opcoesEmpresa.value;
  if (tela === "empresas")
    return empresas.value.map((item) => ({ id: item.id, nome: item.nome ?? "", cnpj: item.cnpj ? String(item.cnpj) : undefined }));
  if (tela === "contas") return listas.contas.map((item) => ({ id: item.id, nome: item.nome }));
  if (tela === "formas_pagamento") return listas.formasPagamento.map((item) => ({ id: item.id, nome: item.nome }));
  if (tela === "pdv")
    return listas.pdvs.map((item) => ({
      id: item.id,
      nome: item.nome,
      conta: listas.contas.find((conta) => conta.id === item.contaId)?.nome ?? "",
      contaId: item.contaId,
      ativo: item.ativo === false ? "Nao" : "Sim"
    }));
  if (tela === "fornecedores")
    return listas.fornecedores.map((item) => ({ id: item.id, nome: item.nome, documento: item.documento }));
  if (tela === "clientes")
    return listas.clientes.map((item) => ({
      id: item.id,
      nome: item.nome,
      documento: item.documento,
      dataNascimento: item.dataNascimento,
      whatsapp: item.whatsapp,
      email: item.email,
      cep: item.cep,
      rua: item.rua,
      numero: item.numero,
      complemento: item.complemento,
      bairro: item.bairro,
      cidade: item.cidade,
      estado: item.estado
    }));
  if (tela === "produtos")
    return listas.produtos.map((item) => ({
      id: item.id,
      nome: item.descricao,
      descricao: item.descricao,
      codigo: item.codigo,
      codigoBarras: item.codigoBarras,
      marca: item.marca ?? "",
      grupoMercadoriaId: item.grupoMercadoriaId ?? "",
      unidadeIndividualId: item.unidadeIndividualId ?? item.unidadeMedidaId ?? "",
      unidade: listas.unidadesMedida.find((unidade) => unidade.id === (item.unidadeIndividualId ?? item.unidadeMedidaId))?.sigla ?? "",
      quantidadeIndividual: String(item.quantidadeIndividual ?? "1"),
      conversoes: JSON.stringify(item.conversoes ?? [])
    }));
  if (tela === "colaboradores")
    return listas.colaboradores.map((item) => ({
      id: item.id,
      nome: item.nome,
      cpf: item.cpf,
      setor: item.descricao,
      setorId: item.setorId ?? undefined,
      cargo: item.cargos?.[0] ?? item.cargoNome ?? "",
      cargoId: item.cargoIds?.[0] ?? item.cargoId ?? ""
    }));
  if (tela === "unidades")
    return listas.unidadesMedida.map((item) => ({ id: item.id, nome: item.nome, sigla: item.sigla }));
  if (tela === "usuarios")
    return listas.usuarios.map((item) => ({
      id: item.usuarioId ?? item.id,
      usuarioId: item.usuarioId ?? item.id,
      nome: item.nome,
      email: item.email,
      role: item.role,
      colaboradorId: item.colaboradorId,
      cargos: item.cargos?.join(", ") ?? "",
      setor: item.descricao,
      setorId: item.setorId ?? undefined
    }));
  if (tela === "permissoes") {
    return permissoesPagina.value.itens;
  }
  if (tela === "malotes")
    return listas.malotes.map((item) => ({
      id: item.id,
      codigo: item.codigo,
      total_lacres: String(item.totalLacres ?? 0)
    }));
  if (tela === "grupos") {
    return [
      ...listas.gruposDespesas.map((item) => ({
        id: item.id,
        nome: item.nome,
        tipo: "Despesa",
        tipoGrupo: "despesa",
        grupoPaiId: item.grupoPaiId ?? ""
      })),
      ...listas.gruposMercadorias.map((item) => ({
        id: item.id,
        nome: item.nome,
        tipo: "Mercadoria",
        tipoGrupo: "mercadoria",
        grupoPaiId: item.grupoPaiId ?? ""
      })),
	      ...listas.gruposRetiradas.map((item) => ({
	        id: item.id,
	        nome: item.nome,
	        tipo: "Retirada",
	        tipoGrupo: "retirada",
	        grupoPaiId: item.grupoPaiId ?? ""
	      })),
	      ...listas.gruposVendas.map((item) => ({
	        id: item.id,
	        nome: item.nome,
	        tipo: "Vendas",
	        tipoGrupo: "vendas",
	        grupoPaiId: item.grupoPaiId ?? ""
	      }))
	    ];
  }
  if (tela === "areas_setores") {
    return [
      ...listas.areas.map((item) => ({ id: item.id, nome: item.nome, tipo: "Area", tipoAreaSetor: "area" })),
      ...listas.setores.map((item) => ({
        id: item.id,
        nome: item.nome,
        tipo: "Setor",
        tipoAreaSetor: "setor",
        areaId: item.areaId ?? "",
        setorPaiId: item.setorPaiId ?? ""
      }))
    ];
  }
  return [];
}

function descricaoTela(tela: string) {
  const descricoes: Record<string, string> = {
    empresas: "Empresas disponiveis no sistema.",
    contas: "Contas usadas nos lancamentos financeiros.",
    formas_pagamento: "Formas de pagamento usadas nas vendas.",
    grupos: "Hierarquia de grupos de despesas, mercadorias e retiradas.",
    unidades: "Unidades de medida usadas nos produtos.",
    areas_setores: "Areas e setores organizacionais.",
    usuarios: "Usuarios e acessos do sistema.",
    permissoes: "Permissoes por cargo, setor ou usuario.",
    malotes: "Malotes e lacres para transferencias.",
    colaboradores: "Cadastro de colaboradores.",
    fornecedores: "Cadastro de fornecedores.",
    clientes: "Cadastro de clientes.",
    produtos: "Cadastro de produtos.",
    pdv: "Pontos de venda vinculados a uma conta de caixa."
  };
  return descricoes[tela] ?? "Cadastro operacional.";
}

function colunasCadastro(tela: string) {
  const colunas: Record<string, string[]> = {
    empresas: ["Nome", "CNPJ"],
    contas: ["Nome"],
    formas_pagamento: ["Nome"],
    pdv: ["Nome", "Conta", "Ativo"],
    grupos: ["Nome", "Tipo"],
    unidades: ["Nome", "Sigla"],
    areas_setores: ["Nome", "Tipo"],
    usuarios: ["Nome", "Email", "Role", "Cargos"],
    permissoes: ["Tipo", "Alvo", "Regras"],
    malotes: ["Codigo", "Total lacres"],
    colaboradores: ["Nome", "CPF", "Cargo", "Setor"],
    fornecedores: ["Nome", "Documento"],
    clientes: ["Nome", "Documento"],
    produtos: ["Codigo", "Nome", "Marca", "Unidade"]
  };
  return colunas[tela] ?? ["Nome"];
}

function ordenarArvore(itens: Array<Record<string, string | undefined>>, paiId = "", nivel = 0): TreeItem[] {
  return itens
    .filter((item) => parentIdArvore(item) === paiId)
    .sort((a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? "")))
    .flatMap((item) => [
      { id: item.id ?? "", nome: item.nome ?? "", detalhe: item.tipo, nivel, item },
      ...ordenarArvore(itens, item.id ?? "", nivel + 1)
    ]);
}

function parentIdArvore(item: Record<string, string | undefined>) {
  if (item.tipoAreaSetor === "setor") return item.setorPaiId || item.areaId || "";
  return item.grupoPaiId || "";
}

function treeGrupos() {
  return ordenarArvore(dadosCadastro("grupos"));
}

function treeAreasSetores() {
  const itens = dadosCadastro("areas_setores");
  return ordenarArvore(itens);
}

function regrasDaLinha(linha: Record<string, string | undefined>) {
  try {
    const regras = JSON.parse(linha.regrasJson ?? linha.regras_json ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(regras).filter(([, valor]) => typeof valor === "boolean")) as Record<
      string,
      boolean
    >;
  } catch {
    return {};
  }
}

function permissoesDaSecao(secao: (typeof secoesPermissoes)[number]) {
  const usadas = new Set(Object.keys(formCadastro.value.regras));
  return permissoes
    .filter((permissao) => {
      if (secao.prefixos.length) return secao.prefixos.some((prefixo) => permissao.startsWith(prefixo));
      return !secoesPermissoes.some(
        (outra) => outra.prefixos.length && outra.prefixos.some((prefixo) => permissao.startsWith(prefixo))
      );
    })
    .sort((a, b) => {
      const pesoA = usadas.has(a) ? 0 : 1;
      const pesoB = usadas.has(b) ? 0 : 1;
      return pesoA - pesoB || a.localeCompare(b);
    });
}

function estadoRegraPermissao(permissao: string) {
  const valor = formCadastro.value.regras[permissao];
  if (valor === true) return "permitir";
  if (valor === false) return "negar";
  return "herdar";
}

function definirRegraPermissao(permissao: string, estado: string) {
  const regras = { ...formCadastro.value.regras };
  if (estado === "permitir") regras[permissao] = true;
  else if (estado === "negar") regras[permissao] = false;
  else delete regras[permissao];
  formCadastro.value.regras = regras;
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

onMounted(() => {
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
	      <div v-if="permissoesUsuario.includes('caixa_operar')" class="caixa-card">
        <div v-if="caixaAberto" class="d-flex align-start justify-space-between ga-2">
          <div>
            <div class="caixa-title">Caixa: {{ caixaAberto.pdvNome }}</div>
            <div class="caixa-meta">Aberto em: {{ new Date(caixaAberto.dataHoraAbertura).toLocaleString("pt-BR") }}</div>
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

    <template #heading-actions>
      <v-btn
        v-if="podeConfigurarTema"
        icon="mdi-palette"
        variant="tonal"
        size="small"
        :title="'Aparencia'"
        @click="abrirTema()"
      />
    </template>

    <div>
      <v-alert v-if="empresaCarregando" type="info" variant="tonal" class="mb-4">Carregando dados...</v-alert>

      <v-alert v-if="telaBloqueadaPorCaixa" type="warning" variant="tonal" class="mb-4">
        {{ motivoTelaAtivaDesabilitada }}
      </v-alert>

      <OperacoesPage
        v-else-if="tipoPagina === 'operacoes'"
        :resumo="resumo"
        :tela-atual="telaAtual"
        :tela-ativa="telaAtiva"
        :empresa-ativa="empresaAtiva"
        :operacoes-paginadas="operacoesPaginadas"
        :total-operacoes="operacoesDaTela.length"
        :pagina="paginaOperacoes"
        :total-paginas="totalPaginasOperacoes"
        :descricao="descricaoTela(telaAtiva)"
        @editar="abrirOperacao"
        @update:pagina="paginaOperacoes = $event"
      />

      <CaixaResumoPage
        v-else-if="tipoPagina === 'caixa'"
        :resumo="resumo"
        :status="caixaStatus"
        :pdvs="opcoesEmpresa.pdvs"
        :usuario-id="sessao?.perfil?.usuarioId || ''"
        :usuario-nome="sessao?.perfil?.nome || sessao?.user?.name || 'Usuario'"
        :salvando="caixaSalvando"
        @abrir-caixa="abrirCaixaOperacional"
        @acertar-saldo="acertarSaldoOperacional"
        @fechar-caixa="fecharCaixaOperacional"
      />

      <FechamentoCaixaPage
        v-else-if="tipoPagina === 'fechamento'"
        :resumo="resumo"
        :status="caixaStatus"
        :salvando="caixaSalvando"
        @acertar-saldo="acertarSaldoOperacional"
        @fechar-caixa="fecharCaixaOperacional"
      />

	      <RelatorioProdutos v-else-if="tipoPagina === 'relatorio_produtos'" :empresa-id="empresaId" />

	      <RelatorioVendasPage
	        v-else-if="tipoPagina === 'relatorio_vendas'"
	        :empresa-id="empresaId"
	        :pdvs="opcoesEmpresa.pdvs"
	        :clientes="opcoesEmpresa.clientes"
	        :colaboradores="opcoesEmpresa.colaboradores"
	        :formas-pagamento="opcoesEmpresa.formasPagamento"
	      />

	      <ContasPagarPage
	        v-else-if="tipoPagina === 'contas_pagar'"
	        :empresa-id="empresaId"
	        :pdvs="opcoesEmpresa.pdvs"
	      />

	      <TreeCadastroPage
        v-else-if="tipoPagina === 'tree'"
        :tela="telaAtiva === 'areas_setores' ? 'areas_setores' : 'grupos'"
        :descricao="descricaoTela(telaAtiva)"
        :itens="telaAtiva === 'areas_setores' ? treeAreasSetores() : treeGrupos()"
        @acionar="abrirCadastroNovo(telaAtiva)"
        @importar="abrirImportacao(telaAtiva)"
        @exportar="abrirExportacao"
        @editar="abrirCadastroEditar"
        @criar-filho="abrirCadastroFilho"
      />

      <CadastroTablePage
        v-else-if="tipoPagina === 'cadastro'"
        :tela="telaAtiva"
        :tela-atual="telaAtual"
        :descricao="descricaoTela(telaAtiva)"
        :colunas="colunasCadastro(telaAtiva)"
        :linhas="dadosCadastro(telaAtiva)"
        :editar-carregando-id="maloteEditandoCarregandoId"
        :modo-servidor="telaAtiva === 'permissoes'"
        :busca="permissoesFiltros.q"
        :tipo-permissao-filtro="permissoesFiltros.tipoPermissao"
        :alvo-filtro="permissoesFiltros.alvoId"
        :permissao-filtro="permissoesFiltros.permissao"
        :alvos-filtro="alvosFiltroPermissoes"
        :permissoes-filtro="[...permissoes]"
        :carregando-busca="permissoesCarregandoBusca"
        :buscou="permissoesBuscou"
        :total-servidor="permissoesPagina.total"
        :pagina-servidor="permissoesPagina.page"
        :itens-por-pagina-servidor="permissoesPagina.pageSize"
        :pode-excluir="false"
        :excluindo-id="permissaoExcluindoId"
        @acionar="telaAtiva === 'malotes' ? abrirMaloteNovo() : abrirCadastroNovo(telaAtiva)"
        @importar="abrirImportacao(telaAtiva)"
        @exportar="abrirExportacao"
        @editar="abrirCadastroEditar"
        @extra="lidarExtraCadastro"
        @update:busca="permissoesFiltros.q = $event"
        @update:tipo-permissao-filtro="permissoesFiltros.tipoPermissao = $event"
        @update:alvo-filtro="permissoesFiltros.alvoId = $event"
        @update:permissao-filtro="permissoesFiltros.permissao = $event"
        @buscar="buscarPermissoes(1, true)"
        @limpar="limparFiltrosPermissoes"
        @excluir="excluirPermissao"
        @update:pagina-servidor="buscarPermissoes($event)"
      />

      <PlaceholderPage v-else :tela-atual="telaAtual" />
    </div>

    <v-dialog v-model="modalCaixaDrawerAberto" max-width="680">
      <v-card>
        <v-card-title>{{ modoCaixaDrawer === "abrir" ? "Abrir caixa" : "Editar abertura" }}</v-card-title>
        <v-card-text>
          <v-row v-if="modoCaixaDrawer === 'abrir'" dense>
            <v-col cols="12" md="6">
              <v-select
                v-model="formCaixaDrawer.pdvId"
                :items="opcoesEmpresa.pdvs"
                item-title="nome"
                item-value="id"
                label="PDV"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="formCaixaDrawer.dataHoraAbertura"
                type="datetime-local"
                label="Data e hora de abertura"
              />
            </v-col>
          </v-row>
          <v-row v-else dense>
            <v-col v-if="!tokenCaixaConfirmado" cols="12">
              <v-text-field v-model="formCaixaDrawer.tokenEdicao" label="Codigo de edicao" autofocus />
            </v-col>
            <template v-else>
              <v-col cols="12" md="6">
                <v-select
                  v-model="formCaixaDrawer.pdvId"
                  :items="opcoesEmpresa.pdvs"
                  item-title="nome"
                  item-value="id"
                  label="PDV"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formCaixaDrawer.dataHoraAbertura"
                  type="datetime-local"
                  label="Data e hora de abertura"
                />
              </v-col>
            </template>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" :disabled="caixaSalvando" @click="modalCaixaDrawerAberto = false">Cancelar</v-btn>
          <v-btn
            v-if="modoCaixaDrawer === 'editar' && !tokenCaixaConfirmado"
            color="primary"
            :disabled="!formCaixaDrawer.tokenEdicao"
            @click="tokenCaixaConfirmado = true"
          >
            Continuar
          </v-btn>
          <v-btn
            v-else
            color="primary"
            :loading="caixaSalvando"
            :disabled="!formCaixaDrawer.pdvId || !formCaixaDrawer.dataHoraAbertura"
            @click="salvarCaixaDrawer"
          >
            Salvar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="modalOperacaoAberto" max-width="960" scrollable>
      <v-card>
        <v-card-title>{{ entidadeNova.charAt(0).toUpperCase() + entidadeNova.slice(1) }}</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12" md="4"
              ><v-text-field v-model="form.dataReferencia" type="date" label="Data de referencia"
            /></v-col>
            <v-col cols="12" md="4"
              ><v-text-field v-model="form.dataVencimento" type="date" label="Data de vencimento"
            /></v-col>
            <v-col cols="12" md="4"
              ><v-text-field
                v-model="form.valorOriginal"
                type="number"
                label="Valor original"
                :readonly="discriminandoDespesa || discriminandoMercadoria"
            /></v-col>
            <v-col cols="12"><v-text-field v-model="form.descricao" label="Descricao" /></v-col>
            <v-col cols="12"><v-textarea v-model="form.observacao" label="Observacao" rows="2" /></v-col>
            <v-col
              v-if="['venda', 'despesa', 'transferencia', 'mercadoria', 'retirada'].includes(entidadeNova)"
              cols="12"
              md="6"
            >
              <v-select
                v-model="form.contaOrigemId"
                :items="opcoesEmpresa.contas"
                item-title="nome"
                item-value="id"
                label="Conta origem"
              />
            </v-col>
            <v-col v-if="['venda', 'despesa', 'mercadoria', 'retirada'].includes(entidadeNova)" cols="12" md="6"
              ><v-text-field v-model="form.dataPagamento" type="date" label="Data de pagamento"
            /></v-col>
            <v-col v-if="entidadeNova === 'transferencia'" cols="12" md="6">
              <v-select
                v-model="form.contaDestinoId"
                :items="opcoesEmpresa.contas"
                item-title="nome"
                item-value="id"
                label="Conta destino"
              />
            </v-col>
            <v-col v-if="['despesa', 'mercadoria'].includes(entidadeNova)" cols="12" md="6">
              <v-select
                v-model="form.fornecedorId"
                :items="opcoesEmpresa.fornecedores"
                item-title="nome"
                item-value="id"
                label="Fornecedor"
                clearable
              />
            </v-col>
            <v-col v-if="entidadeNova === 'retirada'" cols="12" md="6">
              <v-select
                v-model="form.colaboradorId"
                :items="opcoesEmpresa.colaboradores"
                item-title="nome"
                item-value="id"
                label="Colaborador"
                clearable
              />
            </v-col>
            <v-col v-if="entidadeNova === 'despesa'" cols="12" md="6">
              <v-select
                v-model="form.grupoDespesaId"
                :items="opcoesEmpresa.gruposDespesas"
                item-title="nome"
                item-value="id"
                label="Grupo despesa"
                clearable
              />
            </v-col>
            <v-col v-if="entidadeNova === 'mercadoria'" cols="12" md="6">
              <v-select
                v-model="form.grupoMercadoriaId"
                :items="opcoesEmpresa.gruposMercadorias"
                item-title="nome"
                item-value="id"
                label="Grupo mercadoria"
                clearable
              />
            </v-col>
            <v-col v-if="entidadeNova === 'retirada'" cols="12" md="6">
              <v-select
                v-model="form.grupoRetiradaId"
                :items="opcoesEmpresa.gruposRetiradas"
                item-title="nome"
                item-value="id"
                label="Grupo retirada"
                clearable
              />
            </v-col>
            <v-col v-if="entidadeNova === 'transferencia'" cols="12" md="6">
              <v-select
                v-model="form.maloteId"
                :items="opcoesEmpresa.malotes"
                item-title="codigo"
                item-value="id"
                label="Malote"
                clearable
              />
            </v-col>
            <v-col v-if="entidadeNova === 'transferencia'" cols="12" md="6"
              ><v-text-field v-model="form.numeroLacre" label="Numero do lacre"
            /></v-col>
            <v-col cols="12" md="4"
              ><v-text-field v-model="form.valorAcrescimo" type="number" label="Acrescimo"
            /></v-col>
            <v-col cols="12" md="8"
              ><v-text-field v-model="form.descricaoAcrescimo" label="Descricao do acrescimo"
            /></v-col>
            <v-col cols="12" md="4"><v-text-field v-model="form.valorDesconto" type="number" label="Desconto" /></v-col>
            <v-col cols="12" md="8"
              ><v-text-field v-model="form.descricaoDesconto" label="Descricao do desconto"
            /></v-col>
            <v-col cols="12" md="4"><v-switch v-model="form.computar" label="Computar" color="primary" /></v-col>
            <v-col cols="12" md="4"
              ><v-switch v-model="form.temNotaFiscal" label="Tem nota fiscal" color="primary"
            /></v-col>
            <v-col cols="12" md="4"
              ><div class="text-caption text-muted">Total</div>
              <div class="text-h6">{{ dinheiro(valorTotalOperacao) }}</div></v-col
	            >
	          </v-row>
	          <v-divider class="my-4" />
		          <div v-if="entidadeNova === 'venda'" class="d-grid ga-4">
	            <section>
	              <div class="d-flex align-center justify-space-between mb-2">
	                <h3 class="text-subtitle-1">Itens da venda</h3>
	                <v-btn
	                  size="small"
	                  variant="outlined"
	                  prepend-icon="mdi-plus"
	                  @click="itensVenda.push({ descricaoProduto: '', quantidade: '1', valorUnitario: '', valorTotal: '', produtoId: '' })"
	                  >Adicionar item</v-btn
	                >
	              </div>
	              <v-row v-for="(item, index) in itensVenda" :key="`venda-${index}`" dense>
	                <v-col cols="12" md="4">
	                  <v-select
	                    v-model="item.produtoId"
	                    :items="opcoesEmpresa.produtos"
	                    item-title="descricao"
	                    item-value="id"
	                    label="Produto"
	                    clearable
	                  />
	                </v-col>
	                <v-col cols="12" md="3"><v-text-field v-model="item.descricaoProduto" label="Descricao" /></v-col>
	                <v-col cols="6" md="2"><v-text-field v-model="item.quantidade" type="number" label="Qtd." /></v-col>
	                <v-col cols="6" md="2"
	                  ><v-text-field v-model="item.valorTotal" type="number" label="Total"
	                /></v-col>
	                <v-col cols="12" md="1" class="d-flex align-center justify-end">
	                  <v-btn
	                    icon="mdi-delete"
	                    variant="text"
	                    :disabled="itensVenda.length === 1"
	                    @click="itensVenda.splice(index, 1)"
	                  />
	                </v-col>
	              </v-row>
	            </section>

	            <section>
	              <div class="d-flex align-center justify-space-between mb-2">
	                <h3 class="text-subtitle-1">Tipos de pagamento</h3>
	                <v-btn
	                  size="small"
	                  variant="outlined"
	                  prepend-icon="mdi-plus"
	                  @click="tiposPagamento.push({ formaPagamentoId: '', totalPago: '', numeroVendas: '1' })"
	                  >Adicionar pagamento</v-btn
	                >
	              </div>
	              <v-row v-for="(item, index) in tiposPagamento" :key="`pagamento-${index}`" dense>
	                <v-col cols="12" md="5">
	                  <v-select
	                    v-model="item.formaPagamentoId"
	                    :items="opcoesEmpresa.formasPagamento"
	                    item-title="nome"
	                    item-value="id"
	                    label="Forma de pagamento"
	                    clearable
	                  />
	                </v-col>
	                <v-col cols="6" md="3"
	                  ><v-text-field v-model="item.numeroVendas" type="number" label="Numero vendas"
	                /></v-col>
	                <v-col cols="6" md="3"
	                  ><v-text-field v-model="item.totalPago" type="number" label="Total pago"
	                /></v-col>
	                <v-col cols="12" md="1" class="d-flex align-center justify-end">
	                  <v-btn
	                    icon="mdi-delete"
	                    variant="text"
	                    :disabled="tiposPagamento.length === 1"
	                    @click="tiposPagamento.splice(index, 1)"
	                  />
	                </v-col>
	              </v-row>
	            </section>
	          </div>

	          <section v-if="entidadeNova === 'despesa'" class="mt-2">
	            <v-switch v-model="discriminandoDespesa" label="Discriminar itens da despesa" color="primary" />
	            <div v-if="discriminandoDespesa">
	              <div class="d-flex justify-end mb-2">
	                <v-btn
	                  size="small"
	                  variant="outlined"
	                  prepend-icon="mdi-plus"
	                  @click="itensDespesa.push({ descricao: '', valor: '', grupoDespesaId: '' })"
	                  >Adicionar item</v-btn
	                >
	              </div>
	              <v-row v-for="(item, index) in itensDespesa" :key="`despesa-${index}`" dense>
	                <v-col cols="12" md="5"><v-text-field v-model="item.descricao" label="Descricao" /></v-col>
	                <v-col cols="12" md="4">
	                  <v-select
	                    v-model="item.grupoDespesaId"
	                    :items="opcoesEmpresa.gruposDespesas"
	                    item-title="nome"
	                    item-value="id"
	                    label="Grupo"
	                    clearable
	                  />
	                </v-col>
	                <v-col cols="8" md="2"><v-text-field v-model="item.valor" type="number" label="Valor" /></v-col>
	                <v-col cols="4" md="1" class="d-flex align-center justify-end">
	                  <v-btn
	                    icon="mdi-delete"
	                    variant="text"
	                    :disabled="itensDespesa.length === 1"
	                    @click="itensDespesa.splice(index, 1)"
	                  />
	                </v-col>
	              </v-row>
	            </div>
	          </section>

	          <section v-if="entidadeNova === 'mercadoria'" class="mt-2">
	            <v-switch v-model="discriminandoMercadoria" label="Discriminar mercadorias" color="primary" />
	            <div v-if="discriminandoMercadoria">
	              <div class="d-flex justify-end mb-2">
	                <v-btn
	                  size="small"
	                  variant="outlined"
	                  prepend-icon="mdi-plus"
	                  @click="
	                    itensMercadoria.push({
	                      descricao: '',
	                      quantidade: '1',
	                      valorUnitario: '',
	                      valorTotal: '',
	                      produtoId: '',
	                      grupoMercadoriaId: '',
	                      unidadeMedidaId: ''
	                    })
	                  "
	                  >Adicionar mercadoria</v-btn
	                >
	              </div>
	              <v-row v-for="(item, index) in itensMercadoria" :key="`mercadoria-${index}`" dense>
	                <v-col cols="12" md="4">
	                  <v-select
	                    v-model="item.produtoId"
	                    :items="opcoesEmpresa.produtos"
	                    item-title="descricao"
	                    item-value="id"
	                    label="Produto"
	                    clearable
	                  />
	                </v-col>
	                <v-col cols="12" md="3"><v-text-field v-model="item.descricao" label="Descricao" /></v-col>
	                <v-col cols="6" md="2"
	                  ><v-text-field v-model="item.quantidade" type="number" label="Qtd."
	                /></v-col>
	                <v-col cols="6" md="2"
	                  ><v-text-field v-model="item.valorTotal" type="number" label="Total"
	                /></v-col>
	                <v-col cols="12" md="1" class="d-flex align-center justify-end">
	                  <v-btn
	                    icon="mdi-delete"
	                    variant="text"
	                    :disabled="itensMercadoria.length === 1"
	                    @click="itensMercadoria.splice(index, 1)"
	                  />
	                </v-col>
	              </v-row>
	            </div>
	          </section>
	        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" :disabled="salvandoOperacao" @click="modalOperacaoAberto = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="salvandoOperacao" @click="salvarOperacao">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="modalMaloteAberto" max-width="640">
      <v-card>
        <v-card-title>{{ maloteEditandoId ? "Editar malote" : "Novo malote" }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="formMalote.codigo" label="Codigo" />
          <div class="d-grid ga-2">
            <div v-for="(_, index) in formMalote.lacres" :key="index" class="d-flex ga-2">
              <v-text-field v-model="formMalote.lacres[index]" label="Lacre" hide-details />
              <v-btn
                icon="mdi-delete"
                variant="text"
                :disabled="formMalote.lacres.length === 1"
                @click="formMalote.lacres.splice(index, 1)"
              />
            </div>
            <v-btn variant="outlined" prepend-icon="mdi-plus" @click="formMalote.lacres.push('')"
              >Adicionar lacre</v-btn
            >
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" :disabled="maloteSalvando" @click="modalMaloteAberto = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="maloteSalvando" @click="salvarMalote">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="modalCadastroAberto" max-width="820" scrollable>
      <v-card>
        <v-card-title>{{ cadastroEditandoId ? "Editar cadastro" : "Novo cadastro" }}</v-card-title>
        <v-card-subtitle>{{ itemPorTela[cadastroTela]?.titulo ?? "Cadastro operacional" }}</v-card-subtitle>
        <v-card-text>
          <v-row dense>
            <v-col v-if="cadastroTela === 'grupos'" cols="12">
              <v-select
                v-model="formCadastro.tipoGrupo"
	                :items="['despesa', 'mercadoria', 'retirada', 'vendas']"
                label="Tipo de grupo"
                :disabled="Boolean(cadastroEditandoId)"
              />
            </v-col>
            <v-col v-if="cadastroTela === 'areas_setores'" cols="12">
              <v-select
                v-model="formCadastro.tipoAreaSetor"
                :items="['area', 'setor']"
                label="Tipo"
                :disabled="Boolean(cadastroEditandoId)"
              />
            </v-col>
	            <v-col
	              v-if="cadastroTela !== 'produtos'"
	              cols="12"
	              :md="['unidades', 'pdv', 'empresas', 'fornecedores', 'clientes'].includes(cadastroTela) ? 6 : 12"
	              ><v-text-field v-model="formCadastro.nome" label="Nome"
	            /></v-col>
	            <v-col v-if="cadastroTela === 'empresas'" cols="12" md="6">
	              <v-text-field
	                :model-value="formCadastro.cnpj"
	                label="CNPJ"
	                maxlength="18"
	                @update:model-value="formCadastro.cnpj = mascararCnpj(String($event || ''))"
	              />
	            </v-col>
	            <v-col v-if="cadastroTela === 'fornecedores' || cadastroTela === 'clientes'" cols="12" md="6">
	              <v-text-field
	                :model-value="formCadastro.documento"
	                label="Documento"
	                maxlength="18"
	                @update:model-value="atualizarDocumentoCadastro(String($event || ''))"
	              />
	            </v-col>
            <template v-if="cadastroTela === 'clientes'">
              <v-col v-if="documentoEhCpf(formCadastro.documento)" cols="12" md="6">
                <v-text-field v-model="formCadastro.dataNascimento" type="date" label="Data de nascimento" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  :model-value="formCadastro.whatsapp"
                  label="WhatsApp"
                  maxlength="15"
                  @update:model-value="formCadastro.whatsapp = mascararWhatsapp(String($event || ''))"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="formCadastro.email" type="email" label="Email" />
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field
                  :model-value="formCadastro.cep"
                  label="CEP"
                  maxlength="9"
                  @update:model-value="formCadastro.cep = mascararCep(String($event || ''))"
                />
              </v-col>
              <v-col cols="12" md="8">
                <v-text-field v-model="formCadastro.rua" label="Rua" />
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="formCadastro.numero" label="Numero" />
              </v-col>
              <v-col cols="12" md="8">
                <v-text-field v-model="formCadastro.complemento" label="Complemento" />
              </v-col>
              <v-col cols="12" md="5">
                <v-text-field v-model="formCadastro.bairro" label="Bairro" />
              </v-col>
              <v-col cols="12" md="5">
                <v-text-field v-model="formCadastro.cidade" label="Cidade" />
              </v-col>
              <v-col cols="12" md="2">
                <v-text-field
                  :model-value="formCadastro.estado"
                  label="Estado"
                  maxlength="2"
                  @update:model-value="formCadastro.estado = String($event || '').toUpperCase().slice(0, 2)"
                />
              </v-col>
            </template>
            <v-col v-if="cadastroTela === 'pdv'" cols="12" md="8">
              <v-select
                v-model="formCadastro.contaId"
                :items="opcoesEmpresa.contas"
                item-title="nome"
                item-value="id"
                label="Conta do PDV"
              />
            </v-col>
            <v-col v-if="cadastroTela === 'pdv'" cols="12" md="4">
              <v-switch v-model="formCadastro.ativo" color="primary" label="Ativo" />
            </v-col>
            <v-col v-if="cadastroTela === 'unidades'" cols="12" md="4"
              ><v-text-field v-model="formCadastro.sigla" label="Sigla"
            /></v-col>
	            <v-col v-if="cadastroTela === 'colaboradores'" cols="12" md="6"
	              ><v-text-field
	                :model-value="formCadastro.cpf"
	                label="CPF"
	                maxlength="14"
	                @update:model-value="formCadastro.cpf = mascararCpf(String($event || ''))"
	            /></v-col>
	            <template v-if="cadastroTela === 'produtos'">
	              <v-col cols="12" md="4"><v-text-field v-model="formCadastro.codigo" label="Codigo" /></v-col>
	              <v-col cols="12" md="4"><v-text-field v-model="formCadastro.codigoBarras" label="Codigo de barras" /></v-col>
	              <v-col cols="12" md="4"><v-text-field v-model="formCadastro.marca" label="Marca" /></v-col>
	              <v-col cols="12"><v-text-field v-model="formCadastro.descricao" label="Descricao" /></v-col>
	              <v-col cols="12" md="4">
	                <v-select
	                  v-model="formCadastro.grupoMercadoriaId"
	                  :items="opcoesEmpresa.gruposMercadorias"
	                  item-title="nome"
	                  item-value="id"
	                  label="Grupo"
	                  clearable
	                />
	              </v-col>
	              <v-col cols="12" md="4">
	                <v-select
	                  v-model="formCadastro.unidadeIndividualId"
	                  :items="opcoesEmpresa.unidadesMedida"
	                  item-title="nome"
	                  item-value="id"
	                  label="Unidade individual"
	                />
	              </v-col>
	              <v-col cols="12" md="4">
	                <v-text-field v-model="formCadastro.quantidadeIndividual" type="number" label="Quantidade individual" />
	              </v-col>
	              <v-col cols="12">
	                <div class="d-flex align-center justify-space-between mb-2">
	                  <div class="text-body-2 font-weight-bold">Conversoes</div>
	                  <v-btn
	                    size="small"
	                    variant="outlined"
	                    prepend-icon="mdi-plus"
	                    @click="formCadastro.produtoConversoes.push({ unidadeMedidaId: '', quantidade: '1', unidadesIndividuais: '1' })"
	                    >Adicionar conversao</v-btn
	                  >
	                </div>
	                <v-row v-for="(conversao, index) in formCadastro.produtoConversoes" :key="index" dense>
	                  <v-col cols="12" md="4">
	                    <v-select
	                      v-model="conversao.unidadeMedidaId"
	                      :items="opcoesEmpresa.unidadesMedida"
	                      item-title="nome"
	                      item-value="id"
	                      label="Unidade"
	                    />
	                  </v-col>
	                  <v-col cols="6" md="3"><v-text-field v-model="conversao.quantidade" type="number" label="Quantidade" /></v-col>
	                  <v-col cols="6" md="4">
	                    <v-text-field v-model="conversao.unidadesIndividuais" type="number" label="Unidades individuais" />
	                  </v-col>
	                  <v-col cols="12" md="1" class="d-flex align-center justify-end">
	                    <v-btn icon="mdi-delete" variant="text" @click="formCadastro.produtoConversoes.splice(index, 1)" />
	                  </v-col>
	                </v-row>
	              </v-col>
	            </template>
            <v-col v-if="cadastroTela === 'usuarios'" cols="12" md="6"
              ><v-text-field v-model="formCadastro.email" type="email" label="Email"
            /></v-col>
            <v-col v-if="cadastroTela === 'usuarios'" cols="12" md="6">
              <v-select
                :model-value="formCadastro.novoColaborador ? '__novo__' : formCadastro.colaboradorId"
                :items="colaboradoresSelectUsuario"
                item-title="nome"
                item-value="id"
                label="Colaborador"
                @update:model-value="atualizarColaboradorUsuario(String($event || ''))"
              />
            </v-col>
            <template v-if="cadastroTela === 'usuarios' && formCadastro.novoColaborador">
              <v-col cols="12" md="6">
                <v-text-field v-model="formCadastro.novoColaboradorNome" label="Nome do colaborador" />
              </v-col>
              <v-col cols="12" md="6">
	                <v-text-field
	                  :model-value="formCadastro.novoColaboradorCpf"
	                  label="CPF do colaborador"
	                  maxlength="14"
	                  @update:model-value="formCadastro.novoColaboradorCpf = mascararCpf(String($event || ''))"
	                />
              </v-col>
              <v-col cols="12" md="6">
                <v-select
                  v-model="formCadastro.novoColaboradorSetorId"
                  :items="opcoesEmpresa.setores"
                  item-title="nome"
                  item-value="id"
                  label="Setor"
                  clearable
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-select
                  v-model="formCadastro.novoColaboradorCargoId"
                  :items="opcoesEmpresa.cargos"
                  item-title="nome"
                  item-value="id"
                  label="Cargo inicial"
                />
              </v-col>
	            </template>
            <v-col v-if="cadastroTela === 'usuarios' && !cadastroEditandoId" cols="12"
              ><v-text-field v-model="formCadastro.senha" type="password" label="Senha"
            /></v-col>
	            <v-col v-if="cadastroTela === 'colaboradores'" cols="12">
	              <v-select
	                v-model="formCadastro.setorId"
                :items="opcoesEmpresa.setores"
                item-title="nome"
                item-value="id"
                label="Setor"
                clearable
	              />
	            </v-col>
	            <v-col v-if="cadastroTela === 'colaboradores'" cols="12">
	              <v-select
	                v-model="formCadastro.cargoId"
	                :items="opcoesEmpresa.cargos"
	                item-title="nome"
	                item-value="id"
	                label="Cargo"
	              />
	            </v-col>
            <v-col v-if="cadastroTela === 'areas_setores' && formCadastro.tipoAreaSetor === 'setor'" cols="12" md="6">
              <v-select
                v-model="formCadastro.areaId"
                :items="opcoesEmpresa.areas"
                item-title="nome"
                item-value="id"
                label="Area"
                clearable
              />
            </v-col>
            <v-col v-if="cadastroTela === 'areas_setores' && formCadastro.tipoAreaSetor === 'setor'" cols="12" md="6">
              <v-select
                v-model="formCadastro.setorPaiId"
                :items="opcoesEmpresa.setores"
                item-title="nome"
                item-value="id"
                label="Setor pai"
                clearable
              />
            </v-col>
            <v-col v-if="cadastroTela === 'grupos'" cols="12">
              <v-select
                v-model="formCadastro.grupoPaiId"
                :items="
                  dadosCadastro('grupos').filter(
                    (grupo) => grupo.tipoGrupo === formCadastro.tipoGrupo && grupo.id !== cadastroEditandoId
                  )
                "
                item-title="nome"
                item-value="id"
                label="Grupo pai"
                clearable
              />
            </v-col>
            <v-col v-if="cadastroTela === 'usuarios'" cols="12">
              <div class="text-body-2 font-weight-bold mb-2">Empresas</div>
              <v-chip-group v-model="formCadastro.empresaIds" multiple column>
                <v-chip v-for="empresa in empresasDisponiveis" :key="empresa.id" :value="empresa.id" filter>{{
                  empresa.nome
                }}</v-chip>
              </v-chip-group>
            </v-col>
            <template v-if="cadastroTela === 'permissoes'">
              <v-col cols="12" md="4"
                ><v-select
                  v-model="formCadastro.tipoPermissao"
                  :items="['cargo', 'setor', 'usuario']"
                  label="Tipo de permissao"
              /></v-col>
              <v-col v-if="formCadastro.tipoPermissao === 'cargo'" cols="12" md="8">
                <v-select
                  v-model="formCadastro.cargoId"
                  :items="opcoesEmpresa.cargos"
                  item-title="nome"
                  item-value="id"
                  label="Cargo"
                />
              </v-col>
              <v-col v-if="formCadastro.tipoPermissao === 'setor'" cols="12" md="8"
                ><v-select
                  v-model="formCadastro.setorId"
                  :items="opcoesEmpresa.setores"
                  item-title="nome"
                  item-value="id"
                  label="Setor"
              /></v-col>
              <v-col v-if="formCadastro.tipoPermissao === 'usuario'" cols="12" md="8"
                ><v-select
                  v-model="formCadastro.usuarioId"
                  :items="opcoesEmpresa.usuarios"
                  item-title="nome"
                  item-value="usuarioId"
                  label="Usuario"
              /></v-col>
              <v-col v-for="secao in secoesPermissoes" :key="secao.titulo" cols="12">
                <v-sheet class="pa-3 rounded-lg soft-bg">
                  <div class="text-body-2 font-weight-bold mb-2">{{ secao.titulo }}</div>
                  <v-row dense>
                    <v-col v-for="permissao in permissoesDaSecao(secao)" :key="permissao" cols="12">
                      <div class="permission-rule-row">
                        <span class="permission-rule-label">{{ permissao.replaceAll("_", " ") }}</span>
                        <v-btn-toggle
                          :model-value="estadoRegraPermissao(permissao)"
                          density="compact"
                          divided
                          mandatory
                          @update:model-value="definirRegraPermissao(permissao, String($event || 'herdar'))"
                        >
                          <v-btn size="small" value="herdar">Herdar</v-btn>
                          <v-btn size="small" value="permitir">Permitir</v-btn>
                          <v-btn size="small" value="negar">Negar</v-btn>
                        </v-btn-toggle>
                      </div>
                    </v-col>
                  </v-row>
                </v-sheet>
              </v-col>
            </template>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" :disabled="cadastroSalvando" @click="modalCadastroAberto = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="cadastroSalvando" @click="salvarCadastro">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="modalTemaAberto" max-width="560">
      <v-card>
        <v-card-title>Aparencia</v-card-title>
        <v-card-subtitle>Cores editaveis por pagina/secao.</v-card-subtitle>
        <v-card-text>
          <v-select
            v-model="temaTelaEdicao"
            :items="telasTemaPermitidas"
            item-title="titulo"
            item-value="id"
            label="Pagina/secao"
            @update:model-value="abrirTema(String($event))"
          />
          <v-row dense>
            <template v-if="temaTelaEdicao === TELA_TEMA_RESUMO_CAIXA">
              <v-col cols="12" md="6"><v-text-field v-model="tema.corAviso" type="color" label="Entradas" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="tema.corSecundaria" type="color" label="Transferencias" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="tema.corErro" type="color" label="Despesas" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="tema.corPrimaria" type="color" label="Retiradas" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="tema.corSucesso" type="color" label="Saldo" /></v-col>
            </template>
            <template v-else>
              <v-col cols="12" md="6"><v-text-field v-model="tema.corPrimaria" type="color" label="Primaria" /></v-col>
              <v-col cols="12" md="6"
                ><v-text-field v-model="tema.corSecundaria" type="color" label="Secundaria"
              /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="tema.corFundo" type="color" label="Fundo" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="tema.corCartao" type="color" label="Cartao" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="tema.corSucesso" type="color" label="Sucesso" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="tema.corAviso" type="color" label="Aviso" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="tema.corErro" type="color" label="Erro" /></v-col>
            </template>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" :disabled="temaSalvando" @click="modalTemaAberto = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="temaSalvando" @click="salvarTema">Salvar tema</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="modalCopiaAberto" max-width="560">
      <v-card>
        <v-card-title>{{ copiaModo === "importar" ? "Importar dados" : "Exportar registro" }}</v-card-title>
        <v-card-text>
          <v-select v-model="copiaNivel" :items="['simples', 'completo']" label="Modo" />
          <v-select
            v-if="copiaModo === 'importar'"
            v-model="copiaEmpresaOrigemId"
            :items="empresasDisponiveis.filter((empresa) => empresa.id !== copiaEmpresaDestinoId)"
            item-title="nome"
            item-value="id"
            label="Empresa origem"
          />
          <v-select
            v-model="copiaEmpresaDestinoId"
            :items="empresasDisponiveis.filter((empresa) => empresa.id !== copiaEmpresaOrigemId)"
            item-title="nome"
            item-value="id"
            label="Empresa destino"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" :disabled="copiaSalvando" @click="modalCopiaAberto = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="copiaSalvando" @click="executarCopia">{{
            copiaModo === "importar" ? "Importar" : "Exportar"
          }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>

<style scoped>
.permission-rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
}

.permission-rule-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .permission-rule-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

