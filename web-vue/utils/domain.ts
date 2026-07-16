import {
  TELA_TEMA_RESUMO_CAIXA,
  permissoes as permissoesCompartilhadas,
  temAlgumaPermissao,
  temPermissao,
  type Permissao,
  type TemaAplicacao
} from "@padaria/shared";
// M3/ADR-002: serializacao formulario -> payload agora mora no shared; fachada para o front.
export {
  cadastroPayload,
  fiscalDoFormProduto,
  margemFracaoDoForm,
  numeroCampoOuNulo,
  precoVendaDoFormProduto,
  promocoesDoFormProduto,
  transformacaoDoFormProduto
} from "@padaria/shared";
import type {
  AcaoNovo,
  CadastroForm,
  EntidadeOperacional,
  ItemMenu,
  OperacaoForm,
  Opcao,
  Opcoes,
  ProdutoPromocaoDados,
  ProdutoTransformacaoDados
} from "~/types/padaria";
import { mascararCep, mascararDocumento, mascararWhatsapp } from "./formatacao";
import { corCategoriaPorTela } from "./tema";

export const telasOcultasNoDrawerEPermissoes = new Set([
  "promocoes",
  "relatorio_faltas",
  "relatorio_advertencias",
  "perdas_sobras",
  "estoque_produtos",
  "relatorio_dre",
  "folha_ponto",
  "avaliacao_qualidade",
  "avaliacao_colaboradores",
  "relatorio_fiscal",
  "fiscal_produtos",
  "patrimonio",
  "ficha_tecnica",
  "ingredientes"
]);

export const itemPorTela: Record<string, ItemMenu> = {
  entradas: {
    id: "entradas",
    titulo: "Entradas",
    permissao: "entradas_visualizar",
    icone: "mdi-arrow-down-left",
    cor: corCategoriaPorTela["entradas"]
  },
  transferencias: {
    id: "transferencias",
    titulo: "Transferencias",
    permissao: "transferencias_visualizar",
    icone: "mdi-swap-horizontal",
    cor: corCategoriaPorTela["transferencias"]
  },
  despesas: { id: "despesas", titulo: "Despesas", permissao: "despesas_visualizar", icone: "mdi-receipt-text" },
  mercadorias: {
    id: "mercadorias",
    titulo: "Mercadorias",
    permissao: "mercadorias_visualizar",
    icone: "mdi-package-variant-closed",
    cor: corCategoriaPorTela["mercadorias"]
  },
  retiradas: {
    id: "retiradas",
    titulo: "Retiradas",
    permissao: "retiradas_visualizar",
    icone: "mdi-wallet",
    cor: corCategoriaPorTela["retiradas"]
  },
  fechamento: {
    id: "fechamento",
    titulo: "Fechamento com diferenca",
    permissao: "fechamento_com_diferenca_visualizar",
    icone: "mdi-cash-register"
  },
  relatorio_produtos: {
    id: "relatorio_produtos",
    titulo: "Produtos mais vendidos",
    permissao: "relatorio_produtos_visualizar",
    icone: "mdi-chart-bar"
  },
  malotes: {
    id: "malotes",
    titulo: "Malotes",
    permissao: "cadastro_malotes_visualizar",
    icone: "mdi-briefcase"
  },
  caixa: { id: "caixa", titulo: "Caixa", permissao: "caixa_operar", icone: "mdi-cash-register" },
  promocoes: { id: "promocoes", titulo: "Promocoes", permissao: "promocoes_visualizar", icone: "mdi-hand-coin" },
  relatorio_faltas: {
    id: "relatorio_faltas",
    titulo: "Faltas e atestados",
    permissao: "relatorio_faltas_visualizar",
    icone: "mdi-chart-box"
  },
  relatorio_advertencias: {
    id: "relatorio_advertencias",
    titulo: "Advertencias e suspensoes",
    permissao: "relatorio_advertencias_visualizar",
    icone: "mdi-clipboard-check"
  },
  pedidos: { id: "pedidos", titulo: "Pedidos", permissao: "pedidos_visualizar", icone: "mdi-clipboard-list" },
  perdas_sobras: {
    id: "perdas_sobras",
    titulo: "Perdas e sobras",
    permissao: "perdas_sobras_visualizar",
    icone: "mdi-package-variant"
  },
  estoque_produtos: {
    id: "estoque_produtos",
    titulo: "Estoque de produtos",
    permissao: "estoque_produtos_visualizar",
    icone: "mdi-warehouse"
  },
  relatorio_dre: {
    id: "relatorio_dre",
    titulo: "Relatorio de DRE",
    permissao: "relatorio_dre_visualizar",
    icone: "mdi-chart-bar"
  },
  clientes: {
    id: "clientes",
    titulo: "Clientes",
    permissao: "cadastro_clientes_visualizar",
    icone: "mdi-account-group"
  },
  fornecedores: {
    id: "fornecedores",
    titulo: "Fornecedores",
    permissao: "cadastro_fornecedores_visualizar",
    icone: "mdi-domain"
  },
  produtos: { id: "produtos", titulo: "Produtos", permissao: "cadastro_produtos_visualizar", icone: "mdi-basket" },
  colaboradores: {
    id: "colaboradores",
    titulo: "Colaboradores",
    permissao: "cadastro_colaboradores_visualizar",
    icone: "mdi-account-group"
  },
  folha_ponto: {
    id: "folha_ponto",
    titulo: "Folha ponto",
    permissao: "folha_ponto_visualizar",
    icone: "mdi-calendar-clock"
  },
  avaliacao_qualidade: {
    id: "avaliacao_qualidade",
    titulo: "Avaliacao de qualidade",
    permissao: "avaliacao_qualidade_visualizar",
    icone: "mdi-clipboard-check"
  },
  avaliacao_colaboradores: {
    id: "avaliacao_colaboradores",
    titulo: "Avaliacao de colaboradores",
    permissao: "avaliacao_colaboradores_visualizar",
    icone: "mdi-clipboard-check"
  },
  relatorio_fiscal: {
    id: "relatorio_fiscal",
    titulo: "Relatorio fiscal dos produtos",
    permissao: "relatorio_fiscal_visualizar",
    icone: "mdi-file-document"
  },
  fiscal_produtos: {
    id: "fiscal_produtos",
    titulo: "Fiscal de produtos",
    permissao: "cadastro_fiscal_produtos_visualizar",
    icone: "mdi-file-text"
  },
  patrimonio: {
    id: "patrimonio",
    titulo: "Patrimonio",
    permissao: "cadastro_patrimonio_visualizar",
    icone: "mdi-bank"
  },
  ficha_tecnica: {
    id: "ficha_tecnica",
    titulo: "Ficha tecnica",
    permissao: "cadastro_ficha_tecnica_visualizar",
    icone: "mdi-clipboard-list"
  },
  ingredientes: {
    id: "ingredientes",
    titulo: "Ingredientes",
    permissao: "cadastro_ingredientes_visualizar",
    icone: "mdi-basket"
  },
  contas_pagar: {
    id: "contas_pagar",
    titulo: "Contas a pagar",
    permissao: "contas_pagar_visualizar",
    icone: "mdi-receipt-text"
  },
  relatorio_vendas: {
    id: "relatorio_vendas",
    titulo: "Relatorio de Vendas",
    permissao: "relatorio_vendas_visualizar",
    icone: "mdi-hand-coin",
    cor: corCategoriaPorTela["relatorio_vendas"]
  },
  notas_fiscais: {
    id: "notas_fiscais",
    titulo: "Notas fiscais",
    permissao: "notas_fiscais_visualizar",
    icone: "mdi-file-document"
  },
  pdv: { id: "pdv", titulo: "PDV", permissao: "cadastro_pdv_visualizar", icone: "mdi-store" },
  formas_pagamento: {
    id: "formas_pagamento",
    titulo: "Formas de pagamento",
    permissao: "cadastro_formas_pagamento_visualizar",
    icone: "mdi-credit-card"
  },
  integracoes: {
    id: "integracoes",
    titulo: "Integracoes",
    permissao: "integracoes_visualizar",
    icone: "mdi-connection"
  },
  contas: { id: "contas", titulo: "Contas", permissao: "cadastro_contas_visualizar", icone: "mdi-domain" },
  empresas: { id: "empresas", titulo: "Empresas", permissao: "cadastro_empresas_visualizar", icone: "mdi-domain" },
  grupos: { id: "grupos", titulo: "Grupos", permissao: "cadastro_grupos_visualizar", icone: "mdi-layers" },
  unidades: {
    id: "unidades",
    titulo: "Unidades de medida",
    permissao: "cadastro_unidades_medida_visualizar",
    icone: "mdi-ruler"
  },
  turnos: {
    id: "turnos",
    titulo: "Turnos",
    permissao: "cadastro_turnos_visualizar",
    icone: "mdi-clock-outline"
  },
  areas_setores: {
    id: "areas_setores",
    titulo: "Areas e setores",
    permissao: "cadastro_areas_setores_visualizar",
    icone: "mdi-map-marker"
  },
  usuarios: {
    id: "usuarios",
    titulo: "Usuarios",
    permissao: "cadastro_usuarios_visualizar",
    icone: "mdi-account-group"
  },
  permissoes: {
    id: "permissoes",
    titulo: "Permissoes",
    permissao: "cadastro_permissoes_visualizar",
    icone: "mdi-shield-check"
  },
  aparencia: { id: "aparencia", titulo: "Aparencia", permissao: "aparencia_visualizar", icone: "mdi-palette" }
};

const permissoesMenuOcultas = Array.from(telasOcultasNoDrawerEPermissoes).flatMap((telaId) => [
  permissaoMenuMostrar(telaId),
  permissaoMenuDesabilitado(telaId),
  permissaoMenuSomenteCaixaAberto(telaId)
]);

export const permissoesOcultasNaTela = new Set<Permissao>([
  ...Object.values(itemPorTela)
    .filter((item) => telasOcultasNoDrawerEPermissoes.has(item.id))
    .map((item) => item.permissao),
  ...permissoesMenuOcultas
]);

export const permissoes = permissoesCompartilhadas.filter(
  (permissao) => !permissoesOcultasNaTela.has(permissao)
) as readonly Permissao[];

export const itemTemaResumoCaixa: ItemMenu = {
  id: TELA_TEMA_RESUMO_CAIXA,
  titulo: "Resumo do caixa",
  permissao: "aparencia_visualizar",
  icone: "mdi-view-dashboard"
};

export const entidadePorTela: Record<string, EntidadeOperacional> = {
  entradas: "venda",
  transferencias: "transferencia",
  despesas: "despesa",
  mercadorias: "mercadoria",
  retiradas: "retirada"
};

export const endpointOperacaoPorEntidade: Record<EntidadeOperacional, string> = {
  venda: "vendas",
  transferencia: "transferencias",
  despesa: "despesas",
  mercadoria: "mercadorias",
  retirada: "retiradas"
};

export const telasCrudDiretoria = [
  "empresas",
  "contas",
  "grupos",
  "unidades",
  "areas_setores",
  "usuarios",
  "permissoes",
  "colaboradores"
];

export function permissaoMenuMostrar(telaId: string) {
  return `menu_${telaId}_mostrar` as Permissao;
}

export function permissaoMenuDesabilitado(telaId: string) {
  return `menu_${telaId}_desabilitado` as Permissao;
}

export function permissaoMenuSomenteCaixaAberto(telaId: string) {
  return `menu_${telaId}_somente_caixa_aberto` as Permissao;
}

export function telaDependeCaixaAberto(permissoesUsuario: readonly Permissao[], item: ItemMenu) {
  return temPermissao(permissoesUsuario, permissaoMenuSomenteCaixaAberto(item.id));
}

export function telaVisivelNoMenu(permissoesUsuario: readonly Permissao[], item: ItemMenu, caixaAberto = true) {
  if (telasOcultasNoDrawerEPermissoes.has(item.id)) return false;
  if (telaDependeCaixaAberto(permissoesUsuario, item) && !caixaAberto) return false;
  return (
    temAcessoTela(permissoesUsuario, item) ||
    temPermissao(permissoesUsuario, permissaoMenuMostrar(item.id)) ||
    temPermissao(permissoesUsuario, permissaoMenuDesabilitado(item.id)) ||
    temPermissao(permissoesUsuario, permissaoMenuSomenteCaixaAberto(item.id))
  );
}

export function temAcessoTela(permissoesUsuario: readonly Permissao[], item: ItemMenu) {
  return temAlgumaPermissao(permissoesUsuario, [item.permissao, ...(item.permissoesAlternativas ?? [])]);
}

export function telaDesabilitadaNoMenu(permissoesUsuario: readonly Permissao[], item: ItemMenu, caixaAberto: boolean) {
  const temAcesso = temAcessoTela(permissoesUsuario, item);
  if (!temAcesso) return true;
  return telaDependeCaixaAberto(permissoesUsuario, item) && !caixaAberto;
}

export function motivoTelaDesabilitada(permissoesUsuario: readonly Permissao[], item: ItemMenu, caixaAberto: boolean) {
  const dependeCaixa = telaDependeCaixaAberto(permissoesUsuario, item);
  if (dependeCaixa && !caixaAberto && temAcessoTela(permissoesUsuario, item)) {
    return "Abra um caixa para acessar esta tela.";
  }
  return "Tela indisponivel para este perfil.";
}

export const opcoesNovo: AcaoNovo[] = [
  {
    entidade: "despesa",
    titulo: "Despesa",
    subtitulo: "Fornecedor, grupo e itens discriminados",
    permissao: "despesas_criar",
    icone: "mdi-receipt-text",
    cor: "error"
  },
  {
    entidade: "mercadoria",
    titulo: "Mercadoria",
    subtitulo: "Compra, nota fiscal e documento",
    permissao: "mercadorias_criar",
    icone: "mdi-package-variant-closed",
    cor: "info"
  },
  {
    entidade: "transferencia",
    titulo: "Transferencia",
    subtitulo: "Contas, malote e lacre",
    permissao: "transferencias_criar",
    icone: "mdi-swap-horizontal",
    cor: "primary"
  },
  {
    entidade: "retirada",
    titulo: "Retirada",
    subtitulo: "Colaborador, fornecedor ou retirada operacional",
    permissao: "retiradas_criar",
    icone: "mdi-wallet",
    cor: "warning"
  },
  {
    tela: "malote",
    titulo: "Malote",
    subtitulo: "Cadastro de malote e lacres",
    permissao: "cadastro_malotes_criar",
    icone: "mdi-briefcase",
    cor: "secondary"
  }
];

export const secoesPermissoes = [
  { titulo: "Areas e setores", prefixos: ["cadastro_areas_setores", "menu_areas_setores"] },
  { titulo: "Caixa", prefixos: ["caixa_", "caixas_", "menu_caixa"] },
  { titulo: "Clientes", prefixos: ["cadastro_clientes", "menu_clientes"] },
  { titulo: "Colaboradores", prefixos: ["cadastro_colaboradores", "menu_colaboradores"] },
  { titulo: "Contas", prefixos: ["cadastro_contas", "menu_contas"] },
  { titulo: "Contas a pagar", prefixos: ["contas_pagar", "menu_contas_pagar"] },
  { titulo: "Despesas", prefixos: ["despesas", "menu_despesas"] },
  { titulo: "Empresas", prefixos: ["cadastro_empresas", "menu_empresas"] },
  { titulo: "Fechamento com diferenca", prefixos: ["fechamento_com_diferenca", "menu_fechamento"] },
  { titulo: "Formas de pagamento", prefixos: ["cadastro_formas_pagamento", "menu_formas_pagamento"] },
  { titulo: "Fornecedores", prefixos: ["cadastro_fornecedores", "menu_fornecedores"] },
  { titulo: "Grupos", prefixos: ["cadastro_grupos", "menu_grupos"] },
  { titulo: "Integracoes", prefixos: ["integracoes", "menu_integracoes"] },
  { titulo: "Malotes", prefixos: ["cadastro_malotes", "menu_malotes"] },
  { titulo: "Mercadorias", prefixos: ["mercadorias", "menu_mercadorias"] },
  { titulo: "PDV", prefixos: ["cadastro_pdv", "menu_pdv"] },
  { titulo: "Permissoes", prefixos: ["cadastro_permissoes", "menu_permissoes"] },
  { titulo: "Produtos", prefixos: ["cadastro_produtos", "menu_produtos"] },
  { titulo: "Produtos mais vendidos", prefixos: ["relatorio_produtos", "menu_relatorio_produtos"] },
  { titulo: "Relatorio de vendas", prefixos: ["relatorio_vendas", "menu_relatorio_vendas"] },
  { titulo: "Retiradas", prefixos: ["retiradas", "menu_retiradas"] },
  { titulo: "Tema e aparencia", prefixos: ["aparencia", "menu_aparencia"] },
  { titulo: "Transferencias", prefixos: ["transferencias", "menu_transferencias"] },
  { titulo: "Unidades de medida", prefixos: ["cadastro_unidades_medida", "menu_unidades"] },
  { titulo: "Usuarios", prefixos: ["cadastro_usuarios", "menu_usuarios"] },
  { titulo: "Vendas", prefixos: ["entradas", "menu_entradas"] },
  { titulo: "Outras", prefixos: [] }
];

export function opcoesVazias(): Opcoes {
  return {
    empresas: [],
    contas: [],
    formasPagamento: [],
    fornecedores: [],
    clientes: [],
    colaboradores: [],
    cargos: [],
    colaboradoresCargos: [],
    colaboradoresJornadas: [],
    colaboradoresFaltasJustificadas: [],
    gruposDespesas: [],
    gruposMercadorias: [],
    gruposRetiradas: [],
    gruposVendas: [],
    unidadesMedida: [],
    areas: [],
    setores: [],
    permissoes: [],
    cargosPermissoes: [],
    setoresPermissoes: [],
    usuariosPermissoes: [],
    usuarios: [],
    produtos: [],
    malotes: [],
    pdvs: [],
    turnos: []
  };
}

export function formOperacaoVazio(): OperacaoForm {
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    dataReferencia: hoje,
    dataVencimento: hoje,
    dataPagamento: "",
    descricao: "",
    observacao: "",
    valorOriginal: "",
    valorAcrescimo: "",
    descricaoAcrescimo: "",
    valorDesconto: "",
    descricaoDesconto: "",
    contaOrigemId: "",
    contaDestinoId: "",
    fornecedorId: "",
    colaboradorId: "",
    grupoDespesaId: "",
    grupoMercadoriaId: "",
    grupoRetiradaId: "",
    maloteId: "",
    numeroLacre: "",
    documento: "",
    numeroNotaFiscal: "",
    chaveAcesso: "",
    temNotaFiscal: false,
    computar: true
  };
}

export function formCadastroVazio(): CadastroForm {
  return {
    nome: "",
    documento: "",
    dataNascimento: "",
    whatsapp: "",
    cep: "",
    rua: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    cnpj: "",
    email: "",
    senha: "",
    role: "usuario_comum",
    cpf: "",
    sigla: "",
    horaInicio: "",
    horaFim: "",
    codigo: "",
    codigoBarras: "",
    descricao: "",
    marca: "",
    unidadeIndividualId: "",
    quantidadeIndividual: "1",
    embalagem: "",
    cDe: "",
    quantidadeCaixa: "1",
    medidaCompra: "",
    grupoMercadoriaId: "",
    produtoConversoes: [],
    custo: "",
    margem: "",
    precoVenda: "",
    auto: false,
    status: "ativo",
    tipo: "revenda",
    quantidadeEstoque: "0",
    estoqueMin: "",
    estoqueMax: "",
    setorEstoque: "",
    localVenda1: "",
    localVenda2: "",
    fotoUrl: "",
    fiscal: {
      ncm: "",
      cest: "",
      categoriaFiscal: "",
      cstPisCofins: "",
      aliquotaCheia: "",
      aliquotaFcp: "",
      aliquotaPis: "",
      aliquotaCofins: "",
      reducaoIcms: "",
      icms: ""
    },
    transformacao: { precisao: "", quantidade: "", unidade: "", produtoReceituario: "" },
    promoTipo: "nenhum",
    promoValor: "",
    promoDescontoPct: "",
    promoHoraInicio: "",
    promoHoraFim: "",
    promoDias: [false, false, false, false, false, false, false],
    promoValidaAte: "",
    contaId: "",
    ativo: true,
    tipoGrupo: "despesa",
    grupoPaiId: "",
    tipoAreaSetor: "area",
    areaId: "",
    setorPaiId: "",
    setorId: "",
    turnoPadraoId: "",
    colaboradorId: "",
    novoColaborador: false,
    novoColaboradorNome: "",
    novoColaboradorCpf: "",
    novoColaboradorSetorId: "",
    novoColaboradorCargoId: "",
    cargoId: "",
    empresaIds: [],
    tipoPermissao: "cargo",
    usuarioId: "",
    regras: {}
  };
}

export function temaPadrao(): TemaAplicacao {
  return {
    corPrimaria: "#c0521d",
    corSecundaria: "#b8480f",
    corFundo: "#f7f5f2",
    corCartao: "#ffffff",
    corSucesso: "#16a34a",
    corAviso: "#f59e0b",
    corErro: "#ef4444"
  };
}

export function dinheiro(valor: number | string) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function mensagemErro(error: unknown) {
  if (error instanceof Error) {
    try {
      const dados = JSON.parse(error.message) as { message?: string; error?: string; erro?: string };
      return dados.message || dados.error || dados.erro || error.message;
    } catch {
      return error.message;
    }
  }
  return "Nao foi possivel concluir a acao.";
}

export function itensDaEmpresa(itens: Opcao[], idEmpresa: string) {
  return itens.filter(
    (item) => !item.empresaId || item.empresaId === idEmpresa || item.empresaIds?.includes(idEmpresa)
  );
}

export function opcoesFiltradasPorEmpresa(listas: Opcoes, idEmpresa: string): Opcoes {
  const usuarios = itensDaEmpresa(listas.usuarios, idEmpresa);
  const usuariosIds = new Set(usuarios.map((usuario) => usuario.usuarioId).filter(Boolean));
  const setores = itensDaEmpresa(listas.setores, idEmpresa);
  const setoresIds = new Set(setores.map((setor) => setor.id));

  return {
    ...listas,
    contas: itensDaEmpresa(listas.contas, idEmpresa),
    formasPagamento: itensDaEmpresa(listas.formasPagamento, idEmpresa),
    fornecedores: itensDaEmpresa(listas.fornecedores, idEmpresa),
    clientes: itensDaEmpresa(listas.clientes, idEmpresa),
    colaboradores: itensDaEmpresa(listas.colaboradores, idEmpresa),
    cargos: itensDaEmpresa(listas.cargos, idEmpresa),
    colaboradoresCargos: itensDaEmpresa(listas.colaboradoresCargos, idEmpresa),
    colaboradoresJornadas: itensDaEmpresa(listas.colaboradoresJornadas, idEmpresa),
    colaboradoresFaltasJustificadas: itensDaEmpresa(listas.colaboradoresFaltasJustificadas, idEmpresa),
    gruposDespesas: itensDaEmpresa(listas.gruposDespesas, idEmpresa),
    gruposMercadorias: itensDaEmpresa(listas.gruposMercadorias, idEmpresa),
    gruposRetiradas: itensDaEmpresa(listas.gruposRetiradas, idEmpresa),
    gruposVendas: itensDaEmpresa(listas.gruposVendas, idEmpresa),
    unidadesMedida: itensDaEmpresa(listas.unidadesMedida, idEmpresa),
    areas: itensDaEmpresa(listas.areas, idEmpresa),
    setores,
    permissoes: listas.permissoes,
    cargosPermissoes: itensDaEmpresa(listas.cargosPermissoes, idEmpresa),
    setoresPermissoes: listas.setoresPermissoes.filter((item) => !item.setorId || setoresIds.has(item.setorId)),
    usuariosPermissoes: listas.usuariosPermissoes.filter((item) => !item.usuarioId || usuariosIds.has(item.usuarioId)),
    usuarios,
    produtos: itensDaEmpresa(listas.produtos, idEmpresa),
    malotes: itensDaEmpresa(listas.malotes, idEmpresa),
    pdvs: itensDaEmpresa(listas.pdvs, idEmpresa),
    turnos: itensDaEmpresa(listas.turnos, idEmpresa)
  };
}

export function tipoEndpointCadastro(tela: string, form?: CadastroForm) {
  if (tela === "grupos")
    return form?.tipoGrupo === "mercadoria"
      ? "grupos-mercadorias"
      : form?.tipoGrupo === "retirada"
        ? "grupos-retiradas"
        : form?.tipoGrupo === "vendas"
          ? "grupos-vendas"
          : "grupos-despesas";
  const mapa: Record<string, string> = {
    empresas: "empresas",
    contas: "contas",
    unidades: "unidades-medida",
    areas_setores: form?.tipoAreaSetor === "setor" ? "setores" : "areas",
    usuarios: "usuarios",
    permissoes: "permissoes",
    colaboradores: "colaboradores",
    pdv: "pdvs",
    formas_pagamento: "formas-pagamento",
    fornecedores: "fornecedores",
    produtos: "produtos"
  };
  return mapa[tela] ?? tela.replaceAll("_", "-");
}

// Reconstroi o bloco fiscal do formulario a partir da linha (JSON) da listagem, para edicao.
export function fiscalFormDeLinha(fiscalJson: string | undefined): CadastroForm["fiscal"] {
  const vazio = formCadastroVazio().fiscal;
  try {
    const f = JSON.parse(fiscalJson ?? "null") as Record<string, string | number | null> | null;
    if (!f) return vazio;
    const txt = (v: string | number | null | undefined) => (v == null ? "" : String(v));
    return {
      ncm: txt(f.ncm),
      cest: txt(f.cest),
      categoriaFiscal: txt(f.categoriaFiscal),
      cstPisCofins: txt(f.cstPisCofins),
      aliquotaCheia: txt(f.aliquotaCheia),
      aliquotaFcp: txt(f.aliquotaFcp),
      aliquotaPis: txt(f.aliquotaPis),
      aliquotaCofins: txt(f.aliquotaCofins),
      reducaoIcms: txt(f.reducaoIcms),
      icms: txt(f.icms)
    };
  } catch {
    return vazio;
  }
}

// Reconstroi o bloco transformacao do formulario a partir da linha (JSON) da listagem.
export function transformacaoFormDeLinha(json: string | undefined): CadastroForm["transformacao"] {
  const vazio = formCadastroVazio().transformacao;
  try {
    const t = JSON.parse(json ?? "null") as ProdutoTransformacaoDados | null;
    if (!t) return vazio;
    return {
      precisao: t.precisao ?? "",
      quantidade: t.quantidade != null ? String(t.quantidade) : "",
      unidade: t.unidade ?? "",
      produtoReceituario: t.produtoReceituario ?? ""
    };
  } catch {
    return vazio;
  }
}

// Reconstroi os campos de promocao do formulario a partir da primeira promocao da linha (JSON).
export function promoFormDeLinha(promocoesJson: string | undefined) {
  const vazio = formCadastroVazio();
  const base = {
    promoTipo: vazio.promoTipo,
    promoValor: vazio.promoValor,
    promoDescontoPct: vazio.promoDescontoPct,
    promoHoraInicio: vazio.promoHoraInicio,
    promoHoraFim: vazio.promoHoraFim,
    promoDias: vazio.promoDias,
    promoValidaAte: vazio.promoValidaAte
  };
  try {
    const arr = JSON.parse(promocoesJson ?? "[]") as ProdutoPromocaoDados[];
    const p = arr[0];
    if (!p) return base;
    return {
      promoTipo: (p.tipo as CadastroForm["promoTipo"]) || "nenhum",
      promoValor: p.valor != null ? String(p.valor) : "",
      promoDescontoPct: p.descontoFracao != null ? String(Number(p.descontoFracao) * 100) : "",
      promoHoraInicio: (p.horaInicio ?? "").slice(0, 5),
      promoHoraFim: (p.horaFim ?? "").slice(0, 5),
      promoDias: [p.seg, p.ter, p.qua, p.qui, p.sex, p.sab, p.dom].map(Boolean),
      promoValidaAte: p.validaAte ?? ""
    };
  } catch {
    return base;
  }
}

function conversoesDeLinha(json: string | undefined) {
  try {
    const conversoes = JSON.parse(json ?? "[]") as Array<{
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
}

// Reconstroi o formulario de cadastro (todos os tipos) a partir da linha da listagem, para edicao.
// Puro: recebe as regras (calculadas no chamador via useCadastroView) como parametro.
export function formCadastroDeLinha(
  linha: Record<string, string | undefined>,
  regras: Record<string, boolean>
): CadastroForm {
  return {
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
    role: (linha.role as CadastroForm["role"]) || "usuario_comum",
    cpf: linha.cpf ?? "",
    sigla: linha.sigla ?? "",
    horaInicio: (linha.inicio ?? "").slice(0, 5),
    horaFim: (linha.fim ?? "").slice(0, 5),
    codigo: linha.codigo ?? "",
    codigoBarras: linha.codigoBarras ?? "",
    descricao: linha.descricao ?? linha.nome ?? "",
    marca: linha.marca ?? "",
    unidadeIndividualId: linha.unidadeIndividualId ?? linha.unidadeMedidaId ?? "",
    quantidadeIndividual: linha.quantidadeIndividual ?? "1",
    embalagem: linha.embalagem ?? "",
    cDe: linha.cDe ?? "",
    quantidadeCaixa: linha.quantidadeCaixa ?? "1",
    medidaCompra: linha.medidaCompra ?? "",
    grupoMercadoriaId: linha.grupoMercadoriaId ?? "",
    custo: linha.custo ?? "",
    margem: linha.margem ?? "",
    precoVenda: linha.precoVenda ?? "",
    auto: linha.auto === "true",
    status: (linha.status as CadastroForm["status"]) || "ativo",
    tipo: (linha.tipo as CadastroForm["tipo"]) || "revenda",
    quantidadeEstoque: linha.quantidadeEstoque ?? "0",
    estoqueMin: linha.estoqueMin ?? "",
    estoqueMax: linha.estoqueMax ?? "",
    setorEstoque: linha.setorEstoque ?? "",
    localVenda1: linha.localVenda1 ?? "",
    localVenda2: linha.localVenda2 ?? "",
    fotoUrl: linha.fotoUrl ?? "",
    fiscal: fiscalFormDeLinha(linha.fiscal),
    transformacao: transformacaoFormDeLinha(linha.transformacao),
    ...promoFormDeLinha(linha.promocoes),
    produtoConversoes: conversoesDeLinha(linha.conversoes),
    contaId: linha.contaId ?? "",
    ativo: linha.ativo !== "Nao",
    tipoGrupo: (linha.tipoGrupo as CadastroForm["tipoGrupo"]) || "despesa",
    grupoPaiId: linha.grupoPaiId ?? "",
    tipoAreaSetor:
      (linha.tipoAreaSetor as CadastroForm["tipoAreaSetor"]) || (linha.areaId || linha.setorPaiId ? "setor" : "area"),
    areaId: linha.areaId ?? "",
    setorPaiId: linha.setorPaiId ?? "",
    setorId: linha.setorId ?? "",
    turnoPadraoId: linha.turnoPadraoId ?? "",
    colaboradorId: linha.colaboradorId ?? "",
    cargoId: linha.cargoId ?? "",
    empresaIds: linha.empresaIds ? String(linha.empresaIds).split(",") : [],
    usuarioId: linha.usuarioId ?? "",
    regras
  };
}

export function rotaTela(tela: string) {
  return `/${tela}`;
}

export { temPermissao };
