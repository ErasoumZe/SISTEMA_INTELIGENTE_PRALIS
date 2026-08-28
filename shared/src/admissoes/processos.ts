import { z } from "zod";
import { apiIdParamsSchema, paginationQuerySchema } from "../api/index.js";

/**
 * ADM-002 V0 — o PROCESSO DE ADMISSAO.
 *
 * Nasce de um teste encerrado com `aprovado_para_admissao`, na MESMA transacao que o encerra. Nao ha
 * acao "iniciar admissao": um segundo caminho para o mesmo ato e o defeito que a regra-mae do
 * PROJECT_BRAIN/16 proibe.
 *
 * Este contrato NAO tem `empresaId` — nem query, nem corpo, nem path. A empresa vem do perfil
 * autorizado da sessao, como em todo o modulo de Admissoes.
 *
 * O processo NAO tem `colaboradorId` e nao se liga a `colaboradores`. O vinculo com o cadastro
 * operacional e escopo inteiro da V7, incluindo a coluna que o representara.
 */

// --- Estados --------------------------------------------------------------------------------------
/**
 * SOMENTE os dois estados alcancaveis na V0.
 *
 * Nao ha `aguardando_candidato`, `em_revisao_dp` nem `efetivado`. Aceitar um estado antes de a regra
 * dele existir e gravar vocabulario que ninguem confirmou com o DP — e que o banco passa a aceitar de
 * qualquer bug. Ampliar a lista depois e migration aditiva e barata; desfazer nome errado com linha
 * gravada, nao.
 */
export const statusProcesso = ["iniciado", "pausado", "cancelado"] as const;
export const statusProcessoSchema = z.enum(statusProcesso);
export type StatusProcesso = z.infer<typeof statusProcessoSchema>;

export const situacoesProcesso = ["ativo", "pausado", "inativo"] as const;
export const situacaoProcessoSchema = z.enum(situacoesProcesso);
export type SituacaoProcesso = z.infer<typeof situacaoProcessoSchema>;

/**
 * Situacao DERIVADA do status. Mesma regra da D-2 do PROJECT_BRAIN/31: nao existe coluna, campo de
 * formulario nem filtro paralelo de ativo/inativo, e nao pode passar a existir.
 */
export function situacaoDoProcesso(status: StatusProcesso): SituacaoProcesso {
  if (status === "iniciado") return "ativo";
  // Pausado NAO e Ativo. Chamar de ativo esconderia justamente o que importa: o processo esta parado
  // esperando decisao interna sobre um ASO nao apto.
  return status === "pausado" ? "pausado" : "inativo";
}

// --- Origem (ADM-003 V1A) -------------------------------------------------------------------------
/**
 * DUAS origens, UM processo. Nao ha segunda tabela nem segundo tipo.
 *
 * `teste_efetivado` — nasce da efetivacao do periodo de teste, dentro da mesma transacao. Continua
 * sendo o unico caminho dessa origem: nao existe acao "iniciar admissao".
 * `admissao_direta`  — o DP/Gerencia faz o pre-cadastro interno e o processo nasce dali.
 *
 * A origem e SO LEITURA depois de criada: ela se registra, nao se escolhe. Nao ha payload que a
 * troque, e o CHECK do banco recusa a combinacao incoerente.
 */
export const origensProcesso = ["teste_efetivado", "admissao_direta"] as const;
export const origemProcessoSchema = z.enum(origensProcesso);
export type OrigemProcesso = z.infer<typeof origemProcessoSchema>;

// --- Exame admissional ----------------------------------------------------------------------------
/** As CINCO situacoes confirmadas pelo DP. */
export const situacoesExame = [
  "pendente",
  "guia_entregue",
  "agendado",
  "aso_apto",
  "aso_nao_apto",
  "exige_acao"
] as const;
export const situacaoExameSchema = z.enum(situacoesExame);
export type SituacaoExame = z.infer<typeof situacaoExameSchema>;

/**
 * O alerta e DERIVADO, como a situacao Ativo/Inativo. Nao existe coluna, indice nem filtro paralelo
 * de "pendencia de exame", e nao pode passar a existir: seria a segunda fonte da mesma verdade.
 */
export function exameExigeAtencao(situacao: SituacaoExame): boolean {
  return situacao !== "aso_apto";
}

/**
 * NAO HA MOTIVO ESTRUTURADO DE CANCELAMENTO NA V0. Nao e esquecimento.
 *
 * Uma lista provisoria vira regra definitiva no instante em que o CHECK do banco roda, e renomear ou
 * remover um valor ja gravado e caro. Como a lista real depende de validacao do DP que ainda nao
 * aconteceu, a V0 nao inventa uma.
 *
 * O cancelamento continua possivel e auditado por ATOR, DATA e ACAO, que e o que a trilha precisa
 * para responder "quem cancelou e quando". Motivo controlado e vertical futura.
 */

/** Trilha append-only. Cada ato do processo grava exatamente uma acao. */
export const acoesHistoricoProcesso = [
  "criado",
  "cancelado",
  "internos_alterados",
  "exame_alterado",
  // ADM-003 V1B: pausar e retomar sao CONSEQUENCIA de registrar o ASO, nunca atos proprios — nao ha
  // rota nem botao de retomar. A trilha registra os dois porque aconteceram.
  "pausado",
  "retomado",
  "cpf_revelado"
] as const;
export const acaoHistoricoProcessoSchema = z.enum(acoesHistoricoProcesso);
export type AcaoHistoricoProcesso = z.infer<typeof acaoHistoricoProcessoSchema>;

// --- Entradas -------------------------------------------------------------------------------------
export const cancelarProcessoPayloadSchema = z.object({
  versao: z.number().int().positive()
});

/**
 * PRE-CADASTRO da admissao direta. Os tres campos que o DP confirma antes de qualquer candidato.
 *
 * NAO ha `testeId`: quem tem teste nao passa por aqui, e aceitar o campo abriria o segundo caminho
 * para o mesmo ato. NAO ha `nome` nem `cpf`: identidade pertence ao formulario do candidato, e
 * inventar aqui criaria a segunda fonte que o CHECK do banco existe para impedir.
 *
 * NAO ha area, setor, CBO, salario nem dados bancarios — fora desta vertical.
 */
export const criarProcessoDiretoPayloadSchema = z.object({
  funcaoId: z.string().uuid("Funcao operacional invalida"),
  jornadaHorario: z.string().trim().min(1, "Informe a jornada/horario").max(200),
  dataAdmissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de admissao invalida")
});

/** Bloco INTERNO do DP. Tudo opcional: o DP preenche ao longo do tempo. */
const textoInternoOpcional = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .optional()
  .transform((valor) => (valor === undefined || valor === "" ? null : valor));

export const dadosInternosPayloadSchema = z.object({
  versao: z.number().int().positive(),
  dataAdmissao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de admissao invalida")
    .nullable()
    .optional()
    .transform((valor) => valor ?? null),
  ctpsNumero: textoInternoOpcional,
  ctpsSerie: textoInternoOpcional,
  ctpsUf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "UF invalida")
    .nullable()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? null : valor)),
  pisPasepNit: z
    .string()
    .trim()
    .regex(/^[0-9]{11}$/, "PIS/PASEP/NIT deve ter 11 digitos")
    .nullable()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? null : valor)),
  observacoesRh: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? null : valor))
});

/** Situacao do exame: acao PROPRIA, com concorrencia otimista propria. */
export const exameProcessoPayloadSchema = z.object({
  versao: z.number().int().positive(),
  situacao: situacaoExameSchema
});

export const processoParamsSchema = apiIdParamsSchema;
export const historicoProcessoQuerySchema = paginationQuerySchema;

/**
 * Filtro da lista. So `situacao` e paginacao — sem busca por nome e SEM BUSCA POR CPF, pela mesma
 * razao da ADM-001: documento nunca entra em query string.
 */
export const processosQuerySchema = paginationQuerySchema.extend({
  situacao: situacaoProcessoSchema.optional(),
  origem: origemProcessoSchema.optional()
});

// --- Saidas ---------------------------------------------------------------------------------------
/**
 * LISTA. Existe desde a V1A porque a admissao direta nao tem teste de onde ser alcancada — sem
 * lista, um processo direto nasceria inalcancavel. E consulta e mais nada: nao ha aqui nenhuma acao
 * de iniciar, efetivar ou criar alem do "Novo cadastro" da propria tela.
 *
 * `nomeCompleto` e NULO no processo direto ate o candidato responder. A tela mostra isso com todas
 * as letras, em vez de inventar identidade.
 */
export const processoListaDtoSchema = z.object({
  id: z.string(),
  origem: origemProcessoSchema,
  status: statusProcessoSchema,
  situacao: situacaoProcessoSchema,
  nomeCompleto: z.string().nullable(),
  funcaoNome: z.string().nullable(),
  dataAdmissao: z.string().nullable(),
  exameSituacao: situacaoExameSchema,
  criadoEm: z.string()
});

/** Bloco interno do DP, sempre presente no detalhe. Nasce junto do processo. */
export const dadosInternosDtoSchema = z.object({
  versao: z.number().int().positive(),
  dataAdmissao: z.string().nullable(),
  ctpsNumero: z.string().nullable(),
  ctpsSerie: z.string().nullable(),
  ctpsUf: z.string().nullable(),
  pisPasepNit: z.string().nullable(),
  observacoesRh: z.string().nullable(),
  exameSituacao: situacaoExameSchema,
  // Derivado por `exameExigeAtencao`. Viaja para a tela nao reimplementar a regra — nao para gravar.
  exameExigeAtencao: z.boolean(),
  exameAtualizadoPorNome: z.string().nullable(),
  exameAtualizadoEm: z.string().nullable()
});

export const processoDetalheDtoSchema = z.object({
  id: z.string(),
  origem: origemProcessoSchema,
  status: statusProcessoSchema,
  // Derivada pelo servidor com `situacaoDoProcesso`. Viaja no DTO para a tela nao reimplementar a
  // regra — e nao para ser gravada.
  situacao: situacaoProcessoSchema,
  versao: z.number().int().positive(),
  // A ORIGEM, quando ela e um teste. NULO na admissao direta — e e por isso que a tela precisa do
  // `origem` acima para saber se falta caminho de volta ou se ele nunca existiu.
  testeId: z.string().nullable(),
  /**
   * Identidade. NULA no processo direto ate o candidato responder.
   *
   * Vem de `admissoes_testes` na origem teste e de lugar nenhum na direta: o processo nao tem, e
   * nao vai ter, coluna de nome ou CPF. O CHECK do banco impede a segunda fonte.
   */
  nomeCompleto: z.string().nullable(),
  // Funcao e jornada: da origem teste sao HERDADAS e apenas exibidas; da direta vem do proprio
  // processo. Quem le nao precisa saber de onde — o servidor resolve numa funcao so.
  funcaoNome: z.string().nullable(),
  jornadaHorario: z.string().nullable(),
  internos: dadosInternosDtoSchema,
  // SO o nome. E-mail nunca entra na projecao — e identificador reaproveitavel em outras rotas.
  criadoPorNome: z.string().nullable(),
  criadoEm: z.string(),
  atualizadoPorNome: z.string().nullable(),
  atualizadoEm: z.string(),
  canceladoPorNome: z.string().nullable(),
  canceladoEm: z.string().nullable()
});

// `camposAlterados` guarda NOMES de campos, nunca valores: gravar antes/depois duplicaria a PII
// dentro da propria trilha.
export const historicoProcessoDtoSchema = z.object({
  id: z.string(),
  versao: z.number().int().positive(),
  acao: acaoHistoricoProcessoSchema,
  atorNome: z.string().nullable(),
  camposAlterados: z.array(z.string()),
  ocorridoEm: z.string()
});

export type CancelarProcessoPayload = z.infer<typeof cancelarProcessoPayloadSchema>;
export type CriarProcessoDiretoPayload = z.infer<typeof criarProcessoDiretoPayloadSchema>;
export type DadosInternosPayload = z.infer<typeof dadosInternosPayloadSchema>;
export type ExameProcessoPayload = z.infer<typeof exameProcessoPayloadSchema>;
export type ProcessosQuery = z.infer<typeof processosQuerySchema>;
export type ProcessoListaDto = z.infer<typeof processoListaDtoSchema>;
export type DadosInternosDto = z.infer<typeof dadosInternosDtoSchema>;
export type ProcessoDetalheDto = z.infer<typeof processoDetalheDtoSchema>;
export type HistoricoProcessoDto = z.infer<typeof historicoProcessoDtoSchema>;
