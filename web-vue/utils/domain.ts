import { permissoes, type Permissao, type TemaAplicacao, type TipoMovimentacao } from "@padaria/shared";
import type { AcaoNovo, CadastroForm, ItemMenu, MovimentoForm, Opcao, Opcoes } from "~/types/padaria";

export { permissoes };

export const itemPorTela: Record<string, ItemMenu> = {
  entradas: { id: "entradas", titulo: "Entradas", permissao: "entradas", icone: "mdi-arrow-down-left" },
  transferencias: {
    id: "transferencias",
    titulo: "Transferencias",
    permissao: "transferencias",
    icone: "mdi-swap-horizontal"
  },
  despesas: { id: "despesas", titulo: "Despesas", permissao: "despesas", icone: "mdi-receipt-text" },
  mercadorias: {
    id: "mercadorias",
    titulo: "Mercadorias",
    permissao: "mercadorias",
    icone: "mdi-package-variant-closed"
  },
  retiradas: { id: "retiradas", titulo: "Retiradas", permissao: "retiradas", icone: "mdi-wallet" },
  fechamento: {
    id: "fechamento",
    titulo: "Fechamento com diferenca",
    permissao: "fechamento_com_diferenca",
    icone: "mdi-cash-register"
  },
  relatorio_produtos: {
    id: "relatorio_produtos",
    titulo: "Produtos mais vendidos",
    permissao: "relatorio_produtos_mais_vendidos",
    icone: "mdi-chart-bar"
  },
  malotes: { id: "malotes", titulo: "Malotes", permissao: "cadastro_malotes", icone: "mdi-briefcase" },
  caixa: { id: "caixa", titulo: "Caixa", permissao: "operar_caixa", icone: "mdi-store" },
  promocoes: { id: "promocoes", titulo: "Promocoes", permissao: "promocoes", icone: "mdi-hand-coin" },
  relatorio_faltas: {
    id: "relatorio_faltas",
    titulo: "Faltas e atestados",
    permissao: "relatorio_faltas_atestados_colaboradores",
    icone: "mdi-chart-box"
  },
  relatorio_advertencias: {
    id: "relatorio_advertencias",
    titulo: "Advertencias e suspensoes",
    permissao: "relatorio_advertencia_suspensao_colaboradores",
    icone: "mdi-clipboard-check"
  },
  pedidos: { id: "pedidos", titulo: "Pedidos", permissao: "pedidos", icone: "mdi-clipboard-list" },
  perdas_sobras: {
    id: "perdas_sobras",
    titulo: "Perdas e sobras",
    permissao: "perdas_sobras",
    icone: "mdi-package-variant"
  },
  estoque_produtos: {
    id: "estoque_produtos",
    titulo: "Estoque de produtos",
    permissao: "estoque_produtos",
    icone: "mdi-warehouse"
  },
  relatorio_dre: {
    id: "relatorio_dre",
    titulo: "Relatorio de DRE",
    permissao: "relatorio_dre",
    icone: "mdi-chart-bar"
  },
  clientes: {
    id: "clientes",
    titulo: "Clientes",
    permissao: "cadastro_avaliacao_clientes",
    icone: "mdi-account-group"
  },
  fornecedores: { id: "fornecedores", titulo: "Fornecedores", permissao: "cadastro_fornecedores", icone: "mdi-domain" },
  produtos: { id: "produtos", titulo: "Produtos", permissao: "cadastro_produtos", icone: "mdi-basket" },
  colaboradores: {
    id: "colaboradores",
    titulo: "Colaboradores",
    permissao: "cadastro_colaboradores",
    icone: "mdi-account-group"
  },
  feriados: { id: "feriados", titulo: "Feriados", permissao: "cadastro_colaboradores", icone: "mdi-calendar-clock" },
  folha_ponto: { id: "folha_ponto", titulo: "Folha ponto", permissao: "folha_ponto", icone: "mdi-calendar-clock" },
  avaliacao_qualidade: {
    id: "avaliacao_qualidade",
    titulo: "Avaliacao de qualidade",
    permissao: "avaliacao_qualidade",
    icone: "mdi-clipboard-check"
  },
  avaliacao_colaboradores: {
    id: "avaliacao_colaboradores",
    titulo: "Avaliacao de colaboradores",
    permissao: "avaliacao_colaboradores",
    icone: "mdi-clipboard-check"
  },
  relatorio_fiscal: {
    id: "relatorio_fiscal",
    titulo: "Relatorio fiscal dos produtos",
    permissao: "relatorio_fiscal_produtos",
    icone: "mdi-file-document"
  },
  fiscal_produtos: {
    id: "fiscal_produtos",
    titulo: "Fiscal de produtos",
    permissao: "cadastro_fiscal_produtos",
    icone: "mdi-file-text"
  },
  patrimonio: { id: "patrimonio", titulo: "Patrimonio", permissao: "cadastro_patrimonio", icone: "mdi-bank" },
  ficha_tecnica: {
    id: "ficha_tecnica",
    titulo: "Ficha tecnica",
    permissao: "cadastro_ficha_tecnica",
    icone: "mdi-clipboard-list"
  },
  ingredientes: { id: "ingredientes", titulo: "Ingredientes", permissao: "cadastro_ingredientes", icone: "mdi-basket" },
  contas_pagar: { id: "contas_pagar", titulo: "Contas a pagar", permissao: "contas_pagar", icone: "mdi-receipt-text" },
  vendas_crediario: {
    id: "vendas_crediario",
    titulo: "Vendas no crediario",
    permissao: "vendas_crediario",
    icone: "mdi-hand-coin"
  },
  notas_fiscais: {
    id: "notas_fiscais",
    titulo: "Notas fiscais",
    permissao: "notas_fiscais",
    icone: "mdi-file-document"
  },
  grupos_vendas: {
    id: "grupos_vendas",
    titulo: "Grupos de vendas",
    permissao: "cadastro_grupos_vendas",
    icone: "mdi-layers"
  },
  pdv: { id: "pdv", titulo: "PDV", permissao: "cadastro_pdv", icone: "mdi-store" },
  formas_pagamento: {
    id: "formas_pagamento",
    titulo: "Formas de pagamento",
    permissao: "cadastro_formas_pagamento",
    icone: "mdi-credit-card"
  },
  contas: { id: "contas", titulo: "Contas", permissao: "cadastro_contas", icone: "mdi-domain" },
  empresas: { id: "empresas", titulo: "Empresas", permissao: "cadastro_empresas", icone: "mdi-domain" },
  grupos: { id: "grupos", titulo: "Grupos", permissao: "cadastro_grupos_despesas", icone: "mdi-layers" },
  unidades: { id: "unidades", titulo: "Unidades de medida", permissao: "cadastro_unidades_medida", icone: "mdi-ruler" },
  areas_setores: {
    id: "areas_setores",
    titulo: "Areas e setores",
    permissao: "cadastro_areas_setores",
    icone: "mdi-map-marker"
  },
  usuarios: { id: "usuarios", titulo: "Usuarios", permissao: "cadastro_usuarios", icone: "mdi-account-group" },
  permissoes: { id: "permissoes", titulo: "Permissoes", permissao: "cadastro_permissoes", icone: "mdi-shield-check" },
  aparencia: { id: "aparencia", titulo: "Aparencia", permissao: "configurar_tema", icone: "mdi-palette" }
};

export const movimentoPorTela: Record<string, TipoMovimentacao> = {
  entradas: "entrada",
  transferencias: "transferencia",
  despesas: "despesa",
  mercadorias: "mercadoria",
  retiradas: "retirada"
};

export const endpointMovimentoPorTipo: Record<TipoMovimentacao, string> = {
  entrada: "entradas",
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

export const opcoesNovo: AcaoNovo[] = [
  {
    tipo: "despesa",
    titulo: "Despesa",
    subtitulo: "Fornecedor, grupo e itens discriminados",
    permissao: "despesas",
    icone: "mdi-receipt-text",
    cor: "error"
  },
  {
    tipo: "mercadoria",
    titulo: "Mercadoria",
    subtitulo: "Compra, nota fiscal e documento",
    permissao: "mercadorias",
    icone: "mdi-package-variant-closed",
    cor: "info"
  },
  {
    tipo: "transferencia",
    titulo: "Transferencia",
    subtitulo: "Contas, malote e lacre",
    permissao: "transferencias",
    icone: "mdi-swap-horizontal",
    cor: "primary"
  },
  {
    tipo: "retirada",
    titulo: "Retirada",
    subtitulo: "Colaborador, fornecedor ou retirada operacional",
    permissao: "retiradas",
    icone: "mdi-wallet",
    cor: "warning"
  },
  {
    tela: "malote",
    titulo: "Malote",
    subtitulo: "Cadastro de malote e lacres",
    permissao: "cadastro_malotes",
    icone: "mdi-briefcase",
    cor: "secondary"
  }
];

export const secoesPermissoes = [
  { titulo: "Transferencias", prefixos: ["transferencias", "cadastro_malotes"] },
  { titulo: "Despesas", prefixos: ["despesas", "contas_pagar", "cadastro_grupos_despesas"] },
  {
    titulo: "Mercadorias",
    prefixos: [
      "mercadorias",
      "pedidos",
      "estoque_produtos",
      "perdas_sobras",
      "cadastro_grupos_mercadorias",
      "cadastro_produtos",
      "cadastro_unidades_medida",
      "cadastro_fornecedores"
    ]
  },
  { titulo: "Retiradas", prefixos: ["retiradas", "cadastro_grupos_retiradas"] },
  {
    titulo: "Caixa e vendas",
    prefixos: [
      "entradas",
      "fechamento_com_diferenca",
      "promocoes",
      "vendas_crediario",
      "cadastro_pdv",
      "cadastro_formas_pagamento",
      "cadastro_grupos_vendas"
    ]
  },
  {
    titulo: "Cadastros",
    prefixos: [
      "cadastro_empresas",
      "cadastro_contas",
      "cadastro_areas_setores",
      "cadastro_colaboradores",
      "cadastro_avaliacao_clientes",
      "cadastro_fiscal_produtos",
      "cadastro_patrimonio",
      "cadastro_ficha_tecnica",
      "cadastro_ingredientes",
      "folha_ponto"
    ]
  },
  {
    titulo: "Relatorios",
    prefixos: [
      "relatorio_produtos_mais_vendidos",
      "relatorio_faltas_atestados_colaboradores",
      "relatorio_advertencia_suspensao_colaboradores",
      "relatorio_dre",
      "relatorio_fiscal_produtos"
    ]
  },
  { titulo: "Permissoes e aparencia", prefixos: ["cadastro_permissoes", "configurar_tema"] },
  { titulo: "Outras", prefixos: [] }
];

export function opcoesVazias(): Opcoes {
  return {
    empresas: [],
    contas: [],
    formasPagamento: [],
    fornecedores: [],
    colaboradores: [],
    cargos: [],
    colaboradoresCargos: [],
    colaboradoresJornadas: [],
    colaboradoresFaltasJustificadas: [],
    feriados: [],
    gruposDespesas: [],
    gruposMercadorias: [],
    gruposRetiradas: [],
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
    pdvs: []
  };
}

export function formMovimentoVazio(): MovimentoForm {
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
    email: "",
    senha: "",
    cpf: "",
    sigla: "",
    codigo: "",
    contaId: "",
    ativo: true,
    tipoGrupo: "despesa",
    grupoPaiId: "",
    tipoAreaSetor: "area",
    areaId: "",
    setorPaiId: "",
    setorId: "",
    colaboradorId: "",
    cargoId: "",
    empresaIds: [],
    tipoPermissao: "cargo",
    usuarioId: "",
    permissoes: []
  };
}

export function temaPadrao(): TemaAplicacao {
  return {
    corPrimaria: "#6d28d9",
    corSecundaria: "#0891b2",
    corFundo: "#eaf1f9",
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
    colaboradores: itensDaEmpresa(listas.colaboradores, idEmpresa),
    cargos: itensDaEmpresa(listas.cargos, idEmpresa),
    colaboradoresCargos: itensDaEmpresa(listas.colaboradoresCargos, idEmpresa),
    colaboradoresJornadas: itensDaEmpresa(listas.colaboradoresJornadas, idEmpresa),
    colaboradoresFaltasJustificadas: itensDaEmpresa(listas.colaboradoresFaltasJustificadas, idEmpresa),
    feriados: itensDaEmpresa(listas.feriados, idEmpresa),
    gruposDespesas: itensDaEmpresa(listas.gruposDespesas, idEmpresa),
    gruposMercadorias: itensDaEmpresa(listas.gruposMercadorias, idEmpresa),
    gruposRetiradas: itensDaEmpresa(listas.gruposRetiradas, idEmpresa),
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
    pdvs: itensDaEmpresa(listas.pdvs, idEmpresa)
  };
}

export function tipoEndpointCadastro(tela: string, form?: CadastroForm) {
  if (tela === "grupos")
    return form?.tipoGrupo === "mercadoria"
      ? "grupos-mercadorias"
      : form?.tipoGrupo === "retirada"
        ? "grupos-retiradas"
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

export function cadastroPayload(tela: string, form: CadastroForm, empresaId: string) {
  if (tela === "empresas") return { nome: form.nome };
  if (tela === "contas") return { empresaId, nome: form.nome };
  if (tela === "formas_pagamento") return { empresaId, nome: form.nome };
  if (tela === "pdv")
    return { empresaId, nome: form.nome, codigo: form.codigo || null, contaId: form.contaId, ativo: form.ativo };
  if (tela === "grupos") return { empresaId, nome: form.nome, grupoPaiId: form.grupoPaiId || null };
  if (tela === "unidades") return { empresaId, nome: form.nome, sigla: form.sigla };
  if (tela === "areas_setores") {
    return form.tipoAreaSetor === "setor"
      ? { empresaId, nome: form.nome, areaId: form.areaId || null, setorPaiId: form.setorPaiId || null }
      : { empresaId, nome: form.nome };
  }
  if (tela === "usuarios") {
    return {
      nome: form.nome,
      email: form.email,
      senha: form.senha || undefined,
      colaboradorId: form.colaboradorId,
      empresaIds: form.empresaIds.length ? form.empresaIds : [empresaId].filter(Boolean)
    };
  }
  if (tela === "permissoes") {
    return {
      tipoPermissao: form.tipoPermissao,
      cargoId: form.tipoPermissao === "cargo" ? form.cargoId : undefined,
      setorId: form.tipoPermissao === "setor" ? form.setorId : undefined,
      usuarioId: form.tipoPermissao === "usuario" ? form.usuarioId : undefined,
      permissoes: form.permissoes
    };
  }
  if (tela === "colaboradores")
    return { empresaId, nome: form.nome, cpf: form.cpf || null, setorId: form.setorId || null };
  return { empresaId, nome: form.nome, descricao: form.nome };
}

export function rotaTela(tela: string) {
  return `/${tela}`;
}

export function temPermissao(permissoesUsuario: Permissao[], permissao: Permissao) {
  return permissoesUsuario.includes(permissao);
}
