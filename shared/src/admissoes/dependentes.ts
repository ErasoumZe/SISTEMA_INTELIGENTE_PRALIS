import { z } from "zod";
import { cpfTesteSchema } from "./cpf.js";
import { anexoDependenteDtoSchema } from "./dependentes-anexos.js";
import { OPCOES_E5_QUESTOR } from "../conplus/questor-candidato.js";

/**
 * ADM-003 V4 — os dependentes que o candidato declara.
 *
 * Tres decisoes moram aqui, e nenhuma delas e detalhe:
 *
 * 1. NAO existe `empresaId` nem `processoId` no payload. Os dois saem da linha do convite, no
 *    servidor. Um campo opcional aqui bastaria para alguem voltar a ler do cliente "so nesse caso",
 *    e a fronteira entre empresas morreria em silencio.
 * 2. O CPF e OPCIONAL. Sao dados de terceiros, muitas vezes criancas, que costumam nao ter CPF;
 *    exigir criaria dado falso. Mas quando vem, vem valido por digito verificador — a mesma conta
 *    do `cpfTesteSchema`, que o banco tambem refaz desde a migration 0040 (decisao D-7).
 * 3. `parentesco` e `finalidades` sao TEXTO, com sugestao de tela e sem enum. A coluna no banco nao
 *    tem CHECK, e inventar um enum agora congelaria uma lista que o DP nunca aprovou.
 */

const LIMITE_NOME = 180;
const LIMITE_PARENTESCO = 40;
const LIMITE_FINALIDADE = 60;
const MAX_FINALIDADES = 6;

const dataIso = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u, "Data invalida");

/** Sugestoes de tela, nao contrato. Digitar fora da lista continua valendo. */
export const parentescosSugeridos: readonly string[] = [
  "Filho(a)",
  "Enteado(a)",
  "Cônjuge",
  "Companheiro(a)",
  "Tutelado(a)",
  "Pai",
  "Mãe",
  "Outro"
] as const;

/**
 * Para que cada dependente foi informado. A coluna `finalidades` existe desde a 0039 exatamente para
 * isso: coletar dado de menor sem finalidade declarada e o defeito que ela previne.
 */
export const finalidadesSugeridas: readonly string[] = [
  "Imposto de renda",
  "Salário-família",
  "Plano de saúde",
  "Auxílio-creche"
] as const;

/**
 * Campo vazio no formulario vira NULL, e nao "CPF invalido". Sem isto, quem apagasse o CPF de um
 * dependente ficaria preso num erro de validacao que o proprio formulario provocou.
 */
const cpfOpcional = z
  .preprocess((valor) => (typeof valor === "string" && valor.trim() === "" ? null : valor), cpfTesteSchema.nullable())
  .optional();

/**
 * E5 (Questor) — campos comuns do dependente, opcionais. Listas = `OPCOES_E5_QUESTOR` (rótulos já
 * usados na ficha + listas oficiais da documentação). Fumo e álcool são dado de saúde (Q11) e não
 * são coletados.
 */
const opcaoOpcional = (opcoes: readonly string[], rotulo: string) =>
  z
    .string()
    .refine((valor) => opcoes.includes(valor), `${rotulo} fora da lista`)
    .nullish()
    .transform((valor) => valor ?? null);

const camposE5Dependente = {
  sexo: opcaoOpcional(OPCOES_E5_QUESTOR.sexo, "Sexo"),
  estadoCivil: opcaoOpcional(OPCOES_E5_QUESTOR.estadoCivil, "Estado civil"),
  grauInstrucao: opcaoOpcional(OPCOES_E5_QUESTOR.grauInstrucao, "Grau de instrucao"),
  nacionalidade: opcaoOpcional(OPCOES_E5_QUESTOR.nacionalidade, "Nacionalidade")
};

const camposE5DependenteDto = {
  sexo: z.string().nullable(),
  estadoCivil: z.string().nullable(),
  grauInstrucao: z.string().nullable(),
  nacionalidade: z.string().nullable()
};

export const dependentePayloadSchema = z.object({
  nomeCompleto: z.string().trim().min(1, "Informe o nome do dependente").max(LIMITE_NOME),
  nascimento: dataIso,
  parentesco: z.string().trim().min(1, "Informe o parentesco").max(LIMITE_PARENTESCO),
  cpf: cpfOpcional,
  finalidades: z.array(z.string().trim().min(1).max(LIMITE_FINALIDADE)).max(MAX_FINALIDADES).default([]),
  ...camposE5Dependente
});

export type DependentePayload = z.infer<typeof dependentePayloadSchema>;

export const dependenteDtoSchema = z.object({
  id: z.string().uuid(),
  nomeCompleto: z.string(),
  nascimento: z.string(),
  parentesco: z.string(),
  /** Inteiro, e nao mascarado: quem le esta tela e o proprio declarante, conferindo o que digitou. */
  cpf: z.string().nullable(),
  finalidades: z.array(z.string()),
  ...camposE5DependenteDto,
  anexos: z.array(anexoDependenteDtoSchema).optional()
});

export type DependenteDto = z.infer<typeof dependenteDtoSchema>;

/**
 * ADM-003 V5 — o dependente como o DP o ve na REVISAO. Mesmos campos da tela do candidato, MENOS o
 * CPF: sai so `cpfInformado`.
 *
 * O DP confere se o candidato informou o documento do terceiro — para isso nao precisa do numero.
 * Nem mascara parcial: mascara e um jeito de o numero SAIR do servidor, e o CPF de dependente nao
 * tem revelacao auditada por dependente. Enquanto essa decisao nao existir, o numero nao sai.
 */
export const dependenteRevisaoDtoSchema = z.object({
  id: z.string().uuid(),
  nomeCompleto: z.string(),
  nascimento: z.string(),
  parentesco: z.string(),
  cpfInformado: z.boolean(),
  finalidades: z.array(z.string()),
  ...camposE5DependenteDto,
  anexos: z.array(anexoDependenteDtoSchema).optional()
});

export type DependenteRevisaoDto = z.infer<typeof dependenteRevisaoDtoSchema>;

/**
 * A resposta de TODA operacao de dependente devolve o estado inteiro: a lista, a declaracao e a
 * versao da ficha. Cadastrar um dependente move `sem_dependentes`, e mover `sem_dependentes` sobe a
 * versao da ficha — devolver so o item criado deixaria o formulario aberto com versao velha, e o
 * proximo "salvar rascunho" morreria em 409 sem o candidato ter feito nada errado.
 */
export const dependentesDtoSchema = z.object({
  versao: z.number().int().positive(),
  semDependentes: z.boolean().nullable(),
  itens: z.array(dependenteDtoSchema)
});

export type DependentesDto = z.infer<typeof dependentesDtoSchema>;

export const dependenteParamsSchema = z.object({ id: z.string().uuid() });
