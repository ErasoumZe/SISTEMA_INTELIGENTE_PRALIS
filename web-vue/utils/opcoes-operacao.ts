// Quais listas de OPCOES o modal de cada operacao precisa, e a carga tolerante a falha delas.
//
// Vive fora do `AppWorkspace` pelo mesmo motivo de `credor-categoria` e `perfil-caixa`: enquanto o
// mapa era uma const dentro do `<script setup>`, nenhum teste alcancava a estrutura de producao e a
// unica forma de "provar" o carregamento era reimplementa-la no harness — o padrao que ja produziu
// tres mutacoes verdes nesta entrega.
//
// O `Record` de TAREFAS continua no `AppWorkspace`, porque cada tarefa escreve num ref da tela. O
// compilador amarra as duas pontas: `tarefas` e `rotuloOpcao` sao `Record<ChaveOpcaoOperacao, …>`,
// entao uma chave acrescentada aqui sem tarefa la nao compila.
//
// ESCOPO HONESTO: este modulo e o dono da resposta para o modal aberto pelo "+ NOVO". O bloco
// `carregarDadosPagina` do `AppWorkspace` continua decidindo, com URLs e rotulos proprios, quais
// listas o MESMO modal tera quando aberto da tela correspondente. Sao dois caminhos para o mesmo
// ato, e o segundo nao foi removido nesta entrega — esta registrado no relatorio como divida.
import type { EntidadeOperacional } from "~/types/padaria";
import { carregarOpcaoOpcional } from "~/utils/opcoes-formulario";

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
  | "gruposPatrimonio"
  | "grupos";

// O +NOVO e global (abre qualquer operacao de qualquer tela), entao as opcoes sao carregadas por
// ENTIDADE ao abrir o modal — senao os selects (fornecedor, grupo, conta, colaborador...) ficam "No
// data available" quando a operacao e aberta fora da sua propria tela (ex.: abrir "Nova Despesa"
// estando na tela Entradas).
export const opcoesPorEntidade: Record<EntidadeOperacional, ChaveOpcaoOperacao[]> = {
  venda: ["contas", "produtos", "pdvs", "formasPagamento"],
  // B-1: `colaboradores` entrou porque a despesa oferece Colaborador como credor e a lista nao era
  // pedida por este caminho — pelo "+ NOVO" o chip abria um select vazio, enquanto pela tela Despesas
  // funcionava. `patrimonioItens` e `colaboradores` tambem sao as origens do ITEM da DISCRIMINACAO
  // (R-135), que pelo "+ NOVO" era impossivel de preencher.
  //
  // `gruposPatrimonio` anda junto com `patrimonioItens` e nao e opcional: escolher um item de
  // patrimonio grava `grupoPatrimonioId` e o select de Grupo passa a valer `pat:<id>`, mas o
  // `<optgroup>` correspondente so renderiza se a lista de grupos estiver carregada. Sem ela, a
  // coluna Grupo aparece VAZIA com um grupo ja gravado por baixo — pior que nao oferecer.
  despesa: ["contas", "fornecedores", "colaboradores", "patrimonioItens", "gruposPatrimonio", "grupos"],
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
  gruposPatrimonio: "Grupos de patrimônio",
  grupos: "Grupos"
};

/**
 * Carrega as opcoes da operacao e devolve os ROTULOS do que faltou.
 *
 * Mora aqui, e nao no `AppWorkspace`, porque e esta orquestracao — e nao o mapa — que sustenta o
 * contrato de erro: cada lista carrega ISOLADA, entao um 403 numa opcao secundaria nao impede as
 * demais, nao trava o modal e nao apaga o que ja estava carregado (o `undefined` como valor de falha
 * faz a tarefa nao chegar a atribuir). Enquanto isso vivia dentro do componente, o teste tinha de
 * remontar o `Promise.all` no harness — e ai trocar `carregarOpcaoOpcional` por `tarefas[chave]()`
 * na producao matava a tolerancia inteira com a suite verde.
 *
 * Falha silenciosa e proibida: o chamador transforma o retorno em aviso com
 * `avisoOpcoesIndisponiveis`.
 */
export async function carregarOpcoesDaOperacao(
  entidade: EntidadeOperacional,
  tarefas: Record<ChaveOpcaoOperacao, () => Promise<void>>
): Promise<string[]> {
  const faltas: string[] = [];
  await Promise.all(
    opcoesPorEntidade[entidade].map((chave) =>
      carregarOpcaoOpcional(faltas, rotuloOpcao[chave], tarefas[chave], undefined)
    )
  );
  return faltas;
}
