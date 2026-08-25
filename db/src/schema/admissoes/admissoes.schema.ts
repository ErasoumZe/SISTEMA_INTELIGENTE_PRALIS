// Dominio de ADMISSAO, deliberadamente separado de `cadastro`. O periodo de teste nao e cadastro
// operacional: ele nao cria colaborador, nao tem `colaborador_id` e nao efetiva ninguem. Manter o
// subcaminho proprio faz a fronteira aparecer no import (`@padaria/db/schema/admissoes`), em vez de
// depender de quem le lembrar da regra.
export { admissoesTestes, admissoesTestesHistorico } from "../app.schema.js";
