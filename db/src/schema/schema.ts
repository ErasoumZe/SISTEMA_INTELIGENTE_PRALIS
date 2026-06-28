import * as autenticacaoSchema from "./autenticacao/autenticacao.schema.js";
import * as cadastroSchema from "./cadastro/cadastro.schema.js";
import * as caixaSchema from "./caixa/caixa.schema.js";
import * as movimentacaoSchema from "./movimentacao/movimentacao.schema.js";
import * as temaSchema from "./tema/tema.schema.js";
import * as vendaSchema from "./venda/venda.schema.js";

export const schema = {
  ...autenticacaoSchema,
  ...cadastroSchema,
  ...caixaSchema,
  ...movimentacaoSchema,
  ...temaSchema,
  ...vendaSchema
};

export type Schema = typeof schema;
