<script setup lang="ts">
import type { AuthSession, Permissao, TemaAplicacao, TipoMovimentacao } from "@padaria/shared";
import type { CadastroForm, Movimento, MovimentoForm, Opcao, Opcoes, ResumoCaixa, TreeItem } from "~/types/padaria";
import {
  cadastroPayload,
  dinheiro,
  formCadastroVazio,
  formMovimentoVazio,
  itemPorTela,
  mensagemErro,
  movimentoPorTela,
  opcoesFiltradasPorEmpresa,
  opcoesNovo,
  opcoesVazias,
  permissoes,
  rotaTela,
  secoesPermissoes,
  temaPadrao,
  tipoEndpointCadastro
} from "~/utils/domain";

type TipoPagina = "movimentos" | "caixa" | "relatorio_produtos" | "tree" | "cadastro" | "placeholder";

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
const { apiUrl, apiGet, apiPost, apiPut, carregarSessao, aplicarTema } = useApi();

const sessao = ref<AuthSession | null>(null);
const opcoes = ref<Opcoes>(opcoesVazias());
const empresas = ref<Opcao[]>([]);
const movimentos = ref<Movimento[]>([]);
const resumo = ref<ResumoCaixa | null>(null);
const telaAtiva = ref(props.telaInicial && itemPorTela[props.telaInicial] ? props.telaInicial : "entradas");
const empresaSelecionadaId = ref("");
const carregando = ref(true);
const empresaCarregando = ref(false);
const erro = ref("");
const saindo = ref(false);

const snackbar = reactive({ show: false, text: "", color: "success" });

const modalMovimentoAberto = ref(false);
const modalMaloteAberto = ref(false);
const modalCadastroAberto = ref(false);
const modalTemaAberto = ref(false);
const modalCopiaAberto = ref(false);

const tipoNovo = ref<TipoMovimentacao>("entrada");
const form = ref<MovimentoForm>(formMovimentoVazio());
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
const salvandoMovimento = ref(false);

const formMalote = ref({ codigo: "", lacres: [""] });
const maloteEditandoId = ref("");
const maloteSalvando = ref(false);
const maloteEditandoCarregandoId = ref("");

const cadastroTela = ref("");
const cadastroEditandoId = ref("");
const cadastroSalvando = ref(false);
const formCadastro = ref<CadastroForm>(formCadastroVazio());

const tema = ref<TemaAplicacao>(temaPadrao());
const temaTelaAtual = ref("");
const temaTelaEdicao = ref("entradas");
const temaSalvando = ref(false);

const copiaModo = ref<"exportar" | "importar">("importar");
const copiaNivel = ref<"simples" | "completo">("simples");
const copiaTipo = ref("");
const copiaRegistroId = ref("");
const copiaEmpresaOrigemId = ref("");
const copiaEmpresaDestinoId = ref("");
const copiaSalvando = ref(false);

const paginaMovimentos = ref(1);

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
const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeConfigurarTema = computed(() => permissoesUsuario.value.includes("configurar_tema"));
const telasPermitidas = computed(() => {
  return Object.values(itemPorTela).filter((item) => permissoesUsuario.value.includes(item.permissao));
});
const telaAtual = computed(() => itemPorTela[telaAtiva.value] ?? telasPermitidas.value[0]);
const movimentosDaTela = computed(() => {
  const tipo = movimentoPorTela[telaAtiva.value];
  return tipo ? movimentos.value.filter((movimento) => movimento.tipo === tipo) : movimentos.value;
});
const totalPaginasMovimentos = computed(() => Math.max(1, Math.ceil(movimentosDaTela.value.length / 10)));
const movimentosPaginados = computed(() =>
  movimentosDaTela.value.slice((paginaMovimentos.value - 1) * 10, paginaMovimentos.value * 10)
);
const acoesNovo = computed(() => opcoesNovo.filter((item) => permissoesUsuario.value.includes(item.permissao)));
const totalItensDespesa = computed(() =>
  itensDespesa.value.reduce((total, item) => total + Number(item.valor || 0), 0)
);
const totalItensMercadoria = computed(() =>
  itensMercadoria.value.reduce((total, item) => total + Number(item.valorTotal || 0), 0)
);
const valorTotalMovimento = computed(() =>
  Math.max(
    0,
    Number(form.value.valorOriginal || 0) +
      Number(form.value.valorAcrescimo || 0) -
      Number(form.value.valorDesconto || 0)
  )
);

watch(totalPaginasMovimentos, (total) => {
  if (paginaMovimentos.value > total) paginaMovimentos.value = total;
});

watch([discriminandoDespesa, totalItensDespesa], () => {
  if (discriminandoDespesa.value)
    form.value.valorOriginal = totalItensDespesa.value ? totalItensDespesa.value.toFixed(2) : "";
});

watch([discriminandoMercadoria, totalItensMercadoria], () => {
  if (discriminandoMercadoria.value)
    form.value.valorOriginal = totalItensMercadoria.value ? totalItensMercadoria.value.toFixed(2) : "";
});

watch(
  () => form.value.temNotaFiscal,
  (temNota) => {
    if (temNota) form.value.computar = true;
  }
);

watch([telaAtiva, empresaId], ([tela, idEmpresa]) => {
  if (sessao.value && tela && idEmpresa && temaTelaAtual.value !== `${idEmpresa}:${tela}`) void carregarTemaTela(tela);
});

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
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
  empresas.value = await apiGet<Opcao[]>("/api/empresas");
  opcoes.value.empresas = empresas.value;
  if (empresas.value.length && !empresaSelecionadaId.value) empresaSelecionadaId.value = empresas.value[0]?.id ?? "";
}

async function carregarDadosTela(tela: string, idEmpresa = empresaId.value) {
  if (!idEmpresa && tela !== "empresas") return;
  empresaCarregando.value = true;
  try {
    if (tela === "empresas") {
      await carregarEmpresas();
    } else {
      await carregarDadosPagina(idEmpresa, tela);
    }
    await Promise.all([carregarMovimentos(idEmpresa), carregarResumo(idEmpresa)]);
  } finally {
    empresaCarregando.value = false;
  }
}

async function trocarEmpresa(idEmpresa = empresaId.value) {
  await carregarDadosTela(telaAtiva.value, idEmpresa);
  await carregarTemaTela(telaAtiva.value);
}

async function carregarDadosPagina(idEmpresa = empresaId.value, tela = telaAtiva.value) {
  const params = new URLSearchParams({ t: String(Date.now()) });
  if (idEmpresa) params.set("empresaId", idEmpresa);
  const query = `?${params.toString()}`;
  const dados = opcoesVazias();
  dados.empresas = empresas.value;

  if (["entradas", "caixa", "fechamento"].includes(tela)) {
    dados.contas = await apiGet<Opcao[]>(`/api/contas${query}`);
  } else if (tela === "transferencias") {
    [dados.contas, dados.malotes] = await Promise.all([
      apiGet<Opcao[]>(`/api/contas${query}`),
      apiGet<Opcao[]>(`/api/malotes${query}`)
    ]);
  } else if (tela === "despesas" || tela === "contas_pagar") {
    const grupos = await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(
      `/api/grupos${query}`
    );
    Object.assign(dados, grupos);
    [dados.contas, dados.fornecedores] = await Promise.all([
      apiGet<Opcao[]>(`/api/contas${query}`),
      apiGet<Opcao[]>(`/api/fornecedores${query}`)
    ]);
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
    [dados.usuarios, dados.colaboradores, dados.setores] = await Promise.all([
      apiGet<Opcao[]>(`/api/usuarios${query}`),
      apiGet<Opcao[]>(`/api/colaboradores${query}`),
      apiGet<Opcao[]>(`/api/setores${query}`)
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
  } else if (tela === "malotes") {
    dados.malotes = await apiGet<Opcao[]>(`/api/malotes${query}`);
  } else if (tela === "colaboradores") {
    [dados.colaboradores, dados.cargos, dados.setores] = await Promise.all([
      apiGet<Opcao[]>(`/api/colaboradores${query}`),
      apiGet<Opcao[]>(`/api/cargos${query}`),
      apiGet<Opcao[]>(`/api/setores${query}`)
    ]);
  } else if (tela === "feriados") {
    dados.feriados = await apiGet<Opcao[]>(`/api/feriados${query}`);
  } else if (tela === "fornecedores") {
    dados.fornecedores = await apiGet<Opcao[]>(`/api/fornecedores${query}`);
  } else if (tela === "produtos") {
    const [produtos, grupos, unidades] = await Promise.all([
      apiGet<Opcao[]>(`/api/produtos${query}`),
      apiGet<Pick<Opcoes, "gruposMercadorias">>(`/api/grupos${query}`),
      apiGet<Opcao[]>(`/api/unidades_medida${query}`)
    ]);
    dados.produtos = produtos;
    dados.gruposMercadorias = grupos.gruposMercadorias;
    dados.unidadesMedida = unidades;
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
      const destino = telas[0] ?? "entradas";
      telaAtiva.value = destino;
      await router.replace(rotaTela(destino));
      return;
    }
    await carregarDadosTela(telaAtiva.value, empresaId.value);
    await carregarTemaTela(telaAtiva.value);
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

async function carregarMovimentos(idEmpresa = empresaId.value) {
  if (!idEmpresa) return;
  movimentos.value = await apiGet<Movimento[]>(`/api/movimentacoes?empresaId=${idEmpresa}`);
}

async function carregarResumo(idEmpresa = empresaId.value) {
  if (!idEmpresa) return;
  resumo.value = await apiGet<ResumoCaixa>(
    `/api/fechamento-caixa/resumo?empresaId=${idEmpresa}&data=${new Date().toISOString().slice(0, 10)}`
  );
}

function abrirMovimento(tipo: TipoMovimentacao) {
  tipoNovo.value = tipo;
  form.value = formMovimentoVazio();
  discriminandoDespesa.value = false;
  discriminandoMercadoria.value = false;
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
  modalMovimentoAberto.value = true;
}

function executarAcaoNovo(acao: (typeof opcoesNovo)[number]) {
  if (acao.tipo) abrirMovimento(acao.tipo);
  if (acao.tela === "malote") abrirMaloteNovo();
}

async function salvarMovimento() {
  salvandoMovimento.value = true;
  try {
    const itensDespesaPayload =
      tipoNovo.value === "despesa" && discriminandoDespesa.value
        ? itensDespesa.value
            .filter((item) => item.descricao || item.valor)
            .map((item) => ({ ...item, valor: Number(item.valor || 0) }))
        : [];
    const itensMercadoriaPayload =
      tipoNovo.value === "mercadoria" && discriminandoMercadoria.value
        ? itensMercadoria.value
            .filter((item) => item.descricao || item.produtoId)
            .map((item) => ({
              ...item,
              quantidade: Number(item.quantidade || 0),
              valorUnitario: Number(item.valorUnitario || 0),
              valorTotal: Number(item.valorTotal || 0)
            }))
        : [];

    const movimentoSalvo = await apiPost<{ id: string; computar: boolean }>("/api/movimentacoes", {
      empresaId: empresaId.value,
      tipo: tipoNovo.value,
      ...form.value,
      valorOriginal: Number(form.value.valorOriginal || 0),
      valorAcrescimo: Number(form.value.valorAcrescimo || 0),
      valorDesconto: Number(form.value.valorDesconto || 0),
      itensDespesa: itensDespesaPayload,
      itensMercadoria: itensMercadoriaPayload
    });
    movimentos.value.unshift({
      id: movimentoSalvo.id,
      empresaId: empresaId.value,
      tipo: tipoNovo.value,
      dataReferencia: form.value.dataReferencia,
      descricao: form.value.descricao,
      valorOriginal: String(Number(form.value.valorOriginal || 0)),
      computar: movimentoSalvo.computar,
      status: "aprovado"
    });
    modalMovimentoAberto.value = false;
    notificar("Movimentacao salva com sucesso.");
    await carregarResumo(empresaId.value);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoMovimento.value = false;
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
    email: linha.email ?? "",
    cpf: linha.cpf ?? "",
    sigla: linha.sigla ?? "",
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
    permissoes: permissaoCodigosDaLinha(linha)
  };
  modalCadastroAberto.value = true;
}

async function salvarCadastro() {
  cadastroSalvando.value = true;
  try {
    const endpoint = tipoEndpointCadastro(cadastroTela.value, formCadastro.value);
    const payload = cadastroPayload(cadastroTela.value, formCadastro.value, empresaId.value);
    const resultado = cadastroEditandoId.value
      ? await apiPut<{ id?: string }>(`/api/cadastros/${endpoint}/${cadastroEditandoId.value}`, payload)
      : await apiPost<{ id?: string }>(`/api/cadastros/${endpoint}`, payload);
    modalCadastroAberto.value = false;
    notificar(cadastroEditandoId.value ? "Cadastro atualizado com sucesso." : "Cadastro criado com sucesso.");
    const empresaParaRecarregar = cadastroTela.value === "empresas" && resultado?.id ? resultado.id : empresaId.value;
    await carregarDadosTela(cadastroTela.value || telaAtiva.value, empresaParaRecarregar);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    cadastroSalvando.value = false;
  }
}

async function carregarTemaTela(tela: string) {
  try {
    const params = new URLSearchParams({ tela, empresaId: empresaId.value });
    tema.value = await apiGet<TemaAplicacao>(`/api/tema?${params.toString()}`);
    temaTelaAtual.value = `${empresaId.value}:${tela}`;
    aplicarTema(tema.value);
  } catch {
    tema.value = temaPadrao();
  }
}

async function abrirTema(tela = telaAtiva.value) {
  temaTelaEdicao.value = tela;
  await carregarTemaTela(tela);
  modalTemaAberto.value = true;
}

async function salvarTema() {
  temaSalvando.value = true;
  try {
    tema.value = await apiPut<TemaAplicacao>("/api/tema", {
      empresaId: empresaId.value,
      tela: temaTelaEdicao.value,
      ...tema.value
    });
    aplicarTema(tema.value);
    modalTemaAberto.value = false;
    notificar("Aparencia salva com sucesso.");
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    temaSalvando.value = false;
  }
}

async function acertarSaldo() {
  try {
    await apiPost("/api/fechamento-caixa/acertar-saldo", {
      empresaId: empresaId.value,
      data: new Date().toISOString().slice(0, 10)
    });
    notificar("Saldo ajustado com sucesso.");
    await carregarResumo(empresaId.value);
  } catch (error) {
    notificar(mensagemErro(error), "error");
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
  if (tela === "empresas") return empresas.value.map((item) => ({ id: item.id, nome: item.nome }));
  if (tela === "contas") return listas.contas.map((item) => ({ id: item.id, nome: item.nome }));
  if (tela === "fornecedores")
    return listas.fornecedores.map((item) => ({ id: item.id, nome: item.nome, email: item.email }));
  if (tela === "produtos")
    return listas.produtos.map((item) => ({
      id: item.id,
      nome: item.nome,
      grupo: item.descricao,
      unidade: item.sigla
    }));
  if (tela === "colaboradores")
    return listas.colaboradores.map((item) => ({
      id: item.id,
      nome: item.nome,
      cpf: item.cpf,
      setor: item.descricao,
      setorId: item.setorId ?? undefined
    }));
  if (tela === "feriados")
    return listas.feriados.map((item) => ({
      id: item.id,
      nome: item.nome,
      dia: String(item.dia ?? ""),
      mes: String(item.mes ?? ""),
      ano: item.ano ? String(item.ano) : ""
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
    return [
      ...listas.cargosPermissoes.map((item) => ({
        id: item.id,
        tipo: "cargo",
        alvo: listas.cargos.find((cargo) => cargo.id === item.cargoId)?.nome ?? item.cargoId,
        cargoId: item.cargoId,
        permissao: item.codigoPermissao ?? item.permissaoCodigo
      })),
      ...listas.setoresPermissoes.map((item) => ({
        id: item.id,
        tipo: "setor",
        alvo: item.nome,
        setorId: item.setorId ?? undefined,
        permissao: item.codigoPermissao ?? item.permissaoCodigo
      })),
      ...listas.usuariosPermissoes.map((item) => ({
        id: item.id,
        tipo: "usuario",
        alvo: item.nome ?? item.email,
        usuarioId: item.usuarioId,
        permissao: item.codigoPermissao ?? item.permissaoCodigo
      }))
    ];
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
    grupos: "Hierarquia de grupos de despesas, mercadorias e retiradas.",
    unidades: "Unidades de medida usadas nos produtos.",
    areas_setores: "Areas e setores organizacionais.",
    usuarios: "Usuarios e acessos do sistema.",
    permissoes: "Permissoes por cargo, setor ou usuario.",
    malotes: "Malotes e lacres para transferencias.",
    colaboradores: "Cadastro de colaboradores.",
    feriados: "Feriados por empresa.",
    fornecedores: "Cadastro de fornecedores.",
    produtos: "Cadastro de produtos."
  };
  return descricoes[tela] ?? "Cadastro operacional.";
}

function colunasCadastro(tela: string) {
  const colunas: Record<string, string[]> = {
    empresas: ["Nome"],
    contas: ["Nome"],
    grupos: ["Nome", "Tipo"],
    unidades: ["Nome", "Sigla"],
    areas_setores: ["Nome", "Tipo"],
    usuarios: ["Nome", "Email", "Role", "Cargos"],
    permissoes: ["Tipo", "Alvo", "Permissao"],
    malotes: ["Codigo", "Total lacres"],
    colaboradores: ["Nome", "CPF", "Setor"],
    feriados: ["Nome", "Dia", "Mes", "Ano"],
    fornecedores: ["Nome", "Email"],
    produtos: ["Nome", "Grupo", "Unidade"]
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

function permissaoCodigosDaLinha(linha: Record<string, string | undefined>) {
  return String(linha.permissao ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function permissoesDaSecao(secao: (typeof secoesPermissoes)[number]) {
  const usadas = new Set(formCadastro.value.permissoes);
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

function alternarPermissao(permissao: string, marcado: boolean) {
  const atual = new Set(formCadastro.value.permissoes);
  if (marcado) atual.add(permissao);
  else atual.delete(permissao);
  formCadastro.value.permissoes = [...atual];
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
    :telas="telasPermitidas"
    :tela-ativa="telaAtiva"
    :empresas="empresasDisponiveis"
    :empresa-id="empresaSelecionadaId"
    :carregando-empresa="empresaCarregando"
    :saindo="saindo"
    @selecionar-empresa="selecionarEmpresa"
    @logout="logout"
  >
    <template #actions>
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

      <MovimentosPage
        v-if="tipoPagina === 'movimentos'"
        :resumo="resumo"
        :tela-atual="telaAtual"
        :tela-ativa="telaAtiva"
        :empresa-ativa="empresaAtiva"
        :movimentos-paginados="movimentosPaginados"
        :total-movimentos="movimentosDaTela.length"
        :pagina="paginaMovimentos"
        :total-paginas="totalPaginasMovimentos"
        :descricao="descricaoTela(telaAtiva)"
        @editar="abrirMovimento"
        @update:pagina="paginaMovimentos = $event"
      />

      <CaixaResumoPage v-else-if="tipoPagina === 'caixa'" :resumo="resumo" @acertar-saldo="acertarSaldo" />

      <RelatorioProdutos v-else-if="tipoPagina === 'relatorio_produtos'" :empresa-id="empresaId" />

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
        @acionar="telaAtiva === 'malotes' ? abrirMaloteNovo() : abrirCadastroNovo(telaAtiva)"
        @importar="abrirImportacao(telaAtiva)"
        @exportar="abrirExportacao"
        @editar="abrirCadastroEditar"
        @extra="lidarExtraCadastro"
      />

      <PlaceholderPage v-else :tela-atual="telaAtual" />
    </div>

    <v-dialog v-model="modalMovimentoAberto" max-width="960" scrollable>
      <v-card>
        <v-card-title>{{ tipoNovo.charAt(0).toUpperCase() + tipoNovo.slice(1) }}</v-card-title>
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
            <v-col v-if="['entrada', 'despesa', 'transferencia'].includes(tipoNovo)" cols="12" md="6">
              <v-select
                v-model="form.contaOrigemId"
                :items="opcoesEmpresa.contas"
                item-title="nome"
                item-value="id"
                label="Conta origem"
              />
            </v-col>
            <v-col v-if="tipoNovo === 'transferencia'" cols="12" md="6">
              <v-select
                v-model="form.contaDestinoId"
                :items="opcoesEmpresa.contas"
                item-title="nome"
                item-value="id"
                label="Conta destino"
              />
            </v-col>
            <v-col v-if="['despesa', 'mercadoria', 'retirada'].includes(tipoNovo)" cols="12" md="6">
              <v-select
                v-model="form.fornecedorId"
                :items="opcoesEmpresa.fornecedores"
                item-title="nome"
                item-value="id"
                label="Fornecedor"
                clearable
              />
            </v-col>
            <v-col v-if="tipoNovo === 'retirada'" cols="12" md="6">
              <v-select
                v-model="form.colaboradorId"
                :items="opcoesEmpresa.colaboradores"
                item-title="nome"
                item-value="id"
                label="Colaborador"
                clearable
              />
            </v-col>
            <v-col v-if="tipoNovo === 'despesa'" cols="12" md="6">
              <v-select
                v-model="form.grupoDespesaId"
                :items="opcoesEmpresa.gruposDespesas"
                item-title="nome"
                item-value="id"
                label="Grupo despesa"
                clearable
              />
            </v-col>
            <v-col v-if="tipoNovo === 'mercadoria'" cols="12" md="6">
              <v-select
                v-model="form.grupoMercadoriaId"
                :items="opcoesEmpresa.gruposMercadorias"
                item-title="nome"
                item-value="id"
                label="Grupo mercadoria"
                clearable
              />
            </v-col>
            <v-col v-if="tipoNovo === 'retirada'" cols="12" md="6">
              <v-select
                v-model="form.grupoRetiradaId"
                :items="opcoesEmpresa.gruposRetiradas"
                item-title="nome"
                item-value="id"
                label="Grupo retirada"
                clearable
              />
            </v-col>
            <v-col v-if="tipoNovo === 'transferencia'" cols="12" md="6">
              <v-select
                v-model="form.maloteId"
                :items="opcoesEmpresa.malotes"
                item-title="codigo"
                item-value="id"
                label="Malote"
                clearable
              />
            </v-col>
            <v-col v-if="tipoNovo === 'transferencia'" cols="12" md="6"
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
              <div class="text-h6">{{ dinheiro(valorTotalMovimento) }}</div></v-col
            >
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" :disabled="salvandoMovimento" @click="modalMovimentoAberto = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="salvandoMovimento" @click="salvarMovimento">Salvar</v-btn>
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
                :items="['despesa', 'mercadoria', 'retirada']"
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
            <v-col cols="12" :md="cadastroTela === 'unidades' ? 8 : 12"
              ><v-text-field v-model="formCadastro.nome" label="Nome"
            /></v-col>
            <v-col v-if="cadastroTela === 'unidades'" cols="12" md="4"
              ><v-text-field v-model="formCadastro.sigla" label="Sigla"
            /></v-col>
            <v-col v-if="cadastroTela === 'colaboradores'" cols="12" md="6"
              ><v-text-field v-model="formCadastro.cpf" label="CPF"
            /></v-col>
            <v-col v-if="cadastroTela === 'usuarios'" cols="12" md="6"
              ><v-text-field v-model="formCadastro.email" type="email" label="Email"
            /></v-col>
            <v-col v-if="cadastroTela === 'usuarios'" cols="12" md="6">
              <v-select
                v-model="formCadastro.colaboradorId"
                :items="colaboradoresDisponiveisUsuario"
                item-title="nome"
                item-value="id"
                label="Colaborador"
              />
            </v-col>
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
                    <v-col v-for="permissao in permissoesDaSecao(secao)" :key="permissao" cols="12" md="6">
                      <v-checkbox
                        :model-value="formCadastro.permissoes.includes(permissao)"
                        :label="permissao.replaceAll('_', ' ')"
                        hide-details
                        density="compact"
                        @update:model-value="alternarPermissao(permissao, Boolean($event))"
                      />
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
            :items="telasPermitidas"
            item-title="titulo"
            item-value="id"
            label="Pagina/secao"
            @update:model-value="abrirTema(String($event))"
          />
          <v-row dense>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corPrimaria" type="color" label="Primaria" /></v-col>
            <v-col cols="12" md="6"
              ><v-text-field v-model="tema.corSecundaria" type="color" label="Secundaria"
            /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corFundo" type="color" label="Fundo" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corCartao" type="color" label="Cartao" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corSucesso" type="color" label="Sucesso" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corAviso" type="color" label="Aviso" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corErro" type="color" label="Erro" /></v-col>
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
