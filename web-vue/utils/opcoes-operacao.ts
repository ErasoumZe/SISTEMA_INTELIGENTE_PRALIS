// Quais listas de OPCOES o modal de cada operacao precisa — o dono unico da resposta.
//
// Vive fora do `AppWorkspace` pelo mesmo motivo de `credor-categoria` e `perfil-caixa`: enquanto o
// mapa era uma const dentro do `<script setup>`, nenhum teste alcancava a estrutura de producao e a
// unica forma de "provar" o carregamento era reimplementa-la no harness — o padrao que ja produziu
// tres mutacoes verdes nesta entrega.
//
// A carga em si (o `Record` de tarefas e o `Promise.all` tolerante a falha) continua no
// `AppWorkspace`, porque depende dos refs da tela. O compilador amarra as duas pontas: `tarefas` e
// `rotuloOpcao` sao `Record<ChaveOpcaoOperacao, …>`, entao uma chave acrescentada aqui sem tarefa la
// nao compila.
import type { EntidadeOperacional } from "~/types/padaria";

export type ChaveOpcaoOperacao =
  | "contas"
  | "fornecedores"
  | "colaboradores"
  | "sociosGestores"
  | "produtos"
  | "formasPagamento"
  | "pdvs"
  | "unidadesMedida"
  | "patrimonioItens"
  | "grupos";

// O +NOVO e global (abre qualquer operacao de qualquer tela), entao as opcoes sao carregadas por
// ENTIDADE ao abrir o modal — senao os selects (fornecedor, grupo, conta, colaborador...) ficam "No
// data available" quando a operacao e aberta fora da sua propria tela (ex.: abrir "Nova Despesa"
// estando na tela Entradas).
export const opcoesPorEntidade: Record<EntidadeOperacional, ChaveOpcaoOperacao[]> = {
  venda: ["contas", "produtos", "pdvs", "formasPagamento"],
  // B-1: `colaboradores` entrou porque a despesa oferece Colaborador como credor e a lista nao era
  // pedida por este caminho — pelo "+ NOVO" o chip abria um select vazio, enquanto pela tela Despesas
  // funcionava. `patrimonioItens` e `colaboradores` tambem sao as origens do item da DISCRIMINACAO
  // (R-135), que pelo "+ NOVO" era impossivel de preencher.
  despesa: ["contas", "fornecedores", "colaboradores", "patrimonioItens", "grupos"],
  mercadoria: ["contas", "fornecedores", "produtos", "unidadesMedida", "grupos"],
  // R-128 fez do FORNECEDOR o credor padrao da retirada — e o chip que ja vem ativo ao abrir. Sem
  // carregar a lista, o caminho normal da retirada abria um select vazio. `colaboradores` fica para o
  // credor LEGADO reabrir com nome, nao para lancamento novo.
  retirada: ["contas", "fornecedores", "colaboradores", "sociosGestores", "grupos"],
  transferencia: ["contas"]
};

// Rotulo humano de cada lista, usado no aviso discreto de `avisoOpcoesIndisponiveis`.
export const rotuloOpcao: Record<ChaveOpcaoOperacao, string> = {
  contas: "Contas",
  fornecedores: "Fornecedores",
  colaboradores: "Colaboradores",
  sociosGestores: "Sócios e Gestores",
  produtos: "Produtos",
  formasPagamento: "Formas de pagamento",
  pdvs: "PDVs",
  unidadesMedida: "Unidades de medida",
  patrimonioItens: "Itens de patrimônio",
  grupos: "Grupos"
};
