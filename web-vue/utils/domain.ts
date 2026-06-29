import { TELA_TEMA_RESUMO_CAIXA, permissoes, type Permissao, type TemaAplicacao } from "@padaria/shared";
import type { AcaoNovo, CadastroForm, EntidadeOperacional, ItemMenu, OperacaoForm, Opcao, Opcoes } from "~/types/padaria";

export { permissoes };

export const itemPorTela: Record<string, ItemMenu> = {
  entradas: { id: "entradas", titulo: "Entradas", permissao: "entradas_visualizar", icone: "mdi-arrow-down-left" },
  transferencias: {
    id: "transferencias",
    titulo: "Transferencias",
    permissao: "transferencias_visualizar",
    icone: "mdi-swap-horizontal"
  },
  despesas: { id: "despesas", titulo: "Despesas", permissao: "despesas_visualizar", icone: "mdi-receipt-text" },
  mercadorias: {
    id: "mercadorias",
    titulo: "Mercadorias",
    permissao: "mercadorias_visualizar",
    icone: "mdi-package-variant-closed"
  },
  retiradas: { id: "retiradas", titulo: "Retiradas", permissao: "retiradas_visualizar", icone: "mdi-wallet" },
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
  malotes: { id: "malotes", titulo: "Malotes", permissao: "cadastro_malotes_visualizar", icone: "mdi-briefcase" },
  caixa: { id: "caixa", titulo: "Caixa", permissao: "caixa_operar", icone: "mdi-store" },
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
  fornecedores: { id: "fornecedores", titulo: "Fornecedores", permissao: "cadastro_fornecedores_visualizar", icone: "mdi-domain" },
  produtos: { id: "produtos", titulo: "Produtos", permissao: "cadastro_produtos_visualizar", icone: "mdi-basket" },
  colaboradores: {
    id: "colaboradores",
    titulo: "Colaboradores",
    permissao: "cadastro_colaboradores_visualizar",
    icone: "mdi-account-group"
  },
  folha_ponto: { id: "folha_ponto", titulo: "Folha ponto", permissao: "folha_ponto_visualizar", icone: "mdi-calendar-clock" },
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
  patrimonio: { id: "patrimonio", titulo: "Patrimonio", permissao: "cadastro_patrimonio_visualizar", icone: "mdi-bank" },
  ficha_tecnica: {
    id: "ficha_tecnica",
    titulo: "Ficha tecnica",
    permissao: "cadastro_ficha_tecnica_visualizar",
    icone: "mdi-clipboard-list"
  },
  ingredientes: { id: "ingredientes", titulo: "Ingredientes", permissao: "cadastro_ingredientes_visualizar", icone: "mdi-basket" },
  contas_pagar: { id: "contas_pagar", titulo: "Contas a pagar", permissao: "contas_pagar_visualizar", icone: "mdi-receipt-text" },
  relatorio_vendas: {
    id: "relatorio_vendas",
    titulo: "Relatorio de Vendas",
    permissao: "relatorio_vendas_visualizar",
    icone: "mdi-hand-coin"
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
  integracoes: { id: "integracoes", titulo: "Integracoes", permissao: "integracoes_visualizar", icone: "mdi-connection" },
  contas: { id: "contas", titulo: "Contas", permissao: "cadastro_contas_visualizar", icone: "mdi-domain" },
  empresas: { id: "empresas", titulo: "Empresas", permissao: "cadastro_empresas_visualizar", icone: "mdi-domain" },
  grupos: { id: "grupos", titulo: "Grupos", permissao: "cadastro_grupos_visualizar", icone: "mdi-layers" },
  unidades: { id: "unidades", titulo: "Unidades de medida", permissao: "cadastro_unidades_medida_visualizar", icone: "mdi-ruler" },
  areas_setores: {
    id: "areas_setores",
    titulo: "Areas e setores",
    permissao: "cadastro_areas_setores_visualizar",
    icone: "mdi-map-marker"
  },
  usuarios: { id: "usuarios", titulo: "Usuarios", permissao: "cadastro_usuarios_visualizar", icone: "mdi-account-group" },
  permissoes: { id: "permissoes", titulo: "Permissoes", permissao: "cadastro_permissoes_visualizar", icone: "mdi-shield-check" },
  aparencia: { id: "aparencia", titulo: "Aparencia", permissao: "aparencia_visualizar", icone: "mdi-palette" }
};

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

export function telaVisivelNoMenu(permissoesUsuario: readonly Permissao[], item: ItemMenu) {
  return (
    permissoesUsuario.includes(item.permissao) ||
    permissoesUsuario.includes(permissaoMenuMostrar(item.id)) ||
    permissoesUsuario.includes(permissaoMenuDesabilitado(item.id)) ||
    permissoesUsuario.includes(permissaoMenuSomenteCaixaAberto(item.id))
  );
}

export function telaDesabilitadaNoMenu(permissoesUsuario: readonly Permissao[], item: ItemMenu, caixaAberto: boolean) {
  const temAcesso = permissoesUsuario.includes(item.permissao);
  if (!temAcesso) return true;
  return permissoesUsuario.includes(permissaoMenuSomenteCaixaAberto(item.id)) && !caixaAberto;
}

export function motivoTelaDesabilitada(permissoesUsuario: readonly Permissao[], item: ItemMenu, caixaAberto: boolean) {
  const dependeCaixa = permissoesUsuario.includes(permissaoMenuSomenteCaixaAberto(item.id));
  if (dependeCaixa && !caixaAberto && permissoesUsuario.includes(item.permissao)) {
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
  { titulo: "Menu lateral", prefixos: ["menu_"] },
  { titulo: "Transferencias", prefixos: ["transferencias", "cadastro_malotes"] },
  { titulo: "Despesas", prefixos: ["despesas", "contas_pagar", "cadastro_grupos"] },
  {
    titulo: "Mercadorias",
    prefixos: [
      "mercadorias",
      "pedidos",
      "estoque_produtos",
      "perdas_sobras",
      "cadastro_grupos",
      "cadastro_produtos",
      "cadastro_unidades_medida",
      "cadastro_fornecedores"
    ]
  },
  { titulo: "Retiradas", prefixos: ["retiradas", "cadastro_grupos"] },
  {
    titulo: "Caixa e vendas",
    prefixos: [
      "entradas",
      "fechamento_com_diferenca",
      "promocoes",
      "relatorio_vendas",
      "cadastro_pdv",
      "cadastro_formas_pagamento",
      "cadastro_grupos",
      "integracoes"
    ]
  },
  {
    titulo: "Cadastros",
    prefixos: [
      "cadastro_empresas",
      "cadastro_contas",
      "cadastro_areas_setores",
      "cadastro_colaboradores",
      "cadastro_clientes",
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
      "relatorio_produtos",
      "relatorio_faltas",
      "relatorio_advertencias",
      "relatorio_dre",
      "relatorio_fiscal_produtos"
    ]
  },
  { titulo: "Permissoes e aparencia", prefixos: ["cadastro_permissoes", "aparencia"] },
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
    pdvs: []
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
    cpf: "",
    sigla: "",
    codigo: "",
    codigoBarras: "",
    descricao: "",
    marca: "",
    unidadeIndividualId: "",
    quantidadeIndividual: "1",
    grupoMercadoriaId: "",
    produtoConversoes: [],
    contaId: "",
    ativo: true,
    tipoGrupo: "despesa",
    grupoPaiId: "",
    tipoAreaSetor: "area",
    areaId: "",
    setorPaiId: "",
    setorId: "",
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
    pdvs: itensDaEmpresa(listas.pdvs, idEmpresa)
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

function documentoCadastroEhCpf(documento: string) {
  const digitos = documento.replace(/\D/g, "");
  return digitos.length > 0 && digitos.length <= 11;
}

export function cadastroPayload(tela: string, form: CadastroForm, empresaId: string) {
  if (tela === "empresas") return { nome: form.nome, cnpj: form.cnpj || null };
  if (tela === "contas") return { empresaId, nome: form.nome };
  if (tela === "formas_pagamento") return { empresaId, nome: form.nome };
  if (tela === "pdv")
    return { empresaId, nome: form.nome, contaId: form.contaId, ativo: form.ativo };
  if (tela === "grupos")
    return { empresaId, nome: form.nome, tipoGrupo: form.tipoGrupo, grupoPaiId: form.grupoPaiId || null };
  if (tela === "unidades") return { empresaId, nome: form.nome, sigla: form.sigla };
  if (tela === "fornecedores")
    return { empresaId, nome: form.nome, documento: form.documento || null };
  if (tela === "clientes")
    return {
      empresaId,
      nome: form.nome,
      documento: form.documento || null,
      dataNascimento: documentoCadastroEhCpf(form.documento) ? form.dataNascimento || null : null,
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      cep: form.cep || null,
      rua: form.rua || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado || null
    };
  if (tela === "produtos")
    return {
      empresaId,
      codigo: form.codigo || null,
      codigoBarras: form.codigoBarras || null,
      descricao: form.descricao || form.nome,
      marca: form.marca || null,
      unidadeIndividualId: form.unidadeIndividualId,
      quantidadeIndividual: Number(form.quantidadeIndividual || 1),
      grupoMercadoriaId: form.grupoMercadoriaId || null,
      conversoes: form.produtoConversoes
        .filter((conversao) => conversao.unidadeMedidaId && conversao.quantidade && conversao.unidadesIndividuais)
        .map((conversao) => ({
          unidadeMedidaId: conversao.unidadeMedidaId,
          quantidade: Number(conversao.quantidade),
          unidadesIndividuais: Number(conversao.unidadesIndividuais)
        }))
    };
  if (tela === "areas_setores") {
    return form.tipoAreaSetor === "setor"
      ? { empresaId, nome: form.nome, areaId: form.areaId || null, setorPaiId: form.setorPaiId || null }
      : { empresaId, nome: form.nome };
  }
  if (tela === "usuarios") {
    const payload: Record<string, unknown> = {
      nome: form.nome,
      email: form.email,
      senha: form.senha || undefined,
      empresaIds: form.empresaIds.length ? form.empresaIds : [empresaId].filter(Boolean)
    };
    if (form.novoColaborador) {
      payload.novoColaborador = {
        empresaId,
        nome: form.novoColaboradorNome || form.nome,
        cpf: form.novoColaboradorCpf || null,
        setorId: form.novoColaboradorSetorId || null,
        cargoId: form.novoColaboradorCargoId
      };
    } else {
      payload.colaboradorId = form.colaboradorId;
    }
    return payload;
  }
  if (tela === "permissoes") {
    return {
      tipoPermissao: form.tipoPermissao,
      cargoId: form.tipoPermissao === "cargo" ? form.cargoId : undefined,
      setorId: form.tipoPermissao === "setor" ? form.setorId : undefined,
      usuarioId: form.tipoPermissao === "usuario" ? form.usuarioId : undefined,
      regras: form.regras
    };
  }
  if (tela === "colaboradores")
    return { empresaId, nome: form.nome, cpf: form.cpf || null, setorId: form.setorId || null, cargoId: form.cargoId };
  return { empresaId, nome: form.nome, descricao: form.nome };
}

export function rotaTela(tela: string) {
  return `/${tela}`;
}

export function temPermissao(permissoesUsuario: Permissao[], permissao: Permissao) {
  return permissoesUsuario.includes(permissao);
}

