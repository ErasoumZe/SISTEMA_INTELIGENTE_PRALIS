// Esquema de permissoes por cargo, usado pelo seed de referencia de PRODUCAO
// (db/seed-referencia-prod.ts). Espelha o mesmo esquema de db/seed.ts (dev) — se um mudar o
// conjunto de permissoes de um cargo, ajuste o outro. So define dados/funcoes puras (sem efeito
// colateral / sem acesso a banco): seguro de importar.
import { permissoes, type Permissao, type RegrasPermissoes } from "@padaria/shared";

const telasSomenteCaixaAberto = new Set<string>([
  "entradas",
  "transferencias",
  "despesas",
  "mercadorias",
  "retiradas",
  "fechamento",
  "relatorio_produtos"
]);

const permissaoAcessoPorTela = {
  entradas: "entradas_visualizar",
  transferencias: "transferencias_visualizar",
  despesas: "despesas_visualizar",
  mercadorias: "mercadorias_visualizar",
  retiradas: "retiradas_visualizar",
  // NOTA (auditoria P2): fechamento_com_diferenca_visualizar e apenas GATE DE MENU (mostra/oculta a
  // tela). Nenhuma rota o valida; a tela de fechamento roda sob caixa_operar por baixo. Mantido como
  // permissao de acesso do menu "fechamento" so para visibilidade.
  // TODO(M3): o enforcement real de "lancar com diferenca" + a notificacao a Tesouraria/Gerencia/
  // Financeiro/Admin sao R9/D8 (doc 02) — Fase 1 NAO muda comportamento aqui.
  fechamento: "fechamento_com_diferenca_visualizar",
  relatorio_produtos: "relatorio_produtos_visualizar",
  malotes: "cadastro_malotes_visualizar",
  caixa: "caixa_operar",
  promocoes: "promocoes_visualizar",
  relatorio_faltas: "relatorio_faltas_visualizar",
  relatorio_advertencias: "relatorio_advertencias_visualizar",
  pedidos: "pedidos_visualizar",
  perdas_sobras: "perdas_sobras_visualizar",
  estoque_produtos: "estoque_produtos_visualizar",
  relatorio_dre: "relatorio_dre_visualizar",
  clientes: "cadastro_clientes_visualizar",
  fornecedores: "cadastro_fornecedores_visualizar",
  produtos: "cadastro_produtos_visualizar",
  colaboradores: "cadastro_colaboradores_visualizar",
  folha_ponto: "folha_ponto_visualizar",
  avaliacao_qualidade: "avaliacao_qualidade_visualizar",
  avaliacao_colaboradores: "avaliacao_colaboradores_visualizar",
  relatorio_fiscal: "relatorio_fiscal_visualizar",
  fiscal_produtos: "cadastro_fiscal_produtos_visualizar",
  patrimonio: "cadastro_patrimonio_visualizar",
  ficha_tecnica: "cadastro_ficha_tecnica_visualizar",
  ingredientes: "cadastro_ingredientes_visualizar",
  relatorio_vendas: "relatorio_vendas_visualizar",
  notas_fiscais: "notas_fiscais_visualizar",
  contas_pagar: "contas_pagar_visualizar",
  integracoes: "integracoes_visualizar",
  contas: "cadastro_contas_visualizar",
  grupos: "cadastro_grupos_visualizar",
  pdv: "cadastro_pdv_visualizar",
  formas_pagamento: "cadastro_formas_pagamento_visualizar",
  empresas: "cadastro_empresas_visualizar",
  unidades: "cadastro_unidades_medida_visualizar",
  areas_setores: "cadastro_areas_setores_visualizar",
  usuarios: "cadastro_usuarios_visualizar",
  permissoes: "cadastro_permissoes_visualizar",
  aparencia: "aparencia_visualizar"
} as const satisfies Record<string, Permissao>;

type TelaPermissao = keyof typeof permissaoAcessoPorTela;
type ConfigPermissoesCargo = {
  ativas?: TelaPermissao[];
  desabilitadas?: TelaPermissao[];
  somenteCaixaAberto?: TelaPermissao[];
  extras?: Permissao[];
  todas?: boolean;
};

function menuMostrar(tela: TelaPermissao) {
  return `menu_${tela}_mostrar` as Permissao;
}

function menuDesabilitado(tela: TelaPermissao) {
  return `menu_${tela}_desabilitado` as Permissao;
}

function menuSomenteCaixaAberto(tela: TelaPermissao) {
  return `menu_${tela}_somente_caixa_aberto` as Permissao;
}

export function permissoesDoCargo(config: ConfigPermissoesCargo): Permissao[] {
  if (config.todas) return [...permissoes];
  const resultado = new Set<Permissao>(config.extras ?? []);
  for (const tela of config.ativas ?? []) {
    resultado.add(permissaoAcessoPorTela[tela]);
    resultado.add(menuMostrar(tela));
  }
  for (const tela of config.somenteCaixaAberto ?? []) {
    if (telasSomenteCaixaAberto.has(tela)) resultado.add(menuSomenteCaixaAberto(tela));
  }
  for (const tela of config.desabilitadas ?? []) {
    resultado.add(menuDesabilitado(tela));
  }
  return [...resultado];
}

export function regrasPermissoes(lista: Permissao[]): RegrasPermissoes {
  return Object.fromEntries(lista.map((permissao) => [permissao, true]));
}

// Normaliza o nome do cargo para casar com a referencia (trim + minusculas + sem acentos), para que
// "Gerencia"/"Gerência"/"gerencia " apontem para o mesmo padrao. Usado pelo bootstrap e pelo endpoint
// "restaurar padrao do cargo".
export function normalizarNomeCargo(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// Ciclo de vida R7/R10 (Fase 1, doc 09 §4): gera os codigos de acao por dominio de lancamento
// financeiro. Transferencia entra na distribuicao por paridade do §4, ainda que pagar/*_dpago
// fiquem inertes nela (sem dataPagamento) ate o M3.
const DOMINIOS_LANCAMENTO_FINANCEIRO = ["despesas", "mercadorias", "retiradas", "transferencias"] as const;
function acoesLancamentoPorDominio(...acoes: string[]): Permissao[] {
  return DOMINIOS_LANCAMENTO_FINANCEIRO.flatMap((dominio) => acoes.map((acao) => `${dominio}_${acao}` as Permissao));
}

export const permissoesPorCargo: Record<string, Permissao[]> = {
  Caixa: permissoesDoCargo({
    ativas: [
      "caixa",
      "entradas",
      "transferencias",
      "despesas",
      "mercadorias",
      "retiradas",
      "fechamento",
      "relatorio_produtos"
    ],
    somenteCaixaAberto: [
      "entradas",
      "transferencias",
      "despesas",
      "mercadorias",
      "retiradas",
      "fechamento",
      "relatorio_produtos"
    ],
    extras: ["entradas_criar", "transferencias_criar", "despesas_criar", "mercadorias_criar", "retiradas_criar"]
  }),
  Tesouraria: permissoesDoCargo({
    ativas: ["malotes", "transferencias"],
    // Lanca transferencia + CONFERE (D7 — conferencia = Financeiro/Gerencia/Tesouraria). Confere no
    // dominio que acessa (transferencias); os demais dominios ela nao ve. Tambem gerencia os LACRES
    // (selo do movimento), espelhando o cadastro de malotes.
    extras: [
      "cadastro_malotes_criar",
      "cadastro_malotes_editar",
      "transferencias_criar",
      "transferencias_conferir",
      "cadastro_lacres_visualizar",
      "cadastro_lacres_criar",
      "cadastro_lacres_editar"
    ]
  }),
  Gerencia: permissoesDoCargo({
    ativas: [
      "caixa",
      "entradas",
      "transferencias",
      "despesas",
      "mercadorias",
      "retiradas",
      "fechamento",
      "relatorio_produtos",
      "promocoes",
      "relatorio_faltas",
      "relatorio_advertencias",
      "pedidos",
      "perdas_sobras",
      "estoque_produtos",
      "relatorio_dre",
      "clientes"
    ],
    // Gerencia acessa o historico completo do caixa (decisao de negocio: pergunta 1 = sim).
    extras: [
      "entradas_criar",
      "transferencias_criar",
      "transferencias_editar",
      "despesas_criar",
      "despesas_editar",
      "despesas_discriminar",
      "mercadorias_criar",
      "mercadorias_discriminar",
      // Gerencia aprova as compras vindas de NF-e (fila de aprovacao) e os pedidos.
      "mercadorias_aprovar",
      "pedidos_aprovar",
      "retiradas_criar",
      "retiradas_editar",
      "notas_fiscais_importar",
      "caixas_gerenciar",
      "caixa_alterar_horario",
      "cadastro_turnos_visualizar",
      "cadastro_turnos_criar",
      "cadastro_turnos_editar",
      "cadastro_turnos_excluir",
      // Ciclo de vida R7/R10 (doc 09 §4): Gerencia EFETUA, edita, exclui e confere — NAO paga.
      // (mercadorias_editar faltava; os demais editar ela ja tinha acima.)
      "mercadorias_editar",
      // Gerencia configura o ESCOPO de conta por usuario (FOTO 4: quais contas cada um opera).
      "cadastro_contas_usuarios_visualizar",
      "cadastro_contas_usuarios_criar",
      "cadastro_contas_usuarios_editar",
      "cadastro_contas_usuarios_excluir",
      ...acoesLancamentoPorDominio("efetuar", "conferir", "excluir")
    ]
  }),
  Compras: permissoesDoCargo({
    ativas: ["pedidos", "mercadorias", "fornecedores", "produtos"],
    extras: ["mercadorias_criar", "mercadorias_discriminar", "cadastro_fornecedores_criar", "cadastro_produtos_criar"]
  }),
  DP: permissoesDoCargo({
    ativas: ["despesas", "colaboradores", "folha_ponto"],
    extras: ["despesas_criar", "despesas_discriminar", "cadastro_colaboradores_criar", "cadastro_colaboradores_editar"]
  }),
  RH: permissoesDoCargo({
    ativas: ["avaliacao_qualidade", "avaliacao_colaboradores"]
  }),
  Fiscal: permissoesDoCargo({
    ativas: ["relatorio_fiscal", "fiscal_produtos"]
  }),
  "Diretor de Operacoes": permissoesDoCargo({
    ativas: ["relatorio_dre", "patrimonio", "ficha_tecnica", "ingredientes"]
  }),
  // Diretor Geral vira um cargo normal (sem "todas"): o acesso total do diretor vem do role
  // usuario_admin (decisao de negocio: pergunta 3). Assim a tela de permissoes do cargo fica limpa.
  "Diretor Geral": permissoesDoCargo({}),
  Financeiro: permissoesDoCargo({
    ativas: [
      "relatorio_vendas",
      "notas_fiscais",
      "contas_pagar",
      "transferencias",
      "despesas",
      "mercadorias",
      "retiradas",
      "relatorio_dre",
      "grupos",
      "pdv",
      "formas_pagamento"
    ],
    extras: [
      "relatorio_vendas_comprovantes_criar",
      "transferencias_criar",
      "transferencias_editar",
      "despesas_criar",
      "despesas_editar",
      "despesas_discriminar",
      "mercadorias_criar",
      "mercadorias_discriminar",
      "mercadorias_editar",
      "retiradas_criar",
      "retiradas_editar",
      "notas_fiscais_importar",
      "cadastro_grupos_criar",
      "cadastro_pdv_criar",
      "cadastro_formas_pagamento_criar",
      // Ciclo de vida R7/R10 (doc 09 §4): Financeiro tem o ciclo COMPLETO, incluindo pagar e as
      // variantes *_dpago (mexer em lancamento ja pago). E o unico cargo com _dpago (fora o admin).
      ...acoesLancamentoPorDominio(
        "pagar",
        "efetuar",
        "conferir",
        "editar_dpago",
        "visualizar_dpago",
        "excluir",
        "excluir_dpago"
      )
    ]
  })
};

const padraoPorNomeNormalizado = new Map(
  Object.entries(permissoesPorCargo).map(([nome, lista]) => [normalizarNomeCargo(nome), lista])
);

// Padrao de permissoes de um cargo pelo nome (normalizado). null quando o cargo nao tem referencia
// (ex.: cargo custom criado pela operacao). Alimenta o "restaurar padrao do cargo".
export function permissoesPadraoDoCargo(nome: string): Permissao[] | null {
  return padraoPorNomeNormalizado.get(normalizarNomeCargo(nome)) ?? null;
}
