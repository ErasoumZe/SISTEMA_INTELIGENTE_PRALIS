// Dominio de ADMISSAO, deliberadamente separado de `cadastro`. O periodo de teste nao e cadastro
// operacional: ele nao cria colaborador, nao tem `colaborador_id` e nao efetiva ninguem. Manter o
// subcaminho proprio faz a fronteira aparecer no import (`@padaria/db/schema/admissoes`), em vez de
// depender de quem le lembrar da regra.
export { admissoesFuncoes, admissoesTestes, admissoesTestesHistorico } from "../app.schema.js";

// `admissoesFuncoes` sai por aqui, e nao por `cadastro`, pela mesma fronteira: funcao operacional
// e o que a pessoa FAZ, e nao tem relacao com `cargos`, que e catalogo de ACESSO e chave de
// `permissoes_cargos`. Sao listas diferentes para perguntas diferentes.
