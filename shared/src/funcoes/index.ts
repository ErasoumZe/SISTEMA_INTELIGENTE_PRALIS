import { z } from "zod";

export { empresaQuerySchema as funcoesOperacionaisQuerySchema } from "../api/index.js";

/**
 * O catalogo de FUNCOES OPERACIONAIS — o que a pessoa faz.
 *
 * Nao confundir com `cargos`, que e o catalogo de ACESSO — o que a pessoa pode ver. Sao duas
 * perguntas diferentes, e responder as duas com a mesma lista foi o defeito que a decisao de
 * 26/08/2026 corrigiu: registrar um periodo de teste de PADEIRO exigiria criar um cargo de acesso
 * chamado PADEIRO, e toda regra de permissao por cargo passaria a enxerga-lo.
 *
 * Por isso este contrato NAO tem `cargoId`, `cargoNome` nem nada que ligue os dois. A tabela
 * tambem nao tem chave estrangeira para `cargos`, e ha teste que trava as duas ausencias.
 */

const uuidSchema = z.string().uuid();

/** Limite do nome. Generoso: nome de funcao operacional real e curto, mas o catalogo e da empresa. */
const LIMITE_NOME = 120;

/**
 * CBO — Classificacao Brasileira de Ocupacoes, exatamente 6 digitos.
 *
 * OPCIONAL por decisao: o codigo nem sempre e conhecido no momento em que a funcao entra no
 * catalogo, e recusar a funcao por falta dele travaria o DP num dado que nao muda a decisao.
 *
 * Campo vazio no formulario vira NULL, e nao "CBO invalido" — sem isto, quem apagasse o CBO de uma
 * funcao ficaria preso num erro de validacao que o proprio formulario provocou. Mesma forma do CPF
 * opcional dos dependentes.
 *
 * O banco confere o mesmo formato. Nenhum dos dois confere EXISTENCIA: o sistema nao tem a tabela
 * do MTE, e fingir que valida seria pior do que declarar que so valida forma.
 */
const cboOpcional = z
  .preprocess(
    (valor) => (typeof valor === "string" && valor.trim() === "" ? null : valor),
    z
      .string()
      .trim()
      .regex(/^[0-9]{6}$/u, "CBO precisa ter 6 digitos")
      .nullable()
  )
  .optional();

/**
 * AUSENTE e NULO sao coisas DIFERENTES, como nos turnos:
 *   - campo ausente (`undefined`) -> NAO MEXE no que esta gravado;
 *   - `null` explicito           -> LIMPA.
 *
 * Sem isso, um cliente que nao conhecesse o CBO o apagaria ao salvar qualquer outra coisa.
 */
export const funcaoOperacionalPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().trim().min(1, "Informe o nome da função").max(LIMITE_NOME),
  cbo: cboOpcional,
  /**
   * `ativo` e o unico jeito de tirar uma funcao de circulacao — e o unico jeito de traze-la de
   * volta. NAO existe exclusao: ver `funcaoOperacionalDtoSchema.emUso`.
   */
  ativo: z.boolean().default(true)
});

export const funcaoOperacionalDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  nome: z.string(),
  cbo: z.string().nullable(),
  ativo: z.boolean(),
  /**
   * A funcao ja foi usada em algum periodo de teste ou processo de admissao desta empresa.
   *
   * Existe para a tela EXPLICAR, e nao para bloquear: funcao em uso pode ser desativada, e continua
   * valendo no registro que ja a tinha. O que ela nao pode e sumir — e nao pode porque nao ha
   * caminho de exclusao, nem na interface nem no banco, que recusa por chave estrangeira.
   */
  emUso: z.boolean()
});

export type FuncaoOperacionalPayload = z.infer<typeof funcaoOperacionalPayloadSchema>;
export type FuncaoOperacionalDto = z.infer<typeof funcaoOperacionalDtoSchema>;
