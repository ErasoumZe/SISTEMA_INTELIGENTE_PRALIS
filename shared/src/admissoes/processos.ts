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
export const statusProcesso = ["iniciado", "cancelado"] as const;
export const statusProcessoSchema = z.enum(statusProcesso);
export type StatusProcesso = z.infer<typeof statusProcessoSchema>;

export const situacoesProcesso = ["ativo", "inativo"] as const;
export const situacaoProcessoSchema = z.enum(situacoesProcesso);
export type SituacaoProcesso = z.infer<typeof situacaoProcessoSchema>;

/**
 * Situacao DERIVADA do status. Mesma regra da D-2 do PROJECT_BRAIN/31: nao existe coluna, campo de
 * formulario nem filtro paralelo de ativo/inativo, e nao pode passar a existir.
 */
export function situacaoDoProcesso(status: StatusProcesso): SituacaoProcesso {
  return status === "iniciado" ? "ativo" : "inativo";
}

/**
 * Lista FECHADA, pelo mesmo motivo da ADM-001: motivo livre sobre pessoa em avaliacao atrai
 * justamente a PII que o modulo evita.
 *
 * PROVISORIA — precisa de confirmacao do DP. Estes dois cobrem o que se sabe hoje; se o DP precisar
 * de um terceiro, ele entra por migration aditiva no CHECK.
 */
export const motivosCancelamentoProcesso = ["desistencia_do_candidato", "vaga_cancelada"] as const;
export const motivoCancelamentoProcessoSchema = z.enum(motivosCancelamentoProcesso);
export type MotivoCancelamentoProcesso = z.infer<typeof motivoCancelamentoProcessoSchema>;

/** Trilha append-only. So as duas acoes que a V0 alcanca. */
export const acoesHistoricoProcesso = ["criado", "cancelado"] as const;
export const acaoHistoricoProcessoSchema = z.enum(acoesHistoricoProcesso);
export type AcaoHistoricoProcesso = z.infer<typeof acaoHistoricoProcessoSchema>;

// --- Entradas -------------------------------------------------------------------------------------
export const cancelarProcessoPayloadSchema = z.object({
  versao: z.number().int().positive(),
  motivoCancelamento: motivoCancelamentoProcessoSchema
});

export const processoParamsSchema = apiIdParamsSchema;
export const historicoProcessoQuerySchema = paginationQuerySchema;

// --- Saidas ---------------------------------------------------------------------------------------
/**
 * NAO ha DTO de lista, e nao e esquecimento: a V0 nao tem listagem, pagina de lista nem entrada de
 * menu. O processo e alcancado exclusivamente pelo teste efetivado. Lista sem filtro, sem paginacao e
 * sem dono definido seria superficie criada antes de existir necessidade.
 */
export const processoDetalheDtoSchema = z.object({
  id: z.string(),
  status: statusProcessoSchema,
  // Derivada pelo servidor com `situacaoDoProcesso`. Viaja no DTO para a tela nao reimplementar a
  // regra — e nao para ser gravada.
  situacao: situacaoProcessoSchema,
  versao: z.number().int().positive(),
  // A ORIGEM. O processo so existe por causa dela, e a tela precisa do caminho de volta.
  testeId: z.string(),
  testeNomeCompleto: z.string(),
  motivoCancelamento: motivoCancelamentoProcessoSchema.nullable(),
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
export type ProcessoDetalheDto = z.infer<typeof processoDetalheDtoSchema>;
export type HistoricoProcessoDto = z.infer<typeof historicoProcessoDtoSchema>;
