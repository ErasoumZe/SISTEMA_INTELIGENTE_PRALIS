// Dominio de ADMISSAO, deliberadamente separado de `cadastro`. O periodo de teste nao e cadastro
// operacional: ele nao cria colaborador, nao tem `colaborador_id` e nao efetiva ninguem. Manter o
// subcaminho proprio faz a fronteira aparecer no import (`@padaria/db/schema/admissoes`), em vez de
// depender de quem le lembrar da regra.
export {
  admissoesConvites,
  admissoesProcessos,
  admissoesProcessosDependentes,
  admissoesProcessosDependentesAnexos,
  admissoesProcessosFicha,
  admissoesProcessosFichaAnexos,
  admissoesProcessosHistorico,
  admissoesProcessosInternos,
  admissoesGoogleSincronizacoes,
  admissoesGoogleDependentes,
  admissoesGoogleArquivos,
  admissoesTestes,
  admissoesTestesHistorico
} from "../app.schema.js";

// A FUNCAO OPERACIONAL nao sai por aqui. Ela e `funcoesOperacionais`, exportada por
// `@padaria/db/schema/cadastro`: catalogo operacional compartilhavel por empresa, que nasceu nesta
// vertical mas nao pertence a ela.
//
// O periodo de teste continua apontando para a funcao por `funcao_id` — o que mudou foi o DONO do
// catalogo, nao a referencia.
