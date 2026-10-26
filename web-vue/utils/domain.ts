import {
  acentuarMensagemExibida,
  diaNegocio,
  TELA_TEMA_RESUMO_CAIXA,
  permissoes as permissoesCompartilhadas,
  rolesUsuario,
  temAlgumaPermissao,
  temPermissao,
  type Permissao,
  type RoleUsuario,
  type TemaAplicacao
} from "@padaria/shared";
// M3/ADR-002: serializacao formulario -> payload agora mora no shared; fachada para o front.
export { bloqueioCadastroUsuario, cadastroPayload, numeroCampoOuNulo } from "@padaria/shared";
import type {
  AcaoNovo,
  CadastroForm,
  EntidadeOperacional,
  ItemMenu,
  OperacaoForm,
  Opcao,
  Opcoes
} from "~/types/padaria";
import { mascararCep, mascararDocumento, mascararWhatsapp } from "./formatacao";
import { corCategoriaPorTela } from "./tema";

export const telasOcultasNoDrawerEPermissoes = new Set([
  "promocoes",
  "relatorio_faltas",
  "relatorio_advertencias",
  "perdas_sobras",
  "relatorio_dre",
  "folha_ponto",
  "avaliacao_qualidade",
  "avaliacao_colaboradores",
  "relatorio_fiscal",
  "fiscal_produtos",
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
    titulo: "Transferências",
    permissao: "transferencias_visualizar",
    icone: "mdi-swap-horizontal",
    cor: corCategoriaPorTela["transferencias"]
  },
  // `cor` faltava aqui — junto com a ausencia de `despesas` no mapa de cores, era o que deixava este
  // item cinza no menu enquanto Entradas, Transferencias, Mercadorias e Retiradas tinham cor.
  despesas: {
    id: "despesas",
    titulo: "Despesas",
    permissao: "despesas_visualizar",
    icone: "mdi-receipt-text",
    cor: corCategoriaPorTela["despesas"]
  },
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
    titulo: "Pendências operacionais",
    permissao: "fechamento_com_diferenca_visualizar",
    // Balanca (conferir diferenca): mdi-cash-register agora e da tela Caixa, vizinha na secao
    // Operacao — dois icones iguais lado a lado confundiam.
    icone: "mdi-scale-balance"
  },
  relatorio_produtos: {
    id: "relatorio_produtos",
    titulo: "Produtos mais vendidos",
    permissao: "relatorio_produtos_visualizar",
    icone: "mdi-chart-bar"
  },
  caixa: { id: "caixa", titulo: "Caixa", permissao: "caixa_operar", icone: "mdi-cash-register" },
  // Retaguarda: quem gerencia caixas ve o historico de todos. Operador de caixa nao entra aqui.
  historico_caixas: {
    id: "historico_caixas",
    titulo: "Histórico de caixas",
    permissao: "caixas_gerenciar",
    icone: "mdi-history"
  },
  relatorio_fechamento: {
    id: "relatorio_fechamento",
    titulo: "Relatório de fechamento",
    permissao: "relatorio_fechamento_visualizar",
    icone: "mdi-clipboard-text-search"
  },
  // R-200: a UNICA tela nova das duas frentes. Mensagem para PDV nao entra aqui de proposito — ela
  // vive dentro do Monitor de caixas abertos, sem rota e sem item de menu.
  campanhas: {
    id: "campanhas",
    titulo: "Campanhas",
    permissao: "campanhas_visualizar",
    icone: "mdi-trophy-outline"
  },
  promocoes: { id: "promocoes", titulo: "Promoções", permissao: "promocoes_visualizar", icone: "mdi-hand-coin" },
  relatorio_faltas: {
    id: "relatorio_faltas",
    titulo: "Faltas e atestados",
    permissao: "relatorio_faltas_visualizar",
    icone: "mdi-chart-box"
  },
  relatorio_advertencias: {
    id: "relatorio_advertencias",
    titulo: "Advertências e suspensões",
    permissao: "relatorio_advertencias_visualizar",
    icone: "mdi-clipboard-check"
  },
  // Doc 58 §4: a antiga tela Pedidos virou a Cotacao por fornecedor (o id "pedidos" fica, por causa das permissoes).
  pedidos: {
    id: "pedidos",
    titulo: "Cotação por fornecedor",
    permissao: "pedidos_visualizar",
    icone: "mdi-clipboard-list"
  },
  // Doc 58 §5: o que ja foi comprado — a caminho e recebido. O recebimento acontece aqui.
  pedidos_finalizados: {
    id: "pedidos_finalizados",
    titulo: "Pedidos finalizados",
    permissao: "pedidos_visualizar",
    icone: "mdi-truck-check-outline"
  },
  perdas_sobras: {
    id: "perdas_sobras",
    titulo: "Perdas e sobras",
    permissao: "perdas_sobras_visualizar",
    icone: "mdi-package-variant"
  },
  estoque_produtos: {
    id: "estoque_produtos",
    titulo: "Estoques de produtos",
    permissao: "estoque_produtos_visualizar",
    icone: "mdi-warehouse"
  },
  conferencias_estoque: {
    id: "conferencias_estoque",
    titulo: "Conferências de estoque",
    permissao: "conferencias_estoque_visualizar",
    icone: "mdi-clipboard-check-outline"
  },
  agendamento_pedidos: {
    id: "agendamento_pedidos",
    titulo: "Agendamento de pedidos",
    permissao: "agendamento_pedidos_visualizar",
    icone: "mdi-calendar-sync-outline"
  },
  // Doc 58 §2: o responsavel confere e envia o pedido agendado.
  solicitacao_compra: {
    id: "solicitacao_compra",
    titulo: "Solicitação de compra",
    permissao: "pedidos_visualizar",
    icone: "mdi-clipboard-text-clock-outline"
  },
  // Doc 57 §4: catalogo fornecedor-produto, historico de compras e preco-base sairam da tela de Pedidos.
  cadastro_compras: {
    id: "cadastro_compras",
    titulo: "Cadastro de compras",
    permissao: "compras_catalogo_gerir",
    icone: "mdi-database-cog-outline"
  },
  relatorio_dre: {
    id: "relatorio_dre",
    titulo: "Relatórios de DRE",
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
  socios_gestores: {
    id: "socios_gestores",
    titulo: "Sócios e Gestores",
    permissao: "cadastro_socios_gestores_visualizar",
    icone: "mdi-account-tie"
  },
  maquininhas: {
    id: "maquininhas",
    titulo: "Maquininhas",
    permissao: "cadastro_pdv_visualizar",
    permissoesAlternativas: ["cadastro_pdv_criar", "cadastro_pdv_editar"],
    icone: "mdi-credit-card-chip"
  },
  produtos: { id: "produtos", titulo: "Produtos", permissao: "cadastro_produtos_visualizar", icone: "mdi-basket" },
  colaboradores: {
    id: "colaboradores",
    titulo: "Colaboradores",
    permissao: "cadastro_colaboradores_visualizar",
    icone: "mdi-account-group"
  },
  // A Central do DP somente agrega caminhos que ja existem. Ela nao ganha permissao propria:
  // aparece para quem consiga abrir ao menos uma tela do departamento.
  departamento_pessoal: {
    id: "departamento_pessoal",
    titulo: "Central do DP",
    permissao: "admissoes_processos_visualizar",
    permissoesAlternativas: [
      "admissoes_testes_visualizar",
      "cadastro_colaboradores_visualizar",
      "cadastro_funcoes_visualizar",
      "cadastro_areas_setores_visualizar",
      "cadastro_turnos_visualizar"
    ],
    icone: "mdi-view-dashboard-outline"
  },
  // ADM-001. Vizinha de Colaboradores no menu, mas NAO e cadastro operacional: nao entra em
  // `telasCrudDiretoria` (nao usa a grade generica) e a permissao e propria da admissao.
  admissoes_testes: {
    id: "admissoes_testes",
    titulo: "Períodos de teste",
    permissao: "admissoes_testes_visualizar",
    icone: "mdi-account-clock"
  },
  // ADM-003 V1A. UNICO item de menu do processo. A lista e consulta: a unica acao de criacao nela e
  // "+ Novo cadastro", que abre a admissao direta. Efetivar teste continua criando o processo pela
  // tela de Periodos de teste, sem passar por aqui.
  admissoes_processos: {
    id: "admissoes_processos",
    titulo: "Processos de admissão",
    permissao: "admissoes_processos_visualizar",
    icone: "mdi-clipboard-account"
  },
  conplus_folha_05: {
    id: "conplus_folha_05",
    titulo: "Folha de pagamento — Dia 05",
    permissao: "conplus_importacoes_visualizar",
    icone: "mdi-cash-multiple"
  },
  conplus_adiantamento_20: {
    id: "conplus_adiantamento_20",
    titulo: "Adiantamento — Dia 20",
    permissao: "conplus_importacoes_visualizar",
    icone: "mdi-calendar-arrow-right"
  },
  conplus_rescisoes: {
    id: "conplus_rescisoes",
    titulo: "Rescisões",
    permissao: "conplus_importacoes_visualizar",
    icone: "mdi-file-document-remove-outline"
  },
  conplus_ferias: {
    id: "conplus_ferias",
    titulo: "Férias",
    permissao: "conplus_importacoes_visualizar",
    icone: "mdi-beach"
  },
  conplus_exportar: {
    id: "conplus_exportar",
    titulo: "Exportações Questor",
    permissao: "conplus_exportar_admissoes",
    icone: "mdi-file-export-outline"
  },
  folha_ponto: {
    id: "folha_ponto",
    titulo: "Folhas de ponto",
    permissao: "folha_ponto_visualizar",
    icone: "mdi-calendar-clock"
  },
  avaliacao_qualidade: {
    id: "avaliacao_qualidade",
    titulo: "Avaliações de qualidade",
    permissao: "avaliacao_qualidade_visualizar",
    icone: "mdi-clipboard-check"
  },
  avaliacao_colaboradores: {
    id: "avaliacao_colaboradores",
    titulo: "Avaliações de colaboradores",
    permissao: "avaliacao_colaboradores_visualizar",
    icone: "mdi-clipboard-check"
  },
  relatorio_fiscal: {
    id: "relatorio_fiscal",
    titulo: "Relatórios fiscais dos produtos",
    permissao: "relatorio_fiscal_visualizar",
    icone: "mdi-file-document"
  },
  fiscal_produtos: {
    id: "fiscal_produtos",
    titulo: "Fiscais de produtos",
    permissao: "cadastro_fiscal_produtos_visualizar",
    icone: "mdi-file-text"
  },
  patrimonio: {
    id: "patrimonio",
    titulo: "Patrimônio",
    permissao: "cadastro_patrimonio_visualizar",
    icone: "mdi-bank"
  },
  ficha_tecnica: {
    id: "ficha_tecnica",
    titulo: "Ficha técnica",
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
    // Distinto de Despesas (mdi-receipt-text): no menu por eixo V2 os dois caem juntos em "Saidas".
    icone: "mdi-cash-clock"
  },
  relatorio_vendas: {
    id: "relatorio_vendas",
    titulo: "Relatório de vendas",
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
    titulo: "Integrações",
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
  // Catalogo do que a pessoa FAZ. Vizinho de Turnos no menu porque os dois sao catalogo da empresa
  // que a admissao consome — e longe de "Colaboradores", que e gente, nao lista.
  funcoes_operacionais: {
    id: "funcoes_operacionais",
    titulo: "Funções operacionais",
    permissao: "cadastro_funcoes_visualizar",
    icone: "mdi-badge-account-horizontal-outline"
  },
  areas_setores: {
    id: "areas_setores",
    titulo: "Áreas e setores",
    permissao: "cadastro_areas_setores_visualizar",
    icone: "mdi-map-marker"
  },
  usuarios: {
    id: "usuarios",
    titulo: "Usuários",
    permissao: "cadastro_usuarios_visualizar",
    icone: "mdi-account-group"
  },
  permissoes: {
    id: "permissoes",
    titulo: "Permissões",
    permissao: "cadastro_permissoes_visualizar",
    icone: "mdi-shield-check"
  },
  aparencia: { id: "aparencia", titulo: "Aparência", permissao: "aparencia_visualizar", icone: "mdi-palette" }
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
  "permissoes"
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

export type AcaoCadastro = "visualizar" | "criar" | "editar" | "excluir";

function codigoEhPermissao(codigo: string): codigo is Permissao {
  return permissoesCompartilhadas.some((permissao) => permissao === codigo);
}

// A mesma permissao que protege a API deve decidir se a acao aparece. Antes, as paginas de
// cadastro liberavam Novo/Editar para qualquer pessoa que conseguisse abrir a listagem; o clique
// terminava em 403 e fazia a interface prometer uma operacao que o usuario nao podia executar.
export function podeExecutarAcaoCadastro(permissoesUsuario: readonly Permissao[], item: ItemMenu, acao: AcaoCadastro) {
  const codigosTela = [item.permissao, ...(item.permissoesAlternativas ?? [])];
  const permissoesDaAcao = codigosTela
    .flatMap((codigo) => {
      const encontrado = codigo.match(/_(visualizar|criar|editar|excluir)$/);
      if (!encontrado) return [];
      return [codigo.replace(/_(visualizar|criar|editar|excluir)$/, `_${acao}`)];
    })
    .filter(codigoEhPermissao);
  return temAlgumaPermissao(permissoesUsuario, permissoesDaAcao);
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

// +Novo agrupa Saídas e Transferências. A consulta de Entradas continua no menu da tela.
export const opcoesNovo: AcaoNovo[] = [
  {
    id: "transferencias",
    titulo: "Transferências",
    subtitulo: "Nova transferência ou retorno / sangria",
    permissoes: ["transferencias_criar"],
    icone: "mdi-swap-horizontal",
    cor: "var(--cat-transferencias-base)",
    entidade: "transferencia"
  },
  {
    id: "saidas",
    titulo: "Saídas",
    subtitulo: "Despesa, mercadoria ou retirada",
    permissoes: ["despesas_criar", "mercadorias_criar", "retiradas_criar"],
    icone: "mdi-arrow-up-right",
    cor: "var(--cat-despesas-base)",
    entidade: "despesa"
  }
];

// Itens do "+ NOVO" que o perfil enxerga. Basta UMA das permissoes do eixo: quem so cria retirada
// continua vendo "Saidas".
export function acoesNovoPermitidas(permissoesUsuario: readonly Permissao[], caixaAberto = false) {
  return opcoesNovo.filter(
    (acao) =>
      temAlgumaPermissao(permissoesUsuario, acao.permissoes) ||
      (acao.id === "transferencias" && caixaAberto && temPermissao(permissoesUsuario, "caixa_operar"))
  );
}

// Categoria em que o modal de "Saidas" abre: a PRIMEIRA que o perfil pode criar — quem so cria
// retirada nao pode cair na Despesa e travar no salvar. As tres seguem alternaveis nos botoes do topo.
export function categoriaInicialSaida(permissoesUsuario: readonly Permissao[]): EntidadeOperacional {
  if (temPermissao(permissoesUsuario, "despesas_criar")) return "despesa";
  if (temPermissao(permissoesUsuario, "mercadorias_criar")) return "mercadoria";
  return "retirada";
}

export const secoesPermissoes = [
  {
    titulo: "Caixa e fechamento",
    prefixos: [
      "caixa_",
      "caixas_",
      "fechamento_com_diferenca",
      "fechamentos_caixa",
      "relatorio_fechamento",
      "menu_caixa",
      "menu_fechamento"
    ]
  },
  { titulo: "Transferências e cofre", prefixos: ["transferencias", "cadastro_lacres", "menu_transferencias"] },
  {
    titulo: "Lançamentos e pagamentos",
    prefixos: [
      "despesas",
      "mercadorias",
      "retiradas",
      "lancamentos_recorrencia",
      "contas_pagar",
      "menu_despesas",
      "menu_mercadorias",
      "menu_retiradas",
      "menu_contas_pagar"
    ]
  },
  {
    titulo: "Vendas, clientes e pedidos",
    prefixos: [
      "entradas",
      "relatorio_vendas",
      "cadastro_clientes",
      "pedidos",
      "campanhas",
      "promocoes",
      "menu_entradas",
      "menu_relatorio_vendas",
      "menu_clientes",
      "menu_pedidos",
      "menu_promocoes"
    ]
  },
  {
    titulo: "Produtos, estoque e fornecedores",
    prefixos: [
      "cadastro_produtos",
      "estoque_produtos",
      "conferencias_estoque",
      "agendamento_pedidos",
      // Permissoes da fundacao do novo Compras (migration 0060): catalogo fornecedor-produto e
      // carga do preco-base. Sem um prefixo aqui elas ficavam FORA de todas as secoes, e a tela de
      // Permissoes nao as mostrava — ninguem conseguia conceder o acesso pela interface, so pelo
      // cargo de referencia do seed. O gate `domain.test.ts` ("cada permissao visivel em exatamente
      // um modulo") estava vermelho por isso desde a entrega da Fase 1.
      "compras_",
      "perdas_sobras",
      "cadastro_fornecedores",
      "cadastro_ficha_tecnica",
      "cadastro_ingredientes",
      "cadastro_unidades_medida",
      "relatorio_produtos",
      "menu_produtos",
      "menu_estoque_produtos",
      "menu_conferencias_estoque",
      "menu_agendamento_pedidos",
      "menu_cadastro_compras",
      "menu_solicitacao_compra",
      "menu_pedidos_finalizados",
      "menu_perdas_sobras",
      "menu_fornecedores",
      "menu_ficha_tecnica",
      "menu_ingredientes",
      "menu_unidades",
      "menu_relatorio_produtos"
    ]
  },
  {
    titulo: "Pessoas e departamento pessoal",
    prefixos: [
      "admissoes_",
      // Importações, exportações e configuração Conplus/Questor são atos do DP.
      "conplus_",
      "cadastro_colaboradores",
      "cadastro_areas_setores",
      "cadastro_turnos",
      "cadastro_funcoes",
      "folha_ponto",
      "avaliacao_",
      "relatorio_faltas",
      "relatorio_advertencias",
      "menu_admissoes",
      "menu_colaboradores",
      "menu_areas_setores",
      "menu_turnos",
      "menu_funcoes_operacionais",
      "menu_folha_ponto",
      "menu_avaliacao_",
      "menu_relatorio_faltas",
      "menu_relatorio_advertencias"
    ]
  },
  {
    titulo: "Financeiro e fiscal",
    prefixos: [
      "cadastro_contas",
      "cadastro_formas_pagamento",
      "relatorio_dre",
      "relatorio_fiscal",
      "cadastro_fiscal_produtos",
      "notas_fiscais",
      "cadastro_patrimonio",
      "menu_contas",
      "menu_formas_pagamento",
      "menu_relatorio_dre",
      "menu_relatorio_fiscal",
      "menu_fiscal_produtos",
      "menu_notas_fiscais",
      "menu_patrimonio"
    ]
  },
  {
    titulo: "Administração do sistema",
    prefixos: [
      "cadastro_empresas",
      "cadastro_usuarios",
      "cadastro_permissoes",
      "cadastro_grupos",
      "cadastro_socios_gestores",
      "cadastro_pdv",
      "aparencia",
      "integracoes",
      "mensagens_admin",
      "menu_empresas",
      "menu_usuarios",
      "menu_permissoes",
      "menu_grupos",
      "menu_pdv",
      "menu_aparencia",
      "menu_integracoes"
    ]
  },
  { titulo: "Visibilidade de telas", prefixos: ["menu_"] }
];

export type SecaoPermissao = (typeof secoesPermissoes)[number];

export function permissaoPertenceASecao(permissao: string, secao: SecaoPermissao) {
  const correspondencias = secoesPermissoes.flatMap((outra) =>
    outra.prefixos.filter((prefixo) => permissao.startsWith(prefixo)).map((prefixo) => ({ secao: outra, prefixo }))
  );
  if (!correspondencias.length) return secao.prefixos.length === 0;
  const maisEspecifica = correspondencias.sort((a, b) => b.prefixo.length - a.prefixo.length)[0];
  return maisEspecifica?.secao === secao;
}

export function opcoesVazias(): Opcoes {
  return {
    empresas: [],
    contas: [],
    formasPagamento: [],
    fornecedores: [],
    clientes: [],
    colaboradores: [],
    sociosGestores: [],
    maquininhas: [],
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
    pdvs: [],
    turnos: [],
    gruposPatrimonio: [],
    patrimonioItens: []
  };
}

export function formOperacaoVazio(): OperacaoForm {
  const hoje = diaNegocio(new Date());
  return {
    dataReferencia: hoje,
    dataVencimento: hoje,
    dataPagamento: "",
    descricao: "",
    observacao: "",
    valorOriginal: "",
    valorEspecieDeclarado: "",
    valorMoedasDeclarado: "",
    valorAcrescimo: "",
    descricaoAcrescimo: "",
    jurosTipo: "",
    jurosValorInformado: "",
    valorDesconto: "",
    descricaoDesconto: "",
    descontoGeralTipo: "",
    descontoGeralValor: "",
    contaOrigemId: "",
    contaDestinoId: "",
    fornecedorId: "",
    colaboradorId: "",
    socioGestorId: "",
    credorTipo: "",
    dataDocumentoFiscal: "",
    numeroDocumentoFiscal: "",
    fotoDocumentoUrl: "",
    fotoNotaUrl: "",
    grupoDespesaId: "",
    grupoMercadoriaId: "",
    grupoRetiradaId: "",
    numeroLacre: "",
    nLacreDoc: "",
    lacresRetorno: [],
    lacreFechamentoPlanejado: "",
    agendadaPara: "",
    dataRecebimento: "",
    tempoConfirmacao: null,
    contasDestinoIds: [],
    recorrenciaId: "",
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
    numeroSerie: "",
    saldoInicial: "",
    usuariosIds: [],
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
    matriculaPrefixo: "TNP",
    fusoHorario: "America/Sao_Paulo",
    comprasPrazoRespostaHoras: "",
    email: "",
    senha: "",
    role: "usuario_comum",
    // Criacao: as empresas selecionadas SEMPRE vao no payload — nao ha vinculo previo a preservar.
    empresaIdsTocado: true,
    cpf: "",
    sigla: "",
    horaInicio: "",
    horaFim: "",
    etiquetaTurno: "",
    diasSemanaTurno: [],
    marca: "",
    contaId: "",
    ativo: true,
    tipoGrupo: "despesa",
    grupoPaiId: "",
    tipoAreaSetor: "area",
    tipoPatrimonio: "item",
    sig: "",
    grupoPatrimonioId: "",
    areaId: "",
    setorPaiId: "",
    setorId: "",
    turnoPadraoId: "",
    colaboradorId: "",
    // Novo usuario nasce junto com a sua pessoa operacional. Antes este valor era `false` e a tela
    // abria num beco sem saida quando ainda nao havia colaborador cadastrado: o select mostrava
    // apenas "Novo", mas os campos de CPF/setor/cargo permaneciam escondidos. Vincular uma pessoa
    // existente continua disponivel no mesmo formulario, como escolha explicita.
    novoColaborador: true,
    novoColaboradorNome: "",
    novoColaboradorCpf: "",
    novoColaboradorSetorId: "",
    novoColaboradorCargoId: "",
    novoColaboradorPdvPadraoId: "",
    novoColaboradorTurnoPadraoId: "",
    cargoId: "",
    empresaIds: [],
    tipoPermissao: "cargo",
    usuarioId: "",
    regras: {}
  };
}

export function temaPadrao(): TemaAplicacao {
  return {
    corPrimaria: "#6515dd",
    corSecundaria: "#35128c",
    corFundo: "#f4f6fa",
    corCartao: "#ffffff",
    corSucesso: "#16a34a",
    corAviso: "#b7791f",
    corErro: "#dc2626"
  };
}

export function dinheiro(valor: number | string) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function mensagemErro(error: unknown) {
  if (error instanceof Error) {
    try {
      const dados = JSON.parse(error.message) as { message?: string; error?: string; erro?: string };
      return acentuarMensagemExibida(dados.message || dados.error || dados.erro || error.message);
    } catch {
      return acentuarMensagemExibida(error.message);
    }
  }
  return "Não foi possível concluir a ação.";
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
    sociosGestores: itensDaEmpresa(listas.sociosGestores, idEmpresa),
    maquininhas: itensDaEmpresa(listas.maquininhas, idEmpresa),
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
    pdvs: itensDaEmpresa(listas.pdvs, idEmpresa),
    turnos: itensDaEmpresa(listas.turnos, idEmpresa),
    // Patrimonio (D2): alimenta o campo Grupo da discriminacao (§5, item 6) alem da propria tela.
    // Sem este filtro as duas listas vazavam por `...listas` com grupo de OUTRA empresa — e o
    // servidor rejeitaria o lancamento ("Grupo de patrimonio"), sem a pessoa entender por que.
    gruposPatrimonio: itensDaEmpresa(listas.gruposPatrimonio, idEmpresa),
    patrimonioItens: itensDaEmpresa(listas.patrimonioItens, idEmpresa)
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
  // Patrimonio (D2) tem duas entidades na mesma tela, como areas/setores: o formulario diz qual.
  if (tela === "patrimonio") return form?.tipoPatrimonio === "grupo" ? "patrimonio-grupos" : "patrimonio-itens";
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
    socios_gestores: "socios-gestores",
    maquininhas: "maquininhas",
    produtos: "produtos"
  };
  return mapa[tela] ?? tela.replaceAll("_", "-");
}

// Reconstroi o bloco fiscal do formulario a partir da linha (JSON) da listagem, para edicao.
export function formCadastroDeLinha(
  linha: Record<string, string | undefined>,
  regras: Record<string, boolean>
): CadastroForm {
  return {
    ...formCadastroVazio(),
    nome: linha.nome ?? "",
    numeroSerie: linha.numeroSerie ?? "",
    // Conta com fundo (D8): reabre o fundo digitado e as marcacoes de quem opera a conta. Sem isso
    // editar o nome zeraria o fundo e apagaria todos os vinculos no salvar.
    saldoInicial: linha.saldoInicial ?? "",
    usuariosIds: linha.usuariosIds ? linha.usuariosIds.split(",").filter(Boolean) : [],
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
    matriculaPrefixo: linha.matriculaPrefixo ?? "TNP",
    fusoHorario: linha.fusoHorario ?? "America/Sao_Paulo",
    comprasPrazoRespostaHoras: linha.comprasPrazoRespostaHoras ?? "",
    email: linha.email ?? "",
    // SEM default. Este e o formulario de EDICAO: `|| "usuario_comum"` transformava "a linha chegou
    // sem papel" em "o papel dele e comum", e o salvar seguinte REBAIXAVA um usuario_admin sem
    // ninguem pedir. Papel desconhecido vira "" e a tela recusa salvar (bloqueioCadastroUsuario).
    // Valor fora do catalogo tambem cai em "": e desconhecido do mesmo jeito.
    role: rolesUsuario.includes(linha.role as RoleUsuario) ? (linha.role as RoleUsuario) : "",
    // Edicao: comeca INTOCADO. A grade nao conhece as empresas reais do alvo (a listagem e recortada
    // ao escopo da tela), entao enviar `empresaIds` sem o operador ter pedido apagaria os vinculos que
    // a tela nao enxerga. So o clique nos chips liga isto.
    empresaIdsTocado: false,
    cpf: linha.cpf ?? "",
    sigla: linha.sigla ?? "",
    horaInicio: (linha.inicio ?? "").slice(0, 5),
    horaFim: (linha.fim ?? "").slice(0, 5),
    // Vem da linha da grade, que ja traz o valor gravado. O formulario SEMPRE mostra o que existe —
    // e por isso salvar pela tela nunca apaga sem querer: o campo chega preenchido.
    etiquetaTurno: (linha.etiquetaTurno as CadastroForm["etiquetaTurno"]) || "",
    diasSemanaTurno: linha.diasSemanaTurno ? linha.diasSemanaTurno.split(",") : [],
    marca: linha.marca ?? "",
    contaId: linha.contaId ?? "",
    ativo: !["Nao", "Não"].includes(linha.ativo ?? ""),
    tipoGrupo: (linha.tipoGrupo as CadastroForm["tipoGrupo"]) || "despesa",
    grupoPaiId: linha.grupoPaiId ?? "",
    tipoAreaSetor:
      (linha.tipoAreaSetor as CadastroForm["tipoAreaSetor"]) || (linha.areaId || linha.setorPaiId ? "setor" : "area"),
    tipoPatrimonio: (linha.tipoPatrimonio as CadastroForm["tipoPatrimonio"]) || "item",
    sig: linha.sig ?? "",
    grupoPatrimonioId: linha.grupoPatrimonioId ?? "",
    areaId: linha.areaId ?? "",
    setorPaiId: linha.setorPaiId ?? "",
    setorId: linha.setorId ?? "",
    turnoPadraoId: linha.turnoPadraoId ?? "",
    colaboradorId: linha.colaboradorId ?? "",
    // Formulario reconstruido da grade e EDICAO. Nunca herdar o default de criacao acima, senao
    // editar somente o e-mail tentaria fabricar e revincular outro colaborador.
    novoColaborador: false,
    cargoId: linha.cargoId ?? "",
    empresaIds: linha.empresaIds ? String(linha.empresaIds).split(",") : [],
    usuarioId: linha.usuarioId ?? "",
    regras
  };
}

export function rotaTela(tela: string) {
  const rotasConplus: Record<string, string> = {
    conplus_folha_05: "/conplus/folha-05",
    conplus_adiantamento_20: "/conplus/adiantamento-20",
    conplus_rescisoes: "/conplus/rescisoes",
    conplus_ferias: "/conplus/ferias",
    conplus_exportar: "/conplus/exportar"
  };
  return rotasConplus[tela] ?? (tela === "fechamento" ? "/pendencias" : `/${tela}`);
}

export { temPermissao };
