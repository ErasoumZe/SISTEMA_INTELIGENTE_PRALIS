import * as autenticacaoSchema from "./autenticacao/autenticacao.schema.js";
import * as cadastroSchema from "./cadastro/cadastro.schema.js";
import * as caixaSchema from "./caixa/caixa.schema.js";
import * as despesaSchema from "./despesa/despesa.schema.js";
import * as mercadoriaSchema from "./mercadoria/mercadoria.schema.js";
import * as notaFiscalSchema from "./nota-fiscal/nota-fiscal.schema.js";
import * as retiradaSchema from "./retirada/retirada.schema.js";
import * as temaSchema from "./tema/tema.schema.js";
import * as transferenciaSchema from "./transferencia/transferencia.schema.js";
import * as vendaSchema from "./venda/venda.schema.js";

export const schema = {
  ...autenticacaoSchema,
  ...cadastroSchema,
  ...caixaSchema,
  ...despesaSchema,
  ...mercadoriaSchema,
  ...notaFiscalSchema,
  ...retiradaSchema,
  ...temaSchema,
  ...transferenciaSchema,
  ...vendaSchema
};

export type Schema = typeof schema;
